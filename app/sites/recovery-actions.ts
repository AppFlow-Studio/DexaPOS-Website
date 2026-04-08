"use server";

import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrderTracking } from "./order-actions";

// ---- Find Abandoned Carts ----

export async function findAbandonedCarts(storeConfigId: string) {
  const supabase = createServiceRoleClient();
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  // Find sessions that:
  // 1. Have no order placed
  // 2. Have non-empty cart_data
  // 3. Have an email or phone
  // 4. Were last updated 30+ minutes ago
  // 5. Don't already have a notification sent
  const { data: sessions, error } = await supabase
    .from("online_order_sessions")
    .select(`
      id, session_token, store_config_id, customer_email, customer_phone,
      customer_name, cart_data, updated_at
    `)
    .eq("store_config_id", storeConfigId)
    .is("order_id", null)
    .lt("updated_at", thirtyMinAgo)
    .not("cart_data", "eq", "[]")
    .not("cart_data", "is", null);

  if (error || !sessions) return [];

  // Filter out sessions that already have a notification
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) return [];

  const { data: existingNotifications } = await supabase
    .from("abandoned_cart_notifications")
    .select("session_id")
    .in("session_id", sessionIds);

  const notifiedSessionIds = new Set(
    (existingNotifications ?? []).map((n: any) => n.session_id)
  );

  return sessions.filter(
    (s) =>
      !notifiedSessionIds.has(s.id) &&
      (s.customer_email || s.customer_phone) &&
      Array.isArray(s.cart_data) &&
      s.cart_data.length > 0
  );
}

// ---- Send Cart Recovery Email ----

export async function sendCartRecoveryEmail(
  sessionId: string,
  email: string,
  slug: string,
  storeName: string,
  cartItems: any[]
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: "Email service not configured" };
  }

  const supabase = createServiceRoleClient();

  // Get session's store_config_id
  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("store_config_id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return { success: false, error: "Session not found" };
  }

  // Create notification record with recovery token
  const { data: notification, error: insertError } = await supabase
    .from("abandoned_cart_notifications")
    .insert({
      session_id: sessionId,
      store_config_id: session.store_config_id,
      notification_type: "email",
      recipient: email,
      status: "pending",
    })
    .select("id, recovery_token")
    .single();

  if (insertError || !notification) {
    return { success: false, error: "Failed to create notification record" };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  const recoveryUrl = `${baseUrl}/sites/${slug}/checkout?recover=${notification.recovery_token}`;

  const itemsHtml = cartItems
    .map(
      (item: any) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${item.quantity || 1}x ${item.name}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${((item.totalPrice || item.price || 0) * (item.quantity || 1)).toFixed(2)}</td></tr>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',system-ui,sans-serif;max-width:500px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="margin-bottom:4px;">${storeName}</h2>
  <p style="color:#666;margin-top:0;">You left some items in your cart!</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
    <thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #333;">Item</th><th style="text-align:right;padding:8px;border-bottom:2px solid #333;">Price</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div style="text-align:center;margin:30px 0;">
    <a href="${recoveryUrl}" style="display:inline-block;padding:14px 32px;background-color:#000;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Complete Your Order</a>
  </div>
  <p style="font-size:12px;color:#999;text-align:center;">If you didn't start this order, you can safely ignore this email.</p>
</body>
</html>`.trim();

  try {
    const resend = new Resend(apiKey);
    const fromEmail = process.env.RESEND_FROM_EMAIL || "orders@resend.dev";

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `Complete your order from ${storeName}`,
      html,
    });

    if (emailError) {
      await supabase
        .from("abandoned_cart_notifications")
        .update({ status: "failed", error_message: emailError.message, sent_at: new Date().toISOString() })
        .eq("id", notification.id);
      return { success: false, error: emailError.message };
    }

    await supabase
      .from("abandoned_cart_notifications")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", notification.id);

    return { success: true };
  } catch (err: any) {
    await supabase
      .from("abandoned_cart_notifications")
      .update({ status: "failed", error_message: err?.message, sent_at: new Date().toISOString() })
      .eq("id", notification.id);
    return { success: false, error: err?.message || "Failed to send email" };
  }
}

// ---- Send Order Confirmation Email ----

export async function sendOrderConfirmationEmail(
  orderId: string,
  email: string
): Promise<{ success: boolean; error?: string }> {
  console.log("[EMAIL] sendOrderConfirmationEmail called", { orderId, email });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !email) {
    console.error("[EMAIL] Missing apiKey or email", { hasApiKey: !!apiKey, email });
    return { success: false, error: "Email service not configured or no email" };
  }

  const { data: order } = await getOrderTracking(orderId);
  if (!order) {
    console.error("[EMAIL] Order not found for id:", orderId);
    return { success: false, error: "Order not found" };
  }

  console.log("[EMAIL] Order found, sending to:", email, "from:", process.env.RESEND_FROM_EMAIL);

  const itemsHtml = order.items
    .map(
      (item) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${item.quantity}x ${item.name}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${item.subtotal.toFixed(2)}</td></tr>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',system-ui,sans-serif;max-width:500px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;margin-bottom:24px;">
    <div style="display:inline-block;width:48px;height:48px;background:#22c55e;border-radius:50%;line-height:48px;text-align:center;color:#fff;font-size:24px;">&#10003;</div>
  </div>
  <h2 style="text-align:center;margin-bottom:4px;">Order Confirmed!</h2>
  <p style="text-align:center;color:#666;margin-top:0;">Order ${order.displayNumber}</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
    <thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #333;">Item</th><th style="text-align:right;padding:8px;border-bottom:2px solid #333;">Price</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div style="margin:20px 0;padding:16px;background:#f9fafb;border-radius:8px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Subtotal</span><span>$${order.subtotal.toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Tax</span><span>$${order.tax.toFixed(2)}</span></div>
    ${order.tip > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Tip</span><span>$${order.tip.toFixed(2)}</span></div>` : ""}
    <div style="display:flex;justify-content:space-between;font-weight:600;font-size:16px;padding-top:8px;border-top:1px solid #ddd;"><span>Total</span><span>$${order.total.toFixed(2)}</span></div>
  </div>
  <p style="text-align:center;color:#666;font-size:14px;">Estimated prep time: ~${order.estimatedPrepMinutes} minutes</p>
  ${order.cardLastFour ? `
  <div style="margin:16px 0;padding:12px 16px;background:#f9fafb;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
    <span style="color:#666;font-size:14px;">Payment</span>
    <span style="font-size:14px;font-weight:600;">${order.cardType || 'Card'} •••• ${order.cardLastFour}</span>
  </div>` : ''}
  <p style="font-size:12px;color:#999;text-align:center;margin-top:24px;">Thank you for your order!</p>
</body>
</html>`.trim();

  try {
    const resend = new Resend(apiKey);
    const fromEmail = process.env.RESEND_FROM_EMAIL || "orders@resend.dev";

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `Order Confirmed - ${order.displayNumber}`,
      html,
    });

    if (emailError) {
      console.error("[EMAIL] Resend error:", emailError);
      return { success: false, error: emailError.message };
    }

    console.log("[EMAIL] Email sent successfully to:", email);
    return { success: true };
  } catch (err: any) {
    console.error("[EMAIL] Exception:", err);
    return { success: false, error: err?.message || "Failed to send email" };
  }
}

// ---- Send Order Cancellation Email ----

export async function sendOrderCancellationEmail(
  orderId: string,
  email: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !email) {
    return { success: false, error: "Email service not configured or no email" };
  }

  const { data: order } = await getOrderTracking(orderId);
  if (!order) {
    return { success: false, error: "Order not found" };
  }

  const itemsHtml = order.items
    .map(
      (item) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${item.quantity}x ${item.name}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${item.subtotal.toFixed(2)}</td></tr>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',system-ui,sans-serif;max-width:500px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;margin-bottom:24px;">
    <div style="display:inline-block;width:48px;height:48px;background:#ef4444;border-radius:50%;line-height:48px;text-align:center;color:#fff;font-size:24px;">!</div>
  </div>
  <h2 style="text-align:center;margin-bottom:4px;">Order Cancelled</h2>
  <p style="text-align:center;color:#666;margin-top:0;">Order ${order.displayNumber}</p>
  <p style="text-align:center;color:#666;">${order.cancellationReason || "Your order was cancelled before it was accepted."}</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
    <thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #333;">Item</th><th style="text-align:right;padding:8px;border-bottom:2px solid #333;">Price</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div style="margin:20px 0;padding:16px;background:#f9fafb;border-radius:8px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Subtotal</span><span>$${order.subtotal.toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Tax</span><span>$${order.tax.toFixed(2)}</span></div>
    ${order.tip > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Tip</span><span>$${order.tip.toFixed(2)}</span></div>` : ""}
    <div style="display:flex;justify-content:space-between;font-weight:600;font-size:16px;padding-top:8px;border-top:1px solid #ddd;"><span>Total</span><span>$${order.total.toFixed(2)}</span></div>
  </div>
  <p style="font-size:12px;color:#999;text-align:center;margin-top:24px;">If your card was charged, the authorization has been voided.</p>
</body>
</html>`.trim();

  try {
    const resend = new Resend(apiKey);
    const fromEmail = process.env.RESEND_FROM_EMAIL || "orders@resend.dev";

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `Order Cancelled - ${order.displayNumber}`,
      html,
    });

    if (emailError) {
      return { success: false, error: emailError.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to send email" };
  }
}

// ---- Get Recovery Session ----

export async function getRecoverySession(recoveryToken: string): Promise<{
  cartData: any[] | null;
  sessionToken: string | null;
  notificationId: string | null;
}> {
  if (!recoveryToken) return { cartData: null, sessionToken: null, notificationId: null };

  const supabase = createServiceRoleClient();

  const { data: notification } = await supabase
    .from("abandoned_cart_notifications")
    .select("id, session_id")
    .eq("recovery_token", recoveryToken)
    .single();

  if (!notification) return { cartData: null, sessionToken: null, notificationId: null };

  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("session_token, cart_data")
    .eq("id", notification.session_id)
    .single();

  if (!session) return { cartData: null, sessionToken: null, notificationId: null };

  return {
    cartData: session.cart_data ?? null,
    sessionToken: session.session_token,
    notificationId: notification.id,
  };
}

// ---- Mark Recovery Click ----

export async function markRecoveryClicked(notificationId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("abandoned_cart_notifications")
    .update({ status: "clicked", clicked_at: new Date().toISOString() })
    .eq("id", notificationId);
}
