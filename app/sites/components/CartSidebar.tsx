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
  SheetFooter,
} from "@/components/ui/sheet";
import { Minus, Plus, ShoppingBag, Trash2, Leaf } from "lucide-react";

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
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Your Order
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50 mt-12">
              <ShoppingBag className="h-12 w-12" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            <div className="space-y-6">
              {items.map((item) => (
                <div key={item.cartItemId} className="flex gap-4">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-16 w-16 rounded-md object-cover bg-gray-100"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-medium line-clamp-2">{item.name}</h4>
                      {item.selectedModifiers &&
                        item.selectedModifiers.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {item.selectedModifiers
                              .map((m) => m.name)
                              .join(", ")}
                          </p>
                        )}
                      {item.notes && (
                        <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-1">
                          "{item.notes}"
                        </p>
                      )}
                      <div className="flex justify-between items-center mt-1">
                        <span className="font-semibold text-sm">
                          ${(item.totalPrice * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border rounded-md h-8">
                        <button
                          className="px-2 h-full hover:bg-muted transition-colors"
                          onClick={() =>
                            updateQuantity(item.cartItemId, item.quantity - 1)
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="px-2 text-sm font-medium w-8 text-center">
                          {item.quantity}
                        </span>
                        <button
                          className="px-2 h-full hover:bg-muted transition-colors"
                          onClick={() =>
                            updateQuantity(item.cartItemId, item.quantity + 1)
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(item.cartItemId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-6 border-t bg-muted/30 space-y-4">
          {/* Go Green Option */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Leaf
                className={cn(
                  "h-4 w-4",
                  goGreen ? "text-green-600" : "text-gray-400"
                )}
              />
              <div>
                <Label htmlFor="go-green" className="font-medium">
                  Go Green
                </Label>
                <p className="text-xs text-muted-foreground">
                  Opt out of plastic cutlery
                </p>
              </div>
            </div>
            <Switch
              id="go-green"
              checked={goGreen}
              onCheckedChange={setGoGreen}
            />
          </div>

          <Separator />

          {/* Price Breakdown */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax (8%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-lg font-bold pt-2">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          <Button
            className="w-full bg-[var(--primary)] text-white hover:opacity-90 h-12 text-lg font-bold shadow-lg shadow-blue-500/20"
            disabled={items.length === 0}
            onClick={() => setIsCheckoutOpen(true)}
          >
            Checkout
          </Button>
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
