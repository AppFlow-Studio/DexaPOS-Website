"use client";

import { useState, useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  Loader2,
  Snowflake,
  ChefHat,
  Droplet,
  PackageX,
  CalendarX,
  ShieldAlert,
  CircleDashed,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WasteReason, LogWasteInput } from "../../actions/waste";

export interface WastePickItem {
  id: string;
  name: string;
  unit_type: string;
  category?: string | null;
  current_stock?: number | null;
  cost_per_unit?: number | null;
}

const WASTE_REASONS: {
  value: WasteReason;
  label: string;
  icon: typeof Snowflake;
}[] = [
  { value: "spoilage", label: "Spoilage", icon: Snowflake },
  { value: "overproduction", label: "Overproduction", icon: ChefHat },
  { value: "spill", label: "Spill", icon: Droplet },
  { value: "damaged", label: "Damaged", icon: PackageX },
  { value: "expired", label: "Expired", icon: CalendarX },
  { value: "theft", label: "Theft", icon: ShieldAlert },
  { value: "other", label: "Other", icon: CircleDashed },
];

interface LogWasteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: WastePickItem[];
  onConfirm: (input: LogWasteInput) => Promise<void>;
  isPending?: boolean;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export function LogWasteDialog({
  open,
  onOpenChange,
  items,
  onConfirm,
  isPending,
}: LogWasteDialogProps) {
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<WasteReason>("spoilage");
  const [notes, setNotes] = useState("");
  const [wasteDate, setWasteDate] = useState(todayISO());

  const selectedItem = useMemo(
    () => items.find((i) => i.id === itemId),
    [items, itemId],
  );

  const onHand = selectedItem?.current_stock ?? null;
  const qtyValue = parseFloat(quantity) || 0;
  const estimatedCost = qtyValue * (selectedItem?.cost_per_unit ?? 0);
  const exceedsStock = onHand != null && qtyValue > onHand;
  const isValid = !!itemId && qtyValue > 0 && !exceedsStock;

  const reset = () => {
    setItemId("");
    setQuantity("");
    setReason("spoilage");
    setNotes("");
    setWasteDate(todayISO());
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    await onConfirm({
      inventory_item_id: itemId,
      quantity: qtyValue,
      reason,
      notes: notes.trim() || undefined,
      waste_date: wasteDate,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden flex flex-col max-sm:h-dvh sm:max-h-[90vh]">
        {/* Header band */}
        <DialogHeader className="shrink-0 space-y-0 border-b bg-gradient-to-br from-red-500/10 via-background to-background px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/15 ring-1 ring-red-500/20">
              <Trash2 className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <DialogTitle className="text-lg">Log Waste</DialogTitle>
              <DialogDescription>
                Record spoilage, spills, or other inventory loss.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 space-y-5 overflow-y-auto px-6 py-5"
        >
          {/* Item picker */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Inventory Item <span className="text-red-500">*</span>
            </Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select an item to log waste against" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                sideOffset={4}
                className="max-h-[70vh] min-h-105 w-(--radix-select-trigger-width)"
              >
                {items.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No inventory items at this location.
                  </div>
                )}
                {items.map((item) => (
                  <SelectItem
                    key={item.id}
                    value={item.id}
                    className="[&>span:last-child]:min-w-0 [&>span:last-child]:flex-1"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.name}
                      {item.current_stock != null
                        ? ` — ${item.current_stock} ${item.unit_type} on hand`
                        : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Selected item preview */}
            {selectedItem && (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background ring-1 ring-border">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {selectedItem.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedItem.category || "Uncategorized"}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      (onHand ?? 0) <= 0 ? "text-red-500" : "text-foreground",
                    )}
                  >
                    {onHand ?? "—"} {selectedItem.unit_type}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    On hand
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Quantity + Date */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="waste-qty"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Quantity <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="waste-qty"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="h-11 pr-14 text-base font-medium"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                  {selectedItem?.unit_type ?? "units"}
                </span>
              </div>
              {selectedItem && (onHand ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setQuantity(String(onHand))}
                  className="text-xs font-medium text-red-500 hover:underline"
                >
                  Waste all ({onHand} {selectedItem.unit_type})
                </button>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="waste-date"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Waste Date
              </Label>
              <Input
                id="waste-date"
                type="date"
                value={wasteDate}
                max={todayISO()}
                onChange={(e) => setWasteDate(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          {exceedsStock && (
            <div className="-mt-2 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                You can only waste up to {onHand} {selectedItem?.unit_type} on
                hand. If more spoiled, correct the stock count first (Catalog
                tab) or run a count sheet.
              </span>
            </div>
          )}

          {/* Reason chips */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reason <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {WASTE_REASONS.map((r) => {
                const Icon = r.icon;
                const active = reason === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2.5 text-center text-xs font-medium transition-all",
                      active
                        ? "border-red-500/40 bg-red-500/10 text-red-600 ring-1 ring-red-500/20"
                        : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="leading-tight break-words hyphens-auto">
                      {r.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label
              htmlFor="waste-notes"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Notes
            </Label>
            <Textarea
              id="waste-notes"
              placeholder="Optional — describe what happened"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </form>

        {/* Footer with cost summary */}
        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 border-t bg-muted/30 px-6 py-4 sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Estimated Cost
            </p>
            <p className="text-xl font-bold tabular-nums text-red-600">
              ${estimatedCost.toFixed(2)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !isValid}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Log Waste
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
