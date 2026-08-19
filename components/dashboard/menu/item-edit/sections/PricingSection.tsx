"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UpdateMenuItem } from "@/app/dashboard/actions/menu-items";
import {
  useIsAllLocations,
  useLocationStore,
  useIsSingleLocation,
} from "@/stores/location-store";
import { useEffectivePricing } from "@/app/dashboard/hooks/useEffectivePricing";
import { PriceInputGroup } from "@/components/dashboard/locations/PriceInputGroup";
import { AffectsTag } from "../../AffectsTag";
import { CascadeLadder } from "../../CascadeLadder";
import { SectionHeader } from "./OverviewSection";
import type { SectionRenderCtx } from "@/app/dashboard/menu/items/[itemId]/edit/ItemEditLayout";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";

export function PricingSection({ itemId, item, scope }: SectionRenderCtx) {
  const queryClient = useQueryClient();
  const isAllLocations = useIsAllLocations();
  const isSingleLocation = useIsSingleLocation();
  const { selectedLocationId } = useLocationStore();
  // Same dual-pricing strategy/percentage the popup editor uses, so the page
  // respects the merchant/location pricing rules (e.g. auto 4% card adjust).
  const { pricingStrategy, dualPricingPercentage } = useEffectivePricing();
  // Single-location accounts write the core directly — omit location_id even if a
  // stale per-location selection is still in scope (first-load window before the
  // scope-reset effect runs). isSingleLocation drives the omission, not just the UI.
  const locationId = isAllLocations || isSingleLocation ? null : selectedLocationId;

  const [price, setPrice] = React.useState<number>(
    item?.effective_price != null ? Number(item.effective_price) : 0,
  );
  const [cashPrice, setCashPrice] = React.useState<number | null>(
    item?.effective_cash_price != null ? Number(item.effective_cash_price) : null,
  );

  React.useEffect(() => {
    setPrice(item?.effective_price != null ? Number(item.effective_price) : 0);
    setCashPrice(
      item?.effective_cash_price != null ? Number(item.effective_cash_price) : null,
    );
  }, [item?.id, item?.effective_price, item?.effective_cash_price]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (Number.isNaN(price) || price < 0) {
        throw new Error("Enter a valid price");
      }
      const res = await UpdateMenuItem(
        itemId,
        {
          price,
          ...(cashPrice != null ? { cash_price: cashPrice } : {}),
        },
        locationId ?? undefined,
      );
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["item-price-matrix", itemId] });
      invalidateOrderOutSync(queryClient);
    },
    onError: (err) =>
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <div className="space-y-4">
      <SectionHeader title="Pricing" scope={scope} />
      <div className="space-y-4 rounded-2xl border bg-card p-6">
        {!isSingleLocation && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cascade
            </Label>
            <CascadeLadder
              itemId={itemId}
              context={scope}
              locationId={locationId}
            />
          </div>
        )}
        <PriceInputGroup
          key={item?.id ?? "new"}
          price={price}
          cashPrice={cashPrice}
          onPriceChange={setPrice}
          onCashPriceChange={setCashPrice}
          label="Base Price"
          pricingStrategy={pricingStrategy}
          dualPricingPercentage={dualPricingPercentage}
        />
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                Save Pricing
                <AffectsTag ctx={scope} variant="save-button" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
