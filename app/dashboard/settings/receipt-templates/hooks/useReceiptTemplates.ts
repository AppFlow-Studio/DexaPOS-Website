"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getReceiptTemplates,
  upsertReceiptTemplate,
  initializeDefaultTemplates,
} from "@/app/dashboard/actions/receipt-templates";
import type { TemplateType, UpsertReceiptTemplateInput } from "../types";
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
    // Edits from this page invalidate the list; edits made elsewhere (another
    // tab, the POS) show up when the tab regains focus.
    refetchOnWindowFocus: true,
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
 * Hook to create default receipt templates for a location: every type, or only
 * `templateTypes`. Never overwrites a template that already exists.
 */
export function useInitializeDefaultTemplates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      locationId,
      templateTypes,
    }: {
      clerkOrgId: string;
      locationId: string;
      templateTypes?: TemplateType[];
    }) => {
      const result = await initializeDefaultTemplates(
        clerkOrgId,
        locationId,
        templateTypes,
      );
      if (!result.success) {
        throw new Error(
          result.error || "Failed to initialize default templates",
        );
      }
      return result.data ?? [];
    },
    onSuccess: (created, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["receipt-templates", variables.locationId],
      });
      if (created.length === 0) {
        // Someone (another tab, the POS) saved this template first. Nothing
        // was written; the refetch shows what they saved.
        toast.info("This template is already set up. Showing its saved settings.");
        return;
      }
      toast.success("Default receipt template saved");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to initialize default templates");
    },
  });
}
