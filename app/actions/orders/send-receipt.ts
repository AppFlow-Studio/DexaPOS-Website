"use server";

import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import twilio from "twilio";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { GetOrderDetails } from "@/app/dashboard/actions/order";

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
  const location = (order as any).location;
  const html = renderReceiptHtml(order, location);
  return { success: true, html };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function getPaymentMethodName(method: string): string {
  const methods: Record<string, string> = {
    cash: "Cash",
    card_spinapi: "Card",
    card_dvpaylite: "Card",
    card_manual: "Card",
    gift_card: "Gift Card",
    house_account: "House Account",
    external: "External",
  };
  return methods[method] || method.replace("_", " ");
}

function renderReceiptHtml(order: any, location: any): string {
  const items = order.order_items || [];
  const payments = order.order_payments || [];
  const completedPayments = payments.filter(
    (p: any) => p.status === "captured" || p.status === "paid"
  );
  const date = new Date(order.created_at);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const locationAddress = location
    ? [
        location.address_line1,
        location.address_line2,
        `${location.city || ""}, ${location.state || ""} ${location.postal_code || ""}`.trim(),
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const itemsHtml = items
    .map((item: any) => {
      let mods = "";
      if (item.order_item_modifiers?.length) {
        mods = item.order_item_modifiers
          .map(
            (m: any) =>
              `<div style="font-size:11px;color:#666;padding-left:12px;">+ ${m.modifier_name}${m.quantity > 1 ? ` (×${m.quantity})` : ""}${m.price_modifier > 0 ? ` ${formatCurrency(m.price_modifier * m.quantity)}` : ""}</div>`
          )
          .join("");
      }
      return `
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;">
            <span>${item.quantity > 1 ? `${item.quantity}x ` : ""}${item.item_name || "Item"}${item.is_voided ? " (VOID)" : ""}</span>
            <span>${formatCurrency(Number(item.subtotal) || 0)}</span>
          </div>
          ${mods}
        </div>
      `;
    })
    .join("");

  const paymentsHtml = completedPayments
    .map(
      (p: any) =>
        `<div style="display:flex;justify-content:space-between;"><span>${getPaymentMethodName(p.payment_method)}${p.card_last_four ? ` ****${p.card_last_four}` : ""}</span><span>${formatCurrency(Number(p.total_amount) || 0)}</span></div>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; line-height: 1.5; color: #333; max-width: 400px; margin: 0 auto; padding: 16px; }
    .header { text-align: center; margin-bottom: 16px; }
    .business-name { font-size: 18px; font-weight: 600; }
    .address { font-size: 12px; color: #666; margin-top: 4px; }
    .order-info { margin-bottom: 12px; font-size: 13px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .divider { border-bottom: 1px dashed #ccc; margin: 12px 0; }
    .items { margin-bottom: 12px; }
    .totals { margin-top: 12px; }
    .grand-total { font-weight: 600; font-size: 16px; padding-top: 8px; border-top: 1px solid #333; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <div class="business-name">${location?.name || "Receipt"}</div>
    ${locationAddress ? `<div class="address">${locationAddress}</div>` : ""}
    ${location?.phone ? `<div class="address">${location.phone}</div>` : ""}
  </div>
  <div class="divider"></div>
  <div class="order-info">
    <div class="row"><span>Order #</span><span>${order.display_number || order.order_number}</span></div>
    <div class="row"><span>Date</span><span>${dateStr}</span></div>
    <div class="row"><span>Time</span><span>${timeStr}</span></div>
    <div class="row"><span>Type</span><span>${String(order.order_type || "").replace("_", " ")}</span></div>
    ${order.table_number ? `<div class="row"><span>Table</span><span>${order.table_number}</span></div>` : ""}
    ${order.customer_name ? `<div class="row"><span>Customer</span><span>${order.customer_name}</span></div>` : ""}
  </div>
  <div class="divider"></div>
  <div class="items">${itemsHtml}</div>
  <div class="divider"></div>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${formatCurrency(Number(order.subtotal) || 0)}</span></div>
    ${Number(order.tax_amount) > 0 ? `<div class="row"><span>Tax</span><span>${formatCurrency(Number(order.tax_amount))}</span></div>` : ""}
    ${Number(order.discount_amount) > 0 ? `<div class="row" style="color:green;"><span>Discount</span><span>-${formatCurrency(Number(order.discount_amount))}</span></div>` : ""}
    ${Number(order.service_charge) > 0 ? `<div class="row"><span>Service Charge</span><span>${formatCurrency(Number(order.service_charge))}</span></div>` : ""}
    ${Number(order.tip_amount) > 0 ? `<div class="row"><span>Tip</span><span>${formatCurrency(Number(order.tip_amount))}</span></div>` : ""}
    <div class="row grand-total"><span>TOTAL</span><span>${formatCurrency(Number(order.total_amount) || 0)}</span></div>
  </div>
  ${paymentsHtml ? `
  <div class="divider"></div>
  <div style="font-size:11px;text-transform:uppercase;color:#666;margin-bottom:8px;">Payment</div>
  ${paymentsHtml}
  ` : ""}
  <div class="divider"></div>
  <div class="footer">
    <p><strong>Thank You!</strong></p>
    <p>We appreciate your business.</p>
  </div>
</body>
</html>
  `.trim();
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

  const location = (order as any).location;

  const templateType = params.receiptTemplateId ? undefined : "sale";
  let template = null;
  if (params.receiptTemplateId) {
    const { data } = await supabase
      .from("receipt_templates")
      .select("*")
      .eq("id", params.receiptTemplateId)
      .eq("is_active", true)
      .single();
    template = data;
  } else {
    const { data } = await supabase
      .from("receipt_templates")
      .select("*")
      .eq("merchant_id", order.merchant_id)
      .eq("template_type", templateType || "sale")
      .eq("is_active", true)
      .maybeSingle();
    template = data;
  }

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

  const html = renderReceiptHtml(order, location);

  try {
    if (params.deliveryMethod === "email") {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return {
          success: false,
          message: "Email service not configured. Set RESEND_API_KEY.",
        };
      }
      const resend = new Resend(apiKey!);
      const fromEmail =
        process.env.RESEND_FROM_EMAIL || "receipts@resend.dev";
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: fromEmail,
        to: params.recipient,
        subject: `Receipt for Order #${order.display_number || order.order_number}`,
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
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;
      if (!accountSid || !authToken || !fromNumber) {
        return {
          success: false,
          message:
            "SMS service not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.",
        };
      }
      const client = twilio(accountSid!, authToken!);
      const plainText = `Receipt for Order #${order.display_number || order.order_number}. Total: ${formatCurrency(Number(order.total_amount) || 0)}. View full receipt via email.`;
      try {
        await client.messages.create({
          body: plainText,
          from: fromNumber,
          // to: params.recipient,
          to: "+18447440893"
        });
      } catch (smsError: any) {
        await supabase.from("receipt_sends").insert({
          order_id: params.orderId,
          delivery_method: "sms",
          recipient: params.recipient,
          receipt_template_id: params.receiptTemplateId || null,
          status: "failed",
          error_message: smsError?.message || "SMS send failed",
          created_by: userId,
        });
        return {
          success: false,
          message: smsError?.message || "Failed to send SMS",
        };
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
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Failed to send receipt",
    };
  }
}
