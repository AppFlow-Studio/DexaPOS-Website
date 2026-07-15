import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendEmail } from "@/lib/messaging/resend";
import { sendSMS } from "@/lib/messaging/telnyx";
import { renderReceiptHtml } from "@/lib/messaging/receipt-template";

export type OrderEvent =
  | "placed"
  | "accepted"
  | "sent_to_kitchen"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled"
  | "declined";

interface NotificationPrefs {
  email_on_order_placed: boolean;
  sms_on_order_placed: boolean;
  email_on_status: OrderEvent[];
  sms_on_status: OrderEvent[];
  admin_test_email?: string | null;
  admin_test_phone?: string | null;
}

const DEFAULT_PREFS: NotificationPrefs = {
  email_on_order_placed: true,
  sms_on_order_placed: true,
  email_on_status: ["ready", "completed", "cancelled", "declined"],
  sms_on_status: ["accepted", "preparing", "ready", "completed", "cancelled", "declined"],
  admin_test_email: null,
  admin_test_phone: null,
};

interface OrderContext {
  orderId: string;
  merchantId: string;
  storeName: string;
  slug: string;
  primaryColor: string;
  displayNumber: string;
  status: string;
  orderType: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  emailOptIn: boolean;
  smsOptIn: boolean;
  estimatedPrepMinutes: number;
  cancellationReason: string | null;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  cardLastFour: string | null;
  cardType: string | null;
  items: { name: string; quantity: number; subtotal: number }[];
  prefs: NotificationPrefs;
  trackingUrl: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";

  // Phones only auto-linkify real, publicly-resolvable URLs. A localhost/private
  // base produces a tracking link that can't be tapped (or opened) from an SMS,
  // so surface the misconfiguration instead of silently sending a dead link.
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)(:|\/|$)/i.test(url)) {
    console.warn(
      `[order-notifications] NEXT_PUBLIC_APP_URL is "${url}". Tracking links in SMS/email will not be tappable — set it to the public https:// origin.`
    );
  }

  return url.replace(/\/+$/, "");
}

async function loadOrderContext(orderId: string): Promise<OrderContext | null> {
  const supabase = createServiceRoleClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      `id, display_number, status, order_type, customer_name, customer_email, customer_phone,
       cancellation_reason, subtotal, tax_amount, tip_amount, total_amount, location_id,
       merchant_id,
       order_items (item_name, quantity, subtotal)`
    )
    .eq("id", orderId)
    .single();

  if (!order) return null;

  const o = order as unknown as {
    id: string;
    display_number: string;
    status: string;
    order_type: string;
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    cancellation_reason: string | null;
    subtotal: number | string;
    tax_amount: number | string;
    tip_amount: number | string;
    total_amount: number | string;
    location_id: string;
    merchant_id: string;
    order_items: { item_name: string; quantity: number; subtotal: number | string }[];
  };

  const { data: config } = await supabase
    .from("online_store_config")
    .select("id, slug, store_name, primary_color, estimated_prep_minutes, notification_prefs")
    .eq("location_id", o.location_id)
    .limit(1)
    .single();

  const cfg = (config ?? {}) as {
    slug?: string;
    store_name?: string;
    primary_color?: string;
    estimated_prep_minutes?: number;
    notification_prefs?: Partial<NotificationPrefs>;
  };

  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("customer_email_opt_in, customer_sms_opt_in")
    .eq("order_id", orderId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  const { data: payment } = await supabase
    .from("order_payments")
    .select("card_last_four, card_type")
    .eq("order_id", orderId)
    .eq("payment_method", "card")
    .limit(1)
    .single();

  const slug = cfg.slug ?? "";
  const storeName = cfg.store_name ?? "Your order";

  return {
    orderId: o.id,
    merchantId: o.merchant_id,
    storeName,
    slug,
    primaryColor: cfg.primary_color ?? "#111827",
    displayNumber: o.display_number,
    status: o.status,
    orderType: o.order_type,
    customerName: o.customer_name,
    customerEmail: o.customer_email,
    customerPhone: o.customer_phone,
    emailOptIn: session?.customer_email_opt_in ?? true,
    smsOptIn: session?.customer_sms_opt_in ?? true,
    estimatedPrepMinutes: cfg.estimated_prep_minutes ?? 20,
    cancellationReason: o.cancellation_reason,
    subtotal: Number(o.subtotal) || 0,
    tax: Number(o.tax_amount) || 0,
    tip: Number(o.tip_amount) || 0,
    total: Number(o.total_amount) || 0,
    cardLastFour: payment?.card_last_four ?? null,
    cardType: payment?.card_type ?? null,
    items: (o.order_items ?? []).map((i) => ({
      name: i.item_name,
      quantity: i.quantity,
      subtotal: Number(i.subtotal) || 0,
    })),
    prefs: { ...DEFAULT_PREFS, ...(cfg.notification_prefs ?? {}) },
    trackingUrl: slug
      ? `${getBaseUrl()}/sites/${slug}/order/${o.id}`
      : `${getBaseUrl()}/`,
  };
}

async function logNotification(
  ctx: OrderContext,
  channel: "email" | "sms",
  event: OrderEvent,
  recipient: string,
  result: { id?: string; error?: string },
  forced?: { status: "sent" | "failed" | "skipped" }
) {
  const supabase = createServiceRoleClient();
  const status =
    forced?.status ??
    ("error" in result && result.error
      ? "failed"
      : "id" in result && result.id
        ? "sent"
        : "failed");

  await supabase.from("order_notifications").insert({
    order_id: ctx.orderId,
    merchant_id: ctx.merchantId,
    channel,
    event,
    recipient,
    status,
    provider_id: "id" in result ? (result.id ?? null) : null,
    error: "error" in result ? (result.error ?? null) : null,
  });
}

function statusCopy(event: OrderEvent, ctx: OrderContext): { subject: string; headline: string; body: string; sms: string } {
  const num = ctx.displayNumber;
  const store = ctx.storeName;
  switch (event) {
    case "placed":
      return {
        subject: `Order ${num} confirmed — ${store}`,
        headline: "Order received!",
        body: `Thanks for ordering from ${store}. We'll start preparing your order shortly. Estimated time: ~${ctx.estimatedPrepMinutes} minutes.`,
        sms: `${store}: Order ${num} received! Track it: ${ctx.trackingUrl}`,
      };
    case "accepted":
      return {
        subject: `Order ${num} accepted — ${store}`,
        headline: "Order accepted",
        body: `${store} has accepted your order. We're firing it up now.`,
        sms: `${store}: Order ${num} accepted — kitchen is on it!`,
      };
    case "sent_to_kitchen":
      return {
        subject: `Order ${num} is in the kitchen — ${store}`,
        headline: "Sent to the kitchen",
        body: `${store} just sent your order to the kitchen.`,
        sms: `${store}: Order ${num} is in the kitchen.`,
      };
    case "preparing":
      return {
        subject: `Order ${num} is being prepared — ${store}`,
        headline: "Cooking now",
        body: `${store} has started preparing your order.`,
        sms: `${store}: Order ${num} is being cooked!`,
      };
    case "ready":
      return {
        subject: `Order ${num} is ready! — ${store}`,
        headline: ctx.orderType === "delivery" ? "Out for delivery" : "Ready for pickup",
        body:
          ctx.orderType === "delivery"
            ? `Your order is on the way. Track progress: ${ctx.trackingUrl}`
            : `Your order is ready for pickup at ${store}.`,
        sms:
          ctx.orderType === "delivery"
            ? `${store}: Order ${num} is out for delivery!`
            : `${store}: Order ${num} is ready for pickup!`,
      };
    case "completed":
      return {
        subject: `Thanks from ${store}!`,
        headline: "Order completed",
        body: `Thanks for choosing ${store}. We hope you enjoyed your order!`,
        sms: `${store}: Order ${num} complete. Thank you!`,
      };
    case "cancelled":
      return {
        subject: `Order ${num} cancelled — ${store}`,
        headline: "Order cancelled",
        body: ctx.cancellationReason
          ? `Your order was cancelled. Reason: ${ctx.cancellationReason}. Any authorization will be voided.`
          : `Your order was cancelled before it was accepted. Any authorization will be voided.`,
        // Mirror the email: include the reason and a tracking link so the customer
        // can open the order and see its status/reason. The URL goes on its own
        // line — SMS has no markup, so phones auto-linkify bare URLs, and keeping
        // it unglued from surrounding text makes that detection reliable.
        sms: [
          [
            `${store}: Order ${num} was cancelled.`,
            ctx.cancellationReason ? `Reason: ${ctx.cancellationReason}.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          `Track your order:`,
          ctx.trackingUrl,
        ].join("\n"),
      };
    case "declined":
      return {
        subject: `Order ${num} declined — ${store}`,
        headline: "Order declined",
        body: `Sorry — ${store} couldn't accept this order. Any authorization will be voided.`,
        sms: `${store}: Order ${num} was declined. Any charge will be voided.`,
      };
  }
}

function renderEmail(event: OrderEvent, ctx: OrderContext): string {
  const copy = statusCopy(event, ctx);
  const itemsHtml = ctx.items
    .map(
      (i) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(`${i.quantity}x ${i.name}`)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${i.subtotal.toFixed(2)}</td></tr>`
    )
    .join("");

  const accent = ctx.primaryColor;
  const showItems = event === "placed" || event === "cancelled";
  const tipRow =
    ctx.tip > 0
      ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Tip</span><span>$${ctx.tip.toFixed(2)}</span></div>`
      : "";
  const paymentRow = ctx.cardLastFour
    ? `<div style="margin:16px 0;padding:12px 16px;background:#f9fafb;border-radius:8px;display:flex;justify-content:space-between;align-items:center;"><span style="color:#666;font-size:14px;">Payment</span><span style="font-size:14px;font-weight:600;">${escapeHtml(ctx.cardType ?? "Card")} •••• ${escapeHtml(ctx.cardLastFour)}</span></div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:${accent};color:#ffffff;padding:32px 24px;text-align:center;">
      <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;margin-bottom:8px;">${escapeHtml(ctx.storeName)}</div>
      <div style="font-size:24px;font-weight:600;">${escapeHtml(copy.headline)}</div>
      <div style="font-size:14px;margin-top:8px;opacity:0.9;">Order ${escapeHtml(ctx.displayNumber)}</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(copy.body)}</p>
      ${
        showItems
          ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #111827;font-size:13px;">Item</th><th style="text-align:right;padding:8px;border-bottom:2px solid #111827;font-size:13px;">Subtotal</th></tr></thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            <div style="margin:16px 0;padding:16px;background:#f9fafb;border-radius:10px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Subtotal</span><span>$${ctx.subtotal.toFixed(2)}</span></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Tax</span><span>$${ctx.tax.toFixed(2)}</span></div>
              ${tipRow}
              <div style="display:flex;justify-content:space-between;font-weight:600;font-size:16px;padding-top:8px;border-top:1px solid #e5e7eb;"><span>Total</span><span>$${ctx.total.toFixed(2)}</span></div>
            </div>
            ${paymentRow}`
          : ""
      }
      <div style="text-align:center;margin-top:24px;">
        <a href="${escapeHtml(ctx.trackingUrl)}" style="display:inline-block;padding:14px 28px;background:${accent};color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Track your order</a>
      </div>
    </div>
    <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;">
      You're receiving this transactional email because you placed an order at ${escapeHtml(ctx.storeName)}.
    </div>
  </div>
</body></html>`;
}

async function renderReceiptForOrder(orderId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      `*,
      order_items(*, order_item_modifiers(*)),
      order_payments(*),
      location:locations!orders_location_id_fkey(name, address_line1, address_line2, city, state, postal_code, phone)`
    )
    .eq("id", orderId)
    .single();

  if (!order) return null;

  const merchantId = (order as { merchant_id?: string }).merchant_id;
  let merchantLogoUrl: string | null = null;
  if (merchantId) {
    const { data } = await supabase
      .from("merchants")
      .select("organizations(imageURL)")
      .eq("id", merchantId)
      .maybeSingle();
    const org = (data as { organizations?: { imageURL?: string | null } | { imageURL?: string | null }[] | null } | null)?.organizations;
    const record = Array.isArray(org) ? org[0] : org;
    merchantLogoUrl = record?.imageURL ?? null;
  }

  const location = (order as { location?: unknown }).location ?? null;
  return renderReceiptHtml(
    order as Parameters<typeof renderReceiptHtml>[0],
    location as Parameters<typeof renderReceiptHtml>[1],
    { merchantLogoUrl }
  );
}

async function fireEmail(ctx: OrderContext, event: OrderEvent) {
  if (!ctx.customerEmail || !ctx.emailOptIn) {
    await logNotification(
      ctx,
      "email",
      event,
      ctx.customerEmail ?? "",
      { error: ctx.customerEmail ? "opted_out" : "no_email" },
      { status: "skipped" }
    );
    return;
  }
  const copy = statusCopy(event, ctx);

  // For order-placed, reuse the merchant-side receipt template so the customer
  // sees the same beautiful, branded receipt the merchant can send manually.
  let html: string;
  if (event === "placed") {
    const receiptHtml = await renderReceiptForOrder(ctx.orderId);
    html = receiptHtml
      ? receiptHtml + buildTrackingFooter(ctx)
      : renderEmail(event, ctx);
  } else {
    html = renderEmail(event, ctx);
  }

  const result = await sendEmail(ctx.customerEmail, copy.subject, html);
  await logNotification(ctx, "email", event, ctx.customerEmail, result);
}

function buildTrackingFooter(ctx: OrderContext): string {
  return `<div style="max-width:560px;margin:16px auto 32px;padding:0 16px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <a href="${ctx.trackingUrl.replace(/"/g, "&quot;")}" style="display:inline-block;padding:14px 28px;background:${ctx.primaryColor};color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Track your order</a>
  </div>`;
}

async function fireSMS(ctx: OrderContext, event: OrderEvent) {
  if (!ctx.customerPhone || !ctx.smsOptIn) {
    await logNotification(
      ctx,
      "sms",
      event,
      ctx.customerPhone ?? "",
      { error: ctx.customerPhone ? "opted_out" : "no_phone" },
      { status: "skipped" }
    );
    return;
  }
  const copy = statusCopy(event, ctx);
  const result = await sendSMS(ctx.customerPhone, copy.sms);
  await logNotification(ctx, "sms", event, ctx.customerPhone, result);
}

/** Fire receipt email + confirmation SMS for a freshly placed order. */
export async function sendOrderPlacedNotifications(orderId: string): Promise<void> {
  const ctx = await loadOrderContext(orderId);
  if (!ctx) return;
  const tasks: Promise<void>[] = [];
  if (ctx.prefs.email_on_order_placed) tasks.push(fireEmail(ctx, "placed"));
  if (ctx.prefs.sms_on_order_placed) tasks.push(fireSMS(ctx, "placed"));
  await Promise.allSettled(tasks);
}

/** Fire status-change notifications honoring merchant prefs + customer opt-ins. */
export async function sendOrderStatusNotifications(
  orderId: string,
  event: OrderEvent
): Promise<void> {
  const ctx = await loadOrderContext(orderId);
  if (!ctx) return;
  const tasks: Promise<void>[] = [];
  if (ctx.prefs.email_on_status.includes(event)) tasks.push(fireEmail(ctx, event));
  if (ctx.prefs.sms_on_status.includes(event)) tasks.push(fireSMS(ctx, event));
  await Promise.allSettled(tasks);
}

/** Send a test notification using stub data + the merchant's admin contact. */
export async function sendTestNotification(
  storeConfigId: string,
  channel: "email" | "sms",
  to: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceRoleClient();
  const { data: config } = await supabase
    .from("online_store_config")
    .select("store_name, primary_color, slug")
    .eq("id", storeConfigId)
    .single();

  const cfg = (config ?? {}) as { store_name?: string; primary_color?: string; slug?: string };
  const storeName = cfg.store_name ?? "Your store";
  const slug = cfg.slug ?? "";

  const stubCtx: OrderContext = {
    orderId: "test",
    merchantId: "test",
    storeName,
    slug,
    primaryColor: cfg.primary_color ?? "#111827",
    displayNumber: "TEST-001",
    status: "pending",
    orderType: "pickup",
    customerName: "Test Customer",
    customerEmail: channel === "email" ? to : null,
    customerPhone: channel === "sms" ? to : null,
    emailOptIn: true,
    smsOptIn: true,
    estimatedPrepMinutes: 20,
    cancellationReason: null,
    subtotal: 18.5,
    tax: 1.55,
    tip: 3.0,
    total: 23.05,
    cardLastFour: "4242",
    cardType: "Visa",
    items: [
      { name: "Sample Burger", quantity: 1, subtotal: 12.5 },
      { name: "Fries", quantity: 1, subtotal: 6.0 },
    ],
    prefs: DEFAULT_PREFS,
    trackingUrl: `${getBaseUrl()}/sites/${slug}`,
  };

  if (channel === "email") {
    const copy = statusCopy("placed", stubCtx);
    const result = await sendEmail(to, `[TEST] ${copy.subject}`, renderEmail("placed", stubCtx));
    return "error" in result
      ? { success: false, error: result.error }
      : { success: true };
  }
  const copy = statusCopy("placed", stubCtx);
  const result = await sendSMS(to, `[TEST] ${copy.sms}`);
  return "error" in result ? { success: false, error: result.error } : { success: true };
}
