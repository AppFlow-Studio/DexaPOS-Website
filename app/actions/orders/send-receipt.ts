"use server";

import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { sendSMS } from "@/lib/messaging/telnyx";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { GetOrderDetails } from "@/app/dashboard/actions/order";
import {
  renderReceiptHtml,
  renderReceiptText,
} from "@/lib/messaging/receipt-template";

const RATE_LIMIT_SENDS = 3;
const RATE_LIMIT_WINDOW_HOURS = 1;

export interface SendReceiptParams {
  orderId: string;
  deliveryMethod: "email" | "sms";
  recipient: string;
  receiptTemplateId?: string;
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
  const existingOrder = await GetOrderDetails(orderId);
  if (!existingOrder) return { success: false, message: "Order not found" };

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
  const location = (order as { location?: unknown }).location ?? null;
  const merchantLogoUrl = await fetchMerchantLogoUrl(
    supabase,
    (order as { merchant_id?: string }).merchant_id
  );
  const html = renderReceiptHtml(
    order as Parameters<typeof renderReceiptHtml>[0],
    location as Parameters<typeof renderReceiptHtml>[1],
    { merchantLogoUrl }
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

export async function sendReceipt(
  params: SendReceiptParams
): Promise<SendReceiptResult> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, message: "Unauthorized" };
  }

  const existingOrder = await GetOrderDetails(params.orderId);
  if (!existingOrder) {
    return { success: false, message: "Order not found" };
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
  const orderNumber =
    (order as { display_number?: string; order_number?: string }).display_number ||
    (order as { display_number?: string; order_number?: string }).order_number ||
    "—";

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
      const html = renderReceiptHtml(
        order as Parameters<typeof renderReceiptHtml>[0],
        location as Parameters<typeof renderReceiptHtml>[1],
        { merchantLogoUrl }
      );
      const { error: emailError } = await resend.emails.send({
        from: fromEmail,
        to: params.recipient,
        subject: `Your receipt from ${businessName} · Order #${orderNumber}`,
        html,
      });
      if (emailError) {
        await supabase.from("receipt_sends").insert({
          order_id: params.orderId,
          delivery_method: "email",
          recipient: params.recipient,
          receipt_template_id: params.receiptTemplateId || null,
          status: "failed",
          error_message: emailError.message,
          created_by: userId,
        });
        return { success: false, message: emailError.message };
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
      const text = renderReceiptText(
        order as Parameters<typeof renderReceiptText>[0],
        location as Parameters<typeof renderReceiptText>[1]
      );
      const smsResult = await sendSMS(params.recipient, text);
      if ("error" in smsResult) {
        await supabase.from("receipt_sends").insert({
          order_id: params.orderId,
          delivery_method: "sms",
          recipient: params.recipient,
          receipt_template_id: params.receiptTemplateId || null,
          status: "failed",
          error_message: smsResult.error,
          created_by: userId,
        });
        return { success: false, message: smsResult.error };
      }
    }

    await supabase.from("receipt_sends").insert({
      order_id: params.orderId,
      delivery_method: params.deliveryMethod,
      recipient: params.recipient,
      receipt_template_id: params.receiptTemplateId || null,
      status: "sent",
      created_by: userId,
    });

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
