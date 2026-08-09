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

  const numericValue = Number(value);
  const valueValid = Number.isFinite(numericValue) && numericValue >= 0;

  const operation = buildOperation(direction, unit);

  const previewRows = useMemo(() => {
    if (!valueValid) return [];
    return selectedItems.slice(0, 5).map((it) => {
      const next = computeNewPrice(it.effectivePrice, operation, numericValue, rounding);
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
    !isSaving && valueValid && selectedItems.length > 0 && clerkOrgId;

  async function handleApply() {
    if (!canApply || !clerkOrgId) return;
    setIsSaving(true);
    try {
      const locationId =
        scope === "override" && !isAllLocations ? currentLocationId : null;
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk price adjustment</DialogTitle>
          <DialogDescription>
            Apply a price change to {selectedItems.length} selected{" "}
            {selectedItems.length === 1 ? "item" : "items"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Direction */}
          <div className="space-y-2">
            <Label>Operation</Label>
            <div className="inline-flex gap-0.5 rounded-full bg-muted/70 p-1">
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
                    "shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[0.8125rem] font-medium transition-colors",
                    direction === opt.v
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Unit + Value */}
          <div className="flex items-end gap-3">
            {direction !== "set_fixed" && (
              <div className="space-y-2">
                <Label>Unit</Label>
                <div className="inline-flex gap-0.5 rounded-full bg-muted/70 p-1">
                  <button
                    type="button"
                    onClick={() => setUnit("pct")}
                    className={cn(
                      "shrink-0 rounded-full px-4 py-1.5 text-[0.8125rem] font-medium transition-colors",
                      unit === "pct"
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit("amt")}
                    className={cn(
                      "shrink-0 rounded-full px-4 py-1.5 text-[0.8125rem] font-medium transition-colors",
                      unit === "amt"
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border"
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
                placeholder={direction === "set_fixed" ? "9.99" : unit === "pct" ? "4" : "1.00"}
                className="h-9 text-[0.8125rem] tabular-nums"
              />
            </div>
          </div>

          {/* Rounding */}
          <div className="space-y-2">
            <Label>Rounding</Label>
            <RadioGroup
              value={rounding}
              onValueChange={(v) => setRounding(v as BulkPriceRounding)}
              className="grid grid-cols-3 gap-2"
            >
              <label className="flex cursor-pointer items-center gap-2 rounded-2xl border-0 bg-muted/60 p-2.5 shadow-none transition-colors hover:bg-muted">
                <RadioGroupItem value="cent" />
                <span className="text-sm">Nearest cent</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-2xl border-0 bg-muted/60 p-2.5 shadow-none transition-colors hover:bg-muted">
                <RadioGroupItem value="nickel_up" />
                <span className="text-sm">Round up to nickel</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-2xl border-0 bg-muted/60 p-2.5 shadow-none transition-colors hover:bg-muted">
                <RadioGroupItem value="ninety_nine_up" />
                <span className="text-sm">Round up to .99</span>
              </label>
            </RadioGroup>
          </div>

          {/* Apply to */}
          <div className="space-y-2">
            <Label>Apply to</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as "base" | "override")}
              className="grid grid-cols-1 gap-2"
            >
              <label className="flex cursor-pointer items-center gap-2 rounded-2xl border-0 bg-muted/60 p-2.5 shadow-none transition-colors hover:bg-muted">
                <RadioGroupItem value="base" />
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Base price (all locations)</span>
              </label>
              <label
                className={cn(
                  "flex items-center gap-2 rounded-2xl border-0 bg-muted/60 p-2.5 shadow-none",
                  isAllLocations
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer transition-colors hover:bg-muted",
                )}
              >
                <RadioGroupItem value="override" disabled={isAllLocations} />
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  This location only
                  {isAllLocations && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (select a location to enable)
                    </span>
                  )}
                </span>
              </label>
            </RadioGroup>
          </div>

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
            <div className="overflow-hidden rounded-2xl border-0 bg-muted/60 shadow-none">
              <div className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                Preview (first <span className="tabular-nums">{previewRows.length}</span> of{" "}
                <span className="tabular-nums">{selectedItems.length}</span>)
              </div>
              <div className="divide-y divide-border/60">
                {previewRows.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!canApply}
            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium"
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
