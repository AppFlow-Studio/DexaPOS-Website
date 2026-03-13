"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon, Check, Loader2, MapPin, Plus } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCart } from "../hooks/useCart";
import { useSession } from "../hooks/useSession";
import { cn } from "@/lib/utils";
import { OnlineOrderingConfig } from "@/types/site";
import { AuthDialog } from "./AuthDialog";
import {
  placeOrder,
  type PlaceOrderItem,
  type PlaceOrderDetails,
} from "../order-actions";
import { getSavedAddresses, type SavedAddress } from "../customer-actions";

interface CheckoutDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  subtotal: number;
  tax: number;
  total: number;
  config?: Partial<OnlineOrderingConfig>;
  storeConfigId: string;
}

export function CheckoutDialog({
  isOpen,
  onOpenChange,
  subtotal,
  tax,
  total,
  config,
  storeConfigId,
}: CheckoutDialogProps) {
  const { items, clearCart, setOpen: setCartOpen } = useCart();
  const { isAuthenticated, customer } = useSession();

  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [step, setStep] = useState<"details" | "confirm">("details");
  const [orderResult, setOrderResult] = useState<{
    displayNumber?: string;
    estimatedTime?: number;
  } | null>(null);

  // Order form state
  const pickupEnabled = config?.pickupEnabled ?? true;
  const deliveryEnabled = config?.deliveryEnabled ?? false;
  const defaultOrderType = pickupEnabled ? "pickup" : "delivery";
  const [orderType, setOrderType] = useState<"pickup" | "delivery">(defaultOrderType);
  const [pickupTime, setPickupTime] = useState<"asap" | "scheduled">("asap");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
  const [scheduledTime, setScheduledTime] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Tipping
  const tipPresets = (config?.tipConfig?.presetPercentages as number[]) ?? [15, 18, 20, 25];
  const [selectedTipIndex, setSelectedTipIndex] = useState<number | null>(1);
  const [customTip, setCustomTip] = useState("");
  const tipPercent = selectedTipIndex !== null ? tipPresets[selectedTipIndex] : 0;
  const tipAmount = selectedTipIndex !== null
    ? Math.round(subtotal * (tipPercent / 100) * 100) / 100
    : Number(customTip) || 0;
  const grandTotal = total + tipAmount;

  // Delivery address
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");
  const [newAddress, setNewAddress] = useState({
    street: "",
    city: "",
    state: "",
    zip: "",
    notes: "",
  });

  // Contact info (pre-filled from customer)
  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");

  useEffect(() => {
    if (customer?.name) setName(customer.name);
    if (customer?.email) setEmail(customer.email);
  }, [customer]);

  // Load saved addresses when authenticated and delivery is selected
  useEffect(() => {
    if (isAuthenticated && orderType === "delivery" && isOpen) {
      const { sessionToken } = useSession.getState();
      if (sessionToken) {
        getSavedAddresses(sessionToken).then(({ data }) => {
          setSavedAddresses(data);
          if (data.length > 0) {
            const defaultAddr = data.find((a) => a.isDefault);
            setSelectedAddressId(defaultAddr?.id ?? data[0].id);
          }
        });
      }
    }
  }, [isAuthenticated, orderType, isOpen]);

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep("details");
      setOrderResult(null);
    }
  }, [isOpen]);

  const handleCheckout = () => {
    if (!isAuthenticated) {
      setShowAuth(true);
      return;
    }
    handlePlaceOrder();
  };

  const handlePlaceOrder = async () => {
    const { sessionToken } = useSession.getState();
    if (!sessionToken) {
      setShowAuth(true);
      return;
    }

    setLoading(true);

    // Build delivery address
    let deliveryAddress: PlaceOrderDetails["deliveryAddress"] = null;
    if (orderType === "delivery") {
      if (selectedAddressId !== "new") {
        const addr = savedAddresses.find((a) => a.id === selectedAddressId);
        if (addr) {
          deliveryAddress = {
            street: addr.addressLine1 + (addr.addressLine2 ? ` ${addr.addressLine2}` : ""),
            city: addr.city,
            state: addr.state,
            zip: addr.postalCode,
            delivery_notes: addr.deliveryNotes ?? undefined,
          };
        }
      } else {
        deliveryAddress = {
          street: newAddress.street,
          city: newAddress.city,
          state: newAddress.state,
          zip: newAddress.zip,
          delivery_notes: newAddress.notes || undefined,
        };
      }
    }

    // Build requested time
    let requestedTime: string | null = null;
    if (pickupTime === "scheduled" && scheduledDate && scheduledTime) {
      const [hours, minutes] = scheduledTime.split(":").map(Number);
      const dt = new Date(scheduledDate);
      dt.setHours(hours, minutes, 0, 0);
      requestedTime = dt.toISOString();
    }

    const orderItems: PlaceOrderItem[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      notes: item.notes,
      modifiers: item.selectedModifiers?.map((m) => ({
        id: m.id,
        name: m.name,
        price: m.price,
        quantity: 1,
        groupName: null,
      })),
    }));

    const details: PlaceOrderDetails = {
      orderType,
      deliveryAddress,
      requestedTime,
      tip: tipAmount,
      specialInstructions: specialInstructions || undefined,
    };

    const result = await placeOrder(sessionToken, orderItems, details);
    setLoading(false);

    if (result.success) {
      setOrderResult({
        displayNumber: result.displayNumber,
        estimatedTime: result.estimatedTime,
      });
      setStep("confirm");
      clearCart();
    } else {
      alert(result.error ?? "Failed to place order");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    if (step === "confirm") {
      setCartOpen(false);
    }
  };

  // Confirmation screen
  if (step === "confirm" && orderResult) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent
          className="sm:max-w-[450px]"
          style={{
            backgroundColor: "var(--bg, #fff)",
            color: "var(--text, #111)",
            borderColor: "var(--border, #e5e7eb)",
          }}
        >
          <div className="flex flex-col items-center text-center py-8 space-y-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--primary, #2DD4BF)" }}
            >
              <Check className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
              Order Placed!
            </h2>
            <p style={{ color: "var(--text-secondary, #6b7280)" }}>
              Your order {orderResult.displayNumber} has been received
            </p>
            {orderResult.estimatedTime && (
              <div
                className="px-4 py-2 rounded-lg"
                style={{ backgroundColor: "var(--card, #f9fafb)" }}
              >
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Estimated ready in
                </p>
                <p className="text-xl font-bold">
                  {orderResult.estimatedTime} min
                </p>
              </div>
            )}
            <Button
              onClick={handleClose}
              className="mt-4"
              style={{
                backgroundColor: "var(--primary, #2DD4BF)",
                color: "#fff",
                borderRadius: "var(--radius, 12px)",
              }}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto"
          style={{
            backgroundColor: "var(--bg, #fff)",
            color: "var(--text, #111)",
            borderColor: "var(--border, #e5e7eb)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>
              Checkout
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Auth gate */}
            {!isAuthenticated && (
              <div
                className="p-4 rounded-lg text-center space-y-3"
                style={{
                  backgroundColor: "var(--card, #f9fafb)",
                  border: "1px solid var(--border, #e5e7eb)",
                }}
              >
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Verify your phone number to continue
                </p>
                <Button
                  onClick={() => setShowAuth(true)}
                  style={{
                    backgroundColor: "var(--primary, #2DD4BF)",
                    color: "#fff",
                    borderRadius: "var(--radius, 12px)",
                  }}
                >
                  Sign In
                </Button>
              </div>
            )}

            {isAuthenticated && (
              <>
                {/* Contact Info */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Contact</h3>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {customer?.phone}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="checkout-name" className="text-sm">Name</Label>
                      <Input
                        id="checkout-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        style={{
                          borderColor: "var(--border)",
                          backgroundColor: "var(--bg)",
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="checkout-email" className="text-sm">Email</Label>
                      <Input
                        id="checkout-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        style={{
                          borderColor: "var(--border)",
                          backgroundColor: "var(--bg)",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border)" }} />

                {/* Order Type */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Order Type</h3>
                  <Tabs
                    value={orderType}
                    onValueChange={(v) => setOrderType(v as "pickup" | "delivery")}
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="pickup" disabled={!pickupEnabled}>
                        Pickup
                      </TabsTrigger>
                      <TabsTrigger value="delivery" disabled={!deliveryEnabled}>
                        Delivery
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {/* Delivery address picker */}
                  {orderType === "delivery" && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                      {savedAddresses.length > 0 && (
                        <div className="space-y-2">
                          {savedAddresses.map((addr) => (
                            <button
                              key={addr.id}
                              onClick={() => setSelectedAddressId(addr.id)}
                              className={cn(
                                "w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-2"
                              )}
                              style={{
                                borderColor:
                                  selectedAddressId === addr.id
                                    ? "var(--primary)"
                                    : "var(--border)",
                                backgroundColor:
                                  selectedAddressId === addr.id
                                    ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                                    : "var(--bg)",
                              }}
                            >
                              <MapPin className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--primary)" }} />
                              <div>
                                <p className="text-sm font-medium">{addr.label}</p>
                                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                  {addr.addressLine1}, {addr.city}, {addr.state} {addr.postalCode}
                                </p>
                              </div>
                            </button>
                          ))}
                          <button
                            onClick={() => setSelectedAddressId("new")}
                            className="w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-2 text-sm"
                            style={{
                              borderColor:
                                selectedAddressId === "new"
                                  ? "var(--primary)"
                                  : "var(--border)",
                              borderStyle: selectedAddressId === "new" ? "solid" : "dashed",
                              color: "var(--text-secondary)",
                            }}
                          >
                            <Plus className="h-4 w-4" />
                            New address
                          </button>
                        </div>
                      )}

                      {(selectedAddressId === "new" || savedAddresses.length === 0) && (
                        <div className="space-y-2">
                          <Input
                            value={newAddress.street}
                            onChange={(e) => setNewAddress((a) => ({ ...a, street: e.target.value }))}
                            placeholder="Street address"
                            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <Input
                              value={newAddress.city}
                              onChange={(e) => setNewAddress((a) => ({ ...a, city: e.target.value }))}
                              placeholder="City"
                              style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                            />
                            <Input
                              value={newAddress.state}
                              onChange={(e) => setNewAddress((a) => ({ ...a, state: e.target.value }))}
                              placeholder="State"
                              style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                            />
                            <Input
                              value={newAddress.zip}
                              onChange={(e) => setNewAddress((a) => ({ ...a, zip: e.target.value }))}
                              placeholder="ZIP"
                              style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                            />
                          </div>
                          <Input
                            value={newAddress.notes}
                            onChange={(e) => setNewAddress((a) => ({ ...a, notes: e.target.value }))}
                            placeholder="Delivery notes (apt #, gate code...)"
                            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: "1px solid var(--border)" }} />

                {/* Scheduling */}
                <div className="space-y-3">
                  <h3 className="font-semibold">
                    {orderType === "pickup" ? "Pickup Time" : "Delivery Time"}
                  </h3>
                  <div className="flex gap-3">
                    <Button
                      variant={pickupTime === "asap" ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setPickupTime("asap")}
                      style={
                        pickupTime === "asap"
                          ? { backgroundColor: "var(--primary)", color: "#fff", borderRadius: "var(--radius)" }
                          : { borderColor: "var(--border)", borderRadius: "var(--radius)" }
                      }
                    >
                      ASAP
                    </Button>
                    <Button
                      variant={pickupTime === "scheduled" ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setPickupTime("scheduled")}
                      style={
                        pickupTime === "scheduled"
                          ? { backgroundColor: "var(--primary)", color: "#fff", borderRadius: "var(--radius)" }
                          : { borderColor: "var(--border)", borderRadius: "var(--radius)" }
                      }
                    >
                      Schedule
                    </Button>
                  </div>

                  {pickupTime === "scheduled" && (
                    <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn("w-full justify-start text-left font-normal")}
                              style={{ borderColor: "var(--border)" }}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={scheduledDate}
                              onSelect={setScheduledDate}
                              initialFocus
                              disabled={(date) => {
                                const maxDays = config?.futureOrderMaxDays ?? 30;
                                const maxDate = new Date();
                                maxDate.setDate(maxDate.getDate() + maxDays);
                                return date < new Date() || date > maxDate;
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Time</Label>
                        <Select value={scheduledTime} onValueChange={setScheduledTime}>
                          <SelectTrigger style={{ borderColor: "var(--border)" }}>
                            <SelectValue placeholder="Select time" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 28 }, (_, i) => {
                              const hour = Math.floor(i / 2) + 8;
                              const min = i % 2 === 0 ? "00" : "30";
                              if (hour > 21) return null;
                              const ampm = hour >= 12 ? "PM" : "AM";
                              const displayHour = hour > 12 ? hour - 12 : hour;
                              return (
                                <SelectItem key={i} value={`${hour}:${min}`}>
                                  {displayHour}:{min} {ampm}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tipping */}
                {config?.tippingEnabled !== false && (
                  <>
                    <div style={{ borderTop: "1px solid var(--border)" }} />
                    <div className="space-y-3">
                      <h3 className="font-semibold">Add a Tip</h3>
                      <div className="flex gap-2">
                        {tipPresets.map((pct, i) => (
                          <button
                            key={pct}
                            onClick={() => {
                              setSelectedTipIndex(i);
                              setCustomTip("");
                            }}
                            className="flex-1 py-2 text-sm font-medium rounded-lg border transition-colors"
                            style={{
                              backgroundColor:
                                selectedTipIndex === i
                                  ? "var(--primary)"
                                  : "transparent",
                              color: selectedTipIndex === i ? "#fff" : "var(--text)",
                              borderColor:
                                selectedTipIndex === i
                                  ? "var(--primary)"
                                  : "var(--border)",
                              borderRadius: "var(--radius)",
                            }}
                          >
                            {pct}%
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setSelectedTipIndex(null);
                          }}
                          className="flex-1 py-2 text-sm font-medium rounded-lg border transition-colors"
                          style={{
                            backgroundColor:
                              selectedTipIndex === null ? "var(--primary)" : "transparent",
                            color: selectedTipIndex === null ? "#fff" : "var(--text)",
                            borderColor:
                              selectedTipIndex === null ? "var(--primary)" : "var(--border)",
                            borderRadius: "var(--radius)",
                          }}
                        >
                          Custom
                        </button>
                      </div>
                      {selectedTipIndex === null && (
                        <Input
                          type="number"
                          placeholder="Enter tip amount"
                          value={customTip}
                          onChange={(e) => setCustomTip(e.target.value)}
                          className="animate-in fade-in slide-in-from-top-2"
                          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                        />
                      )}
                    </div>
                  </>
                )}

                {/* Special instructions */}
                <div style={{ borderTop: "1px solid var(--border)" }} />
                <div className="space-y-2">
                  <Label htmlFor="special-instructions" className="text-sm font-semibold">
                    Special Instructions
                  </Label>
                  <Input
                    id="special-instructions"
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    placeholder="Any notes for the restaurant..."
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                  />
                </div>

                {/* Order Summary */}
                <div style={{ borderTop: "1px solid var(--border)" }} />
                <div
                  className="rounded-lg p-4 space-y-2"
                  style={{ backgroundColor: "var(--card, #f9fafb)" }}
                >
                  <div className="flex justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
                    <span>Subtotal ({items.length} items)</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
                    <span>Tax</span>
                    <span>${tax.toFixed(2)}</span>
                  </div>
                  {tipAmount > 0 && (
                    <div className="flex justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
                      <span>Tip</span>
                      <span>${tipAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div
                    className="flex justify-between font-bold text-lg pt-2 mt-2"
                    style={{
                      color: "var(--text)",
                      borderTop: "2px solid var(--border)",
                    }}
                  >
                    <span>Total</span>
                    <span>${grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Place Order */}
                <Button
                  onClick={handleCheckout}
                  disabled={loading || !name || items.length === 0}
                  className="w-full py-6 text-base font-bold"
                  style={{
                    backgroundColor: "var(--primary, #2DD4BF)",
                    color: "#fff",
                    borderRadius: "var(--radius, 12px)",
                    boxShadow: "0 4px 16px color-mix(in srgb, var(--primary) 40%, transparent)",
                  }}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : null}
                  {loading
                    ? "Placing Order..."
                    : `Place Order · $${grandTotal.toFixed(2)}`}
                </Button>

                <p className="text-xs text-center" style={{ color: "var(--text-secondary)" }}>
                  Pay at {orderType === "pickup" ? "pickup" : "delivery"}
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AuthDialog
        isOpen={showAuth}
        onOpenChange={setShowAuth}
        storeConfigId={storeConfigId}
        onSuccess={() => setShowAuth(false)}
      />
    </>
  );
}
