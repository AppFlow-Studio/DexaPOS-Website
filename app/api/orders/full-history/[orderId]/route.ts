import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { GetOrderFullHistory } from "@/app/dashboard/actions/order";

export async function GET(
  _req: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await context.params;
    if (!orderId) {
      return NextResponse.json(
        { error: "Missing orderId" },
        { status: 400 }
      );
    }

    const data = await GetOrderFullHistory(orderId);
    if (!data) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    if (err?.code === "ACCESS_DENIED") {
      return NextResponse.json(
        { error: "You don't have permission to view this order" },
        { status: 403 }
      );
    }
    Sentry.captureException(error);
    console.error("[GET /api/orders/full-history/[orderId]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

