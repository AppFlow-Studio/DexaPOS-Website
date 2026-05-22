"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import { Minus, Plus, AlertCircle, Check, X } from "lucide-react";
import {
  StorefrontItem,
  StorefrontModifierGroup,
  StorefrontModifierOption,
} from "@/types/storefront";
import { useCart } from "../hooks/useCart";
import {
  getStorefrontBrowsePrice,
  getStorefrontDeliveryPriceLabel,
} from "../lib/storefront-pricing";

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

// ── Modifier row ────────────────────────────────────────────────────
function ModifierRow({
  option,
  isSelected,
  isSingle,
  onToggle,
}: {
  option: StorefrontModifierOption;
  isSelected: boolean;
  isSingle: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer transition-colors touch-manipulation"
      style={{
        borderBottom: "1px solid #f3f4f6",
        backgroundColor: isSelected ? "#f9fafb" : "#ffffff",
        minHeight: "52px",
      }}
    >
      {/* Control */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isSingle ? (
          // Radio circle
          <div
            className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
            style={{
              borderColor: isSelected ? "var(--primary)" : "#d1d5db",
              backgroundColor: isSelected ? "var(--primary)" : "#ffffff",
            }}
          >
            {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
        ) : (
          // Checkbox square
          <div
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
            style={{
              border: isSelected ? "none" : "2px solid #d1d5db",
              backgroundColor: isSelected ? "var(--primary)" : "#ffffff",
            }}
          >
            {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          </div>
        )}
        <span className="text-sm font-medium" style={{ color: "#111827" }}>
          {option.name}
        </span>
      </div>

      {/* Price */}
      {option.price > 0 && (
        <span className="text-sm font-medium flex-shrink-0" style={{ color: "#6b7280" }}>
          +${option.price.toFixed(2)}
        </span>
      )}
    </div>
  );
}

// ── Modifier group ───────────────────────────────────────────────────
function ModifierGroupSection({
  group,
  selectedIds,
  onToggle,
  hasError,
}: {
  group: StorefrontModifierGroup;
  selectedIds: string[];
  onToggle: (optionId: string) => void;
  hasError: boolean;
}) {
  const isSingle = group.max_selections === 1;
  const selCount = selectedIds.length;
  const isComplete = !group.required || selCount >= Math.max(1, group.min_selections);

  // Sub-label: "Choose 1" / "Choose up to N" / "Choose N–M"
  const chooseLabel = (() => {
    if (isSingle) return "Choose 1";
    if (group.min_selections > 0 && group.max_selections && group.max_selections > group.min_selections) {
      return `Choose ${group.min_selections}–${group.max_selections}`;
    }
    if (group.max_selections && group.max_selections > 1) return `Choose up to ${group.max_selections}`;
    if (group.min_selections > 0) return `Choose at least ${group.min_selections}`;
    return "Choose any";
  })();

  return (
    <div>
      {/* Group header */}
      <div
        className="flex items-start justify-between gap-3 px-5 py-3"
        style={{
          backgroundColor: "#f9fafb",
          borderTop: "1px solid #e5e7eb",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold" style={{ color: "#111827" }}>
              {group.name}
            </h4>
            {hasError && <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>{chooseLabel}</p>
          {hasError && (
            <p className="text-xs mt-0.5" style={{ color: "#ef4444" }}>
              Please make a selection
            </p>
          )}
        </div>

        {/* Required / Optional / Done pill */}
        {group.required ? (
          isComplete ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold flex-shrink-0"
              style={{ backgroundColor: "#dcfce7", color: "#166534", borderRadius: "6px", height: "22px" }}
            >
              <Check className="w-3 h-3" strokeWidth={2.5} />
              Done
            </span>
          ) : (
            <span
              className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold flex-shrink-0"
              style={{
                backgroundColor: hasError ? "#fef2f2" : "#dcfce7",
                color: hasError ? "#991b1b" : "#166534",
                borderRadius: "6px",
                height: "22px",
              }}
            >
              Required
            </span>
          )
        ) : (
          <span
            className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold flex-shrink-0"
            style={{ backgroundColor: "#f3f4f6", color: "#6b7280", borderRadius: "6px", height: "22px" }}
          >
            Optional
          </span>
        )}
      </div>

      {/* Options */}
      <div>
        {group.options.map((option) => (
          <ModifierRow
            key={option.id}
            option={option}
            isSelected={selectedIds.includes(option.id)}
            isSingle={isSingle}
            onToggle={() => onToggle(option.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────
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
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState("");
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      const defaults: Record<string, string[]> = {};
      item?.modifier_groups?.forEach((group) => {
        const defaultOption = group.options.find((o) => o.is_default);
        if (defaultOption) defaults[group.id] = [defaultOption.id];
      });
      setSelectedModifiers(defaults);
      setNotes("");
      setImageError(false);
      setShowValidationErrors(false);
    }
  }, [isOpen, item]);

  const allRequiredMet = useMemo(() => {
    if (!item?.modifier_groups) return true;
    return item.modifier_groups.every((group) => {
      if (group.required || group.min_selections > 0) {
        return (selectedModifiers[group.id] ?? []).length >= Math.max(1, group.min_selections);
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
  const hasImage = isValidImageSrc(item.image) && !imageError;
  const basePrice = getStorefrontBrowsePrice(item);
  const deliveryPriceLabel = getStorefrontDeliveryPriceLabel(item);

  const toggleOption = (group: StorefrontModifierGroup, optionId: string) => {
    setSelectedModifiers((prev) => {
      const current = prev[group.id] ?? [];
      const isSingle = group.max_selections === 1;
      if (isSingle) return { ...prev, [group.id]: [optionId] };
      if (current.includes(optionId)) return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      if (group.max_selections && current.length >= group.max_selections) return prev;
      return { ...prev, [group.id]: [...current, optionId] };
    });
  };

  const calculateTotal = () => {
    let total = basePrice;
    item.modifier_groups?.forEach((group) => {
      (selectedModifiers[group.id] ?? []).forEach((selId) => {
        const opt = group.options.find((o) => o.id === selId);
        if (opt) total += opt.price;
      });
    });
    return total;
  };

  const handleAddToCart = () => {
    if (!allRequiredMet) { setShowValidationErrors(true); return; }
    const flatModifiers: StorefrontModifierOption[] = [];
    item.modifier_groups?.forEach((group) => {
      (selectedModifiers[group.id] ?? []).forEach((selId) => {
        const opt = group.options.find((o) => o.id === selId);
        if (opt) flatModifiers.push(opt);
      });
    });
    addItem(item, quantity, flatModifiers, notes);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex p-0 gap-0 overflow-hidden border-0 shadow-2xl"
        style={{
          maxWidth: "min(680px, calc(100vw - 2rem))",
          maxHeight: "92vh",
          borderRadius: "16px",
          backgroundColor: "#ffffff",
        }}
      >
        <DialogDescription className="sr-only">
          {item.description ? `${item.name}. ${item.description}` : `${item.name}. Customize and add to your order.`}
        </DialogDescription>

        {/* Close button — absolute, always visible */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-50 flex items-center justify-center rounded-full transition-colors"
          style={{
            width: "32px",
            height: "32px",
            backgroundColor: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          <X className="w-4 h-4 text-white" />
        </button>

        {/* ── Two-panel layout ── */}
        <div className="flex flex-col w-full" style={{ maxHeight: "92vh" }}>

          {/* Image band — full width on mobile, left panel on md+ */}
          <div
            className="relative w-full flex-shrink-0"
            style={{
              height: hasImage ? "240px" : "0px",
              backgroundColor: hasImage ? "#f3f4f6" : "transparent",
            }}
          >
            {hasImage && (
              <Image
                src={item.image!}
                fill
                className="object-cover"
                alt=""
                sizes="680px"
                onError={() => setImageError(true)}
              />
            )}
            {isUnavailable && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                <span
                  className="rounded-full px-4 py-2 text-lg font-bold tracking-wider text-white"
                  style={{ backgroundColor: "rgba(0,0,0,0.7)", border: "2px solid rgba(255,255,255,0.3)" }}
                >
                  Sold Out
                </span>
              </div>
            )}
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ minHeight: 0 }}>

            {/* Item info header */}
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid #e5e7eb" }}>
              <h2 className="text-2xl font-bold leading-tight" style={{ color: "#111827" }}>
                {item.name}
              </h2>
              <p className="text-lg font-semibold mt-1" style={{ color: "#111827" }}>
                ${basePrice.toFixed(2)}
              </p>
              {deliveryPriceLabel && (
                <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
                  {deliveryPriceLabel}
                </p>
              )}
              {item.description && (
                <p className="text-sm mt-2 leading-relaxed" style={{ color: "#6b7280" }}>
                  {item.description}
                </p>
              )}

              {/* Dietary tags */}
              {item.dietary_tags && item.dietary_tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {item.dietary_tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--primary) 10%, #ffffff)",
                        color: "var(--primary)",
                        border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Allergens */}
              {item.allergens && item.allergens.length > 0 && (
                <div
                  className="mt-3 rounded-lg p-3 space-y-1.5"
                  style={{ backgroundColor: "#fff7ed", border: "1px solid #fed7aa" }}
                >
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#c2410c" }}>
                    Allergens
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {item.allergens.map((allergen) => (
                      <span key={allergen} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#ffedd5", color: "#c2410c" }}>
                        {allergen}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modifier groups */}
            {(item.modifier_groups ?? []).map((group) => {
              const hasError = showValidationErrors && (group.required || group.min_selections > 0)
                && (selectedModifiers[group.id] ?? []).length < Math.max(1, group.min_selections);
              return (
                <ModifierGroupSection
                  key={group.id}
                  group={group}
                  selectedIds={selectedModifiers[group.id] ?? []}
                  onToggle={(optId) => toggleOption(group, optId)}
                  hasError={hasError}
                />
              );
            })}

            {/* Special instructions */}
            <div className="px-5 py-4" style={{ borderTop: "1px solid #e5e7eb" }}>
              <label className="block text-sm font-semibold mb-2" style={{ color: "#111827" }}>
                Special Instructions
              </label>
              <textarea
                placeholder="e.g. No onions, sauce on side…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full text-sm px-3 py-2.5 rounded-lg resize-none outline-none"
                style={{
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#f9fafb",
                  color: "#111827",
                }}
              />
            </div>

            {/* Upsell */}
            {upsellSuggestions.length > 0 && (
              <div className="px-5 pb-4" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px" }}>
                <p className="text-sm font-semibold mb-3" style={{ color: "#111827" }}>
                  You might also like
                </p>
                <div
                  className="flex gap-3 overflow-x-auto pb-1"
                  style={{ scrollbarWidth: "none" } as React.CSSProperties}
                >
                  {upsellSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => onItemSelect?.(suggestion)}
                      className="shrink-0 w-28 rounded-xl overflow-hidden text-left transition-all hover:scale-[1.02] active:scale-[0.98] touch-manipulation"
                      style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }}
                    >
                      <div className="h-20 w-full overflow-hidden flex items-center justify-center" style={{ backgroundColor: "#f3f4f6" }}>
                        {isValidImageSrc(suggestion.image) ? (
                          <img src={suggestion.image!} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl font-bold opacity-30" style={{ color: "var(--primary)" }}>
                            {suggestion.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="p-2 space-y-0.5">
                        <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: "#111827" }}>
                          {suggestion.name}
                        </p>
                        <p className="text-xs font-medium" style={{ color: "#6b7280" }}>
                          ${getStorefrontBrowsePrice(suggestion).toFixed(2)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Sticky footer ── */}
          <div
            className="flex-shrink-0 flex items-center gap-3 px-5 py-4"
            style={{ borderTop: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}
          >
            {/* Quantity stepper */}
            <div
              className="flex items-center overflow-hidden flex-shrink-0"
              style={{ border: "1px solid #e5e7eb", borderRadius: "8px", height: "48px" }}
            >
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
                className="flex items-center justify-center disabled:opacity-40 touch-manipulation"
                style={{ width: "44px", height: "48px", color: "#374151" }}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-base font-bold" style={{ color: "#111827" }}>
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                aria-label="Increase quantity"
                className="flex items-center justify-center touch-manipulation"
                style={{ width: "44px", height: "48px", color: "#374151" }}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Add to cart CTA */}
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={isUnavailable}
              className="flex-1 font-bold text-sm text-center transition-opacity hover:opacity-90 active:scale-[0.98] touch-manipulation disabled:opacity-50"
              style={{
                height: "48px",
                backgroundColor: isUnavailable ? "#d1d5db" : "var(--primary)",
                color: "#ffffff",
                borderRadius: "8px",
              }}
            >
              {isUnavailable ? "Sold Out" : `Add to cart · $${(calculateTotal() * quantity).toFixed(2)}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
