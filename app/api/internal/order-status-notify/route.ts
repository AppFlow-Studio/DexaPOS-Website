import { NextResponse } from "next/server";
import { sendOrderStatusNotifications, type OrderEvent } from "@/lib/messaging/order-notifications";

const VALID_EVENTS: OrderEvent[] = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
  "declined",
];

/**
 * Internal endpoint invoked from edge functions / DB triggers / the POS sync
 * worker when an online order's status changes. Authenticated via a shared
 * secret so it can be called server-to-server without a user session.
 */
export async function POST(request: Request) {
  const secret = process.env.INTERNAL_NOTIFICATION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const auth = request.headers.get("x-internal-secret");
  if (auth !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { order_id?: string; event?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const orderId = body.order_id;
  const event = body.event as OrderEvent | undefined;

  if (!orderId || !event || !VALID_EVENTS.includes(event)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    await sendOrderStatusNotifications(orderId, event);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[order-status-notify] failed:", err);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}
