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
import {
  Loader2,
  AlertTriangle,
  Globe,
  MapPin,
  Truck,
  Percent,
  DollarSign,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BulkAdjustMenuItemDeliveryPrices,
  type BulkDeliveryOp,
  type BulkDeliveryRounding,
} from "@/app/dashboard/actions/bulk-delivery-price-adjustment";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";

type Operation = "markup_pct" | "markup_amt" | "set_fixed" | "reset";

interface PreviewItem {
  id: string;
  name: string;
  /** Card (POS) price — markup % / $ is computed from this. */
  cardPrice: number;
  /** Current delivery price, if any. Shown in preview "before" column. */
  currentDeliveryPrice: number | null;
}

interface BulkDeliveryPriceAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string | undefined;
  selectedItems: PreviewItem[];
  /** Currently-selected location id from the global selector, or null if "all". */
  currentLocationId: string | null;
  isAllLocations: boolean;
  onSuccess?: () => void;
}

// Keep in sync with bulk_adjust_menu_item_delivery_prices RPC.
// Note: markup is computed off card_price every time — never compounded over
// the current delivery price.
function applyOperation(
  cardPrice: number,
  op: BulkDeliveryOp,
  value: number,
): number | null {
  switch (op) {
    case "markup_pct":
      return cardPrice * (1 + value / 100);
    case "markup_amt":
      return cardPrice + value;
    case "set_fixed":
      return value;
    case "reset":
      return null;
  }
}

function applyRounding(raw: number, rounding: BulkDeliveryRounding): number {
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

function computeNewDeliveryPrice(
  cardPrice: number,
  op: BulkDeliveryOp,
  value: number,
  rounding: BulkDeliveryRounding,
): number | null {
  const raw = applyOperation(cardPrice, op, value);
  if (raw === null) return null;
  return applyRounding(raw, rounding);
}

export function BulkDeliveryPriceAdjustDialog({
  open,
  onOpenChange,
  clerkOrgId,
  selectedItems,
  currentLocationId,
  isAllLocations,
  onSuccess,
}: BulkDeliveryPriceAdjustDialogProps) {
  const queryClient = useQueryClient();

  const [operation, setOperation] = useState<Operation>("markup_pct");
  const [value, setValue] = useState<string>("");
  const [rounding, setRounding] = useState<BulkDeliveryRounding>("cent");
  const [scope, setScope] = useState<"base" | "override">(
    isAllLocations ? "base" : "override",
  );
  const [isSaving, setIsSaving] = useState(false);

  const isReset = operation === "reset";
  const numericValue = Number(value);
  const valueValid = isReset || (Number.isFinite(numericValue) && numericValue >= 0);

  const previewRows = useMemo(() => {
    if (!valueValid) return [];
    return selectedItems.slice(0, 5).map((it) => {
      const next = computeNewDeliveryPrice(
        it.cardPrice,
        operation,
        numericValue || 0,
        rounding,
      );
      return {
        id: it.id,
        name: it.name,
        card: it.cardPrice,
        old: it.currentDeliveryPrice,
        next,
        skipped: next !== null && next < 0,
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
        scope === "override" && !isAllLocations ? currentLocationId : null;
      const res = await BulkAdjustMenuItemDeliveryPrices({
        clerkOrgId,
        locationId,
        itemIds: selectedItems.map((s) => s.id),
        operation,
        value: isReset ? 0 : numericValue,
        rounding,
      });
      if (res.error || !res.data) {
        toast.error(res.error ?? "Bulk delivery price update failed");
        return;
      }
      toast.success(
        isReset
          ? `Cleared online price on ${res.data.updated} ${
              res.data.updated === 1 ? "item" : "items"
            }`
          : `${res.data.updated} updated · ${res.data.skipped} skipped`,
      );
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
      onSuccess?.();
      onOpenChange(false);
      setValue("");
      setOperation("markup_pct");
    } finally {
      setIsSaving(false);
    }
  }

  const operationOptions: {
    v: Operation;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    hint: string;
  }[] = [
    {
      v: "markup_pct",
      label: "Markup %",
      icon: Percent,
      hint: "Card price + N%",
    },
    {
      v: "markup_amt",
      label: "Markup $",
      icon: DollarSign,
      hint: "Card price + flat $",
    },
    {
      v: "set_fixed",
      label: "Set fixed",
      icon: Truck,
      hint: "Literal online price",
    },
    {
      v: "reset",
      label: "Reset",
      icon: RotateCcw,
      hint: "Clear override",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Truck className="h-4.5 w-4.5" />
            </span>
            Bulk online (delivery) price
          </DialogTitle>
          <DialogDescription>
            Apply an online price change to {selectedItems.length} selected{" "}
            {selectedItems.length === 1 ? "item" : "items"}. Markups are always
            computed from the current card price — never compounded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Operation selector — 2x2 grid, icon-on-left layout */}
          <div className="space-y-2">
            <Label>Operation</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {operationOptions.map((opt) => {
                const Icon = opt.icon;
                const isActive = operation === opt.v;
                const isResetOpt = opt.v === "reset";
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setOperation(opt.v)}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-2xl border-0 p-3 text-left shadow-none transition-colors",
                      isActive
                        ? isResetOpt
                          ? "bg-destructive/10 ring-2 ring-destructive/30"
                          : "bg-primary/10 ring-2 ring-primary/30"
                        : "bg-muted/60 hover:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
                        isActive
                          ? isResetOpt
                            ? "bg-destructive/15 text-destructive"
                            : "bg-primary/15 text-primary"
                          : "bg-background text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "text-sm font-medium leading-none",
                          isActive && isResetOpt && "text-destructive",
                          isActive && !isResetOpt && "text-primary",
                        )}
                      >
                        {opt.label}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground truncate">
                        {opt.hint}
                      </div>
                    </div>
                    {isActive && (
                      <span
                        className={cn(
                          "absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full",
                          isResetOpt
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-primary text-primary-foreground",
                        )}
                      >
                        <svg
                          viewBox="0 0 12 12"
                          className="h-2.5 w-2.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="2 6 5 9 10 3" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Value input — hidden in reset mode */}
          {!isReset && (
            <div className="space-y-2">
              <Label htmlFor="bulk-delivery-value">
                {operation === "set_fixed"
                  ? "New online price"
                  : operation === "markup_pct"
                    ? "Percent over card price"
                    : "Amount over card price"}
              </Label>
              <div className="relative">
                {operation === "markup_pct" ? (
                  <span className="pointer-events-none absolute bottom-0 right-0 top-0 flex w-10 items-center justify-center text-sm font-medium text-muted-foreground">
                    %
                  </span>
                ) : (
                  <span className="pointer-events-none absolute bottom-0 left-0 top-0 flex w-10 items-center justify-center text-sm font-medium text-muted-foreground">
                    $
                  </span>
                )}
                <Input
                  id="bulk-delivery-value"
                  inputMode="decimal"
                  type="number"
                  min={0}
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={
                    operation === "set_fixed"
                      ? "9.99"
                      : operation === "markup_pct"
                        ? "20"
                        : "2.00"
                  }
                  className={cn(
                    "h-10 rounded-full border-0 bg-muted/60 text-base shadow-none tabular-nums focus-visible:bg-background",
                    operation === "markup_pct" ? "pr-12" : "pl-12",
                  )}
                />
              </div>
              {operation === "markup_pct" && (
                <p className="text-xs text-muted-foreground">
                  Tip: 20% typically covers Uber/DoorDash take rate.
                </p>
              )}
            </div>
          )}

          {/* Rounding — hidden in reset mode */}
          {!isReset && (
            <div className="space-y-2">
              <Label>Rounding</Label>
              <RadioGroup
                value={rounding}
                onValueChange={(v) => setRounding(v as BulkDeliveryRounding)}
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
          )}

          {/* Apply to — base vs override */}
          <div className="space-y-2">
            <Label>Apply to</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as "base" | "override")}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-2xl border-0 p-3 shadow-none transition-colors",
                  scope === "base"
                    ? "bg-primary/10 ring-2 ring-primary/30"
                    : "bg-muted/60 hover:bg-muted",
                )}
              >
                <RadioGroupItem value="base" />
                <Globe
                  className={cn(
                    "h-4 w-4 shrink-0",
                    scope === "base" ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="text-sm leading-tight">
                  <span className="block font-medium">Base price</span>
                  <span className="block text-xs text-muted-foreground">
                    All locations
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex items-center gap-2.5 rounded-2xl border-0 p-3 shadow-none transition-colors",
                  isAllLocations
                    ? "cursor-not-allowed bg-muted/60 opacity-50"
                    : scope === "override"
                      ? "cursor-pointer bg-primary/10 ring-2 ring-primary/30"
                      : "cursor-pointer bg-muted/60 hover:bg-muted",
                )}
              >
                <RadioGroupItem value="override" disabled={isAllLocations} />
                <MapPin
                  className={cn(
                    "h-4 w-4 shrink-0",
                    scope === "override" && !isAllLocations
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                />
                <span className="text-sm leading-tight">
                  <span className="block font-medium">This location only</span>
                  <span className="block text-xs text-muted-foreground">
                    {isAllLocations
                      ? "Select a location to enable"
                      : "Override at the location level"}
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          {/* Reset warning */}
          {isReset && (
            <Alert
              variant="default"
              className="rounded-2xl border-0 bg-destructive/10 text-destructive shadow-none"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>This clears the online price</AlertTitle>
              <AlertDescription className="text-destructive/90">
                {scope === "base"
                  ? "Online price will be removed at the base level and use_delivery_price will be turned off. Items fall back to their card price for online orders."
                  : "Removes this location's online-price override. Item falls back to the base online price (or card price)."}
              </AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {previewRows.length > 0 && (
            <div className="overflow-hidden rounded-2xl border-0 bg-muted/60 shadow-none">
              <div className="border-b border-border/60 px-3 py-2 text-xs font-medium">
                <div className="grid grid-cols-[1fr_70px_70px_90px] items-center gap-2">
                  <span className="text-muted-foreground">
                    Preview (<span className="tabular-nums">{previewRows.length}</span> of{" "}
                    <span className="tabular-nums">{selectedItems.length}</span>)
                  </span>
                  <span className="text-right text-muted-foreground/70 font-normal text-[11px] uppercase tracking-wide">
                    Card
                  </span>
                  <span className="text-right text-muted-foreground/70 font-normal text-[11px] uppercase tracking-wide">
                    Old
                  </span>
                  <span className="text-right text-muted-foreground/70 font-normal text-[11px] uppercase tracking-wide">
                    {isReset ? "Cleared" : "New"}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-border/60">
                {previewRows.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[1fr_70px_70px_90px] items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    <span className="truncate text-foreground">{r.name}</span>
                    <span className="text-right tabular-nums text-muted-foreground text-xs">
                      ${r.card.toFixed(2)}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground text-xs">
                      {r.old != null ? (
                        `$${r.old.toFixed(2)}`
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-right font-medium tabular-nums",
                        r.skipped && "text-amber-600 dark:text-amber-400",
                        !r.skipped && r.next === null && "text-muted-foreground italic font-normal text-xs",
                        !r.skipped && r.next !== null && !isReset && "text-primary",
                      )}
                    >
                      {r.skipped
                        ? "skipped"
                        : r.next === null
                          ? "cleared"
                          : `$${r.next.toFixed(2)}`}
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
            variant={isReset ? "destructive" : "default"}
            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReset ? "Reset" : "Apply"} on{" "}
            <span className="tabular-nums">{selectedItems.length}</span>{" "}
            {selectedItems.length === 1 ? "item" : "items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
