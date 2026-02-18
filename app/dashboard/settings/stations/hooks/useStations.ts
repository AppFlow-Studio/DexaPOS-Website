"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getStationsForLocation,
  getStationsForMerchant,
  getNextStationNumber,
  getStationsWithHeartbeats,
  createStation,
  updateStation,
  deactivateStation,
  reactivateStation,
  deleteStation,
  deleteMultipleStations,
  getKdsDisplayByStationId,
  updateKdsDisplay,
  getKdsRoutingRules,
  setKdsRoutingRules,
  Station,
  StationWithHeartbeat,
  StationType,
  SyncRole,
  ViewScope,
  CreateStationInput,
  UpdateStationInput,
  CreateKdsDisplayInput,
  KdsDisplayMode,
  KdsRoutingMode,
  KdsDisplay,
  KdsRoutingRule,
} from "@/app/dashboard/actions/stations";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// Re-export types for convenience
export type {
  Station,
  StationWithHeartbeat,
  StationType,
  SyncRole,
  ViewScope,
  CreateStationInput,
  UpdateStationInput,
  CreateKdsDisplayInput,
  KdsDisplayMode,
  KdsRoutingMode,
  KdsDisplay,
  KdsRoutingRule,
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

export const getSyncRoleLabel = (role: SyncRole): string => {
  switch (role) {
    case "leader":
      return "Leader";
    case "follower":
      return "Follower";
    default:
      return role;
  }
};

export const getViewScopeLabel = (scope: ViewScope): string => {
  switch (scope) {
    case "own":
      return "Own Orders Only";
    case "location":
      return "All Location Orders";
    default:
      return scope;
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
 * Hook to fetch stations for a specific location
 */
export function useLocationStations(locationId: string) {
  return useQuery({
    queryKey: ["stations", "location", locationId],
    queryFn: async () => {
      const result = await getStationsForLocation(locationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch stations");
      }
      return result.data || [];
    },
    enabled: !!locationId && locationId !== "all",
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch stations with heartbeat data for a specific location
 */
export function useStationsWithHeartbeats(locationId: string) {
  return useQuery({
    queryKey: ["stations-with-heartbeats", locationId],
    queryFn: async () => {
      const result = await getStationsWithHeartbeats(locationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch stations");
      }
      return result.data || [];
    },
    enabled: !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch all stations for a merchant (across all locations)
 */
export function useMerchantStations(clerkOrgId: string) {
  return useQuery({
    queryKey: ["stations", "merchant", clerkOrgId],
    queryFn: async () => {
      const result = await getStationsForMerchant(clerkOrgId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch stations");
      }
      return result.data || [];
    },
    enabled: !!clerkOrgId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to get next available station number
 */
export function useNextStationNumber(locationId: string, stationType: StationType) {
  return useQuery({
    queryKey: ["stations", "nextNumber", locationId, stationType],
    queryFn: async () => {
      const result = await getNextStationNumber(locationId, stationType);
      return result.data || 1;
    },
    enabled: !!locationId && locationId !== "all",
    staleTime: 10 * 1000, // 10 seconds
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook to create a new station
 */
export function useCreateStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      input,
    }: {
      clerkOrgId: string;
      input: CreateStationInput;
    }) => {
      const result = await createStation(clerkOrgId, input);
      if (!result.success) {
        throw new Error(result.error || "Failed to create station");
      }
      return result.data;
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      toast.success("Station created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create station");
    },
  });
}

/**
 * Hook to update a station
 */
export function useUpdateStation() {
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
        throw new Error(result.error || "Failed to update station");
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      toast.success("Station updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update station");
    },
  });
}

/**
 * Hook to deactivate a station
 */
export function useDeactivateStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stationId,
      deactivatedBy,
    }: {
      stationId: string;
      deactivatedBy?: string;
    }) => {
      const result = await deactivateStation(stationId, deactivatedBy);
      if (!result.success) {
        throw new Error(result.error || "Failed to deactivate station");
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      toast.success(`${data?.station_name} has been deactivated`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to deactivate station");
    },
  });
}

/**
 * Hook to reactivate a station
 */
export function useReactivateStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stationId: string) => {
      const result = await reactivateStation(stationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to reactivate station");
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      toast.success(`${data?.station_name} has been reactivated`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reactivate station");
    },
  });
}

/**
 * Hook to delete a station
 */
export function useDeleteStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stationId: string) => {
      const result = await deleteStation(stationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to delete station");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      toast.success("Station deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete station");
    },
  });
}

/**
 * Hook to delete multiple stations
 */
export function useDeleteMultipleStations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stationIds: string[]) => {
      const result = await deleteMultipleStations(stationIds);
      if (!result.success) {
        throw new Error(result.error || "Failed to delete stations");
      }
      return result;
    },
    onSuccess: (_, stationIds) => {
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      toast.success(`${stationIds.length} station(s) deleted successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete stations");
    },
  });
}

// ============================================================================
// KDS Display Hooks
// ============================================================================

/**
 * Hook to fetch KDS display config for a station
 */
export function useKdsDisplay(stationId: string | undefined) {
  return useQuery({
    queryKey: ["kds-display", stationId],
    queryFn: async () => {
      const result = await getKdsDisplayByStationId(stationId!);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch KDS display config");
      }
      return result.data;
    },
    enabled: !!stationId,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to update KDS display config
 */
export function useUpdateKdsDisplay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      kdsDisplayId,
      input,
    }: {
      kdsDisplayId: string;
      input: Partial<CreateKdsDisplayInput>;
    }) => {
      const result = await updateKdsDisplay(kdsDisplayId, input);
      if (!result.success) {
        throw new Error(result.error || "Failed to update KDS display config");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kds-display"] });
      queryClient.invalidateQueries({ queryKey: ["kds-routing-rules"] });
      toast.success("KDS display config updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update KDS display config");
    },
  });
}

// ============================================================================
// KDS Routing Rules Hooks
// ============================================================================

/**
 * Hook to fetch routing rules for a KDS display
 */
export function useKdsRoutingRules(kdsDisplayId: string | undefined) {
  return useQuery({
    queryKey: ["kds-routing-rules", kdsDisplayId],
    queryFn: async () => {
      const result = await getKdsRoutingRules(kdsDisplayId!);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch KDS routing rules");
      }
      return result.data || [];
    },
    enabled: !!kdsDisplayId,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to replace all routing rules for a KDS display
 */
export function useSetKdsRoutingRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      kdsDisplayId,
      rules,
    }: {
      kdsDisplayId: string;
      rules: { rule_type: string; rule_value: string }[];
    }) => {
      const result = await setKdsRoutingRules(kdsDisplayId, rules);
      if (!result.success) {
        throw new Error(result.error || "Failed to update KDS routing rules");
      }
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["kds-routing-rules", variables.kdsDisplayId],
      });
      toast.success("KDS routing rules updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update KDS routing rules");
    },
  });
}
