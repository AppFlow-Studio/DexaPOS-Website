// ============================================================================
// Loyalty Programs & Promotions React Query Hooks
// Description: Query and mutation hooks for loyalty program/promotion CRUD
// ============================================================================

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GetLoyaltyPrograms,
  CreateLoyaltyProgram,
  UpdateLoyaltyProgram,
  ToggleLoyaltyProgram,
  DeleteLoyaltyProgram,
  GetPromotions,
  CreatePromotion,
  UpdatePromotion,
  TogglePromotion,
  DeletePromotion,
  GetProgramAnalytics,
  type LoyaltyProgram,
  type LoyaltyProgramInsert,
  type LoyaltyProgramUpdate,
  type Promotion,
  type PromotionInsert,
  type PromotionUpdate,
  type ProgramWithStats,
  type ProgramAnalytics,
} from '../../../actions/loyalty-programs';

// ============================================================================
// LOYALTY PROGRAMS - Queries
// ============================================================================

/**
 * Query hook to fetch all loyalty programs for a merchant
 */
export function useLoyaltyPrograms(clerkOrgId: string | undefined) {
  return useQuery({
    queryKey: ['loyalty-programs', clerkOrgId],
    queryFn: async () => {
      if (!clerkOrgId) throw new Error('clerkOrgId is required');
      const result = await GetLoyaltyPrograms(clerkOrgId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch loyalty programs');
      }
      return result.data || [];
    },
    enabled: !!clerkOrgId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// ============================================================================
// LOYALTY PROGRAMS - Mutations
// ============================================================================

/**
 * Mutation hook to create a new loyalty program
 */
export function useCreateLoyaltyProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      input,
    }: {
      clerkOrgId: string;
      input: Omit<LoyaltyProgramInsert, 'merchant_id' | 'created_at' | 'updated_at'>;
    }) => {
      const result = await CreateLoyaltyProgram(clerkOrgId, input);
      if (!result.success) {
        throw new Error(result.error || 'Failed to create loyalty program');
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['loyalty-programs', variables.clerkOrgId],
      });
      },
    onError: (error: Error) => {},
  });
}

/**
 * Mutation hook to update an existing loyalty program
 */
export function useUpdateLoyaltyProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      programId,
      input,
    }: {
      clerkOrgId: string;
      programId: string;
      input: LoyaltyProgramUpdate;
    }) => {
      const result = await UpdateLoyaltyProgram(clerkOrgId, programId, input);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update loyalty program');
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['loyalty-programs', variables.clerkOrgId],
      });
      },
    onError: (error: Error) => {},
  });
}

/**
 * Mutation hook to toggle a loyalty program's active status
 */
export function useToggleLoyaltyProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      programId,
      isActive,
    }: {
      clerkOrgId: string;
      programId: string;
      isActive: boolean;
    }) => {
      const result = await ToggleLoyaltyProgram(clerkOrgId, programId, isActive);
      if (!result.success) {
        throw new Error(result.error || 'Failed to toggle loyalty program');
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['loyalty-programs', variables.clerkOrgId],
      });
      },
    onError: (error: Error) => {},
  });
}

/**
 * Mutation hook to delete a loyalty program
 */
export function useDeleteLoyaltyProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      programId,
    }: {
      clerkOrgId: string;
      programId: string;
    }) => {
      const result = await DeleteLoyaltyProgram(clerkOrgId, programId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete loyalty program');
      }
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['loyalty-programs', variables.clerkOrgId],
      });
      },
    onError: (error: Error) => {},
  });
}

// ============================================================================
// PROMOTIONS - Queries
// ============================================================================

/**
 * Query hook to fetch all promotions for a merchant
 */
export function usePromotions(clerkOrgId: string | undefined) {
  return useQuery({
    queryKey: ['promotions', clerkOrgId],
    queryFn: async () => {
      if (!clerkOrgId) throw new Error('clerkOrgId is required');
      const result = await GetPromotions(clerkOrgId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch promotions');
      }
      return result.data || [];
    },
    enabled: !!clerkOrgId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// ============================================================================
// PROMOTIONS - Mutations
// ============================================================================

/**
 * Mutation hook to create a new promotion
 */
export function useCreatePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      input,
    }: {
      clerkOrgId: string;
      input: Omit<PromotionInsert, 'merchant_id' | 'created_at' | 'updated_at'>;
    }) => {
      const result = await CreatePromotion(clerkOrgId, input);
      if (!result.success) {
        throw new Error(result.error || 'Failed to create promotion');
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['promotions', variables.clerkOrgId],
      });
      },
    onError: (error: Error) => {},
  });
}

/**
 * Mutation hook to update an existing promotion
 */
export function useUpdatePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      promotionId,
      input,
    }: {
      clerkOrgId: string;
      promotionId: string;
      input: PromotionUpdate;
    }) => {
      const result = await UpdatePromotion(clerkOrgId, promotionId, input);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update promotion');
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['promotions', variables.clerkOrgId],
      });
      },
    onError: (error: Error) => {},
  });
}

/**
 * Mutation hook to toggle a promotion's active status
 */
export function useTogglePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      promotionId,
      isActive,
    }: {
      clerkOrgId: string;
      promotionId: string;
      isActive: boolean;
    }) => {
      const result = await TogglePromotion(clerkOrgId, promotionId, isActive);
      if (!result.success) {
        throw new Error(result.error || 'Failed to toggle promotion');
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['promotions', variables.clerkOrgId],
      });
      },
    onError: (error: Error) => {},
  });
}

/**
 * Mutation hook to delete a promotion
 */
export function useDeletePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      promotionId,
    }: {
      clerkOrgId: string;
      promotionId: string;
    }) => {
      const result = await DeletePromotion(clerkOrgId, promotionId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete promotion');
      }
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['promotions', variables.clerkOrgId],
      });
      },
    onError: (error: Error) => {},
  });
}

// ============================================================================
// ANALYTICS - Queries
// ============================================================================

/**
 * Query hook to fetch loyalty program analytics for a specific program
 */
export function useProgramAnalytics(clerkOrgId: string | undefined, programId: string | undefined) {
  return useQuery({
    queryKey: ['program-analytics', clerkOrgId, programId],
    queryFn: async () => {
      if (!clerkOrgId || !programId) throw new Error('clerkOrgId and programId are required');
      const result = await GetProgramAnalytics(clerkOrgId, programId);
      if (!result) {
        throw new Error('Failed to fetch program analytics');
      }
      return result;
    },
    enabled: !!clerkOrgId && !!programId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
