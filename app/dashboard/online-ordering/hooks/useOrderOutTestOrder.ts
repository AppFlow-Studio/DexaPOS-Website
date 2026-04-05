"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
        toast.error(result.error || "Failed to send test order");
        return;
      }
      if (result.stored_in_dlq) {
        toast.success("Test payload stored in DLQ", {
          description: result.message || "Webhook processed in fallback path",
        });
      } else {
        toast.success("Test order created", {
          description: result.testOrderNumber,
        });
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
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to send test order");
    },
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
