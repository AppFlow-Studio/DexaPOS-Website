"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Minus, Plus } from "lucide-react";
import {
  StorefrontItem,
  StorefrontModifierGroup,
  StorefrontModifierOption,
} from "@/types/storefront";
import { useCart } from "../hooks/useCart";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ItemDetailsModalProps {
  item: StorefrontItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ItemDetailsModal({
  item,
  isOpen,
  onClose,
}: ItemDetailsModalProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<
    Record<string, string[]>
  >({});
  const [notes, setNotes] = useState("");

  // Reset state when item changes
  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setSelectedModifiers({});
      setNotes("");
    }
  }, [isOpen, item]);

  // Validate Logic
  const allRequiredMet = useMemo(() => {
    if (!item || !item.modifier_groups) return true;
    return item.modifier_groups.every((group) => {
      if (group.required || group.min_selections > 0) {
        const selections = selectedModifiers[group.id] || [];
        return selections.length >= Math.max(1, group.min_selections);
      }
      return true;
    });
  }, [item, selectedModifiers]);

  if (!item) return null;

  const toggleOption = (group: StorefrontModifierGroup, optionId: string) => {
    setSelectedModifiers((prev) => {
      const current = prev[group.id] || [];
      const isSingle = group.max_selections === 1;

      if (isSingle) {
        // Radio behavior
        return { ...prev, [group.id]: [optionId] };
      } else {
        // Checkbox behavior
        if (current.includes(optionId)) {
          return {
            ...prev,
            [group.id]: current.filter((id) => id !== optionId),
          };
        } else {
          // Check Max
          if (group.max_selections && current.length >= group.max_selections) {
            return prev; // Max reached
          }
          return { ...prev, [group.id]: [...current, optionId] };
        }
      }
    });
  };

  const calculateTotal = () => {
    let total = item.price;
    item.modifier_groups?.forEach((group) => {
      const selections = selectedModifiers[group.id] || [];
      selections.forEach((selId) => {
        const opt = group.options.find((o) => o.id === selId);
        if (opt) total += opt.price;
      });
    });
    return total;
  };

  const handleAddToCart = () => {
    // Collect full modifier objects
    const flatModifiers: StorefrontModifierOption[] = [];
    item.modifier_groups?.forEach((group) => {
      const selections = selectedModifiers[group.id] || [];
      selections.forEach((selId) => {
        const opt = group.options.find((o) => o.id === selId);
        if (opt) flatModifiers.push(opt);
      });
    });

    addItem(item, quantity, flatModifiers, notes);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] h-[90vh] sm:h-auto flex flex-col p-0 overflow-hidden">
        <ScrollArea className="flex-1 max-h-[calc(90vh-80px)] overflow-y-auto">
          {/* Header Image? Optional */}
          {item.image && (
            <div className="w-full h-48 bg-gray-100">
              <img
                src={item.image}
                className="w-full h-full object-cover"
                alt={item.name}
              />
            </div>
          )}

          <div className="p-6 space-y-6">
            <div>
              <DialogTitle className="text-2xl font-bold">
                {item.name}
              </DialogTitle>
              {item.description && (
                <p className="text-muted-foreground mt-2">{item.description}</p>
              )}
              <p className="text-lg font-semibold mt-2 text-[var(--primary)]">
                Base price: ${item.price.toFixed(2)}
              </p>
            </div>

            {/* Modifiers */}
            <div className="space-y-6">
              {item.modifier_groups?.map((group) => (
                <div key={group.id} className="border-t pt-4">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold text-lg">{group.name}</h4>
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        group.required
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {group.required ? "Required" : `Optional`}
                      {group.max_selections &&
                        group.max_selections > 1 &&
                        ` (Max ${group.max_selections})`}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {group.options.map((option) => {
                      const isSelected = (
                        selectedModifiers[group.id] || []
                      ).includes(option.id);
                      return (
                        <div
                          key={option.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all",
                            isSelected
                              ? "border-[var(--primary)] bg-[var(--primary)]/5"
                              : "border-gray-200 hover:border-gray-300"
                          )}
                          onClick={() => toggleOption(group, option.id)}
                        >
                          <div className="flex items-center gap-3">
                            {group.max_selections === 1 ? (
                              <div
                                className={cn(
                                  "h-4 w-4 rounded-full border flex items-center justify-center",
                                  isSelected
                                    ? "border-[var(--primary)]"
                                    : "border-gray-400"
                                )}
                              >
                                {isSelected && (
                                  <div className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                                )}
                              </div>
                            ) : (
                              <Checkbox checked={isSelected} />
                            )}
                            <span className="font-medium">{option.name}</span>
                          </div>
                          {option.price > 0 && (
                            <span className="text-sm text-gray-600">
                              +${option.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Notes */}
            <div className="border-t pt-4">
              <Label htmlFor="notes" className="mb-2 block font-semibold">
                Special Instructions
              </Label>
              <Textarea
                id="notes"
                placeholder="Ex: No onions, sauce on side..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
              />
            </div>
          </div>
        </ScrollArea>

        {/* Footer actions */}
        <DialogFooter className="p-4 border-t bg-white sticky bottom-0 z-10 sm:justify-between flex-row items-center gap-4">
          {/* Quantity */}
          <div className="flex items-center border rounded-md h-10 w-32 bg-white">
            <button
              className="px-3 h-full hover:bg-gray-100 flex items-center justify-center disabled:opacity-50"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="flex-1 text-center font-bold">{quantity}</span>
            <button
              className="px-3 h-full hover:bg-gray-100 flex items-center justify-center"
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <Button
            className="flex-1 h-10 bg-[var(--primary)] text-white hover:opacity-90"
            onClick={handleAddToCart}
            disabled={!allRequiredMet}
          >
            Add to Order - ${(calculateTotal() * quantity).toFixed(2)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
