"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  sendOrderOutTestOrder,
  listRecentTestOrders,
  type SendTestOrderInput,
} from "@/app/dashboard/actions/orderout-test-order";

/**
 * Fire a synthetic OrderOut webhook for this location.
 * On success, refreshes the recent-test-orders history + any order lists.
 */
export function useSendOrderOutTestOrder(locationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<SendTestOrderInput, "locationId">) =>
      sendOrderOutTestOrder({ ...input, locationId }),
    onSuccess: (result) => {
      if (!result.success) {
        return;
      }
      queryClient.invalidateQueries({
        queryKey: ["orderout-test-orders", locationId],
      });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["online-orders"] });
      queryClient.invalidateQueries({
        queryKey: ["orderout-recent-orders"],
      });
    },
    onError: (err) => {},
  });
}

/**
 * List recent TEST-prefixed orders for this location.
 */
export function useRecentOrderOutTestOrders(
  locationId: string,
  options: { limit?: number } = {}
) {
  const { limit = 10 } = options;
  return useQuery({
    queryKey: ["orderout-test-orders", locationId, limit],
    queryFn: () => listRecentTestOrders({ locationId, limit }),
    enabled: !!locationId && locationId !== "all",
    staleTime: 15 * 1000,
  });
}
