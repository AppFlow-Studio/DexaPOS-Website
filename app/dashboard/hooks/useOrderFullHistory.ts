"use client";

import { useQuery } from "@tanstack/react-query";
import type { OrderFullHistory } from "@/types/order-full-history";

export type OrderFullHistoryErrorType =
  | "not_found"
  | "access_denied"
  | "network";

/**
 * Fetches full order history including order, items, payments, timeline, reversals, etc.
 * Uses the API route which calls GetOrderFullHistory server action.
 * When get_order_full_history RPC is available, this can be switched to supabase.rpc('get_order_full_history', { p_order_id: orderId }).
 */
export function useOrderFullHistory(orderId: string) {
  return useQuery<OrderFullHistory | null, Error & { status?: number }>({
    queryKey: ["order-full-history", orderId],
    queryFn: async (): Promise<OrderFullHistory | null> => {
      if (!orderId) return null;

      const res = await fetch(`/api/orders/full-history/${orderId}`);

      if (res.status === 403) {
        const err = new Error(
          "You don't have permission to view this order"
        ) as Error & { status?: number; errorType?: OrderFullHistoryErrorType };
        err.status = 403;
        err.errorType = "access_denied";
        throw err;
      }

      if (res.status === 404) {
        const err = new Error("Order not found") as Error & {
          status?: number;
          errorType?: OrderFullHistoryErrorType;
        };
        err.status = 404;
        err.errorType = "not_found";
        throw err;
      }

      if (!res.ok) {
        const err = new Error(
          res.statusText || "Failed to load order"
        ) as Error & { status?: number; errorType?: OrderFullHistoryErrorType };
        err.status = res.status;
        err.errorType = "network";
        throw err;
      }

      return res.json();
    },
    enabled: !!orderId,
    staleTime: 30_000, // 30 seconds - order detail is read-heavy
    refetchOnWindowFocus: true,
  });
}
