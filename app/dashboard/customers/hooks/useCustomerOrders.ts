"use client";

import { useQuery } from "@tanstack/react-query";
import { GetCustomerOrders } from "@/app/dashboard/actions/order";
import type { OrderResponse } from "@/types/order-management";

/**
 * Fetch all orders for a specific customer
 */
export function useCustomerOrders(customerId: string | null) {
  return useQuery<OrderResponse[]>({
    queryKey: ["customer", "orders", customerId],
    queryFn: () => (customerId ? GetCustomerOrders(customerId) : Promise.resolve([])),
    enabled: !!customerId,
    staleTime: 30000, // 30 seconds
  });
}
