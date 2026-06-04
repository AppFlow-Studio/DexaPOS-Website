"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrderFullHistory } from "@/types/order-full-history";

export async function GetOrderFullHistory(
  orderId: string
): Promise<OrderFullHistory | null> {
  if (!orderId) return null;

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_order_full_history", {
    p_order_id: orderId,
  });

  if (error) {
    if (error.code === "42501") {
      const err = new Error("Access denied") as Error & { code?: string };
      err.code = "ACCESS_DENIED";
      throw err;
    }
    console.error("[GetOrderFullHistory] RPC error:", error);
    return null;
  }

  return data as OrderFullHistory | null;
}
