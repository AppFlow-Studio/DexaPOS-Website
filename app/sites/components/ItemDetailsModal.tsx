"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Minus, Plus, AlertCircle } from "lucide-react";
import {
  StorefrontItem,
  StorefrontModifierGroup,
  StorefrontModifierOption,
} from "@/types/storefront";
import { useCart } from "../hooks/useCart";

function isValidImageSrc(src?: string | null): boolean {
  return !!src && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/"));
}

interface ItemDetailsModalProps {
  item: StorefrontItem | null;
  isOpen: boolean;
  onClose: () => void;
  categoryItems?: StorefrontItem[];
  onItemSelect?: (item: StorefrontItem) => void;
}

export function ItemDetailsModal({
  item,
  isOpen,
  onClose,
  categoryItems,
  onItemSelect,
}: ItemDetailsModalProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [imageError, setImageError] = useState(false);
  const [selectedModifiers, setSelectedModifiers] = useState<
    Record<string, string[]>
  >({});
  const [notes, setNotes] = useState("");
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  // Reset state when item changes, pre-selecting default modifier options
  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      const defaults: Record<string, string[]> = {};
      item?.modifier_groups?.forEach((group) => {
        const defaultOption = group.options.find((o) => o.is_default);
        if (defaultOption) {
          defaults[group.id] = [defaultOption.id];
        }
      });
      setSelectedModifiers(defaults);
      setNotes("");
      setImageError(false);
      setShowValidationErrors(false);
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

  const upsellSuggestions = useMemo(() => {
    if (!item || !categoryItems?.length) return [];
    return categoryItems
      .filter((i) => i.id !== item.id && i.availability !== false)
      .sort((a, b) => (b.is_popular ? 1 : 0) - (a.is_popular ? 1 : 0))
      .slice(0, 3);
  }, [item, categoryItems]);

  if (!item) return null;

  const isUnavailable = item.availability === false;

  const toggleOption = (group: StorefrontModifierGroup, optionId: string) => {
    setSelectedModifiers((prev) => {
      const current = prev[group.id] || [];
      const isSingle = group.max_selections === 1;

      if (isSingle) {
        return { ...prev, [group.id]: [optionId] };
      } else {
        if (current.includes(optionId)) {
          return {
            ...prev,
            [group.id]: current.filter((id) => id !== optionId),
          };
        } else {
          if (group.max_selections && current.length >= group.max_selections) {
            return prev;
          }
          return { ...prev, [group.id]: [...current, optionId] };
        }
      }
    });
  };

  const calculateTotal = () => {
    let total = item.delivery_price ?? item.price;
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
    if (!allRequiredMet) {
      setShowValidationErrors(true);
      return;
    }
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

  const isGroupIncomplete = (group: StorefrontModifierGroup) => {
    if (!showValidationErrors) return false;
    if (group.required || group.min_selections > 0) {
      const selections = selectedModifiers[group.id] || [];
      return selections.length < Math.max(1, group.min_selections);
    }
    return false;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton
        className="flex max-h-[90vh] w-full max-w-[min(480px,calc(100%-2rem))] flex-col gap-0 overflow-hidden rounded-lg border p-0 shadow-lg sm:max-w-[560px] [&_[data-slot=dialog-close]]:rounded-full [&_[data-slot=dialog-close]]:border [&_[data-slot=dialog-close]]:border-white/20 [&_[data-slot=dialog-close]]:bg-black/45 [&_[data-slot=dialog-close]]:p-2 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]]:shadow-md [&_[data-slot=dialog-close]]:backdrop-blur-sm [&_[data-slot=dialog-close]]:hover:bg-black/55 [&_[data-slot=dialog-close]]:focus:ring-white/40"
        style={{
          backgroundColor: "var(--bg)",
          color: "var(--text)",
          borderColor: "var(--border)",
        }}
      >
        <DialogDescription className="sr-only">
          {item.description
            ? `${item.name}. ${item.description}`
            : `${item.name}. Customize options and add to your order.`}
        </DialogDescription>

        {/* Header image — full width, fixed height */}
        <div
          className="relative h-[220px] w-full shrink-0 overflow-hidden"
          style={{
            backgroundColor:
              isValidImageSrc(item.image) && !imageError
                ? "var(--card)"
                : "color-mix(in srgb, var(--primary) 12%, var(--bg))",
          }}
        >
          {isValidImageSrc(item.image) && !imageError ? (
            <Image
              src={item.image}
              fill
              className="object-cover"
              alt=""
              sizes="(max-width: 640px) min(480px, 100vw), 560px"
              onError={() => setImageError(true)}
            />
          ) : (
            <span
              className="flex h-full items-center justify-center text-5xl font-bold opacity-50"
              style={{ color: "var(--primary)" }}
              aria-hidden
            >
              {item.name.charAt(0).toUpperCase()}
            </span>
          )}
          {isUnavailable && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            >
              <span
                className="rounded-full px-4 py-2 text-lg font-bold tracking-wider text-white"
                style={{
                  backgroundColor: "rgba(0,0,0,0.7)",
                  border: "2px solid rgba(255,255,255,0.3)",
                }}
              >
                Sold Out
              </span>
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style={{ backgroundColor: "var(--bg)" }}
        >
          <div className="space-y-6 p-6" style={{ backgroundColor: "var(--bg)" }}>
            <DialogHeader className="space-y-2 p-0 text-left">
              <DialogTitle
                className="text-2xl font-bold leading-tight"
                style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
              >
                {item.name}
              </DialogTitle>
            </DialogHeader>

            {item.description && (
              <p className="mt-2" style={{ color: "var(--text-secondary)" }}>
                {item.description}
              </p>
            )}

            <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>
              ${(item.delivery_price ?? item.price).toFixed(2)}
            </p>

            {item.dietary_tags && item.dietary_tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {item.dietary_tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--primary) 12%, var(--bg))",
                      color: "var(--primary)",
                      border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {item.allergens && item.allergens.length > 0 && (
              <div
                className="space-y-2 rounded-xl p-3"
                style={{
                  backgroundColor: "color-mix(in srgb, #f97316 8%, var(--bg))",
                  border: "1px solid color-mix(in srgb, #f97316 20%, transparent)",
                }}
              >
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#ea580c" }}>
                  Allergens
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {item.allergens.map((allergen) => (
                    <span
                      key={allergen}
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: "color-mix(in srgb, #f97316 15%, var(--bg))",
                        color: "#ea580c",
                      }}
                    >
                      {allergen}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-6">
              {item.modifier_groups?.map((group) => {
                const incomplete = isGroupIncomplete(group);
                const selCount = (selectedModifiers[group.id] || []).length;
                const isComplete =
                  !group.required || selCount >= Math.max(1, group.min_selections);
                return (
                  <div
                    key={group.id}
                    className="rounded-b-lg border-t pt-4 transition-all"
                    style={{
                      borderColor: incomplete ? "#ef4444" : "var(--border)",
                    }}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                          {group.name}
                        </h4>
                        {incomplete && <AlertCircle className="h-4 w-4 text-red-500" />}
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: group.required
                            ? isComplete
                              ? "color-mix(in srgb, #10b981 15%, transparent)"
                              : incomplete
                                ? "color-mix(in srgb, #ef4444 15%, transparent)"
                                : "color-mix(in srgb, var(--text-secondary) 12%, var(--bg))"
                            : "color-mix(in srgb, var(--text-secondary) 12%, var(--bg))",
                          color: group.required
                            ? isComplete
                              ? "#059669"
                              : incomplete
                                ? "#dc2626"
                                : "var(--text-secondary)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {group.required
                          ? isComplete
                            ? "✓ Done"
                            : "Required"
                          : "Optional"}
                        {!group.required &&
                          group.max_selections &&
                          group.max_selections > 1 &&
                          ` (Max ${group.max_selections})`}
                      </span>
                    </div>

                    {incomplete && (
                      <p className="mb-2 flex items-center gap-1 text-xs text-red-500">
                        Please make a selection to continue
                      </p>
                    )}

                    <div className="space-y-3">
                      {group.options.map((option) => {
                        const isSelected = (selectedModifiers[group.id] || []).includes(
                          option.id
                        );
                        return (
                          <div
                            key={option.id}
                            role="button"
                            tabIndex={0}
                            className="flex min-h-[44px] cursor-pointer items-center justify-between rounded-lg border p-3 transition-all touch-manipulation"
                            style={{
                              backgroundColor: isSelected
                                ? "color-mix(in srgb, var(--primary) 8%, var(--bg))"
                                : "var(--card)",
                              borderColor: isSelected ? "var(--primary)" : "var(--border)",
                            }}
                            onClick={() => toggleOption(group, option.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleOption(group, option.id);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              {group.max_selections === 1 ? (
                                <div
                                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                                  style={{
                                    borderColor: isSelected ? "var(--primary)" : "var(--border)",
                                  }}
                                  aria-hidden
                                >
                                  {isSelected && (
                                    <div
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: "var(--primary)" }}
                                    />
                                  )}
                                </div>
                              ) : (
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleOption(group, option.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                              <span className="font-medium" style={{ color: "var(--text)" }}>
                                {option.name}
                              </span>
                            </div>
                            {option.price > 0 && (
                              <span
                                className="text-sm font-medium"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                +${option.price.toFixed(2)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <Label
                htmlFor="notes"
                className="mb-2 block font-semibold"
                style={{ color: "var(--text)" }}
              >
                Special Instructions
              </Label>
              <Textarea
                id="notes"
                placeholder="Ex: No onions, sauce on side..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>

            {upsellSuggestions.length > 0 && (
              <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <p className="mb-3 text-sm font-semibold" style={{ color: "var(--text)" }}>
                  You might also like
                </p>
                <div
                  className="flex gap-3 overflow-x-auto pb-1"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
                >
                  {upsellSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => onItemSelect?.(suggestion)}
                      className="shrink-0 w-28 rounded-xl overflow-hidden text-left transition-all hover:scale-[1.02] active:scale-[0.98] touch-manipulation"
                      style={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div
                        className="h-20 w-full overflow-hidden flex items-center justify-center"
                        style={{
                          backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--bg))",
                        }}
                      >
                        {isValidImageSrc(suggestion.image) ? (
                          <img
                            src={suggestion.image!}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span
                            className="text-2xl font-bold opacity-40"
                            style={{ color: "var(--primary)" }}
                            aria-hidden
                          >
                            {suggestion.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="p-2 space-y-0.5">
                        <p
                          className="text-xs font-semibold leading-tight line-clamp-2"
                          style={{ color: "var(--text)" }}
                        >
                          {suggestion.name}
                        </p>
                        <p className="text-xs font-medium" style={{ color: "var(--text)" }}>
                          ${(suggestion.delivery_price ?? suggestion.price).toFixed(2)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter
          className="shrink-0 flex-row items-center gap-3 border-t px-5 pt-3 pb-6 sm:gap-4 sm:px-6 sm:pt-4 sm:pb-6 sm:justify-between"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--bg)",
          }}
        >
          <div
            className="flex h-11 min-w-[100px] shrink-0 items-center overflow-hidden rounded-lg border"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--card)",
            }}
          >
            <button
              type="button"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center disabled:opacity-50 touch-manipulation"
              style={{ color: "var(--text)" }}
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="flex-1 text-center font-bold" style={{ color: "var(--text)" }}>
              {quantity}
            </span>
            <button
              type="button"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center touch-manipulation"
              style={{ color: "var(--text)" }}
              onClick={() => setQuantity(quantity + 1)}
              aria-label="Increase quantity"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <Button
            className="min-h-[44px] flex-1 touch-manipulation mr-1"
            style={{
              backgroundColor: isUnavailable ? "var(--border)" : "var(--primary)",
              color: isUnavailable ? "var(--text-secondary)" : "var(--primary-text)",
            }}
            onClick={handleAddToCart}
            disabled={isUnavailable}
          >
            {isUnavailable
              ? "Sold Out"
              : `Add to Order · $${(calculateTotal() * quantity).toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
