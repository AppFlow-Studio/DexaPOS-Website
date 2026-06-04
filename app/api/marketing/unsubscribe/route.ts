import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("c");
  if (!customerId) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, merchant_id")
    .eq("id", customerId)
    .single();

  if (!customer) {
    return new NextResponse("Customer not found.", { status: 404 });
  }

  const { error } = await (supabase as any).rpc("unsubscribe_customer", {
    p_customer_id: customer.id,
    p_merchant_id: customer.merchant_id,
  });

  if (error) {
    console.error("[marketing/unsubscribe]", error);
    return new NextResponse("Failed to process unsubscribe request.", { status: 500 });
  }

  return new NextResponse(
    "You have been unsubscribed from marketing communications. You will no longer receive promotional messages.",
    {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    }
  );
}
