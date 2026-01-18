"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTerminalsForLocation,
  getAvailableTerminals,
  getTerminalForStation,
  getPaymentTerminalById,
  createPaymentTerminal,
  updatePaymentTerminal,
  deletePaymentTerminal,
  linkTerminalToStation,
  unlinkTerminalFromStation,
  testTerminalConnection,
  PaymentTerminal,
  CreatePaymentTerminalInput,
  UpdatePaymentTerminalInput,
} from "@/app/dashboard/actions/payment-terminals";
import {
  TerminalType,
  ApiEnvironment,
  TerminalConnectionType as ConnectionType,
  getTerminalTypeLabel,
  getApiEnvironmentLabel,
  getTerminalConnectionTypeLabel as getConnectionTypeLabel,
} from "@/app/dashboard/settings/stations/utils/terminal-helpers";
import { toast } from "sonner";

// Re-export types and helpers for convenience
export type {
  PaymentTerminal,
  TerminalType,
  ApiEnvironment,
  ConnectionType,
  CreatePaymentTerminalInput,
  UpdatePaymentTerminalInput,
};

export { getTerminalTypeLabel, getApiEnvironmentLabel, getConnectionTypeLabel };

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook to fetch all terminals for a location
 */
export function useLocationTerminals(locationId: string) {
  return useQuery({
    queryKey: ["paymentTerminals", "location", locationId],
    queryFn: async () => {
      const result = await getTerminalsForLocation(locationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch terminals");
      }
      return result.data || [];
    },
    enabled: !!locationId && locationId !== "all",
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch available (unassigned) terminals for a location
 */
export function useAvailableTerminals(locationId: string) {
  return useQuery({
    queryKey: ["paymentTerminals", "available", locationId],
    queryFn: async () => {
      const result = await getAvailableTerminals(locationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch available terminals");
      }
      return result.data || [];
    },
    enabled: !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch the terminal assigned to a specific station
 */
export function useStationTerminal(stationId: string) {
  return useQuery({
    queryKey: ["paymentTerminals", "station", stationId],
    queryFn: async () => {
      const result = await getTerminalForStation(stationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch terminal");
      }
      return result.data;
    },
    enabled: !!stationId,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch a single terminal by ID
 */
export function usePaymentTerminal(terminalId: string) {
  return useQuery({
    queryKey: ["paymentTerminals", "terminal", terminalId],
    queryFn: async () => {
      const result = await getPaymentTerminalById(terminalId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch terminal");
      }
      return result.data;
    },
    enabled: !!terminalId,
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook to create a new payment terminal
 */
export function useCreatePaymentTerminal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      input,
    }: {
      clerkOrgId: string;
      input: CreatePaymentTerminalInput;
    }) => {
      const result = await createPaymentTerminal(clerkOrgId, input);
      if (!result.success) {
        throw new Error(result.error || "Failed to create terminal");
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["paymentTerminals"] });
      toast.success(`${data?.terminal_name} registered successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create terminal");
    },
  });
}

/**
 * Hook to update a payment terminal
 */
export function useUpdatePaymentTerminal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      terminalId,
      input,
    }: {
      terminalId: string;
      input: UpdatePaymentTerminalInput;
    }) => {
      const result = await updatePaymentTerminal(terminalId, input);
      if (!result.success) {
        throw new Error(result.error || "Failed to update terminal");
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["paymentTerminals"] });
      toast.success(`${data?.terminal_name} updated successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update terminal");
    },
  });
}

/**
 * Hook to delete a payment terminal
 */
export function useDeletePaymentTerminal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (terminalId: string) => {
      const result = await deletePaymentTerminal(terminalId);
      if (!result.success) {
        throw new Error(result.error || "Failed to delete terminal");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["paymentTerminals"] });
      toast.success("Terminal removed successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete terminal");
    },
  });
}

/**
 * Hook to link a terminal to a station
 */
export function useLinkTerminalToStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      terminalId,
      stationId,
    }: {
      terminalId: string;
      stationId: string;
    }) => {
      const result = await linkTerminalToStation(terminalId, stationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to link terminal");
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["paymentTerminals"] });
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      toast.success(`${data?.terminal_name} linked to station`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to link terminal");
    },
  });
}

/**
 * Hook to unlink a terminal from a station
 */
export function useUnlinkTerminalFromStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (terminalId: string) => {
      const result = await unlinkTerminalFromStation(terminalId);
      if (!result.success) {
        throw new Error(result.error || "Failed to unlink terminal");
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["paymentTerminals"] });
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      toast.success(`${data?.terminal_name} unlinked from station`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to unlink terminal");
    },
  });
}

/**
 * Hook to test terminal connection
 */
export function useTestTerminalConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (terminalId: string) => {
      const result = await testTerminalConnection(terminalId);
      if (!result.success) {
        throw new Error(result.error || "Failed to test connection");
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["paymentTerminals"] });
      if (result.status === "Online") {
        toast.success("Terminal online and ready");
      } else {
        toast.warning(result.error || "Terminal is not responding");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Connection test failed");
    },
  });
}
