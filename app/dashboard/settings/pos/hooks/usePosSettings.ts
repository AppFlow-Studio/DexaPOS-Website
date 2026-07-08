"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getLocationPosSettings,
  saveLocationPosConfig,
  saveStationPosConfigOverrides,
} from "@/app/dashboard/actions/pos-settings";
import type {
  PosConfig,
  StationPosConfigOverrides,
} from "@/lib/pos/pos-config";

export function useLocationPosSettings(
  clerkOrgId: string | undefined,
  locationId: string | undefined,
) {
  return useQuery({
    queryKey: ["location-pos-settings", clerkOrgId, locationId],
    queryFn: async () => {
      if (!clerkOrgId || !locationId || locationId === "all") {
        throw new Error("A concrete location is required");
      }

      const result = await getLocationPosSettings(clerkOrgId, locationId);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to load POS settings");
      }

      return result.data;
    },
    enabled: Boolean(clerkOrgId && locationId && locationId !== "all"),
    staleTime: 30 * 1000,
  });
}

export function useSaveLocationPosConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      locationId,
      posConfig,
    }: {
      clerkOrgId: string;
      locationId: string;
      posConfig: PosConfig;
    }) => {
      const result = await saveLocationPosConfig(
        clerkOrgId,
        locationId,
        posConfig,
      );
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to save POS settings");
      }
      return result.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [
          "location-pos-settings",
          variables.clerkOrgId,
          variables.locationId,
        ],
      });
      toast.success("Location POS settings saved");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save POS settings");
    },
  });
}

export function useSaveStationPosConfigOverrides() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      stationId,
      overrides,
    }: {
      clerkOrgId: string;
      locationId: string;
      stationId: string;
      overrides: StationPosConfigOverrides;
    }) => {
      const result = await saveStationPosConfigOverrides(
        clerkOrgId,
        stationId,
        overrides,
      );
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to save station overrides");
      }
      return result.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [
          "location-pos-settings",
          variables.clerkOrgId,
          variables.locationId,
        ],
      });
      toast.success("Station overrides saved");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save station overrides");
    },
  });
}
