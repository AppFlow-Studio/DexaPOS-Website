import { NextResponse } from "next/server";
import { GetOrderFullHistory } from "@/app/dashboard/actions/order";

export async function GET(
  _req: Request,
  context: { params: { orderId: string } }
) {
  try {
    const { orderId } = context.params;
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
  } catch (error) {
    console.error("[GET /api/orders/full-history/[orderId]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

