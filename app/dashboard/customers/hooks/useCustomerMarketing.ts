import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GetCustomerMarketingCampaignHistory,
  GetCustomerMarketingPreferences,
  UpdateCustomerMarketingPreferences,
  UnsubscribeFromMarketing,
  SendQuickMessage,
  GetMarketingCampaignStats,
} from "@/app/dashboard/actions/marketing";

/**
 * Get customer's marketing campaign history
 */
export function useCustomerMarketingHistory(customerId: string | null) {
  return useQuery({
    queryKey: ["customer-marketing-history", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      return GetCustomerMarketingCampaignHistory(customerId);
    },
    enabled: !!customerId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Get customer's marketing preferences
 */
export function useCustomerMarketingPreferences(customerId: string | null) {
  return useQuery({
    queryKey: ["customer-marketing-preferences", customerId],
    queryFn: async () => {
      if (!customerId) return null;
      return GetCustomerMarketingPreferences(customerId);
    },
    enabled: !!customerId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Get campaign stats
 */
export function useMarketingCampaignStats(campaignId: string | null) {
  return useQuery({
    queryKey: ["marketing-campaign-stats", campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      return GetMarketingCampaignStats(campaignId);
    },
    enabled: !!campaignId,
    staleTime: 1000 * 60,
  });
}

/**
 * Mutation: Update marketing preferences
 */
export function useUpdateCustomerMarketingPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: UpdateCustomerMarketingPreferences,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["customer-marketing-preferences", variables.customerId],
      });
    },
  });
}

/**
 * Mutation: Unsubscribe from marketing
 */
export function useUnsubscribeFromMarketing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: UnsubscribeFromMarketing,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["customer-marketing-preferences", variables],
      });
    },
  });
}

/**
 * Mutation: Send quick message
 */
export function useSendQuickMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: SendQuickMessage,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["customer-marketing-history", variables.customerId],
      });
    },
  });
}
