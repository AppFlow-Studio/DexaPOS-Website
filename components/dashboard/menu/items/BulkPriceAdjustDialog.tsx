"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Globe, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BulkAdjustMenuItemPrices,
  type BulkPriceOp,
  type BulkPriceRounding,
} from "@/app/dashboard/actions/bulk-price-adjustment";
import { useMerchantPricingStrategies } from "@/app/dashboard/hooks/useMerchantPricingStrategies";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";
import { useIsSingleLocation } from "@/stores/location-store";

type Direction = "increase" | "decrease" | "set_fixed";
type Unit = "pct" | "amt";

interface PreviewItem {
  id: string;
  name: string;
  effectivePrice: number;
}

interface BulkPriceAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string | undefined;
  selectedItems: PreviewItem[];
  /** Currently-selected location id from the global selector, or null if "all". */
  currentLocationId: string | null;
  isAllLocations: boolean;
  onSuccess?: () => void;
}

// Keep in sync with bulk_adjust_menu_item_prices RPC (migrations/20260509120000_*.sql).
function applyOperation(
  oldPrice: number,
  op: BulkPriceOp,
  value: number,
): number {
  switch (op) {
    case "increase_pct":
      return oldPrice * (1 + value / 100);
    case "decrease_pct":
      return oldPrice * (1 - value / 100);
    case "increase_amt":
      return oldPrice + value;
    case "decrease_amt":
      return oldPrice - value;
    case "set_fixed":
      return value;
  }
}

function applyRounding(raw: number, rounding: BulkPriceRounding): number {
  switch (rounding) {
    case "cent":
      return Math.round(raw * 100) / 100;
    case "nickel_up":
      return Math.ceil(raw * 20) / 20;
    case "ninety_nine_up": {
      const floor = Math.floor(raw);
      return raw <= floor + 0.99 ? floor + 0.99 : floor + 1.99;
    }
  }
}

export function computeNewPrice(
  oldPrice: number,
  op: BulkPriceOp,
  value: number,
  rounding: BulkPriceRounding,
): number {
  return applyRounding(applyOperation(oldPrice, op, value), rounding);
}

function buildOperation(direction: Direction, unit: Unit): BulkPriceOp {
  if (direction === "set_fixed") return "set_fixed";
  if (direction === "increase") return unit === "pct" ? "increase_pct" : "increase_amt";
  return unit === "pct" ? "decrease_pct" : "decrease_amt";
}

export function BulkPriceAdjustDialog({
  open,
  onOpenChange,
  clerkOrgId,
  selectedItems,
  currentLocationId,
  isAllLocations,
  onSuccess,
}: BulkPriceAdjustDialogProps) {
  const queryClient = useQueryClient();
  const isSingleLocation = useIsSingleLocation();

  const [direction, setDirection] = useState<Direction>("increase");
  const [unit, setUnit] = useState<Unit>("pct");
  const [value, setValue] = useState<string>("");
  const [rounding, setRounding] = useState<BulkPriceRounding>("cent");
  const [scope, setScope] = useState<"base" | "override">(
    isAllLocations ? "base" : "override",
  );
  const [isSaving, setIsSaving] = useState(false);

  const { data: stratResp } = useMerchantPricingStrategies(clerkOrgId, open);
  const strategies = stratResp?.data ?? [];
  const distinctStrategies = useMemo(
    () => new Set(strategies.map((s) => s.pricing_strategy)),
    [strategies],
  );
  const crossStrategy =
    scope === "base" && distinctStrategies.size > 1 && strategies.length > 0;

  const hasValue = value.trim() !== "";
  const numericValue = hasValue ? Number(value) : Number.NaN;
  const valueValid =
    hasValue &&
    Number.isFinite(numericValue) &&
    (direction === "set_fixed" ? numericValue >= 0 : numericValue > 0);

  const operation = buildOperation(direction, unit);

  const previewRows = useMemo(() => {
    if (!valueValid) return [];
    return selectedItems.slice(0, 5).map((it) => {
      const next = computeNewPrice(
        it.effectivePrice,
        operation,
        numericValue,
        rounding,
      );
      return {
        id: it.id,
        name: it.name,
        old: it.effectivePrice,
        next,
        skipped: next < 0,
      };
    });
  }, [selectedItems, valueValid, operation, numericValue, rounding]);

  const canApply =
    !isSaving && valueValid && selectedItems.length > 0 && !!clerkOrgId;

  async function handleApply() {
    if (!canApply || !clerkOrgId) return;
    setIsSaving(true);
    try {
      const locationId =
        !isSingleLocation && scope === "override" && !isAllLocations
          ? currentLocationId
          : null;
      const res = await BulkAdjustMenuItemPrices({
        clerkOrgId,
        locationId,
        itemIds: selectedItems.map((s) => s.id),
        operation,
        value: numericValue,
        rounding,
      });
      if (res.error || !res.data) {
        toast.error(res.error ?? "Bulk price update failed");
        return;
      }
      toast.success(
        `${res.data.updated} updated · ${res.data.skipped} skipped`,
      );
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-categories"] });
      invalidateOrderOutSync(queryClient);
      onSuccess?.();
      onOpenChange(false);
      // reset
      setValue("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-none flex-col gap-0 overflow-hidden rounded-3xl border-0 p-0 sm:max-h-[90dvh] sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-5 pr-14 text-left">
          <DialogTitle className="text-xl">Adjust item prices</DialogTitle>
          <DialogDescription className="leading-5">
            Apply a card-price change to {selectedItems.length} selected{" "}
            {selectedItems.length === 1 ? "item" : "items"}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Direction */}
          <div className="space-y-2">
            <Label>Operation</Label>
            <div className="inline-flex rounded-full bg-muted/60 p-1">
              {(
                [
                  { v: "increase", label: "Increase" },
                  { v: "decrease", label: "Decrease" },
                  { v: "set_fixed", label: "Set fixed" },
                ] as { v: Direction; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setDirection(opt.v)}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors",
                    direction === opt.v
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Unit + Value */}
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            {direction !== "set_fixed" && (
              <div className="space-y-2">
                <Label>Unit</Label>
                <div className="inline-flex rounded-full bg-muted/60 p-1">
                  <button
                    type="button"
                    onClick={() => setUnit("pct")}
                    className={cn(
                      "shrink-0 rounded-full px-4 py-2 text-sm transition-colors",
                      unit === "pct"
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit("amt")}
                    className={cn(
                      "shrink-0 rounded-full px-4 py-2 text-sm transition-colors",
                      unit === "amt"
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    $
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 space-y-2">
              <Label htmlFor="bulk-value">
                {direction === "set_fixed"
                  ? "New price ($)"
                  : unit === "pct"
                    ? "Percent"
                    : "Amount ($)"}
              </Label>
              <Input
                id="bulk-value"
                inputMode="decimal"
                type="number"
                min={0}
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  direction === "set_fixed"
                    ? "e.g. 9.99"
                    : unit === "pct"
                      ? "e.g. 4"
                      : "e.g. 1.00"
                }
                className="h-10 rounded-full border-0 bg-muted/60 px-4 tabular-nums shadow-none focus-visible:bg-background"
              />
            </div>
          </div>

          {/* Rounding */}
          <div className="space-y-2">
            <Label>Rounding</Label>
            <RadioGroup
              value={rounding}
              onValueChange={(v) => setRounding(v as BulkPriceRounding)}
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-2xl border-0 p-3 transition-colors",
                  rounding === "cent"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/50 hover:bg-muted",
                )}
              >
                <RadioGroupItem value="cent" />
                <span className="text-sm">Nearest cent</span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-2xl border-0 p-3 transition-colors",
                  rounding === "nickel_up"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/50 hover:bg-muted",
                )}
              >
                <RadioGroupItem value="nickel_up" />
                <span className="text-sm">Round up to nickel</span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-2xl border-0 p-3 transition-colors",
                  rounding === "ninety_nine_up"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/50 hover:bg-muted",
                )}
              >
                <RadioGroupItem value="ninety_nine_up" />
                <span className="text-sm">Round up to .99</span>
              </label>
            </RadioGroup>
          </div>

          {/* Apply to */}
          {!isSingleLocation && <div className="space-y-2">
            <Label>Apply to</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as "base" | "override")}
              className="grid grid-cols-1 gap-2"
            >
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-2xl border-0 p-3 transition-colors",
                  scope === "base"
                    ? "bg-primary/10"
                    : "bg-muted/50 hover:bg-muted",
                )}
              >
                <RadioGroupItem value="base" />
                <Globe className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm">Base price — all locations</span>
                  <p className="text-xs text-muted-foreground">
                    Updates the shared base price for each selected item
                  </p>
                </div>
              </label>
              <label
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-0 p-3 transition-colors",
                  isAllLocations
                    ? "cursor-not-allowed bg-muted/30 opacity-50"
                    : scope === "override"
                      ? "cursor-pointer bg-primary/10"
                      : "cursor-pointer bg-muted/50 hover:bg-muted",
                )}
              >
                <RadioGroupItem value="override" disabled={isAllLocations} />
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm">This location only</span>
                  {isAllLocations && (
                    <p className="text-xs text-muted-foreground">
                      Select a location to enable
                    </p>
                  )}
                  {!isAllLocations && (
                    <p className="text-xs text-muted-foreground">
                      Creates or updates this location&apos;s price override
                    </p>
                  )}
                </div>
              </label>
            </RadioGroup>
          </div>}

          {/* Cross-strategy warning */}
          {crossStrategy && (
            <Alert
              variant="default"
              className="rounded-2xl border-0 bg-amber-50 text-amber-900 shadow-none dark:bg-amber-900/20 dark:text-amber-200"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Mixed pricing strategies detected</AlertTitle>
              <AlertDescription>
                This merchant has both <strong>manual</strong> and{" "}
                <strong>dual</strong> pricing locations. Base price changes
                propagate to all of them. Review carefully before applying.
              </AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {previewRows.length > 0 && (
            <div className="overflow-hidden rounded-2xl bg-muted/40">
              <div className="border-b border-border/60 px-4 py-2.5 text-xs font-medium text-muted-foreground">
                Preview (first{" "}
                <span className="tabular-nums">{previewRows.length}</span> of{" "}
                <span className="tabular-nums">{selectedItems.length}</span>)
              </div>
              <div className="divide-y">
                {previewRows.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="min-w-0 truncate">{r.name}</span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        r.skipped && "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      ${r.old.toFixed(2)} →{" "}
                      {r.skipped ? (
                        <em>skipped (negative)</em>
                      ) : (
                        `$${r.next.toFixed(2)}`
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 bg-background px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!canApply}
            className="rounded-full px-5"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply to <span className="tabular-nums">{selectedItems.length}</span>{" "}
            {selectedItems.length === 1 ? "item" : "items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
