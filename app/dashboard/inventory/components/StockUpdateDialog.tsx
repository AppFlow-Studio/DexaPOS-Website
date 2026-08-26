"use client";

import { useState } from "react";
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
import { Package, Loader2, TrendingUp, TrendingDown } from "lucide-react";

interface StockUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  currentStock: number;
  unitType: string;
  onConfirm: (
    newStock: number,
    reason: string,
    source: string
  ) => Promise<void>;
  isPending?: boolean;
}

const UPDATE_SOURCES = [
  { value: "manual", label: "Manual Count" },
  { value: "adjustment", label: "Adjustment" },
  { value: "waste", label: "Waste / Spoilage" },
  { value: "transfer", label: "Transfer" },
];

export function StockUpdateDialog({
  open,
  onOpenChange,
  itemName,
  currentStock,
  unitType,
  onConfirm,
  isPending,
}: StockUpdateDialogProps) {
  const [newStock, setNewStock] = useState(currentStock.toString());
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("manual");

  const stockValue = parseFloat(newStock) || 0;
  const change = stockValue - currentStock;
  const isIncrease = change > 0;
  const isDecrease = change < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    await onConfirm(stockValue, reason, source);

    // Reset form
    setNewStock(currentStock.toString());
    setReason("");
    setSource("manual");
    onOpenChange(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset form when closing
      setNewStock(currentStock.toString());
      setReason("");
      setSource("manual");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <DialogTitle>Update Stock</DialogTitle>
              <DialogDescription className="truncate max-w-[300px]">
                {itemName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Current Stock Display */}
          <div className="flex items-center justify-between rounded-2xl bg-muted/60 p-3">
            <span className="text-sm text-muted-foreground">Current Stock</span>
            <span className="font-semibold tabular-nums">
              {currentStock} {unitType}
            </span>
          </div>

          {/* New Stock Input */}
          <div className="space-y-2">
            <Label htmlFor="newStock">New Stock Quantity</Label>
            <div className="flex items-center gap-2">
              <Input
                id="newStock"
                type="number"
                min="0"
                step="0.01"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground w-12">
                {unitType}
              </span>
            </div>
          </div>

          {/* Change Preview */}
          {change !== 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-muted/60 p-3">
              {isIncrease ? (
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium tabular-nums">
                {isIncrease ? "+" : ""}
                {change.toFixed(2)} {unitType}{" "}
                {isIncrease ? "increase" : "decrease"}
              </span>
            </div>
          )}

          {/* Update Source */}
          <div className="space-y-2">
            <Label htmlFor="source">Update Type</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UPDATE_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="Why are you updating this stock? (e.g., 'Weekly inventory count', 'Found damaged items')"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              This will be recorded in the activity log for audit purposes.
            </p>
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !reason.trim() || change === 0}
            className="gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Update Stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
