"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPrepStationsForLocation,
  createPrepStation,
  updatePrepStation,
  deletePrepStation,
  reorderPrepStations,
  getCategoryPrepDefaults,
  setCategoryPrepDefault,
  removeCategoryPrepDefault,
  type PrepStation,
  type PrepStationWithCount,
  type CategoryPrepDefault,
  type CreatePrepStationInput,
  type UpdatePrepStationInput,
} from "@/app/dashboard/actions/prep-stations";
import { toast } from "sonner";

// Re-export types for convenience
export type {
  PrepStation,
  PrepStationWithCount,
  CategoryPrepDefault,
  CreatePrepStationInput,
  UpdatePrepStationInput,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch prep stations for a location (with item counts)
 */
export function usePrepStations(locationId: string | null | undefined) {
  return useQuery({
    queryKey: ["prep-stations", locationId],
    queryFn: async () => {
      const result = await getPrepStationsForLocation(locationId!);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch prep stations");
      }
      return result.data || [];
    },
    enabled: !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch category prep defaults for a location
 */
export function useCategoryPrepDefaults(
  locationId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["category-prep-defaults", locationId],
    queryFn: async () => {
      const result = await getCategoryPrepDefaults(locationId!);
      if (!result.success) {
        throw new Error(
          result.error || "Failed to fetch category prep defaults",
        );
      }
      return result.data || [];
    },
    enabled: !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Create a new prep station
 */
export function useCreatePrepStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      input,
    }: {
      clerkOrgId: string;
      input: CreatePrepStationInput;
    }) => {
      const result = await createPrepStation(clerkOrgId, input);
      if (!result.success) {
        throw new Error(result.error || "Failed to create prep station");
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["prep-stations", variables.input.locationId],
      });
      toast.success("Prep station created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create prep station");
    },
  });
}

/**
 * Update a prep station
 */
export function useUpdatePrepStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stationId,
      input,
    }: {
      stationId: string;
      input: UpdatePrepStationInput;
    }) => {
      const result = await updatePrepStation(stationId, input);
      if (!result.success) {
        throw new Error(result.error || "Failed to update prep station");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prep-stations"] });
      toast.success("Prep station updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update prep station");
    },
  });
}

/**
 * Delete a prep station
 */
export function useDeletePrepStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stationId: string) => {
      const result = await deletePrepStation(stationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to delete prep station");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prep-stations"] });
      queryClient.invalidateQueries({
        queryKey: ["category-prep-defaults"],
      });
      toast.success("Prep station deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete prep station");
    },
  });
}

/**
 * Reorder prep stations
 */
export function useReorderPrepStations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stationIds,
      locationId,
    }: {
      stationIds: string[];
      locationId: string;
    }) => {
      const result = await reorderPrepStations(stationIds, locationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to reorder prep stations");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prep-stations"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reorder prep stations");
    },
  });
}

/**
 * Set category prep default
 */
export function useSetCategoryPrepDefault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      locationId,
      categoryId,
      prepStationId,
      merchantId,
    }: {
      locationId: string;
      categoryId: string;
      prepStationId: string;
      merchantId: string;
    }) => {
      const result = await setCategoryPrepDefault(
        locationId,
        categoryId,
        prepStationId,
        merchantId,
      );
      if (!result.success) {
        throw new Error(
          result.error || "Failed to set category prep default",
        );
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["category-prep-defaults"],
      });
      toast.success("Category prep station default set");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to set category default");
    },
  });
}

/**
 * Remove category prep default
 */
export function useRemoveCategoryPrepDefault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      locationId,
      categoryId,
    }: {
      locationId: string;
      categoryId: string;
    }) => {
      const result = await removeCategoryPrepDefault(locationId, categoryId);
      if (!result.success) {
        throw new Error(
          result.error || "Failed to remove category prep default",
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["category-prep-defaults"],
      });
      toast.success("Category prep station default removed");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove category default");
    },
  });
}
