"use client";

import { useState } from "react";
import { CheckoutDialog } from "./CheckoutDialog";

import { useCart } from "../hooks/useCart";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Minus, Plus, X, Leaf, ShoppingBag } from "lucide-react";

import { OnlineOrderingConfig } from "@/types/site";

interface CartSidebarProps {
  config?: Partial<OnlineOrderingConfig>;
}

export function CartSidebar({ config }: CartSidebarProps) {
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

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const subtotal = getSubtotal();
  const taxRate = 0.08; // Fixed 8% tax for now
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        {/* Header */}
        <SheetHeader className="p-4 border-b bg-white shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-bold">Your Order</SheetTitle>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </SheetHeader>

        {/* Cart Items */}
        <ScrollArea className="flex-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-center px-6">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <ShoppingBag className="h-8 w-8 text-gray-400" />
              </div>
              <p className="font-medium text-gray-900 mb-1">
                Your cart is empty
              </p>
              <p className="text-sm text-gray-500">Add items to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((item) => (
                <div
                  key={item.cartItemId}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex gap-3">
                    {/* Item Image */}
                    {item.image && (
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Item Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h4 className="font-medium text-gray-900 line-clamp-1">
                            {item.name}
                          </h4>
                          {item.selectedModifiers &&
                            item.selectedModifiers.length > 0 && (
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                {item.selectedModifiers
                                  .map((m) => m.name)
                                  .join(", ")}
                              </p>
                            )}
                          {item.notes && (
                            <p className="text-xs text-gray-400 italic mt-0.5 line-clamp-1">
                              "{item.notes}"
                            </p>
                          )}
                        </div>
                        <span className="font-semibold text-gray-900 shrink-0">
                          ${(item.totalPrice * item.quantity).toFixed(2)}
                        </span>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => removeItem(item.cartItemId)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            aria-label="Remove item"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex items-center border border-gray-200 rounded-full h-8">
                          <button
                            className="w-8 h-full flex items-center justify-center hover:bg-gray-100 rounded-l-full transition-colors"
                            onClick={() =>
                              updateQuantity(item.cartItemId, item.quantity - 1)
                            }
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center text-sm font-medium">
                            {item.quantity}
                          </span>
                          <button
                            className="w-8 h-full flex items-center justify-center hover:bg-gray-100 rounded-r-full transition-colors"
                            onClick={() =>
                              updateQuantity(item.cartItemId, item.quantity + 1)
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

        {/* Footer - Sticky */}
        <div className="border-t bg-white shrink-0">
          {/* Go Green Option */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Leaf
                className={cn(
                  "h-4 w-4",
                  goGreen ? "text-green-600" : "text-gray-400"
                )}
              />
              <div>
                <Label
                  htmlFor="go-green"
                  className="text-sm font-medium cursor-pointer"
                >
                  Go Green
                </Label>
                <p className="text-xs text-gray-500">
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
          <div className="px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Tax (8%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
          </div>

          {/* Checkout Button */}
          <div className="p-4 pt-0">
            <Button
              className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white font-semibold text-base rounded-lg shadow-sm"
              disabled={items.length === 0}
              onClick={() => setIsCheckoutOpen(true)}
            >
              <span>Checkout</span>
              <span className="ml-auto">${total.toFixed(2)}</span>
            </Button>
          </div>
        </div>
      </SheetContent>

      <CheckoutDialog
        isOpen={isCheckoutOpen}
        onOpenChange={setIsCheckoutOpen}
        subtotal={subtotal}
        tax={tax}
        total={total}
        config={config}
      />
    </Sheet>
  );
}
