"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GetInventoryItems,
  GetVendors,
  GetInventoryStats,
  CreateInventoryItem,
  UpdateInventoryItem,
  DeleteInventoryItem,
  UpdateItemStock,
} from "@/app/dashboard/actions/inventory";
import { InventoryItemWithVendor, StockMode } from "@/types/inventory";

// ============================================================================
// INVENTORY ITEMS
// ============================================================================

export function useAdminCreateInventoryItem(clerkOrgId: string) {
  const queryClient = useQueryClient();

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
        queryClient.invalidateQueries({ queryKey: ["admin", "inventory", "items", clerkOrgId] });
        queryClient.invalidateQueries({ queryKey: ["admin", "inventory", "stats", clerkOrgId] });
      }
    },
    onError: (error) => {
      toast.error("Failed to create item: " + error.message);
    },
  });
}

export function useAdminUpdateInventoryItem(clerkOrgId: string) {
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
        queryClient.invalidateQueries({ queryKey: ["admin", "inventory", "items", clerkOrgId] });
        queryClient.invalidateQueries({ queryKey: ["admin", "inventory", "stats", clerkOrgId] });
      }
    },
    onError: (error) => {
      toast.error("Failed to update item: " + error.message);
    },
  });
}

export function useAdminDeleteInventoryItem(clerkOrgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => DeleteInventoryItem(itemId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Item deleted");
        queryClient.invalidateQueries({ queryKey: ["admin", "inventory", "items", clerkOrgId] });
        queryClient.invalidateQueries({ queryKey: ["admin", "inventory", "stats", clerkOrgId] });
      }
    },
    onError: (error) => {
      toast.error("Failed to delete item: " + error.message);
    },
  });
}
