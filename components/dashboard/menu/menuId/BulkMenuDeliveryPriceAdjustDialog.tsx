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
import { Loader2, Globe, MapPin, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BulkAdjustMenuItemMenuDeliveryPrices,
  type BulkMenuDeliveryOp,
  type BulkMenuDeliveryRounding,
} from "@/app/dashboard/actions/bulk-menu-delivery-price-adjustment";

type Scope = "all_locations" | "this_location";

interface PreviewItem {
  id: string;
  name: string;
  /** Effective card price — markup is always computed from this. */
  cardPrice: number;
  /** Current L5 delivery price for this menu context, if any. */
  currentDeliveryPrice: number | null;
}

interface BulkMenuDeliveryPriceAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string | undefined;
  menuId: string;
  selectedItems: PreviewItem[];
  currentLocationId: string | null;
  isAllLocations: boolean;
  onSuccess?: () => void;
}

function applyOperation(cardPrice: number, op: BulkMenuDeliveryOp, value: number): number | null {
  switch (op) {
    case "markup_pct":  return cardPrice * (1 + value / 100);
    case "markup_amt":  return cardPrice + value;
    case "set_fixed":   return value;
    case "reset":       return null;
  }
}

function applyRounding(raw: number, rounding: BulkMenuDeliveryRounding): number {
  switch (rounding) {
    case "cent":      return Math.round(raw * 100) / 100;
    case "nickel_up": return Math.ceil(raw * 20) / 20;
    case "ninety_nine_up": {
      const floor = Math.floor(raw);
      return raw <= floor + 0.99 ? floor + 0.99 : floor + 1.99;
    }
  }
}

export function BulkMenuDeliveryPriceAdjustDialog({
  open,
  onOpenChange,
  clerkOrgId,
  menuId,
  selectedItems,
  currentLocationId,
  isAllLocations,
  onSuccess,
}: BulkMenuDeliveryPriceAdjustDialogProps) {
  const queryClient = useQueryClient();

  const [operation, setOperation] = useState<BulkMenuDeliveryOp>("markup_pct");
  const [value, setValue] = useState<string>("");
  const [rounding, setRounding] = useState<BulkMenuDeliveryRounding>("cent");
  const [scope, setScope] = useState<Scope>("all_locations");
  const [isSaving, setIsSaving] = useState(false);

  const isReset = operation === "reset";
  const numericValue = Number(value);
  const valueValid = isReset || (Number.isFinite(numericValue) && numericValue >= 0);

  const previewRows = useMemo(() => {
    if (!valueValid) return [];
    return selectedItems.slice(0, 5).map((it) => {
      if (isReset) {
        return { id: it.id, name: it.name, old: it.currentDeliveryPrice, next: null as number | null, skipped: false };
      }
      const raw = applyOperation(it.cardPrice, operation, numericValue);
      if (raw === null) return { id: it.id, name: it.name, old: it.currentDeliveryPrice, next: null as number | null, skipped: false };
      const next = applyRounding(raw, rounding);
      return { id: it.id, name: it.name, old: it.currentDeliveryPrice, next, skipped: next < 0 };
    });
  }, [selectedItems, valueValid, isReset, operation, numericValue, rounding]);

  const canApply = !isSaving && valueValid && selectedItems.length > 0 && !!clerkOrgId;

  async function handleApply() {
    if (!canApply || !clerkOrgId) return;
    setIsSaving(true);
    try {
      const locationId = scope === "this_location" && !isAllLocations
        ? currentLocationId
        : null;

      const res = await BulkAdjustMenuItemMenuDeliveryPrices({
        clerkOrgId,
        menuId,
        locationId,
        itemIds: selectedItems.map((s) => s.id),
        operation,
        value: isReset ? 0 : numericValue,
        rounding,
      });

      if (res.error || !res.data) {
        toast.error(res.error ?? "Bulk menu delivery price update failed");
        return;
      }

      toast.success(`${res.data.updated} updated · ${res.data.skipped} skipped`);
      queryClient.invalidateQueries({ queryKey: ["menu-with-categories"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
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
          <DialogTitle>Bulk online price adjustment — this menu</DialogTitle>
          <DialogDescription>
            Apply a delivery-price change to {selectedItems.length} selected{" "}
            {selectedItems.length === 1 ? "item" : "items"} at the menu level (L5).
            Markup is always computed from the effective card price, never compounded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Operation */}
          <div className="space-y-2">
            <Label>Operation</Label>
            <div className="inline-flex rounded-md border bg-muted p-1 flex-wrap gap-1">
              {(
                [
                  { v: "markup_pct", label: "Markup %" },
                  { v: "markup_amt", label: "Markup $" },
                  { v: "set_fixed",  label: "Set fixed" },
                  { v: "reset",      label: "Reset" },
                ] as { v: BulkMenuDeliveryOp; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => {
                    setOperation(opt.v);
                    if (opt.v === "reset") setValue("");
                  }}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-sm transition flex items-center gap-1",
                    operation === opt.v
                      ? "bg-background shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.v === "reset" && <RotateCcw className="h-3 w-3" />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Value */}
          {!isReset && (
            <div className="space-y-2">
              <Label htmlFor="bulk-menu-del-value">
                {operation === "set_fixed"
                  ? "New price ($)"
                  : operation === "markup_pct"
                    ? "Markup percent"
                    : "Markup amount ($)"}
              </Label>
              <Input
                id="bulk-menu-del-value"
                inputMode="decimal"
                type="number"
                min={0}
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={operation === "set_fixed" ? "9.99" : operation === "markup_pct" ? "10" : "1.00"}
              />
            </div>
          )}

          {/* Rounding */}
          {!isReset && (
            <div className="space-y-2">
              <Label>Rounding</Label>
              <RadioGroup
                value={rounding}
                onValueChange={(v) => setRounding(v as BulkMenuDeliveryRounding)}
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
          )}

          {/* Scope */}
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
                      {r.old != null ? `$${r.old.toFixed(2)}` : "—"} →{" "}
                      {isReset ? (
                        <em>reset</em>
                      ) : r.skipped ? (
                        <em>skipped (negative)</em>
                      ) : r.next != null ? (
                        `$${r.next.toFixed(2)}`
                      ) : "—"}
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
          <Button
            onClick={handleApply}
            disabled={!canApply}
            variant={isReset ? "destructive" : "default"}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReset ? "Reset" : "Apply to"} {selectedItems.length}{" "}
            {selectedItems.length === 1 ? "item" : "items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
