"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  DollarSign,
  MapPin,
  RefreshCcw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { VendorItemWithDetails } from "@/types/inventory";
import {
  GetLocationPricingForItem,
  UpsertLocationPricing,
  RemoveLocationPricing,
} from "@/app/dashboard/actions/location-pricing";

interface LocationPricingSheetProps {
  vendorId: string;
  item: VendorItemWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LocationPricingSheet({
  vendorId,
  item,
  open,
  onOpenChange,
}: LocationPricingSheetProps) {
  const queryClient = useQueryClient();

  // Fetch pricing data
  const { data: pricingData, isLoading } = useQuery({
    queryKey: ["location-pricing", vendorId, item?.inventory_item_id],
    queryFn: () => GetLocationPricingForItem(vendorId, item!.inventory_item_id),
    enabled: !!vendorId && !!item?.inventory_item_id && open,
  });

  // Extract data
  const locations = pricingData?.data || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b mb-4">
          <SheetTitle className="flex flex-col gap-1">
            <span>Location Pricing</span>
            <span className="text-sm font-normal text-muted-foreground">
              {item?.inventory_item?.name}
            </span>
          </SheetTitle>
          <SheetDescription>
            Override the default cost (${item?.default_cost?.toFixed(2)}) for
            specific locations.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : locations.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium">No Locations Linked</h3>
            <p className="text-sm text-muted-foreground mt-1 px-8">
              This vendor is not linked to any locations yet. Go to the
              &quot;Locations&quot; tab to link locations first.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-muted p-3 rounded-lg flex items-center justify-between text-sm">
              <span className="font-medium">Default Vendor Cost:</span>
              <Badge variant="outline" className="bg-background">
                ${item?.default_cost?.toFixed(2)} /{" "}
                {item?.inventory_item?.unit_type}
              </Badge>
            </div>

            <div className="space-y-4">
              {locations.map((locData) => (
                <PricingRow
                  key={locData.location.id}
                  vendorId={vendorId}
                  inventoryItemId={item!.inventory_item_id}
                  locationName={locData.location.name}
                  locationId={locData.location.id}
                  currentPricing={locData.pricing}
                  defaultCost={item!.default_cost}
                  unitType={item!.inventory_item?.unit_type || "unit"}
                />
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Pricing Row Component
// ============================================================================

function PricingRow({
  vendorId,
  inventoryItemId,
  locationName,
  locationId,
  currentPricing,
  defaultCost,
  unitType,
}: {
  vendorId: string;
  inventoryItemId: string;
  locationName: string;
  locationId: string;
  currentPricing: any;
  defaultCost: number;
  unitType: string;
}) {
  const queryClient = useQueryClient();
  const [cost, setCost] = useState(
    currentPricing ? currentPricing.unit_cost.toString() : ""
  );
  const [isModified, setIsModified] = useState(false);

  // Upsert mutation
  const upsertMutation = useMutation({
    mutationFn: () =>
      UpsertLocationPricing({
        vendorId,
        locationId,
        inventoryItemId,
        unitCost: parseFloat(cost),
      }),
    onSuccess: (result) => {
      if (result.error) toast.error(result.error);
      else {
        toast.success(`Price updated for ${locationName}`);
        setIsModified(false);
        queryClient.invalidateQueries({
          queryKey: ["location-pricing", vendorId, inventoryItemId],
        });
      }
    },
    onError: () => toast.error("Failed to update price"),
  });

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: () => RemoveLocationPricing(currentPricing.id),
    onSuccess: (result) => {
      if (result.error) toast.error(result.error);
      else {
        toast.success(`Price reverted to default for ${locationName}`);
        setCost("");
        setIsModified(false);
        queryClient.invalidateQueries({
          queryKey: ["location-pricing", vendorId, inventoryItemId],
        });
      }
    },
    onError: () => toast.error("Failed to revert price"),
  });

  const handleSave = () => {
    if (!cost || isNaN(parseFloat(cost)) || parseFloat(cost) < 0) {
      toast.error("Please enter a valid cost");
      return;
    }
    upsertMutation.mutate();
  };

  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
      <div className="mt-2 text-muted-foreground">
        <MapPin className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-sm">{locationName}</span>
          {currentPricing && (
            <Badge variant="secondary" className="text-[10px] px-1.5 h-5">
              Overridden
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="number"
              value={cost}
              placeholder={defaultCost.toFixed(2)}
              onChange={(e) => {
                setCost(e.target.value);
                setIsModified(true);
              }}
              className="pl-8 h-9 text-sm"
            />
          </div>

          {isModified ? (
            <Button
              size="sm"
              className="h-9 px-3"
              onClick={handleSave}
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          ) : currentPricing ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              title="Revert to default"
            >
              {removeMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
