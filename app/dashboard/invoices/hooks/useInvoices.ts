"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GetInvoices,
  GetInvoice,
  GetInvoiceKpis,
  CreateInvoice,
  UpdateInvoice,
  UpdateInvoiceStatus,
  DeleteInvoice,
  type Invoice,
  type InvoiceStatus,
  type CreateInvoiceInput,
  type UpdateInvoiceInput,
} from "@/app/dashboard/actions/invoices";
import {
  sendInvoice,
  type SendInvoiceParams,
} from "@/app/actions/invoices/send-invoice";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useLocationStore } from "@/stores/location-store";

// =============================================================================
// Queries
// =============================================================================

export function useInvoices(status?: InvoiceStatus | null) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const effectiveLocationId =
    selectedLocationId === "all" ? null : selectedLocationId;

  return useQuery({
    queryKey: ["invoices", clerkOrgId, effectiveLocationId, status ?? "all"],
    queryFn: () => GetInvoices(clerkOrgId!, effectiveLocationId, status),
    enabled: !!clerkOrgId,
  });
}

export function useInvoiceKpis() {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const effectiveLocationId =
    selectedLocationId === "all" ? null : selectedLocationId;

  return useQuery({
    queryKey: ["invoice-kpis", clerkOrgId, effectiveLocationId],
    queryFn: () => GetInvoiceKpis(clerkOrgId!, effectiveLocationId),
    enabled: !!clerkOrgId,
  });
}

export function useInvoice(invoiceId: string | null) {
  return useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => GetInvoice(invoiceId!),
    enabled: !!invoiceId,
  });
}

// =============================================================================
// Mutations
// =============================================================================

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId();

  return useMutation({
    mutationFn: (input: CreateInvoiceInput) =>
      CreateInvoice(clerkOrgId!, input),
    onSuccess: (result) => {
      if (result.error && !result.data) {
        toast.error("Failed to create invoice", { description: result.error });
        return;
      }
      if (result.error && result.data) {
        toast.warning("Invoice created with issues", { description: result.error });
      } else {
        toast.success("Invoice created");
      }
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-kpis"] });
    },
    onError: () => {
      toast.error("Failed to create invoice");
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      invoiceId,
      input,
    }: {
      invoiceId: string;
      input: UpdateInvoiceInput;
    }) => UpdateInvoice(invoiceId, input),
    onSuccess: (result, variables) => {
      if (result.error && !result.data) {
        toast.error("Failed to update invoice", { description: result.error });
        return;
      }
      if (result.error && result.data) {
        toast.warning("Invoice updated with issues", { description: result.error });
      } else {
        toast.success("Invoice updated");
      }
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-kpis"] });
      queryClient.invalidateQueries({
        queryKey: ["invoice", variables.invoiceId],
      });
    },
    onError: () => {
      toast.error("Failed to update invoice");
    },
  });
}

export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      invoiceId,
      status,
    }: {
      invoiceId: string;
      status: InvoiceStatus;
    }) => UpdateInvoiceStatus(invoiceId, status),
    onSuccess: (result, variables) => {
      if (!result.success) {
        toast.error("Failed to update status", { description: result.error });
        return;
      }
      const statusLabel =
        variables.status.charAt(0).toUpperCase() + variables.status.slice(1);
      toast.success(`Invoice marked as ${statusLabel}`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-kpis"] });
      queryClient.invalidateQueries({
        queryKey: ["invoice", variables.invoiceId],
      });
    },
    onError: () => {
      toast.error("Failed to update invoice status");
    },
  });
}

export function useSendInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: SendInvoiceParams) => sendInvoice(params),
    onSuccess: (result, variables) => {
      if (!result.success) {
        toast.error("Failed to send invoice", { description: result.message });
        return;
      }
      if (result.results.some((r) => !r.success)) {
        toast.warning(result.message, {
          description: result.results
            .map((r) => `${r.channel.toUpperCase()}: ${r.message}`)
            .join("  ·  "),
        });
      } else {
        toast.success(result.message);
      }
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-kpis"] });
      queryClient.invalidateQueries({
        queryKey: ["invoice", variables.invoiceId],
      });
    },
    onError: () => {
      toast.error("Failed to send invoice");
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invoiceId: string) => DeleteInvoice(invoiceId),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error("Failed to delete invoice", { description: result.error });
        return;
      }
      toast.success("Invoice deleted");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-kpis"] });
    },
    onError: () => {
      toast.error("Failed to delete invoice");
    },
  });
}
