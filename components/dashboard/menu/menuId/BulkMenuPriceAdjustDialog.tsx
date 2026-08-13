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
import { Loader2, Globe, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BulkAdjustMenuItemMenuPrices,
  type BulkMenuPriceOp,
  type BulkMenuPriceRounding,
} from "@/app/dashboard/actions/bulk-menu-price-adjustment";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";
import { useIsSingleLocation } from "@/stores/location-store";

function applyOp(price: number, op: BulkMenuPriceOp, value: number): number {
  switch (op) {
    case "increase_pct": return price * (1 + value / 100);
    case "decrease_pct": return price * (1 - value / 100);
    case "increase_amt": return price + value;
    case "decrease_amt": return price - value;
    case "set_fixed":    return value;
    default:             return price;
  }
}

function applyRound(raw: number, rounding: BulkMenuPriceRounding): number {
  switch (rounding) {
    case "cent":      return Math.round(raw * 100) / 100;
    case "nickel_up": return Math.ceil(raw * 20) / 20;
    case "ninety_nine_up": {
      const floor = Math.floor(raw);
      return raw <= floor + 0.99 ? floor + 0.99 : floor + 1.99;
    }
  }
}

function computeNewPrice(price: number, op: BulkMenuPriceOp, value: number, rounding: BulkMenuPriceRounding): number {
  return applyRound(applyOp(price, op, value), rounding);
}

type Direction = "increase" | "decrease" | "set_fixed";
type Unit = "pct" | "amt";
// null = fan-out (all locations); string = specific location
type Scope = "all_locations" | "this_location";

interface PreviewItem {
  id: string;
  name: string;
  effectivePrice: number;
}

interface BulkMenuPriceAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string | undefined;
  menuId: string;
  selectedItems: PreviewItem[];
  currentLocationId: string | null;
  isAllLocations: boolean;
  onSuccess?: () => void;
}

function buildOperation(direction: Direction, unit: Unit): BulkMenuPriceOp {
  if (direction === "set_fixed") return "set_fixed";
  if (direction === "increase") return unit === "pct" ? "increase_pct" : "increase_amt";
  return unit === "pct" ? "decrease_pct" : "decrease_amt";
}

export function BulkMenuPriceAdjustDialog({
  open,
  onOpenChange,
  clerkOrgId,
  menuId,
  selectedItems,
  currentLocationId,
  isAllLocations,
  onSuccess,
}: BulkMenuPriceAdjustDialogProps) {
  const queryClient = useQueryClient();
  const isSingleLocation = useIsSingleLocation();

  const [direction, setDirection] = useState<Direction>("increase");
  const [unit, setUnit] = useState<Unit>("pct");
  const [value, setValue] = useState<string>("");
  const [rounding, setRounding] = useState<BulkMenuPriceRounding>("cent");
  const [scope, setScope] = useState<Scope>("all_locations");
  const [isSaving, setIsSaving] = useState(false);

  const numericValue = Number(value);
  const valueValid = Number.isFinite(numericValue) && numericValue >= 0;
  const operation = buildOperation(direction, unit);

  const previewRows = useMemo(() => {
    if (!valueValid) return [];
    return selectedItems.slice(0, 5).map((it) => {
      const next = computeNewPrice(it.effectivePrice, operation, numericValue, rounding);
      return { id: it.id, name: it.name, old: it.effectivePrice, next, skipped: next < 0 };
    });
  }, [selectedItems, valueValid, operation, numericValue, rounding]);

  const canApply = !isSaving && valueValid && selectedItems.length > 0 && !!clerkOrgId;

  async function handleApply() {
    if (!canApply || !clerkOrgId) return;
    setIsSaving(true);
    try {
      const locationId = scope === "this_location" && !isAllLocations
        ? currentLocationId
        : null;

      const res = await BulkAdjustMenuItemMenuPrices({
        clerkOrgId,
        menuId,
        locationId,
        itemIds: selectedItems.map((s) => s.id),
        operation,
        value: numericValue,
        rounding,
      });

      if (res.error || !res.data) {
        toast.error(res.error ?? "Bulk menu price update failed");
        return;
      }

      toast.success(`${res.data.updated} updated · ${res.data.skipped} skipped`);
      queryClient.invalidateQueries({ queryKey: ["menu-with-categories"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      invalidateOrderOutSync(queryClient);
      onSuccess?.();
      onOpenChange(false);
      setValue("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk price adjustment — this menu</DialogTitle>
          <DialogDescription>
            Apply a card-price change to {selectedItems.length} selected{" "}
            {selectedItems.length === 1 ? "item" : "items"} at the menu level (L5).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Direction */}
          <div className="space-y-2">
            <Label>Operation</Label>
            <div className="inline-flex rounded-md border bg-muted p-1">
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
                    "px-3 py-1.5 text-sm rounded-sm transition",
                    direction === opt.v
                      ? "bg-background shadow-sm font-medium"
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
                <div className="inline-flex rounded-md border bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => setUnit("pct")}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-sm",
                      unit === "pct" ? "bg-background shadow-sm font-medium" : "text-muted-foreground",
                    )}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit("amt")}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-sm",
                      unit === "amt" ? "bg-background shadow-sm font-medium" : "text-muted-foreground",
                    )}
                  >
                    $
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 space-y-2">
              <Label htmlFor="bulk-menu-value">
                {direction === "set_fixed"
                  ? "New price ($)"
                  : unit === "pct"
                    ? "Percent"
                    : "Amount ($)"}
              </Label>
              <Input
                id="bulk-menu-value"
                inputMode="decimal"
                type="number"
                min={0}
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={direction === "set_fixed" ? "9.99" : unit === "pct" ? "4" : "1.00"}
              />
            </div>
          </div>

          {/* Rounding */}
          <div className="space-y-2">
            <Label>Rounding</Label>
            <RadioGroup
              value={rounding}
              onValueChange={(v) => setRounding(v as BulkMenuPriceRounding)}
              className="grid grid-cols-3 gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="cent" />
                <span className="text-sm">Nearest cent</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="nickel_up" />
                <span className="text-sm">Round up to nickel</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="ninety_nine_up" />
                <span className="text-sm">Round up to .99</span>
              </label>
            </RadioGroup>
          </div>

          {/* Scope */}
          {!isSingleLocation && (
          <div className="space-y-2">
            <Label>Apply to</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as Scope)}
              className="grid grid-cols-1 gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="all_locations" />
                <Globe className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm">This menu — all locations</span>
                  <p className="text-xs text-muted-foreground">
                    Writes an L5 override for every location of this merchant
                  </p>
                </div>
              </label>
              <label
                className={cn(
                  "flex items-center gap-2 rounded-md border p-2.5",
                  isAllLocations
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer hover:bg-muted/50",
                )}
              >
                <RadioGroupItem value="this_location" disabled={isAllLocations} />
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm">This menu — this location only</span>
                  {isAllLocations && (
                    <p className="text-xs text-muted-foreground">
                      Select a location to enable
                    </p>
                  )}
                </div>
              </label>
            </RadioGroup>
          </div>
          )}

          {/* Preview */}
          {previewRows.length > 0 && (
            <div className="rounded-md border">
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
                Preview (first {previewRows.length} of {selectedItems.length})
              </div>
              <div className="divide-y">
                {previewRows.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="truncate">{r.name}</span>
                    <span className={cn("tabular-nums", r.skipped && "text-amber-600")}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!canApply}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply to {selectedItems.length}{" "}
            {selectedItems.length === 1 ? "item" : "items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
