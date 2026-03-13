"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, X } from "lucide-react";
import Link from "next/link";
import type { CartItem } from "../../hooks/useCart";
import { useStorefrontPath } from "../../lib/use-storefront-path";

interface OrderDetailsSectionProps {
  items: CartItem[];
  slug: string;
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onRemoveItem: (cartItemId: string) => void;
}

export function OrderDetailsSection({
  items,
  slug,
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
          Order Details ({items.length} {items.length === 1 ? "item" : "items"})
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
            <div
              key={item.cartItemId}
              className="flex gap-3 p-3 rounded-lg"
              style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
            >
              {item.image && (
                <div
                  className="w-14 h-14 overflow-hidden shrink-0"
                  style={{ borderRadius: "var(--radius)", backgroundColor: "var(--bg)" }}
                >
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm line-clamp-1" style={{ color: "var(--text)" }}>
                      {item.name}
                    </h4>
                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "var(--text-secondary)" }}>
                        {item.selectedModifiers.map((m) => m.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="font-bold text-sm shrink-0" style={{ color: "var(--text)" }}>
                    ${(item.totalPrice * item.quantity).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <button
                    onClick={() => onRemoveItem(item.cartItemId)}
                    className="p-1 transition-colors"
                    style={{ color: "var(--text-secondary)" }}
                    aria-label="Remove item"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div
                    className="flex items-center h-7"
                    style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)" }}
                  >
                    <button
                      className="w-7 h-full flex items-center justify-center"
                      style={{ color: "var(--text)" }}
                      onClick={() => onUpdateQuantity(item.cartItemId, item.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-7 text-center text-xs font-bold" style={{ color: "var(--text)" }}>
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
