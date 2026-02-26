import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  GetCustomerMarketingCampaignHistory,
  GetCustomerMarketingPreferences,
  UpdateCustomerMarketingPreferences,
  UnsubscribeFromMarketing,
  SendQuickMessage,
  GetMarketingCampaignStats,
  GetMerchantMarketingCampaigns,
  DeleteMarketingCampaign,
  CreateMarketingCampaign,
  GetMarketingCampaignRecipients,
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
      queryClient.invalidateQueries({
        queryKey: ["merchant-marketing-campaigns"],
      });
    },
  });
}

/**
 * Get all campaigns for the merchant
 */
export function useMerchantMarketingCampaigns() {
  const { data: userInfo } = useUserInfo();
  const merchantId = userInfo?.members?.[0]?.organizations?.merchants?.id || null;

  return useQuery({
    queryKey: ["merchant-marketing-campaigns", merchantId],
    queryFn: async () => {
      if (!merchantId) return [];
      return GetMerchantMarketingCampaigns(merchantId);
    },
    enabled: !!merchantId,
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * Mutation: Delete marketing campaign
 */
export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: DeleteMarketingCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["merchant-marketing-campaigns"],
      });
    },
  });
}

/**
 * Mutation: Create marketing campaign
 */
export function useCreateCampaign() {
  const { data: userInfo } = useUserInfo();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Omit<Parameters<typeof CreateMarketingCampaign>[0], 'merchantId'>) =>
      CreateMarketingCampaign({
        ...variables,
        merchantId: userInfo?.members?.[0]?.organizations?.merchants?.id || "",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["merchant-marketing-campaigns"],
      });
    },
  });
}

/**
 * Get recipients for a specific campaign
 */
export function useMarketingCampaignRecipients(campaignId: string | null) {
  return useQuery({
    queryKey: ["marketing-campaign-recipients", campaignId],
    queryFn: () =>
      campaignId ? GetMarketingCampaignRecipients(campaignId) : Promise.resolve([]),
    enabled: !!campaignId,
    staleTime: 1000 * 60 * 5,
  });
}
