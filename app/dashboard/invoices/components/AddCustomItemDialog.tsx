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

interface CustomItemData {
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
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

  const reset = () => {
    setName("");
    setDescription("");
    setQuantity("1");
    setPrice("");
  };

  const handleAdd = () => {
    if (!name.trim() || !price) return;
    onAdd({
      name: name.trim(),
      description: description.trim() || undefined,
      quantity: parseFloat(quantity) || 1,
      unit_price: parseFloat(price) || 0,
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
                min="0.01"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
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
