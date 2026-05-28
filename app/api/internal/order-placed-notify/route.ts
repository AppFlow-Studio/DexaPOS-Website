import { NextResponse } from "next/server";
import { sendOrderPlacedNotifications } from "@/lib/messaging/order-notifications";

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_NOTIFICATION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const auth = request.headers.get("x-internal-secret");
  if (auth !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { order_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.order_id) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    await sendOrderPlacedNotifications(body.order_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[order-placed-notify] failed:", err);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}
