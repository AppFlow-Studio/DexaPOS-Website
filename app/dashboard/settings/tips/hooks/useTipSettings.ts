"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GetTipPoolConfigs,
  CreateTipPoolConfig,
  UpdateTipPoolConfig,
  DeleteTipPoolConfig,
  ToggleTipPoolConfig,
  GetTipOutRules,
  CreateTipOutRule,
  UpdateTipOutRule,
  DeleteTipOutRule,
  GetRolesForMerchant,
} from "@/app/dashboard/actions/tips";

// =====================================================
// TIP POOL CONFIGS
// =====================================================

export function useTipPoolConfigs(
  clerkOrgId: string | undefined,
  locationId: string | undefined
) {
  return useQuery({
    queryKey: ["tip-pool-configs", clerkOrgId, locationId],
    queryFn: async () => {
      if (!clerkOrgId || !locationId) throw new Error("Missing required parameters");
      const result = await GetTipPoolConfigs(clerkOrgId, locationId);
      if (!result.success) throw new Error(result.error || "Failed to fetch tip pools");
      return result.data || [];
    },
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

export function useCreateTipPool(onSettled?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      locationId,
      input,
    }: {
      clerkOrgId: string;
      locationId: string;
      input: Parameters<typeof CreateTipPoolConfig>[2];
    }) => {
      const result = await CreateTipPoolConfig(clerkOrgId, locationId, input);
      if (!result.success) throw new Error(result.error || "Failed to create tip pool");
      return result.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["tip-pool-configs", variables.clerkOrgId, variables.locationId],
        refetchType: "active",
      });
      toast.success("Tip pool created successfully");
      onSettled?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create tip pool");
    },
  });
}

export function useUpdateTipPool(onSettled?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      configId,
      input,
    }: {
      clerkOrgId: string;
      configId: string;
      input: Parameters<typeof UpdateTipPoolConfig>[2];
    }) => {
      const result = await UpdateTipPoolConfig(clerkOrgId, configId, input);
      if (!result.success) throw new Error(result.error || "Failed to update tip pool");
      return result.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tip-pool-configs"],
        refetchType: "active",
      });
      toast.success("Tip pool updated successfully");
      onSettled?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update tip pool");
    },
  });
}

export function useDeleteTipPool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      configId,
    }: {
      clerkOrgId: string;
      configId: string;
    }) => {
      const result = await DeleteTipPoolConfig(clerkOrgId, configId);
      if (!result.success) throw new Error(result.error || "Failed to delete tip pool");
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tip-pool-configs"],
        refetchType: "active",
      });
      toast.success("Tip pool deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete tip pool");
    },
  });
}

export function useToggleTipPool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      configId,
      isActive,
    }: {
      clerkOrgId: string;
      configId: string;
      isActive: boolean;
    }) => {
      const result = await ToggleTipPoolConfig(clerkOrgId, configId, isActive);
      if (!result.success) throw new Error(result.error || "Failed to toggle tip pool");
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tip-pool-configs"],
        refetchType: "active",
      });
      toast.success("Tip pool updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update tip pool");
    },
  });
}

// =====================================================
// TIP-OUT RULES
// =====================================================

export function useTipOutRules(
  clerkOrgId: string | undefined,
  locationId: string | undefined
) {
  return useQuery({
    queryKey: ["tip-out-rules", clerkOrgId, locationId],
    queryFn: async () => {
      if (!clerkOrgId || !locationId) throw new Error("Missing required parameters");
      const result = await GetTipOutRules(clerkOrgId, locationId);
      if (!result.success) throw new Error(result.error || "Failed to fetch tip-out rules");
      return result.data || [];
    },
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

export function useCreateTipOutRule(onSettled?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      locationId,
      input,
    }: {
      clerkOrgId: string;
      locationId: string;
      input: Parameters<typeof CreateTipOutRule>[2];
    }) => {
      const result = await CreateTipOutRule(clerkOrgId, locationId, input);
      if (!result.success) throw new Error(result.error || "Failed to create tip-out rule");
      return result.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["tip-out-rules", variables.clerkOrgId, variables.locationId],
        refetchType: "active",
      });
      toast.success("Tip-out rule created successfully");
      onSettled?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create tip-out rule");
    },
  });
}

export function useUpdateTipOutRule(onSettled?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      ruleId,
      input,
    }: {
      clerkOrgId: string;
      ruleId: string;
      input: Parameters<typeof UpdateTipOutRule>[2];
    }) => {
      const result = await UpdateTipOutRule(clerkOrgId, ruleId, input);
      if (!result.success) throw new Error(result.error || "Failed to update tip-out rule");
      return result.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tip-out-rules"],
        refetchType: "active",
      });
      toast.success("Tip-out rule updated successfully");
      onSettled?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update tip-out rule");
    },
  });
}

export function useDeleteTipOutRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      ruleId,
    }: {
      clerkOrgId: string;
      ruleId: string;
    }) => {
      const result = await DeleteTipOutRule(clerkOrgId, ruleId);
      if (!result.success) throw new Error(result.error || "Failed to delete tip-out rule");
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tip-out-rules"],
        refetchType: "active",
      });
      toast.success("Tip-out rule deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete tip-out rule");
    },
  });
}

// =====================================================
// ROLES
// =====================================================

export function useRoles(clerkOrgId: string | undefined) {
  return useQuery({
    queryKey: ["roles", clerkOrgId],
    queryFn: async () => {
      if (!clerkOrgId) throw new Error("Missing clerkOrgId");
      const result = await GetRolesForMerchant(clerkOrgId);
      if (!result.success) throw new Error(result.error || "Failed to fetch roles");
      return result.data || [];
    },
    enabled: !!clerkOrgId,
    staleTime: 5 * 60 * 1000,
  });
}
