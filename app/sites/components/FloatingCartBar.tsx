"use client";

import { useCart } from "../hooks/useCart";
import { Button } from "@/components/ui/button";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function FloatingCartBar() {
  const { items, setOpen, getSubtotal, getTotalItems } = useCart();
  const subtotal = getSubtotal();
  const itemCount = getTotalItems();

  // Don't render if cart is empty
  if (items.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-safe lg:pb-4 mb-[72px] lg:mb-0"
      >
        <motion.div
          key={itemCount}
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ duration: 0.2 }}
          className="container mx-auto max-w-lg"
        >
          <div
            className="bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center justify-between gap-4 border border-gray-700"
            style={{
              boxShadow:
                "0 -4px 20px rgba(0, 0, 0, 0.15), 0 8px 30px rgba(0, 0, 0, 0.25)",
            }}
          >
            {/* Left: Cart Icon + Item Count */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingCart className="h-5 w-5 text-gray-300" />
                <span className="absolute -top-2 -right-2 bg-[var(--primary)] text-white text-[10px] font-bold h-4 w-4 flex items-center justify-center rounded-full">
                  {itemCount}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm text-gray-400">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </p>
              </div>
            </div>

            {/* Center: Subtotal */}
            <div className="flex-1 text-center sm:text-left">
              <p className="text-lg font-bold">${subtotal.toFixed(2)}</p>
            </div>

            {/* Right: CTA Button */}
            <Button
              onClick={() => setOpen(true)}
              className="bg-[var(--primary)] hover:opacity-90 text-white font-semibold px-6 h-10 rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95"
            >
              <span className="mr-2">View Cart</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
