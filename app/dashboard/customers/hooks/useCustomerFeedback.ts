"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GetCustomerFeedback,
  AddFeedbackResponse,
  UpdateFeedbackFlag,
} from "@/app/dashboard/actions/feedback";

export function useCustomerFeedback(customerId: string | null) {
  return useQuery({
    queryKey: ["customer", "feedback", customerId],
    queryFn: () =>
      customerId ? GetCustomerFeedback(customerId) : Promise.resolve([]),
    enabled: !!customerId,
    staleTime: 30000,
  });
}

export function useAddFeedbackResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ feedbackId, response }: { feedbackId: string; response: string }) =>
      AddFeedbackResponse(feedbackId, response),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", "feedback"] });
    },
  });
}

export function useUpdateFeedbackFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ feedbackId, isFlagged }: { feedbackId: string; isFlagged: boolean }) =>
      UpdateFeedbackFlag(feedbackId, isFlagged),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", "feedback"] });
    },
  });
}
