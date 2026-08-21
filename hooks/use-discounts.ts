"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  listDiscounts,
  getDiscountStats,
  getDiscountById,
  createDiscount,
  updateDiscount,
  toggleDiscountActive,
  deleteDiscount,
  bulkUpdateDiscountStatus,
  bulkDeleteDiscounts,
  getDiscountUsage,
  listCategoriesForMerchant,
  listMenuItemsForMerchant,
} from "@/app/dashboard/actions/discounts";
import {
  Discount,
  DiscountFormInput,
  DiscountListFilters,
} from "@/types/discount";
import type { PaginationMeta, PaginationParams } from "@/types/pagination";
import { toast } from "sonner";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useMerchantId } from "@/app/dashboard/hooks/useLocationScopedModifiers";
import {
  useLocationStore,
  useIsAllLocations,
} from "@/stores/location-store";

function useEffectiveLocationId() {
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  return isAllLocations ? "all" : selectedLocationId;
}

export function useDiscounts(
  filters: DiscountListFilters,
  pagination?: PaginationParams,
) {
  const locationId = useEffectiveLocationId();
  const scopedFilters: DiscountListFilters = {
    ...filters,
    locationId: locationId || "all",
  };
  return useQuery({
    queryKey: [
      "discounts",
      "list",
      locationId,
      scopedFilters,
      pagination,
      "scoped",
    ],
    queryFn: () => listDiscounts(scopedFilters, pagination),
    placeholderData: keepPreviousData,
  });
}

export function useDiscountStats() {
  const locationId = useEffectiveLocationId();
  return useQuery({
    queryKey: ["discounts", "stats", locationId, "scoped"],
    queryFn: () => getDiscountStats(locationId),
  });
}

export function useDiscount(discountId: string | null) {
  return useQuery({
    queryKey: ["discount", discountId],
    queryFn: () =>
      discountId
        ? getDiscountById(discountId)
        : Promise.resolve({ success: false as const, error: "No id" }),
    enabled: !!discountId,
  });
}

export function useDiscountUsage(discountId: string | null) {
  return useQuery({
    queryKey: ["discount-usage", discountId],
    queryFn: () =>
      discountId
        ? getDiscountUsage(discountId)
        : Promise.resolve({ success: false as const, error: "No id" }),
    enabled: !!discountId,
  });
}

export function useCreateDiscount() {
  const queryClient = useQueryClient();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  return useMutation({
    mutationFn: (input: DiscountFormInput) => {
      // If the form didn't explicitly set a scope, inherit from the current
      // location selector: All Locations -> global (null), specific -> that location.
      const location_id =
        input.location_id !== undefined
          ? input.location_id
          : isAllLocations
            ? null
            : selectedLocationId;
      return createDiscount({ ...input, location_id });
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Discount created");
        queryClient.invalidateQueries({ queryKey: ["discounts"] });
      } else {
        toast.error(result.error || "Failed to create discount");
      }
    },
    onError: () => {
      toast.error("Failed to create discount");
    },
  });
}

export function useUpdateDiscount(discountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DiscountFormInput) => updateDiscount(discountId, input),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Discount updated");
        queryClient.invalidateQueries({ queryKey: ["discounts"] });
        queryClient.invalidateQueries({ queryKey: ["discount", discountId] });
      } else {
        toast.error(result.error || "Failed to update discount");
      }
    },
    onError: () => {
      toast.error("Failed to update discount");
    },
  });
}

export function useToggleDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleDiscountActive(id, isActive),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ["discounts"] });
      // Update every cached "discounts" query (all scope/filter variants) optimistically.
      const snapshots = queryClient.getQueriesData<{
        success: boolean;
        data?: Discount[];
        pagination?: PaginationMeta;
      }>({ queryKey: ["discounts", "list"] });
      queryClient.setQueriesData<{
        success: boolean;
        data?: Discount[];
        pagination?: PaginationMeta;
      }>(
        { queryKey: ["discounts", "list"] },
        (current) => {
          if (!current?.data) return current;
          return {
            ...current,
            data: current.data.map((d) =>
              d.id === id ? { ...d, is_active: isActive } : d,
            ),
          };
        },
      );
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      if (context?.snapshots) {
        context.snapshots.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
      toast.error("Failed to update status");
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Status updated");
      } else {
        toast.error(result.error || "Failed to update status");
      }
      queryClient.invalidateQueries({ queryKey: ["discounts"] });
    },
  });
}

export function useDeleteDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode?: "soft" | "hard" }) =>
      deleteDiscount(id, mode),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Discount deleted");
        queryClient.invalidateQueries({ queryKey: ["discounts"] });
      } else {
        toast.error(result.error || "Failed to delete discount");
      }
    },
    onError: () => {
      toast.error("Failed to delete discount");
    },
  });
}

export function useBulkStatusUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, isActive }: { ids: string[]; isActive: boolean }) =>
      bulkUpdateDiscountStatus(ids, isActive),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Discounts updated");
        queryClient.invalidateQueries({ queryKey: ["discounts"] });
      } else {
        toast.error(result.error || "Failed to update discounts");
      }
    },
    onError: () => {
      toast.error("Failed to update discounts");
    },
  });
}

export function useBulkDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, mode }: { ids: string[]; mode?: "soft" | "hard" }) =>
      bulkDeleteDiscounts(ids, mode),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Discounts deleted");
        queryClient.invalidateQueries({ queryKey: ["discounts"] });
      } else {
        toast.error(result.error || "Failed to delete discounts");
      }
    },
    onError: () => {
      toast.error("Failed to delete discounts");
    },
  });
}

export function useDiscountCategories() {
  const merchantId = useMerchantId();
  return useQuery({
    queryKey: ["discount-categories", merchantId],
    queryFn: () => listCategoriesForMerchant(merchantId),
  });
}

export function useDiscountMenuItems() {
  const merchantId = useMerchantId();
  return useQuery({
    queryKey: ["discount-menu-items", merchantId],
    queryFn: () => listMenuItemsForMerchant(merchantId),
  });
}
