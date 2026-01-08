"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCart } from "../hooks/useCart";
import { cn } from "@/lib/utils";

import { OnlineOrderingConfig } from "@/types/site";

interface CheckoutDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  subtotal: number;
  tax: number;
  total: number;
  config?: Partial<OnlineOrderingConfig>;
}

export function CheckoutDialog({
  isOpen,
  onOpenChange,
  subtotal,
  tax,
  total,
  config,
}: CheckoutDialogProps) {
  const { items, goGreen, clearCart, setOpen: setCartOpen } = useCart();
  const [step, setStep] = useState<"details" | "payment">("details");
  const [loading, setLoading] = useState(false);

  // Defaults if config is missing (fallback to existing behavior)
  const pickupEnabled = config?.pickupEnabled ?? true;
  const deliveryEnabled = config?.deliveryEnabled ?? false;

  // Default to first available option
  const defaultOrderType = pickupEnabled
    ? "pickup"
    : deliveryEnabled
    ? "delivery"
    : "pickup";
  const [orderType, setOrderType] = useState<"pickup" | "delivery">(
    defaultOrderType
  );

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pickupTime, setPickupTime] = useState<"asap" | "scheduled">("asap");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(
    new Date()
  );
  const [scheduledTime, setScheduledTime] = useState("");

  const handlePlaceOrder = async () => {
    setLoading(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Success logic
    setLoading(false);
    onOpenChange(false);
    setCartOpen(false);
    clearCart();
    // You might want to trigger a success toast or redirect here
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Checkout</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Contact Details */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Contact Information</h3>
            <div className="grid gap-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4"></div>

          {/* Order Preferences */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Order Preferences</h3>

            <Tabs
              value={orderType}
              onValueChange={(v) => setOrderType(v as any)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pickup" disabled={!pickupEnabled}>
                  Pickup
                </TabsTrigger>
                <TabsTrigger value="delivery" disabled={!deliveryEnabled}>
                  Delivery {!deliveryEnabled && "(Unavailable)"}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-3">
              <Label>
                {orderType === "pickup" ? "Pickup Time" : "Delivery Time"}
              </Label>
              <div className="flex gap-4">
                <Button
                  variant={pickupTime === "asap" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setPickupTime("asap")}
                  disabled={config?.acceptFutureOrdersOnly}
                >
                  ASAP {config?.acceptFutureOrdersOnly && "(Disabled)"}
                </Button>
                <Button
                  variant={pickupTime === "scheduled" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setPickupTime("scheduled")}
                >
                  Schedule
                </Button>
              </div>

              {pickupTime === "scheduled" && (
                <div className="grid grid-cols-2 gap-4 pt-2 animate-in fade-in slide-in-from-top-2">
                  <div className="grid gap-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !scheduledDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {scheduledDate ? (
                            format(scheduledDate, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={scheduledDate}
                          onSelect={setScheduledDate}
                          initialFocus
                          disabled={(date) => {
                            if (
                              !config?.futureOrderMinDays &&
                              !config?.futureOrderMaxDays
                            )
                              return date < new Date();

                            const minDate = new Date();
                            minDate.setDate(
                              minDate.getDate() +
                                (config?.futureOrderMinDays || 0)
                            );

                            const maxDate = new Date();
                            maxDate.setDate(
                              maxDate.getDate() +
                                (config?.futureOrderMaxDays || 30)
                            );

                            return (
                              date < new Date() ||
                              date < minDate ||
                              date > maxDate
                            );
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid gap-2">
                    <Label>Time</Label>
                    <Select
                      value={scheduledTime}
                      onValueChange={setScheduledTime}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select time" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Mock times for demo */}
                        <SelectItem value="10:00">10:00 AM</SelectItem>
                        <SelectItem value="10:30">10:30 AM</SelectItem>
                        <SelectItem value="11:00">11:00 AM</SelectItem>
                        <SelectItem value="11:30">11:30 AM</SelectItem>
                        <SelectItem value="12:00">12:00 PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-4"></div>

          {/* Payment (Mock) */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Payment</h3>
            <div className="bg-muted p-4 rounded-lg flex items-center justify-center text-muted-foreground text-sm">
              {!config?.acceptOnlinePayments && !config?.acceptCashOnDelivery
                ? "No payment methods configured."
                : "Payment integration coming soon. You won't be charged yet."}
            </div>
          </div>

          {/* Total Summary */}
          <div className="bg-primary/5 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Tax</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t border-primary/10 pt-2 mt-2">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePlaceOrder}
            disabled={loading || !name || !email || !phone}
            className="w-full sm:w-auto"
          >
            {loading
              ? "Placing Order..."
              : `Place Order - $${total.toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
