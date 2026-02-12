"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getReceiptTemplates,
  upsertReceiptTemplate,
  initializeDefaultTemplates,
} from "@/app/dashboard/actions/receipt-templates";
import type { UpsertReceiptTemplateInput } from "../types";
import { toast } from "sonner";

/**
 * Hook to fetch all receipt templates for a location
 */
export function useReceiptTemplates(locationId: string) {
  return useQuery({
    queryKey: ["receipt-templates", locationId],
    queryFn: async () => {
      const result = await getReceiptTemplates(locationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch receipt templates");
      }
      return result.data || [];
    },
    enabled: !!locationId && locationId !== "all",
    staleTime: 30_000,
  });
}

/**
 * Hook to upsert a receipt template
 */
export function useUpsertReceiptTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      input,
    }: {
      clerkOrgId: string;
      input: UpsertReceiptTemplateInput;
    }) => {
      const result = await upsertReceiptTemplate(clerkOrgId, input);
      if (!result.success) {
        throw new Error(result.error || "Failed to save receipt template");
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["receipt-templates", variables.input.location_id],
      });
      toast.success("Receipt template saved successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save receipt template");
    },
  });
}

/**
 * Hook to initialize all default receipt templates for a location
 */
export function useInitializeDefaultTemplates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      locationId,
    }: {
      clerkOrgId: string;
      locationId: string;
    }) => {
      const result = await initializeDefaultTemplates(clerkOrgId, locationId);
      if (!result.success) {
        throw new Error(
          result.error || "Failed to initialize default templates",
        );
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["receipt-templates", variables.locationId],
      });
      toast.success("Default receipt templates saved successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to initialize default templates");
    },
  });
}
