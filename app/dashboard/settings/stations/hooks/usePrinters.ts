"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPrintersForStation,
  getPrinterById,
  createPrinter,
  updatePrinter,
  deletePrinter,
  Printer,
  CreatePrinterInput,
  UpdatePrinterInput,
} from "@/app/dashboard/actions/printers";
import {
  PrinterType,
  PrinterRole,
  PrinterConnectionType,
  getPrinterTypeLabel,
  getPrinterRoleLabel,
  getPrinterRoleIcon,
  getPrinterConnectionTypeLabel,
} from "@/app/dashboard/settings/stations/utils/terminal-helpers";
import { toast } from "sonner";

// Re-export types and helpers for convenience
export type {
  Printer,
  PrinterType,
  PrinterRole,
  PrinterConnectionType,
  CreatePrinterInput,
  UpdatePrinterInput,
};

export {
  getPrinterTypeLabel,
  getPrinterRoleLabel,
  getPrinterRoleIcon,
  getPrinterConnectionTypeLabel,
};

// ============================================================================
// Query Hooks
// ============================================================================

export function useStationPrinters(stationId: string) {
  return useQuery({
    queryKey: ["printers", "station", stationId],
    queryFn: async () => {
      const result = await getPrintersForStation(stationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch printers");
      }
      return result.data || [];
    },
    enabled: !!stationId,
    staleTime: 30 * 1000,
  });
}

export function usePrinter(printerId: string) {
  return useQuery({
    queryKey: ["printers", "printer", printerId],
    queryFn: async () => {
      const result = await getPrinterById(printerId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch printer");
      }
      return result.data;
    },
    enabled: !!printerId,
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useCreatePrinter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePrinterInput) => {
      const result = await createPrinter(input);
      if (!result.success) {
        throw new Error(result.error || "Failed to create printer");
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["printers"] });
      toast.success(`${data?.printer_name} added successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create printer");
    },
  });
}

export function useUpdatePrinter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      printerId,
      input,
    }: {
      printerId: string;
      input: UpdatePrinterInput;
    }) => {
      const result = await updatePrinter(printerId, input);
      if (!result.success) {
        throw new Error(result.error || "Failed to update printer");
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["printers"] });
      toast.success(`${data?.printer_name} updated successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update printer");
    },
  });
}

export function useDeletePrinter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (printerId: string) => {
      const result = await deletePrinter(printerId);
      if (!result.success) {
        throw new Error(result.error || "Failed to delete printer");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printers"] });
      toast.success("Printer removed successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete printer");
    },
  });
}
