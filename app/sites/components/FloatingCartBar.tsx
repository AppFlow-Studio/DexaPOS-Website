"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useCart } from "../hooks/useCart";

function isValidImageSrc(src?: string | null): boolean {
  return !!src && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/"));
}
import { ArrowRight, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";


interface FloatingCartBarProps {
  freeDeliveryThreshold?: number | null;
  baseDeliveryFee?: number | null;
  prepTime?: number | null;
}

export function FloatingCartBar({ freeDeliveryThreshold, baseDeliveryFee, prepTime }: FloatingCartBarProps) {
  const { items, setOpen, getSubtotal, getTotalItems } = useCart();
  const subtotal = getSubtotal();
  const itemCount = getTotalItems();
  const [mobileNavHeight, setMobileNavHeight] = useState(72);

  useEffect(() => {
    const el = document.getElementById("mobile-bottom-tabs");
    if (!el) return;
    const update = () => setMobileNavHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (items.length === 0) {
    return null;
  }

  const previewItems = items.slice(0, 4);
  const showFreeDeliveryBar =
    !!freeDeliveryThreshold &&
    freeDeliveryThreshold > 0 &&
    subtotal < freeDeliveryThreshold;
  const amountToFreeDelivery = showFreeDeliveryBar
    ? (freeDeliveryThreshold! - subtotal).toFixed(2)
    : null;
  const freeDeliveryProgress = showFreeDeliveryBar
    ? Math.min((subtotal / freeDeliveryThreshold!) * 100, 100)
    : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-safe lg:pb-4 lg:mb-0"
        style={{ marginBottom: mobileNavHeight }}
      >
        <motion.div
          key={itemCount}
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.03, 1] }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="container mx-auto max-w-lg"
        >
          <div
            style={{
              backgroundColor: "var(--primary)",
              borderRadius: "var(--radius)",
              boxShadow:
                "0 8px 32px color-mix(in srgb, var(--primary) 40%, transparent), 0 2px 8px rgba(0,0,0,0.12)",
              fontFamily: "var(--font)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="w-full cursor-pointer flex items-center justify-between gap-3 px-4 py-3.5 min-h-[56px] touch-manipulation text-left"
              style={{
                color: "var(--primary-text)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex -space-x-2 shrink-0">
                  {previewItems.map((item) => (
                    <div
                      key={item.cartItemId}
                      className="w-9 h-9 rounded-lg overflow-hidden border-2 flex items-center justify-center shrink-0 relative"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--primary-text) 15%, transparent)",
                        borderColor: "var(--primary)",
                      }}
                    >
                      {isValidImageSrc(item.image) ? (
                        <Image
                          src={item.image!}
                          fill
                          alt={item.name}
                          className="object-cover"
                          sizes="36px"
                        />
                      ) : (
                        <ShoppingBag className="h-4 w-4 opacity-70" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="min-w-0">
                  <span className="font-semibold text-[15px] block truncate">
                    {itemCount} {itemCount === 1 ? "item" : "items"}
                    {prepTime && prepTime > 0 && (
                      <span className="text-xs ml-2 opacity-75">· ~{prepTime} min</span>
                    )}
                  </span>
                  <span className="text-xs opacity-90 truncate block">
                    {previewItems
                      .map((i) => {
                        const mods = i.selectedModifiers
                          ?.slice(0, 2)
                          .map((m) => m.name)
                          .join(", ");
                        return mods ? `${i.name} (${mods})` : i.name;
                      })
                      .join(", ")}
                    {items.length > 4 && ` +${items.length - 4} more`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-base">${subtotal.toFixed(2)}</span>
                <ArrowRight className="h-4 w-4 opacity-80" />
              </div>
            </button>

            {/* Free delivery progress bar */}
            {showFreeDeliveryBar && (
              <div
                className="px-4 pb-3"
                style={{ color: "var(--primary-text)" }}
              >
                <div className="flex justify-between text-[11px] mb-1 opacity-90">
                  <span>Add ${amountToFreeDelivery} more for free delivery</span>
                  <span>Free over ${freeDeliveryThreshold!.toFixed(0)}</span>
                </div>
                <div
                  className="w-full h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: "color-mix(in srgb, var(--primary-text) 25%, transparent)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${freeDeliveryProgress}%`,
                      backgroundColor: "var(--primary-text)",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
