"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface CustomItemData {
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  is_to_go: boolean;
}

interface AddCustomItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: CustomItemData) => void;
}

export function AddCustomItemDialog({
  open,
  onOpenChange,
  onAdd,
}: AddCustomItemDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [isToGo, setIsToGo] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setQuantity("1");
    setPrice("");
    setIsToGo(false);
  };

  const handleAdd = () => {
    if (!name.trim() || !price) return;
    onAdd({
      name: name.trim(),
      description: description.trim() || undefined,
      quantity: parseInt(quantity, 10) || 1,
      unit_price: parseFloat(price) || 0,
      is_to_go: isToGo,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="custom-name">
              Item name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="custom-name"
              placeholder="e.g. Consulting service"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="custom-desc">Description (optional)</Label>
            <Textarea
              id="custom-desc"
              placeholder="Brief description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="custom-qty">Quantity</Label>
              <Input
                id="custom-qty"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setQuantity(Number.isNaN(v) || v < 1 ? "1" : String(v));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-price">
                Price <span className="text-destructive">*</span>
              </Label>
              <Input
                id="custom-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="custom-to-go">To Go</Label>
              <p className="text-xs text-muted-foreground">
                Mark this item as a to-go order.
              </p>
            </div>
            <Switch
              id="custom-to-go"
              checked={isToGo}
              onCheckedChange={setIsToGo}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!name.trim() || !price}>
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
