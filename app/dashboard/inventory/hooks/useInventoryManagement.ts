"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useLocationStore } from "@/stores/location-store";
import { toast } from "sonner";
import {
  GetInventoryItems,
  GetVendors,
  GetPurchaseOrders,
  GetInventoryStats,
  CreateInventoryItem,
  UpdateInventoryItem,
  DeleteInventoryItem,
  UpdateItemStock,
  CreateVendor,
  UpdateVendor,
  DeleteVendor,
  CreatePurchaseOrder,
  UpdatePurchaseOrderStatus,
  DeletePurchaseOrder,
  VendorWithStats,
  PurchaseOrderWithDetails,
} from "../../actions/inventory";
import { InventoryItemWithVendor, StockMode } from "@/types/inventory";

// ============================================================================
// HELPERS
// ============================================================================

function useOrgContext() {
  const { data: userInfo } = useUserInfo();
  const { selectedLocationId } = useLocationStore();

  // Get clerk org ID from the nested members -> organizations structure
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id || "";

  return {
    clerkOrgId,
    locationId: selectedLocationId,
    isGlobalView: selectedLocationId === "all" || !selectedLocationId,
  };
}

// ============================================================================
// INVENTORY ITEMS
// ============================================================================

export function useInventoryItems() {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery<InventoryItemWithVendor[]>({
    queryKey: ["inventory-items", clerkOrgId, locationId],
    queryFn: () => GetInventoryItems(clerkOrgId, locationId),
    enabled: !!clerkOrgId,
  });
}

export function useCreateInventoryItem() {
  const queryClient = useQueryClient();
  const { clerkOrgId, locationId } = useOrgContext();

  return useMutation({
    mutationFn: (data: {
      name: string;
      sku?: string;
      category?: string;
      unit_type: string;
      stock_mode?: StockMode;
      current_stock?: number;
      reorder_point?: number;
      cost_per_unit?: number;
      vendor_id?: string;
      location_id?: string | null;
    }) => CreateInventoryItem(clerkOrgId, data),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Inventory item created");
        queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      }
    },
    onError: (error) => {
      toast.error("Failed to create item: " + error.message);
    },
  });
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      itemId,
      data,
    }: {
      itemId: string;
      data: {
        name?: string;
        sku?: string;
        category?: string;
        unit_type?: string;
        stock_mode?: StockMode;
        current_stock?: number;
        reorder_point?: number;
        cost_per_unit?: number;
        vendor_id?: string | null;
      };
    }) => UpdateInventoryItem(itemId, data),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Item updated");
        queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      }
    },
    onError: (error) => {
      toast.error("Failed to update item: " + error.message);
    },
  });
}

export function useDeleteInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => DeleteInventoryItem(itemId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Item deleted");
        queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      }
    },
    onError: (error) => {
      toast.error("Failed to delete item: " + error.message);
    },
  });
}

export function useUpdateItemStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, stock }: { itemId: string; stock: number }) =>
      UpdateItemStock(itemId, stock),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Stock updated");
        queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      }
    },
    onError: (error) => {
      toast.error("Failed to update stock: " + error.message);
    },
  });
}

/**
 * Hook for updating location-specific stock (Phase 3)
 * Uses the new SetLocationStock action that calls the RPC
 */
export function useSetLocationStock() {
  const queryClient = useQueryClient();
  const { locationId } = useOrgContext();

  return useMutation({
    mutationFn: async ({
      itemId,
      stock,
    }: {
      itemId: string;
      stock: number;
    }) => {
      if (!locationId || locationId === "all") {
        return { error: "Please select a location to update stock" };
      }
      // Import dynamically to avoid circular deps if needed
      const { SetLocationStock } = await import("../../actions/location-stock");
      return SetLocationStock(locationId, itemId, stock);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Stock updated");
        queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      }
    },
    onError: (error) => {
      toast.error("Failed to update stock: " + error.message);
    },
  });
}

// ============================================================================
// VENDORS
// ============================================================================

export function useVendors() {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery<VendorWithStats[]>({
    queryKey: ["vendors", clerkOrgId, locationId],
    queryFn: () => GetVendors(clerkOrgId, locationId),
    enabled: !!clerkOrgId,
  });
}

export function useCreateVendor() {
  const queryClient = useQueryClient();
  const { clerkOrgId } = useOrgContext();

  return useMutation({
    mutationFn: (data: {
      name: string;
      contact_name?: string;
      phone?: string;
      email?: string;
      address_line1?: string;
      city?: string;
      state?: string;
      zip_code?: string;
      location_id?: string | null;
    }) => CreateVendor(clerkOrgId, data),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Vendor created");
        queryClient.invalidateQueries({ queryKey: ["vendors"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      }
    },
    onError: (error) => {
      toast.error("Failed to create vendor: " + error.message);
    },
  });
}

export function useUpdateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      vendorId,
      data,
    }: {
      vendorId: string;
      data: {
        name?: string;
        contact_name?: string;
        phone?: string;
        email?: string;
        address_line1?: string;
        city?: string;
        state?: string;
        zip_code?: string;
      };
    }) => UpdateVendor(vendorId, data),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Vendor updated");
        queryClient.invalidateQueries({ queryKey: ["vendors"] });
      }
    },
    onError: (error) => {
      toast.error("Failed to update vendor: " + error.message);
    },
  });
}

export function useDeleteVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vendorId: string) => DeleteVendor(vendorId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Vendor deleted");
        queryClient.invalidateQueries({ queryKey: ["vendors"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      }
    },
    onError: (error) => {
      toast.error("Failed to delete vendor: " + error.message);
    },
  });
}

// ============================================================================
// PURCHASE ORDERS
// ============================================================================

export function usePurchaseOrders() {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery<PurchaseOrderWithDetails[]>({
    queryKey: ["purchase-orders", clerkOrgId, locationId],
    queryFn: () => GetPurchaseOrders(clerkOrgId, locationId),
    enabled: !!clerkOrgId,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  const { clerkOrgId } = useOrgContext();

  return useMutation({
    mutationFn: (data: {
      location_id: string;
      vendor_id: string;
      items: Array<{
        inventory_item_id: string;
        quantity_ordered: number;
        unit_cost: number;
      }>;
    }) => CreatePurchaseOrder(clerkOrgId, data),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Purchase order created");
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      }
    },
    onError: (error) => {
      toast.error("Failed to create PO: " + error.message);
    },
  });
}

export function useUpdatePurchaseOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      poId,
      status,
      receivedQuantities,
    }: {
      poId: string;
      status: "pending" | "received" | "paid" | "cancelled";
      receivedQuantities?: Record<string, number>;
    }) => UpdatePurchaseOrderStatus(poId, status, receivedQuantities),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Order status updated");
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
        queryClient.invalidateQueries({ queryKey: ["purchase-order-details"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      }
    },
    onError: (error) => {
      toast.error("Failed to update PO: " + error.message);
    },
  });
}

export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (poId: string) => DeletePurchaseOrder(poId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Purchase order deleted");
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      }
    },
    onError: (error) => {
      toast.error("Failed to delete PO: " + error.message);
    },
  });
}

// ============================================================================
// STATS
// ============================================================================

export function useInventoryStats() {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery({
    queryKey: ["inventory-stats", clerkOrgId, locationId],
    queryFn: () => GetInventoryStats(clerkOrgId, locationId),
    enabled: !!clerkOrgId,
  });
}

// Re-export types for convenience
export type { VendorWithStats, PurchaseOrderWithDetails };
