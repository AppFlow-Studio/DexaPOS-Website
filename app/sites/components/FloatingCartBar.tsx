"use client";

import { useCart } from "../hooks/useCart";
import { ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function FloatingCartBar() {
  const { items, setOpen, getSubtotal, getTotalItems } = useCart();
  const subtotal = getSubtotal();
  const itemCount = getTotalItems();

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
          animate={{ scale: [1, 1.03, 1] }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="container mx-auto max-w-lg"
        >
          <div
            onClick={() => setOpen(true)}
            className="cursor-pointer flex items-center justify-between gap-4 px-5 py-3.5"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-text)",
              borderRadius: "var(--radius)",
              boxShadow:
                "0 8px 32px color-mix(in srgb, var(--primary) 40%, transparent), 0 2px 8px rgba(0,0,0,0.12)",
              fontFamily: "var(--font)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--primary-text) 20%, transparent)",
                }}
              >
                {itemCount}
              </div>
              <span className="font-semibold text-[15px]">View Cart</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base">
                ${subtotal.toFixed(2)}
              </span>
              <ArrowRight className="h-4 w-4 opacity-70" />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
