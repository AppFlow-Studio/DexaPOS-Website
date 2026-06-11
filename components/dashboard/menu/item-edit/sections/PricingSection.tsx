"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpdateMenuItem } from "@/app/dashboard/actions/menu-items";
import {
  useIsAllLocations,
  useLocationStore,
  useIsSingleLocation,
} from "@/stores/location-store";
import { AffectsTag } from "../../AffectsTag";
import { CascadeLadder } from "../../CascadeLadder";
import { SectionHeader } from "./OverviewSection";
import type { SectionRenderCtx } from "@/app/dashboard/menu/items/[itemId]/edit/ItemEditLayout";

export function PricingSection({ itemId, item, scope }: SectionRenderCtx) {
  const queryClient = useQueryClient();
  const isAllLocations = useIsAllLocations();
  const isSingleLocation = useIsSingleLocation();
  const { selectedLocationId } = useLocationStore();
  // Single-location accounts write the core directly — omit location_id even if a
  // stale per-location selection is still in scope (first-load window before the
  // scope-reset effect runs). isSingleLocation drives the omission, not just the UI.
  const locationId = isAllLocations || isSingleLocation ? null : selectedLocationId;

  const initialPrice =
    item?.effective_price != null ? String(item.effective_price) : "";
  const initialCash =
    item?.effective_cash_price != null ? String(item.effective_cash_price) : "";

  const [price, setPrice] = React.useState(initialPrice);
  const [cashPrice, setCashPrice] = React.useState(initialCash);

  React.useEffect(() => {
    setPrice(
      item?.effective_price != null ? String(item.effective_price) : "",
    );
    setCashPrice(
      item?.effective_cash_price != null
        ? String(item.effective_cash_price)
        : "",
    );
  }, [item?.id, item?.effective_price, item?.effective_cash_price]);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = parseFloat(price);
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new Error("Enter a valid price");
      }
      const parsedCash = cashPrice === "" ? undefined : parseFloat(cashPrice);
      const res = await UpdateMenuItem(
        itemId,
        {
          price: parsed,
          ...(parsedCash !== undefined ? { cash_price: parsedCash } : {}),
        },
        locationId ?? undefined,
      );
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Pricing saved");
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["item-price-matrix", itemId] });
    },
    onError: (err) =>
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <div className="space-y-4">
      <SectionHeader title="Pricing" scope={scope} />
      <div className="space-y-4 rounded-lg border bg-card p-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pricing-price">Price</Label>
            <Input
              id="pricing-price"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pricing-cash">Cash price</Label>
            <Input
              id="pricing-cash"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={cashPrice}
              onChange={(e) => setCashPrice(e.target.value)}
              placeholder="Default"
            />
          </div>
        </div>
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
