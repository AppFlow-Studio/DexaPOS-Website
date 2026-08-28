"use client";

import { useMemo, useState } from "react";
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
import { ArrowRightLeft, Loader2, Plus, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { InitiateTransferInput, TransferLocation } from "../../actions/transfers";

export interface TransferPickItem {
  id: string;
  name: string;
  unit_type: string;
  category?: string | null;
  current_stock?: number | null;
}

interface TransferLine {
  inventory_item_id: string;
  quantity: number;
}

interface CreateTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: TransferPickItem[];
  /** Current scoped location — the transfer source. */
  fromLocationId: string;
  fromLocationName: string;
  /** All merchant locations (used to pick the destination). */
  locations: TransferLocation[];
  onConfirm: (input: InitiateTransferInput) => Promise<void>;
  isPending?: boolean;
}

export function CreateTransferDialog({
  open,
  onOpenChange,
  items,
  fromLocationId,
  fromLocationName,
  locations,
  onConfirm,
  isPending,
}: CreateTransferDialogProps) {
  const [toLocationId, setToLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [pickItemId, setPickItemId] = useState("");

  const destinations = useMemo(
    () => locations.filter((l) => l.id !== fromLocationId),
    [locations, fromLocationId],
  );

  const itemMap = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  const availableItems = useMemo(
    () => items.filter((i) => !lines.some((l) => l.inventory_item_id === i.id)),
    [items, lines],
  );

  const reset = () => {
    setToLocationId("");
    setNotes("");
    setLines([]);
    setPickItemId("");
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  };

  const addLine = () => {
    if (!pickItemId) return;
    setLines((prev) => [
      ...prev,
      { inventory_item_id: pickItemId, quantity: 1 },
    ]);
    setPickItemId("");
  };

  const updateQty = (id: string, qty: number) =>
    setLines((prev) =>
      prev.map((l) =>
        l.inventory_item_id === id ? { ...l, quantity: qty } : l,
      ),
    );

  const removeLine = (id: string) =>
    setLines((prev) => prev.filter((l) => l.inventory_item_id !== id));

  const hasOverStock = lines.some((l) => {
    const onHand = itemMap.get(l.inventory_item_id)?.current_stock ?? 0;
    return l.quantity > onHand;
  });

  const isValid =
    !!toLocationId &&
    lines.length > 0 &&
    lines.every((l) => l.quantity > 0) &&
    !hasOverStock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    await onConfirm({
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      notes: notes.trim() || undefined,
      items: lines,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none bg-card p-0 max-sm:top-auto max-sm:translate-y-0 sm:h-[min(760px,calc(100dvh-1rem))] sm:max-h-[90vh] sm:w-[calc(100%-1rem)] sm:max-w-[560px] sm:rounded-3xl">
        <DialogHeader className="shrink-0 space-y-0 px-5 py-5 pr-14 sm:px-6 sm:pr-16">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <DialogTitle className="text-lg">New Stock Transfer</DialogTitle>
              <DialogDescription>
                Move inventory from {fromLocationName} to another location.
                Source stock is decremented immediately.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6"
        >
          {/* Route — labels and controls live in separate rows of one grid so
              the From box and the To trigger always share a baseline, whatever
              each label wraps to. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              From
            </Label>
            <span aria-hidden />
            <Label
              htmlFor="transfer-destination"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              To <span className="text-red-500">*</span>
            </Label>

            <div className="flex h-11 min-w-0 items-center rounded-2xl border-0 bg-muted/60 px-4 text-sm font-medium">
              <span className="truncate">{fromLocationName}</span>
            </div>
            <ArrowRightLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={toLocationId} onValueChange={setToLocationId}>
              <SelectTrigger
                id="transfer-destination"
                className="h-11 w-full min-w-0 rounded-2xl border-0 bg-muted/60 shadow-none hover:bg-muted [&>span]:min-w-0 [&>span]:truncate"
              >
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent className="w-(--radix-select-trigger-width)">
                {destinations.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No other locations available.
                  </div>
                )}
                {destinations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Item picker */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Add Items <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-2">
              <Select value={pickItemId} onValueChange={setPickItemId}>
                <SelectTrigger className="h-11 min-w-0 flex-1 rounded-2xl border-0 bg-muted/60 shadow-none hover:bg-muted [&>span]:min-w-0 [&>span]:truncate">
                  <SelectValue placeholder="Select an item" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  sideOffset={4}
                  avoidCollisions
                  collisionPadding={16}
                  className="max-h-[min(15rem,var(--radix-select-content-available-height))] w-(--radix-select-trigger-width)"
                >
                  {availableItems.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No items available.
                    </div>
                  )}
                  {availableItems.map((item) => (
                    <SelectItem
                      key={item.id}
                      value={item.id}
                      className="[&>span:last-child]:flex [&>span:last-child]:w-full [&>span:last-child]:items-center [&>span:last-child]:justify-between [&>span:last-child]:gap-3"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {item.current_stock != null
                          ? `${item.current_stock} ${item.unit_type}`
                          : "—"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-1"
                onClick={addLine}
                disabled={!pickItemId}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          {/* Lines */}
          {lines.length > 0 && (
            <div className="space-y-1 rounded-2xl border-0 bg-muted/40 p-2">
              {lines.map((line) => {
                const item = itemMap.get(line.inventory_item_id);
                const onHand = item?.current_stock ?? 0;
                const over = line.quantity > onHand;
                return (
                  <div
                    key={line.inventory_item_id}
                    className="flex items-center gap-3 rounded-xl bg-background px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item?.name ?? "Unknown item"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {onHand} {item?.unit_type ?? ""} on hand
                      </p>
                    </div>
                    <div className="relative w-28">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) =>
                          updateQty(
                            line.inventory_item_id,
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className={cn(
                          "h-9 rounded-xl border-0 bg-muted/60 pr-12 text-sm shadow-none",
                          over && "bg-red-500/10 text-red-600 ring-1 ring-red-500/40",
                        )}
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground">
                        {item?.unit_type ?? ""}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeLine(line.inventory_item_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {hasOverStock && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                One or more lines exceed the stock on hand at {fromLocationName}.
                Reduce the quantity before sending.
              </span>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </Label>
            <Textarea
              placeholder="Optional — reason or instructions for this transfer"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none border-0 bg-muted/60 shadow-none focus-visible:bg-muted/40"
            />
          </div>
        </form>

        <DialogFooter className="shrink-0 bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
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
            className="gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
