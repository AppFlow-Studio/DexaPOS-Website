"use server";

import {
  sendOrderPlacedNotifications,
  sendOrderStatusNotifications,
  type OrderEvent,
} from "@/lib/messaging/order-notifications";

/** Server-action wrapper so the storefront can fire receipt notifications
 *  after the create-online-order edge function returns success. */
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  if (!orderId) return;
  try {
    await sendOrderPlacedNotifications(orderId);
  } catch (err) {
    console.error("[notifyOrderPlaced] failed:", err);
  }
}

export async function notifyOrderStatus(
  orderId: string,
  event: OrderEvent
): Promise<void> {
  if (!orderId || !event) return;
  try {
    await sendOrderStatusNotifications(orderId, event);
  } catch (err) {
    console.error("[notifyOrderStatus] failed:", err);
  }
}
