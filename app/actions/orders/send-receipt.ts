"use server";

import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { sendSMS } from "@/lib/messaging/telnyx";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  renderReceiptHtml,
  renderReceiptText,
} from "@/lib/messaging/receipt-template";

const RATE_LIMIT_SENDS = 3;
const RATE_LIMIT_WINDOW_HOURS = 1;

/**
 * Authorizes the Clerk-authenticated caller against an order's merchant.
 * Uses the service-role client to resolve the caller's org → merchant id and
 * compares it to the order's merchant_id (the codebase's standard tenancy
 * check). Returns false when the org is missing or doesn't own the order — we
 * surface that as a generic "Order not found" so order UUIDs can't be probed.
 */
async function callerOwnsOrder(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string | null | undefined,
  merchantId: string | null | undefined
): Promise<boolean> {
  if (!orgId || !merchantId) return false;
  const { data } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", orgId)
    .maybeSingle();
  return !!data && (data as { id: string }).id === merchantId;
}

export interface SendReceiptParams {
  orderId: string;
  deliveryMethod: "email" | "sms";
  recipient: string;
  receiptTemplateId?: string;
  /** When true (email only), persist the recipient to the linked customer's profile. */
  saveToProfile?: boolean;
}

export interface SendReceiptResult {
  success: boolean;
  message: string;
}

/** Returns rendered receipt HTML for preview. Does not send. */
export async function getReceiptPreviewHtml(orderId: string): Promise<{
  success: boolean;
  html?: string;
  message?: string;
}> {
  const { userId, orgId } = await auth();
  if (!userId) return { success: false, message: "Unauthorized" };

  const supabase = createServiceRoleClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      order_items(*, order_item_modifiers(*)),
      order_payments(*),
      location:locations!orders_location_id_fkey(name, address_line1, address_line2, city, state, postal_code, phone)
    `
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { success: false, message: "Order not found" };
  }
  if (!(await callerOwnsOrder(supabase, orgId, (order as { merchant_id?: string }).merchant_id))) {
    return { success: false, message: "Order not found" };
  }
  const location = (order as { location?: unknown }).location ?? null;
  const merchantLogoUrl = await fetchMerchantLogoUrl(
    supabase,
    (order as { merchant_id?: string }).merchant_id
  );
  // Representative CTA so the preview matches what's actually sent. The link is
  // inert in the modal's sandboxed iframe; the real send uses a valid send_token.
  const receiptToken = (order as { receipt_token?: string | null }).receipt_token;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const receiptUrl =
    receiptToken && appUrl ? `${appUrl}/receipts/${receiptToken}/preview` : null;
  const html = renderReceiptHtml(
    order as Parameters<typeof renderReceiptHtml>[0],
    location as Parameters<typeof renderReceiptHtml>[1],
    { merchantLogoUrl, receiptUrl }
  );
  return { success: true, html };
}

async function fetchMerchantLogoUrl(
  supabase: ReturnType<typeof createServiceRoleClient>,
  merchantId: string | undefined
): Promise<string | null> {
  if (!merchantId) return null;
  const { data } = await supabase
    .from("merchants")
    .select("clerk_org_id, organizations(imageURL)")
    .eq("id", merchantId)
    .maybeSingle();
  const org = (data as { organizations?: { imageURL?: string | null } | { imageURL?: string | null }[] | null } | null)?.organizations;
  if (!org) return null;
  const record = Array.isArray(org) ? org[0] : org;
  return record?.imageURL ?? null;
}

/**
 * Saves the recipient email to the order's linked customer profile (and the
 * order itself). Best-effort — a failure here must not fail the receipt send.
 */
async function persistCustomerEmail(
  supabase: ReturnType<typeof createServiceRoleClient>,
  order: unknown,
  email: string
): Promise<void> {
  const customerId = (order as { customer_id?: string | null }).customer_id;
  const orderId = (order as { id?: string }).id;
  try {
    if (customerId) {
      await supabase
        .from("customers")
        .update({ email })
        .eq("id", customerId);
    }
    if (orderId) {
      await supabase
        .from("orders")
        .update({ customer_email: email })
        .eq("id", orderId);
    }
  } catch {
    // best-effort; receipt already sent
  }
}

/** Ensures the order has a receipt_token; lazy-backfills if missing. */
async function ensureReceiptToken(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orderId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("orders")
    .select("receipt_token")
    .eq("id", orderId)
    .single();
  const existing = (data as { receipt_token?: string | null } | null)?.receipt_token;
  if (existing) return existing;

  // Lazy backfill for any pre-migration order that slipped through.
  const { data: updated } = await supabase
    .from("orders")
    .update({ receipt_token: null }) // triggers DB default expression
    .eq("id", orderId)
    .select("receipt_token")
    .single();
  return (updated as { receipt_token?: string | null } | null)?.receipt_token ?? null;
}

export async function sendReceipt(
  params: SendReceiptParams
): Promise<SendReceiptResult> {
  const { userId, orgId } = await auth();
  if (!userId) {
    return { success: false, message: "Unauthorized" };
  }

  const supabase = createServiceRoleClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      `
      *,
      order_items(*, order_item_modifiers(*)),
      order_payments(*),
      location:locations!orders_location_id_fkey(name, address_line1, address_line2, city, state, postal_code, phone)
    `
    )
    .eq("id", params.orderId)
    .single();

  if (orderError || !order) {
    return { success: false, message: "Order not found" };
  }
  if (!(await callerOwnsOrder(supabase, orgId, (order as { merchant_id?: string }).merchant_id))) {
    return { success: false, message: "Order not found" };
  }

  const location = (order as { location?: unknown }).location ?? null;

  const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: recentSends } = await supabase
    .from("receipt_sends")
    .select("id")
    .eq("order_id", params.orderId)
    .gte("sent_at", oneHourAgo);

  if ((recentSends?.length ?? 0) >= RATE_LIMIT_SENDS) {
    return {
      success: false,
      message: `Rate limit exceeded. Maximum ${RATE_LIMIT_SENDS} receipts per order per hour.`,
    };
  }

  const businessName =
    (location as { name?: string } | null)?.name || "Receipt";
  // display_number already has a leading '#'; only prefix for raw order_number fallback.
  const displayNum =
    (order as { display_number?: string; order_number?: string }).display_number;
  const fallbackNum =
    (order as { display_number?: string; order_number?: string }).order_number;
  const orderNumber = displayNum || (fallbackNum ? `#${fallbackNum}` : "—");

  try {
    if (params.deliveryMethod === "email") {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return {
          success: false,
          message: "Email service not configured. Set RESEND_API_KEY.",
        };
      }
      const resend = new Resend(apiKey);
      const fromEmail =
        process.env.RESEND_FROM_EMAIL || "receipts@resend.dev";
      const merchantLogoUrl = await fetchMerchantLogoUrl(
        supabase,
        (order as { merchant_id?: string }).merchant_id
      );

      // Insert a pending row first so we have a send_token to build the hosted
      // receipt URL — the email's "View receipt online" CTA points at the same
      // /receipts/{t1}/{t2} page the SMS link does.
      const { data: pendingRow, error: pendingErr } = await supabase
        .from("receipt_sends")
        .insert({
          order_id: params.orderId,
          merchant_id: (order as { merchant_id?: string }).merchant_id,
          delivery_method: "email",
          recipient: params.recipient,
          receipt_template_id: params.receiptTemplateId || null,
          status: "pending",
          created_by: userId,
        })
        .select("id, send_token")
        .single();

      if (pendingErr || !pendingRow) {
        return { success: false, message: "Failed to initialise receipt send record." };
      }

      const receiptToken = await ensureReceiptToken(supabase, params.orderId);
      const sendToken = (pendingRow as { send_token?: string }).send_token;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
      const receiptUrl =
        receiptToken && sendToken && appUrl
          ? `${appUrl}/receipts/${receiptToken}/${sendToken}`
          : null;

      const html = renderReceiptHtml(
        order as Parameters<typeof renderReceiptHtml>[0],
        location as Parameters<typeof renderReceiptHtml>[1],
        { merchantLogoUrl, receiptUrl }
      );
      const { error: emailError } = await resend.emails.send({
        from: fromEmail,
        to: params.recipient,
        subject: `Your receipt from ${businessName} · Order ${orderNumber}`,
        html,
      });

      await supabase
        .from("receipt_sends")
        .update({
          status: emailError ? "failed" : "sent",
          error_message: emailError ? emailError.message : null,
        })
        .eq("id", (pendingRow as { id: string }).id);

      if (emailError) {
        return { success: false, message: emailError.message };
      }

      if (params.saveToProfile) {
        await persistCustomerEmail(supabase, order, params.recipient);
      }
    } else {
      if (
        !process.env.TELNYX_API_KEY ||
        (!process.env.TELNYX_FROM_NUMBER && !process.env.TELNYX_MESSAGING_PROFILE_ID)
      ) {
        return {
          success: false,
          message:
            "SMS service not configured. Set TELNYX_API_KEY and either TELNYX_FROM_NUMBER or TELNYX_MESSAGING_PROFILE_ID.",
        };
      }

      // Insert pending row first so we have a send_token for the URL.
      const { data: pendingRow, error: pendingErr } = await supabase
        .from("receipt_sends")
        .insert({
          order_id: params.orderId,
          merchant_id: (order as { merchant_id?: string }).merchant_id,
          delivery_method: "sms",
          recipient: params.recipient,
          receipt_template_id: params.receiptTemplateId || null,
          status: "pending",
          created_by: userId,
        })
        .select("id, send_token")
        .single();

      if (pendingErr || !pendingRow) {
        return { success: false, message: "Failed to initialise receipt send record." };
      }

      const receiptToken = await ensureReceiptToken(supabase, params.orderId);
      const sendToken = (pendingRow as { send_token?: string }).send_token;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
      const receiptUrl = receiptToken && sendToken
        ? `${appUrl}/receipts/${receiptToken}/${sendToken}`
        : appUrl;

      const text = renderReceiptText(
        order as Parameters<typeof renderReceiptText>[0],
        location as Parameters<typeof renderReceiptText>[1],
        receiptUrl
      );
      const smsResult = await sendSMS(params.recipient, text);

      const newStatus = "error" in smsResult ? "failed" : "sent";
      await supabase
        .from("receipt_sends")
        .update({
          status: newStatus,
          error_message: "error" in smsResult ? smsResult.error : null,
        })
        .eq("id", (pendingRow as { id: string }).id);

      if ("error" in smsResult) {
        return { success: false, message: smsResult.error };
      }
    }

    return {
      success: true,
      message:
        params.deliveryMethod === "email"
          ? "Receipt sent to email successfully"
          : "Receipt sent via SMS successfully",
    };
  } catch (err: unknown) {
    const message =
      (err as { message?: string })?.message || "Failed to send receipt";
    return { success: false, message };
  }
}
