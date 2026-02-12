"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getStationsWithHeartbeats,
  updateStation,
  StationWithHeartbeat,
  Station,
  StationType,
  UpdateStationInput,
  ViewScope,
} from "@/app/dashboard/actions/stations";
import type { SyncRole } from "@/app/dashboard/actions/stations";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// Re-export types for convenience
export type {
  Station,
  StationWithHeartbeat,
  StationType,
  UpdateStationInput,
  ViewScope,
  SyncRole,
};

// ============================================================================
// Helper Functions
// ============================================================================

export const getStationTypeLabel = (type: StationType): string => {
  switch (type) {
    case "register":
      return "Register";
    case "checkout":
      return "Checkout";
    case "kds":
      return "Kitchen Display";
    case "self_service":
      return "Self-Service Kiosk";
    default:
      return type;
  }
};

export const getStationTypeIcon = (type: StationType): string => {
  switch (type) {
    case "register":
      return "💳";
    case "checkout":
      return "🛒";
    case "kds":
      return "🍳";
    case "self_service":
      return "📱";
    default:
      return "📱";
  }
};

export const getNetworkTypeLabel = (type: string | null | undefined): string => {
  switch (type) {
    case "wifi":
      return "Wi-Fi";
    case "ethernet":
      return "Ethernet";
    case "cellular":
      return "Cellular";
    default:
      return type || "Unknown";
  }
};

export const formatLastSeen = (
  heartbeatAt: string | null | undefined,
  fallback: string | null | undefined
): string => {
  const timestamp = heartbeatAt || fallback;
  if (!timestamp) return "Never";

  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return "Unknown";
  }
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook to fetch stations with heartbeat data for device management
 */
export function useDevicesHardware(locationId: string) {
  return useQuery({
    queryKey: ["devices-hardware", locationId],
    queryFn: async () => {
      const result = await getStationsWithHeartbeats(locationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch devices");
      }
      return result.data || [];
    },
    enabled: !!locationId && locationId !== "all",
    staleTime: 30_000,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook to update a station/device
 */
export function useUpdateDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stationId,
      input,
    }: {
      stationId: string;
      input: UpdateStationInput;
    }) => {
      const result = await updateStation(stationId, input);
      if (!result.success) {
        throw new Error(result.error || "Failed to update device");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices-hardware"] });
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      toast.success("Device updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update device");
    },
  });
}
