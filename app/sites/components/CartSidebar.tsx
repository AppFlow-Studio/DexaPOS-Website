"use client";

import { useRouter } from "next/navigation";
import { useCart } from "../hooks/useCart";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Minus, Plus, X, Leaf, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { OnlineOrderingConfig } from "@/types/site";
import { useStorefrontPath } from "../lib/use-storefront-path";

interface CartSidebarProps {
  config?: Partial<OnlineOrderingConfig>;
  storeConfigId?: string;
  slug: string;
}

export function CartSidebar({ config, storeConfigId, slug }: CartSidebarProps) {
  const router = useRouter();
  const storePath = useStorefrontPath(slug);
  const {
    items,
    isOpen,
    setOpen,
    updateQuantity,
    removeItem,
    getSubtotal,
    goGreen,
    setGoGreen,
  } = useCart();

  const subtotal = getSubtotal();
  const taxRate = 0.08;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const handleCheckout = () => {
    setOpen(false);
    router.push(storePath("/checkout"));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-60"
            style={{
              backgroundColor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
            }}
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-70 flex flex-col"
            style={{
              maxHeight: "85vh",
              backgroundColor: "var(--bg)",
              borderRadius: "20px 20px 0 0",
              fontFamily: "var(--font)",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
            }}
          >
            {/* Drag Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: "var(--border)" }}
              />
            </div>

            {/* Header */}
            <div
              className="px-6 py-3 flex items-center justify-between shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <h2
                className="text-xl font-bold"
                style={{
                  color: "var(--text)",
                  fontFamily: "var(--font-display)",
                }}
              >
                Your Order
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-xl transition-colors"
                style={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Cart Items */}
            <ScrollArea className="flex-1 overflow-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[250px] text-center px-6">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                    style={{ backgroundColor: "var(--card)" }}
                  >
                    <ShoppingBag
                      className="h-8 w-8"
                      style={{ color: "var(--text-secondary)" }}
                    />
                  </div>
                  <p className="font-medium mb-1" style={{ color: "var(--text)" }}>
                    Your cart is empty
                  </p>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    Add items to get started
                  </p>
                </div>
              ) : (
                <div>
                  {items.map((item) => (
                    <div
                      key={item.cartItemId}
                      className="px-6 py-4 transition-colors"
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <div className="flex gap-3">
                        {item.image && (
                          <div
                            className="w-14 h-14 overflow-hidden shrink-0"
                            style={{
                              borderRadius: "var(--radius)",
                              backgroundColor: "var(--card)",
                            }}
                          >
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <h4
                                className="font-semibold line-clamp-1 text-[15px]"
                                style={{ color: "var(--text)" }}
                              >
                                {item.name}
                              </h4>
                              {item.selectedModifiers &&
                                item.selectedModifiers.length > 0 && (
                                  <p
                                    className="text-xs mt-0.5 line-clamp-1"
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    {item.selectedModifiers
                                      .map((m) => m.name)
                                      .join(", ")}
                                  </p>
                                )}
                              {item.notes && (
                                <p
                                  className="text-xs italic mt-0.5 line-clamp-1"
                                  style={{ color: "var(--text-secondary)", opacity: 0.7 }}
                                >
                                  &ldquo;{item.notes}&rdquo;
                                </p>
                              )}
                            </div>
                            <span
                              className="font-bold shrink-0 text-[15px]"
                              style={{ color: "var(--text)" }}
                            >
                              ${(item.totalPrice * item.quantity).toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between mt-3">
                            <button
                              onClick={() => removeItem(item.cartItemId)}
                              className="p-1 transition-colors"
                              style={{ color: "var(--text-secondary)" }}
                              aria-label="Remove item"
                            >
                              <X className="h-4 w-4" />
                            </button>
                            <div
                              className="flex items-center h-8"
                              style={{
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius)",
                              }}
                            >
                              <button
                                className="w-8 h-full flex items-center justify-center transition-colors"
                                style={{ color: "var(--text)" }}
                                onClick={() =>
                                  updateQuantity(
                                    item.cartItemId,
                                    item.quantity - 1
                                  )
                                }
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span
                                className="w-8 text-center text-sm font-bold"
                                style={{ color: "var(--text)" }}
                              >
                                {item.quantity}
                              </span>
                              <button
                                className="w-8 h-full flex items-center justify-center transition-colors"
                                style={{
                                  backgroundColor: "var(--primary)",
                                  color: "#FFFFFF",
                                  borderRadius: `0 calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0`,
                                }}
                                onClick={() =>
                                  updateQuantity(
                                    item.cartItemId,
                                    item.quantity + 1
                                  )
                                }
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Footer */}
            {items.length > 0 && (
              <div className="shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
                {/* Go Green */}
                <div
                  className="px-6 py-3 flex items-center justify-between"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-2">
                    <Leaf
                      className={cn("h-4 w-4", goGreen ? "text-green-600" : "")}
                      style={{ color: goGreen ? undefined : "var(--text-secondary)" }}
                    />
                    <div>
                      <Label
                        htmlFor="go-green"
                        className="text-sm font-medium cursor-pointer"
                        style={{ color: "var(--text)" }}
                      >
                        Go Green
                      </Label>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        Skip the plastic cutlery
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="go-green"
                    checked={goGreen}
                    onCheckedChange={setGoGreen}
                  />
                </div>

                {/* Price Summary */}
                <div className="px-6 py-3 space-y-1.5 text-sm">
                  <div className="flex justify-between" style={{ color: "var(--text-secondary)" }}>
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between" style={{ color: "var(--text-secondary)" }}>
                    <span>Tax (8%)</span>
                    <span>${tax.toFixed(2)}</span>
                  </div>
                  <div
                    className="flex justify-between text-lg font-bold pt-3 mt-2"
                    style={{
                      color: "var(--text)",
                      borderTop: "2px solid var(--border)",
                    }}
                  >
                    <span>Total</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Checkout Button */}
                <div className="px-6 pb-6 pt-2">
                  <button
                    className="w-full py-4 font-bold text-base transition-all"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "#FFFFFF",
                      borderRadius: "var(--radius)",
                      border: "none",
                      boxShadow: "0 4px 16px color-mix(in srgb, var(--primary) 40%, transparent)",
                      fontFamily: "var(--font)",
                    }}
                    disabled={items.length === 0}
                    onClick={handleCheckout}
                  >
                    Checkout Â· ${total.toFixed(2)}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
