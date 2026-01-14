"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDevicesForStation,
  getStationDeviceById,
  getDevicesForLocation,
  createStationDevice,
  updateStationDevice,
  deleteStationDevice,
  updateDeviceStatus,
  testDeviceConnection,
  testPrint,
  openCashDrawer,
  StationDevice,
  CreateStationDeviceInput,
  UpdateStationDeviceInput,
} from "@/app/dashboard/actions/station-devices";
import {
  StationDeviceType,
  DeviceConnectionType as ConnectionType,
  getDeviceTypeLabel,
  getDeviceTypeIcon,
  getDeviceConnectionTypeLabel as getConnectionTypeLabel,
} from "@/app/dashboard/settings/stations/utils/terminal-helpers";
import { toast } from "sonner";

// Re-export types and helpers for convenience
export type {
  StationDevice,
  StationDeviceType,
  ConnectionType,
  CreateStationDeviceInput,
  UpdateStationDeviceInput,
};

export { getDeviceTypeLabel, getDeviceTypeIcon, getConnectionTypeLabel };

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook to fetch all devices for a specific station
 */
export function useStationDevices(stationId: string) {
  return useQuery({
    queryKey: ["stationDevices", "station", stationId],
    queryFn: async () => {
      const result = await getDevicesForStation(stationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch devices");
      }
      return result.data || [];
    },
    enabled: !!stationId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single device by ID
 */
export function useStationDevice(deviceId: string) {
  return useQuery({
    queryKey: ["stationDevices", "device", deviceId],
    queryFn: async () => {
      const result = await getStationDeviceById(deviceId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch device");
      }
      return result.data;
    },
    enabled: !!deviceId,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch all devices for a location (across all stations)
 */
export function useLocationDevices(locationId: string) {
  return useQuery({
    queryKey: ["stationDevices", "location", locationId],
    queryFn: async () => {
      const result = await getDevicesForLocation(locationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch devices");
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
 * Hook to create a new station device
 */
export function useCreateStationDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateStationDeviceInput) => {
      const result = await createStationDevice(input);
      if (!result.success) {
        throw new Error(result.error || "Failed to create device");
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stationDevices"] });
      toast.success(`${data?.device_name} added successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create device");
    },
  });
}

/**
 * Hook to update a station device
 */
export function useUpdateStationDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      deviceId,
      input,
    }: {
      deviceId: string;
      input: UpdateStationDeviceInput;
    }) => {
      const result = await updateStationDevice(deviceId, input);
      if (!result.success) {
        throw new Error(result.error || "Failed to update device");
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stationDevices"] });
      toast.success(`${data?.device_name} updated successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update device");
    },
  });
}

/**
 * Hook to delete a station device
 */
export function useDeleteStationDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deviceId: string) => {
      const result = await deleteStationDevice(deviceId);
      if (!result.success) {
        throw new Error(result.error || "Failed to delete device");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stationDevices"] });
      toast.success("Device removed successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete device");
    },
  });
}

/**
 * Hook to update device connection status
 */
export function useUpdateDeviceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      deviceId,
      isConnected,
      lastError,
    }: {
      deviceId: string;
      isConnected: boolean;
      lastError?: string;
    }) => {
      const result = await updateDeviceStatus(deviceId, isConnected, lastError);
      if (!result.success) {
        throw new Error(result.error || "Failed to update device status");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stationDevices"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update device status");
    },
  });
}

/**
 * Hook to test device connection
 */
export function useTestDeviceConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deviceId: string) => {
      const result = await testDeviceConnection(deviceId);
      if (!result.success) {
        throw new Error(result.error || "Failed to test connection");
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["stationDevices"] });
      if (result.connected) {
        toast.success("Device connected successfully");
      } else {
        toast.warning(result.error || "Device is not responding");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Connection test failed");
    },
  });
}

/**
 * Hook to send test print
 */
export function useTestPrint() {
  return useMutation({
    mutationFn: async (deviceId: string) => {
      const result = await testPrint(deviceId);
      if (!result.success) {
        throw new Error(result.error || "Failed to print");
      }
      return result;
    },
    onSuccess: () => {
      toast.success("Test print sent successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Test print failed");
    },
  });
}

/**
 * Hook to open cash drawer
 */
export function useOpenCashDrawer() {
  return useMutation({
    mutationFn: async (deviceId: string) => {
      const result = await openCashDrawer(deviceId);
      if (!result.success) {
        throw new Error(result.error || "Failed to open cash drawer");
      }
      return result;
    },
    onSuccess: () => {
      toast.success("Cash drawer opened");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to open cash drawer");
    },
  });
}
