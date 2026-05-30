"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GetServiceChargeRules,
  UpsertServiceChargeRule,
  DeleteServiceChargeRule,
  ServiceChargeRule,
  ServiceChargeRuleInput,
} from "@/app/dashboard/actions/service-charge";

const queryKey = (clerkOrgId: string | undefined) =>
  ["service-charge-rules", clerkOrgId] as const;

export function useServiceChargeRules(clerkOrgId: string | undefined) {
  return useQuery({
    queryKey: queryKey(clerkOrgId),
    queryFn: async (): Promise<ServiceChargeRule[]> => {
      if (!clerkOrgId) throw new Error("Missing clerkOrgId");
      const result = await GetServiceChargeRules(clerkOrgId);
      if (result.error) throw new Error(result.error);
      return result.data ?? [];
    },
    enabled: !!clerkOrgId,
    staleTime: 30 * 1000,
  });
}

export function useUpsertServiceChargeRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      input,
    }: {
      clerkOrgId: string;
      input: ServiceChargeRuleInput;
    }) => {
      const result = await UpsertServiceChargeRule(clerkOrgId, input);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: queryKey(variables.clerkOrgId),
        refetchType: "active",
      });
      toast.success("Service charge saved");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save service charge");
    },
  });
}

export function useDeleteServiceChargeRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      ruleId,
    }: {
      clerkOrgId: string;
      ruleId: string;
    }) => {
      const result = await DeleteServiceChargeRule(clerkOrgId, ruleId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: queryKey(variables.clerkOrgId),
        refetchType: "active",
      });
      toast.success("Service charge disabled");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to disable service charge");
    },
  });
}
