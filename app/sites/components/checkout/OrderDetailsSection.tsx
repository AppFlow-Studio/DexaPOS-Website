"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, X } from "lucide-react";
import Link from "next/link";
import { type CartItem, resolveCartUnitPrice } from "../../hooks/useCart";
import { useStorefrontPath } from "../../lib/use-storefront-path";

interface OrderDetailsSectionProps {
  items: CartItem[];
  slug: string;
  orderType: "pickup" | "delivery";
  deliveryPricingEnabled: boolean;
  useCashPrice: boolean;
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onRemoveItem: (cartItemId: string) => void;
}

export function OrderDetailsSection({
  items,
  slug,
  orderType,
  deliveryPricingEnabled,
  useCashPrice,
  onUpdateQuantity,
  onRemoveItem,
}: OrderDetailsSectionProps) {
  const storePath = useStorefrontPath(slug);
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
          Order summary ({items.length} {items.length === 1 ? "item" : "items"})
        </h2>
        {expanded ? (
          <ChevronUp className="h-5 w-5" style={{ color: "var(--text-secondary)" }} />
        ) : (
          <ChevronDown className="h-5 w-5" style={{ color: "var(--text-secondary)" }} />
        )}
      </button>

      {expanded && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
          {items.map((item) => (
            <OrderDetailItem
              key={item.cartItemId}
              item={item}
              orderType={orderType}
              deliveryPricingEnabled={deliveryPricingEnabled}
              useCashPrice={useCashPrice}
              onUpdateQuantity={onUpdateQuantity}
              onRemoveItem={onRemoveItem}
            />
          ))}

          <Link
            href={storePath()}
            className="block text-center text-sm font-medium py-2"
            style={{ color: "var(--primary)" }}
          >
            + Add more items
          </Link>
        </div>
      )}
    </section>
  );
}

function OrderDetailItem({
  item,
  orderType,
  deliveryPricingEnabled,
  useCashPrice,
  onUpdateQuantity,
  onRemoveItem,
}: {
  item: CartItem;
  orderType: "pickup" | "delivery";
  deliveryPricingEnabled: boolean;
  useCashPrice: boolean;
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onRemoveItem: (cartItemId: string) => void;
}) {
  const [imageError, setImageError] = useState(false);
  const showImage = item.image && !imageError;

  return (
    <div
      className="flex gap-3 p-3 rounded-lg !bg-white"
      style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}
    >
      <div
        className="w-14 h-14 overflow-hidden shrink-0 flex items-center justify-center"
        style={{ borderRadius: "var(--radius)", backgroundColor: "#f3f4f6" }}
      >
        {showImage ? (
          <img
            src={item.image!}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span
            className="text-xl font-bold"
            style={{ color: "var(--primary)" }}
          >
            {item.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <h4 className="font-semibold text-sm line-clamp-1" style={{ color: "#111827" }}>
              {item.name}
            </h4>
            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
              <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "#6b7280" }}>
                {item.selectedModifiers.map((m) => m.name).join(", ")}
              </p>
            )}
          </div>
          <span className="font-bold text-sm shrink-0" style={{ color: "#111827" }}>
            ${(resolveCartUnitPrice(item, orderType, deliveryPricingEnabled, useCashPrice) * item.quantity).toFixed(2)}
          </span>
        </div>

        <div className="flex items-center justify-between mt-2">
          <button
            onClick={() => onRemoveItem(item.cartItemId)}
            className="p-1 transition-colors"
            style={{ color: "#6b7280" }}
            aria-label="Remove item"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div
            className="flex items-center h-7"
            style={{ border: "1px solid #e5e7eb", borderRadius: "var(--radius)" }}
          >
            <button
              className="w-7 h-full flex items-center justify-center"
              style={{ color: "#111827" }}
              onClick={() => onUpdateQuantity(item.cartItemId, item.quantity - 1)}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-7 text-center text-xs font-bold" style={{ color: "#111827" }}>
              {item.quantity}
            </span>
            <button
              className="w-7 h-full flex items-center justify-center"
              style={{
                backgroundColor: "var(--primary)",
                color: "#FFFFFF",
                borderRadius: `0 calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0`,
              }}
              onClick={() => onUpdateQuantity(item.cartItemId, item.quantity + 1)}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
