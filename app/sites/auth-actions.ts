"use server";

import twilio from "twilio";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const RATE_LIMIT_PER_PHONE = 5; // max OTPs per phone per hour

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

export async function sendOtp(
  phone: string,
  storeConfigId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceRoleClient();

  const normalized = normalizePhone(phone);
  if (normalized.length < 11) {
    return { success: false, error: "Invalid phone number" };
  }

  const { data: storeConfig } = await supabase
    .from("online_store_config")
    .select("merchant_id, is_active")
    .eq("id", storeConfigId)
    .single();

  if (!storeConfig || storeConfig.is_active === false) {
    return { success: false, error: "Store not found" };
  }

  const merchantId = storeConfig.merchant_id;

  // Rate limit: max OTPs per phone per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("phone_verifications")
    .select("id", { count: "exact", head: true })
    .eq("phone", normalized)
    .eq("merchant_id", merchantId)
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) >= RATE_LIMIT_PER_PHONE) {
    return { success: false, error: "Too many attempts. Try again later." };
  }

  const code = generateOtp();
  const expiresAt = new Date(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
  ).toISOString();

  const { error: insertError } = await supabase
    .from("phone_verifications")
    .insert({
      phone: normalized,
      code,
      merchant_id: merchantId,
      expires_at: expiresAt,
    });

  if (insertError) {
    return { success: false, error: "Failed to create verification" };
  }

  // Send via Twilio
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Twilio not configured");
    // In dev, log the code instead of failing
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV] OTP for ${normalized}: ${code}`);
      return { success: true };
    }
    return { success: false, error: "SMS service not configured" };
  }

  try {
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      body: `Your verification code is: ${code}`,
      from: fromNumber,
      to: normalized,
    });
    return { success: true };
  } catch (err: any) {
    console.error("Twilio send error:", err?.message);
    return { success: false, error: "Failed to send verification code" };
  }
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
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

  // Find the latest unexpired, unverified code for this phone+merchant
  const { data: verification, error: fetchError } = await supabase
    .from("phone_verifications")
    .select("*")
    .eq("phone", normalized)
    .eq("merchant_id", merchantId)
    .is("verified_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !verification) {
    return { success: false, error: "No active verification found. Request a new code." };
  }

  if (verification.attempts >= MAX_ATTEMPTS) {
    return { success: false, error: "Too many failed attempts. Request a new code." };
  }

  // Increment attempts
  await supabase
    .from("phone_verifications")
    .update({ attempts: verification.attempts + 1 })
    .eq("id", verification.id);

  if (verification.code !== code) {
    return { success: false, error: "Invalid code" };
  }

  // Mark as verified
  await supabase
    .from("phone_verifications")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", verification.id);

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
