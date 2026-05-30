import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useMerchantInfo } from "@/app/manage/hooks/useMerchantInfo";
import { useLocationStore } from "@/stores/location-store";
import {
  getItemsForLocationFlat,
  updateItemOverride,
  FlatItem,
} from "../../actions/menu-items-rpc";
import { toast } from "sonner";

export type InventoryItem = FlatItem;

export function useInventory() {
  const { data: userInfo, isLoading: isUserLoading } = useUserInfo();
  // Assuming the first member's organization is the active one
  const clerkOrgId =
    userInfo?.members?.[0]?.organizations?.clerk_org_id ||
    userInfo?.members?.[0]?.organizations?.id;
  // Note: clerk_org_id is usually what we use to look up merchant.
  // However, layout.tsx uses id. Let's try to match layout.tsx behavior or use what useMerchantInfo expects.
  // useMerchantInfo takes `clerkOrgId`.

  // We need merchant info to get the internal merchant_id
  const { data: merchantInfo, isLoading: isMerchantLoading } = useMerchantInfo(
    clerkOrgId || ""
  );

  const { selectedLocationId } = useLocationStore();
  const queryClient = useQueryClient();

  const merchantId =
    merchantInfo instanceof Error ? undefined : merchantInfo?.id;

  // Fetch Inventory Items
  const {
    data: items = [],
    isLoading: isInventoryLoading,
    refetch,
  } = useQuery({
    queryKey: ["inventory", merchantId, selectedLocationId],
    queryFn: async () => {
      if (!merchantId) return [];
      // If selectedLocationId is 'all', we pass null to getItemsForLocationFlat
      // But usually inventory management requires a specific location.
      const locationId =
        selectedLocationId === "all" ? null : selectedLocationId;

      const res = await getItemsForLocationFlat(merchantId, locationId);
      if (res.success && res.data) {
        return res.data;
      }
      return [];
    },
    enabled: !!merchantId,
  });

  // Update Stock Mutation
  const updateStockMutation = useMutation({
    mutationFn: async ({
      itemId,
      quantity,
    }: {
      itemId: string;
      quantity: number;
    }) => {
      if (!merchantId) throw new Error("Merchant not found");

      if (selectedLocationId === "all") {
        throw new Error("Please select a specific location to update stock");
      }

      const res = await updateItemOverride({
        menuItemId: itemId,
        locationId: selectedLocationId,
        currentStock: quantity,
        stockTrackingMode: "quantity", // Ensure tracking is on if we are setting quantity
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to update stock");
      }
      return res;
    },
    onSuccess: () => {
      toast.success("Stock updated successfully");
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      // Also invalidate menu items if they are used elsewhere
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return {
    items,
    isLoading: isUserLoading || isMerchantLoading || isInventoryLoading,
    locationId: selectedLocationId,
    updateStock: updateStockMutation.mutate,
    isUpdating: updateStockMutation.isPending,
    refetch,
    isMerchantLoaded: !!merchantId,
  };
}
