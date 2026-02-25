import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GetMerchantLoyaltyPrograms,
  GetCustomerLoyaltyEnrollments,
  GetCustomerLoyaltyBalance,
  GetCustomerLoyaltyLifetimePoints,
  GetCustomerLoyaltyRewards,
  GetCustomerLoyaltyTransactionHistory,
  AddLoyaltyPoints,
  RedeemLoyaltyReward,
  EnrollInLoyaltyProgram,
  GetLoyaltyProgramWithCustomerContext,
} from "@/app/dashboard/actions/loyalty";

/**
 * Get all loyalty programs for a merchant
 */
export function useMerchantLoyaltyPrograms(merchantId: string | null) {
  return useQuery({
    queryKey: ["loyalty-programs", merchantId],
    queryFn: async () => {
      if (!merchantId) return [];
      return GetMerchantLoyaltyPrograms(merchantId);
    },
    enabled: !!merchantId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get customer's loyalty program enrollments
 */
export function useCustomerLoyaltyEnrollments(customerId: string | null) {
  return useQuery({
    queryKey: ["customer-loyalty-enrollments", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      return GetCustomerLoyaltyEnrollments(customerId);
    },
    enabled: !!customerId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Get customer's current points balance
 */
export function useCustomerLoyaltyBalance(
  customerId: string | null,
  programId: string | null
) {
  return useQuery({
    queryKey: ["customer-loyalty-balance", customerId, programId],
    queryFn: async () => {
      if (!customerId || !programId) return 0;
      return GetCustomerLoyaltyBalance(customerId, programId);
    },
    enabled: !!customerId && !!programId,
    staleTime: 1000 * 60,
  });
}

/**
 * Get customer's lifetime earned points
 */
export function useCustomerLoyaltyLifetimePoints(
  customerId: string | null,
  programId: string | null
) {
  return useQuery({
    queryKey: ["customer-loyalty-lifetime", customerId, programId],
    queryFn: async () => {
      if (!customerId || !programId) return 0;
      return GetCustomerLoyaltyLifetimePoints(customerId, programId);
    },
    enabled: !!customerId && !!programId,
    staleTime: 1000 * 60,
  });
}

/**
 * Get customer's rewards
 */
export function useCustomerLoyaltyRewards(
  customerId: string | null,
  programId: string | null
) {
  return useQuery({
    queryKey: ["customer-loyalty-rewards", customerId, programId],
    queryFn: async () => {
      if (!customerId || !programId) return [];
      return GetCustomerLoyaltyRewards(customerId, programId);
    },
    enabled: !!customerId && !!programId,
    staleTime: 1000 * 60,
  });
}

/**
 * Get customer's transaction history
 */
export function useCustomerLoyaltyHistory(
  customerId: string | null,
  programId: string | null
) {
  return useQuery({
    queryKey: ["customer-loyalty-history", customerId, programId],
    queryFn: async () => {
      if (!customerId || !programId) return [];
      return GetCustomerLoyaltyTransactionHistory(customerId, programId);
    },
    enabled: !!customerId && !!programId,
    staleTime: 1000 * 60,
  });
}

/**
 * Get full program details with customer context
 */
export function useCustomerLoyaltyProgram(
  customerId: string | null,
  programId: string | null
) {
  return useQuery({
    queryKey: ["customer-loyalty-program", customerId, programId],
    queryFn: async () => {
      if (!customerId || !programId) return null;
      return GetLoyaltyProgramWithCustomerContext(programId, customerId);
    },
    enabled: !!customerId && !!programId,
    staleTime: 1000 * 60,
  });
}

/**
 * Mutation: Enroll customer in loyalty program
 */
export function useEnrollInLoyaltyProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: EnrollInLoyaltyProgram,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["customer-loyalty-enrollments", variables.customerId],
      });
      queryClient.invalidateQueries({
        queryKey: ["customer-loyalty-balance", variables.customerId],
      });
    },
  });
}

/**
 * Mutation: Add loyalty points (admin)
 */
export function useAddLoyaltyPoints() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: AddLoyaltyPoints,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["customer-loyalty-balance", variables.customerId],
      });
      queryClient.invalidateQueries({
        queryKey: ["customer-loyalty-history", variables.customerId],
      });
      queryClient.invalidateQueries({
        queryKey: ["customer-loyalty-program", variables.customerId],
      });
    },
  });
}

/**
 * Mutation: Redeem loyalty reward
 */
export function useRedeemLoyaltyReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: RedeemLoyaltyReward,
    onSuccess: (data, variables) => {
      if (data) {
        queryClient.invalidateQueries({
          queryKey: ["customer-loyalty-rewards"],
        });
      }
    },
  });
}
