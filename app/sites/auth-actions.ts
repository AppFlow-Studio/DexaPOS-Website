"use server";

import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendSMS as sendTelnyxSMS } from "@/lib/messaging/telnyx";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;

interface PhoneVerificationRpcResult {
  success: boolean;
  error?: string;
  verification_id?: string;
  attempts?: number;
  remaining_attempts?: number;
}

function generateOtp(): string {
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += digits[Math.floor(Math.random() * 10)];
  }
  return code;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.startsWith("+")) return phone.replace(/\s/g, "");
  return `+${digits}`;
}

async function getRequestIp(): Promise<string | null> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const realIp = requestHeaders.get("x-real-ip");
  return forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || null;
}

export async function sendOtp(
  phone: string,
  storeConfigId: string
): Promise<{ success: boolean; error?: string; code?: "rate_limited_phone" | "rate_limited_ip" | "sms_failed" | "not_configured" }> {
  const supabase = createServiceRoleClient();

  const normalized = normalizePhone(phone);
  if (normalized.length < 11) {
    return { success: false, error: "Invalid phone number" };
  }

  const { data: storeConfig } = await supabase
    .from("online_store_config")
    .select("merchant_id, is_active, store_name")
    .eq("id", storeConfigId)
    .single();

  if (!storeConfig || storeConfig.is_active === false) {
    return { success: false, error: "Store not found" };
  }

  const merchantId = storeConfig.merchant_id;
  const storeName = (storeConfig as { store_name?: string }).store_name || "your order";

  const code = generateOtp();
  const expiresAt = new Date(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
  ).toISOString();

  const requestIp = await getRequestIp();
  const { data: issueResult, error: issueError } = await supabase.rpc(
    "issue_phone_verification_otp",
    {
      p_phone: normalized,
      p_merchant_id: merchantId,
      p_code: code,
      p_request_ip: requestIp,
      p_expires_at: expiresAt,
    }
  );

  const verificationResult = issueResult as PhoneVerificationRpcResult | null;
  if (issueError || !verificationResult?.success || !verificationResult.verification_id) {
    const msg = verificationResult?.error ?? "";
    if (msg.includes("Too many attempts")) {
      return { success: false, error: msg, code: "rate_limited_phone" };
    }
    if (msg.includes("Too many requests from this network")) {
      return { success: false, error: msg, code: "rate_limited_ip" };
    }
    return { success: false, error: msg || "Failed to create verification" };
  }

  const verificationId = verificationResult.verification_id;

  // Verification SMS = transactional → Telnyx (Twilio is reserved for marketing).
  const body = `Your ${storeName} verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`;
  const result = await sendTelnyxSMS(normalized, body);

  if ("error" in result) {
    console.error("[sendOtp] Telnyx error:", result.error);
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV OTP] ${normalized} → ${code}`);
      return { success: true };
    }
    await supabase.from("phone_verifications").delete().eq("id", verificationId);
    if (result.error.includes("not configured")) {
      return { success: false, error: "SMS service is not configured. Please contact support.", code: "not_configured" };
    }
    return { success: false, error: "Failed to send SMS. Please check your number and try again.", code: "sms_failed" };
  }

  return { success: true };
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  code?: "max_attempts" | "expired" | "invalid_code";
  remainingAttempts?: number;
  sessionToken?: string;
  customer?: {
    id: string;
    name: string | null;
    phone: string;
    email: string | null;
  };
}

export async function verifyOtp(
  phone: string,
  code: string,
  storeConfigId: string,
  existingSessionToken?: string
): Promise<VerifyOtpResult> {
  const supabase = createServiceRoleClient();

  const normalized = normalizePhone(phone);

  const { data: storeConfig } = await supabase
    .from("online_store_config")
    .select("id, merchant_id, is_active")
    .eq("id", storeConfigId)
    .single();

  if (!storeConfig || storeConfig.is_active === false) {
    return { success: false, error: "Store not found" };
  }

  const merchantId = storeConfig.merchant_id;

  const { data: verifyResult, error: verifyError } = await supabase.rpc(
    "verify_phone_verification_otp",
    {
      p_phone: normalized,
      p_merchant_id: merchantId,
      p_code: code,
    }
  );

  const verificationResult = verifyResult as PhoneVerificationRpcResult | null;
  if (verifyError || !verificationResult?.success) {
    const msg = verificationResult?.error ?? "";
    if (msg.includes("Too many failed attempts")) {
      return { success: false, error: msg, code: "max_attempts" };
    }
    if (msg.includes("No active verification")) {
      return { success: false, error: msg, code: "expired" };
    }
    return {
      success: false,
      error: msg || "Invalid code",
      code: "invalid_code",
      remainingAttempts: verificationResult?.remaining_attempts,
    };
  }

  // Find or create customer
  let { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("merchant_id", merchantId)
    .eq("phone", normalized)
    .limit(1)
    .single();

  if (!customer) {
    const { data: newCustomer, error: createError } = await supabase
      .from("customers")
      .insert({
        merchant_id: merchantId,
        phone: normalized,
        name: null,
        email: null,
      })
      .select("id, name, phone, email")
      .single();

    if (createError || !newCustomer) {
      return { success: false, error: "Failed to create customer record" };
    }
    customer = newCustomer;
  }

  // Upgrade existing anonymous session if provided
  if (existingSessionToken) {
    const { data: anonSession } = await supabase
      .from("online_order_sessions")
      .select("id, session_token")
      .eq("session_token", existingSessionToken)
      .eq("store_config_id", storeConfigId)
      .eq("is_authenticated", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (anonSession) {
      await supabase
        .from("online_order_sessions")
        .update({
          customer_id: customer.id,
          is_authenticated: true,
          customer_phone: normalized,
          customer_name: customer.name,
          customer_email: customer.email,
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", anonSession.id);

      return {
        success: true,
        sessionToken: anonSession.session_token,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: normalized,
          email: customer.email,
        },
      };
    }
  }

  // Create a new session (or update existing unexpired one)
  const { data: existingSession } = await supabase
    .from("online_order_sessions")
    .select("id, session_token")
    .eq("store_config_id", storeConfigId)
    .eq("customer_id", customer.id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existingSession?.session_token) {
    // Refresh the existing session
    await supabase
      .from("online_order_sessions")
      .update({
        is_authenticated: true,
        customer_phone: normalized,
        customer_name: customer.name,
        customer_email: customer.email,
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", existingSession.id);

    return {
      success: true,
      sessionToken: existingSession.session_token,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: normalized,
        email: customer.email,
      },
    };
  }

  // Create new session
  const { data: newSession, error: sessionError } = await supabase
    .from("online_order_sessions")
    .insert({
      store_config_id: storeConfigId,
      customer_id: customer.id,
      customer_phone: normalized,
      customer_name: customer.name,
      customer_email: customer.email,
      is_authenticated: true,
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })
    .select("session_token")
    .single();

  if (sessionError || !newSession?.session_token) {
    return { success: false, error: "Failed to create session" };
  }

  return {
    success: true,
    sessionToken: newSession.session_token,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: normalized,
      email: customer.email,
    },
  };
}
