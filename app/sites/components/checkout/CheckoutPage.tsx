"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "../../hooks/useCart";
import { useSession } from "../../hooks/useSession";
import { useSessionInit } from "../../hooks/useSessionInit";
import { useCartSync } from "../../hooks/useCartSync";
import { useStorefrontPath } from "../../lib/use-storefront-path";
import { AuthDialog } from "../AuthDialog";
import { CheckoutHeader } from "./CheckoutHeader";
import { ContactSection } from "./ContactSection";
import { OrderTypeSection } from "./OrderTypeSection";
import { OrderDetailsSection } from "./OrderDetailsSection";
import { TipSection } from "./TipSection";
import { PromoCodeSection } from "./PromoCodeSection";
import { OrderSummarySection } from "./OrderSummarySection";
import { PlaceOrderButton } from "./PlaceOrderButton";
import { OrderConfirmation } from "./OrderConfirmation";
import { PaymentCardForm, type PaymentCardFormHandle } from "./PaymentCardForm";
import {
  getStoreTaxRate,
  type PlaceOrderItem,
} from "../../order-actions";
import { sendOrderConfirmationEmail } from "../../recovery-actions";
import { getSavedAddresses, type SavedAddress } from "../../customer-actions";
import type { Site, OnlineOrderingConfig } from "@/types/site";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
interface CheckoutPageProps {
  site: Site | null;
  location: {
    id: string;
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string | null;
    email: string | null;
    business_hours: any;
    latitude?: number | null;
    longitude?: number | null;
  };
  config?: Partial<OnlineOrderingConfig> | null;
  storeConfigId: string;
  slug: string;
}

export function CheckoutPage({
  site,
  location,
  config,
  storeConfigId,
  slug,
}: CheckoutPageProps) {
  useSessionInit(storeConfigId);
  useCartSync();

  const { items, clearCart, updateQuantity, removeItem, getSubtotal } = useCart();
  const { isAuthenticated, customer } = useSession();
  const storePath = useStorefrontPath(slug);

  // Hydration guard — cart is in localStorage
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Step
  const [step, setStep] = useState<"checkout" | "confirmation">("checkout");
  const [orderResult, setOrderResult] = useState<{
    displayNumber?: string;
    estimatedTime?: number;
    orderId?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  // Contact
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  // Order type
  const pickupEnabled = config?.pickupEnabled ?? true;
  const deliveryEnabled = config?.deliveryEnabled ?? false;
  const defaultOrderType = pickupEnabled ? "pickup" : "delivery";
  const [orderType, setOrderType] = useState<"pickup" | "delivery">(defaultOrderType);

  // Scheduling
  const [pickupTime, setPickupTime] = useState<"asap" | "scheduled">("asap");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
  const [scheduledTime, setScheduledTime] = useState("");

  // Curbside
  const [curbside, setCurbside] = useState(false);

  // Delivery
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");
  const [newAddress, setNewAddress] = useState({
    street: "",
    city: "",
    state: "",
    zip: "",
    notes: "",
  });

  // Tip
  const tipPresets = (config?.tipConfig?.presetPercentages as number[]) ?? [15, 18, 20, 25];
  const [selectedTipIndex, setSelectedTipIndex] = useState<number | null>(1);
  const [customTip, setCustomTip] = useState("");
  const tipPercent = selectedTipIndex !== null && selectedTipIndex >= 0 ? tipPresets[selectedTipIndex] : 0;

  // Special instructions
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Tax rate (fetched from server)
  const [taxRate, setTaxRate] = useState(0.08);

  // Payment
  const paymentFormRef = useRef<PaymentCardFormHandle>(null);
  const [securityKey, setSecurityKey] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Calculated values
  const subtotal = getSubtotal();
  const tipAmount =
    selectedTipIndex === -1
      ? 0
      : selectedTipIndex !== null
        ? Math.round(subtotal * (tipPercent / 100) * 100) / 100
        : Number(customTip) || 0;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const deliveryFee =
    orderType === "delivery"
      ? (config?.baseDeliveryFee ?? 0) > 0 &&
        config?.freeDeliveryThreshold &&
        subtotal >= config.freeDeliveryThreshold
        ? 0
        : config?.baseDeliveryFee ?? 0
      : 0;
  const total = subtotal + tax + tipAmount + deliveryFee;

  // Pre-fill contact from session
  useEffect(() => {
    if (customer?.name) {
      const parts = customer.name.split(" ");
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" ") || "");
    }
    if (customer?.email) setEmail(customer.email);
  }, [customer]);

  // Fetch tax rate on mount
  useEffect(() => {
    if (storeConfigId) {
      getStoreTaxRate(storeConfigId).then((rate) => {
        if (rate > 0) setTaxRate(rate);
      });
    }
  }, [storeConfigId]);

  // COMMENTED OUT FOR TESTING — payment bypass mode
  // useEffect(() => {
  //   if (!storeConfigId) return;
  //
  //   setPaymentError(null);
  //   fetch(`${SUPABASE_URL}/functions/v1/process-online-payment`, {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       Authorization: `Bearer ${ANON_KEY}`,
  //     },
  //     body: JSON.stringify({
  //       store_config_id: storeConfigId,
  //     }),
  //   })
  //     .then((res) => res.json())
  //     .then((data) => {
  //       if (data.success) {
  //         setSecurityKey(process.env.NEXT_PUBLIC_DEJAVOO_SECURITY_KEY_TOKEN!);
  //       } else if (!data.success) {
  //         // Don't show error if payment simply isn't configured — just hide the form
  //         if (data.error?.includes("not configured")) {
  //           console.log("iPOS payment not configured for this store");
  //         } else {
  //           setPaymentError(data.error || "Failed to initialize payment.");
  //         }
  //       }
  //     })
  //     .catch(() => {
  //       setPaymentError("Failed to connect to payment service.");
  //     });
  // }, [storeConfigId]);

  // Load saved addresses when authenticated + delivery
  useEffect(() => {
    if (isAuthenticated && orderType === "delivery") {
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
  }, [isAuthenticated, orderType]);

  // Store address string
  const storeAddress = [
    location.address_line1,
    location.city,
    location.state,
    location.postal_code,
  ]
    .filter(Boolean)
    .join(", ");

  // Determine lat/lng from site.address or location
  const storeLat = site?.address?.lat ?? location.latitude;
  const storeLng = site?.address?.lng ?? location.longitude;

  const handleCheckout = () => {
    handlePlaceOrder();
  };

  const handlePlaceOrder = async () => {
    const { sessionToken } = useSession.getState();

    setLoading(true);
    setPaymentError(null);

    // Step 1: Tokenize card via FTD (skip if no securityKey — test mode)
    let paymentTokenId: string | undefined;
    if (securityKey) {
      try {
        if (!paymentFormRef.current) {
          throw new Error("Payment form not ready. Please wait a moment.");
        }
        paymentTokenId = await paymentFormRef.current.tokenize();
      } catch (err: any) {
        setLoading(false);
        setPaymentError(err.message || "Card tokenization failed.");
        return;
      }
    }

    // Build delivery address
    let deliveryAddress: {
      street: string;
      unit?: string;
      city: string;
      state: string;
      zip: string;
      delivery_notes?: string;
    } | null = null;
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

    // Build special instructions with curbside
    let instructions = specialInstructions;
    if (curbside && orderType === "pickup") {
      instructions = instructions
        ? `CURBSIDE PICKUP: Bring order to my car. ${instructions}`
        : "CURBSIDE PICKUP: Bring order to my car";
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

    // Step 2: Call create-online-order edge function with payment_token_id
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/create-online-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({
            // Session token if logged in, store_config_id for guests
            ...(sessionToken
              ? { session_token: sessionToken }
              : { store_config_id: storeConfigId }),
            items: orderItems,
            order_type: orderType,
            delivery_address: deliveryAddress,
            requested_time: requestedTime,
            tip: tipAmount,
            special_instructions: instructions || undefined,
            ...(paymentTokenId ? { payment_token_id: paymentTokenId } : {}),
            // Contact info (always sent — edge function uses session data if available)
            customer_name: `${firstName} ${lastName}`.trim() || undefined,
            customer_phone: customer?.phone || undefined,
            customer_email: email || undefined,
          }),
        }
      );

      const result = await res.json();
      setLoading(false);

      if (result.success && !result.requires_redirect) {
        setOrderResult({
          displayNumber: result.display_number,
          estimatedTime: result.estimated_time,
          orderId: result.order_id,
        });
        setStep("confirmation");
        clearCart();

        // Fire-and-forget order confirmation email
        if (result.order_id && email) {
          sendOrderConfirmationEmail(result.order_id, email).catch(() => {});
        }
      } else if (result.success && result.requires_redirect && result.payment_url) {
        // HPP fallback (shouldn't happen with FTD, but handle gracefully)
        window.location.href = result.payment_url;
      } else {
        setPaymentError(result.error || "Failed to process payment.");
      }
    } catch {
      setLoading(false);
      setPaymentError("Network error. Please try again.");
    }
  };

  // Loading skeleton while hydrating
  if (!hydrated) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
        <CheckoutHeader slug={slug} storeName={site?.title || location.name} logoUrl={site?.logo_url} />
        <div className="max-w-2xl mx-auto p-4 space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-lg animate-pulse"
              style={{ backgroundColor: "var(--card)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Confirmation screen
  if (step === "confirmation" && orderResult) {
    return (
      <>
        <CheckoutHeader slug={slug} storeName={site?.title || location.name} logoUrl={site?.logo_url} />
        <OrderConfirmation
          displayNumber={orderResult.displayNumber}
          estimatedTime={orderResult.estimatedTime}
          orderId={orderResult.orderId}
          slug={slug}
        />
      </>
    );
  }

  // Empty cart guard
  if (items.length === 0) {
    return (
      <>
        <CheckoutHeader slug={slug} storeName={site?.title || location.name} logoUrl={site?.logo_url} />
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 space-y-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--card)" }}
          >
            <ShoppingBag className="h-8 w-8" style={{ color: "var(--text-secondary)" }} />
          </div>
          <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
            Your cart is empty
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Add some items before checking out
          </p>
          <Link
            href={storePath()}
            className="px-6 py-3 font-bold text-sm"
            style={{
              backgroundColor: "var(--primary)",
              color: "#FFFFFF",
              borderRadius: "var(--radius)",
            }}
          >
            Browse Menu
          </Link>
        </div>
      </>
    );
  }

  const canPlaceOrder = firstName.trim().length > 0 && items.length > 0;
  return (
    <>
      <CheckoutHeader slug={slug} storeName={site?.title || location.name} logoUrl={site?.logo_url} />

      <main className="max-w-2xl mx-auto p-4 pb-32 space-y-6">
        {/* Contact */}
        <ContactSection
          isAuthenticated={isAuthenticated}
          customerPhone={customer?.phone}
          firstName={firstName}
          lastName={lastName}
          email={email}
          onFirstNameChange={setFirstName}
          onLastNameChange={setLastName}
          onEmailChange={setEmail}
          onSignInClick={() => setShowAuth(true)}
        />

        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* Order Type + Scheduling */}
        <OrderTypeSection
          orderType={orderType}
          onOrderTypeChange={setOrderType}
          pickupEnabled={pickupEnabled}
          deliveryEnabled={deliveryEnabled}
          pickupTime={pickupTime}
          onPickupTimeChange={setPickupTime}
          scheduledDate={scheduledDate}
          onScheduledDateChange={setScheduledDate}
          scheduledTime={scheduledTime}
          onScheduledTimeChange={setScheduledTime}
          maxFutureDays={config?.futureOrderMaxDays ?? 30}
          prepTime={config?.preparationLeadTime ?? 20}
          curbside={curbside}
          onCurbsideChange={setCurbside}
          storeAddress={storeAddress}
          storeLat={storeLat}
          storeLng={storeLng}
          savedAddresses={savedAddresses}
          selectedAddressId={selectedAddressId}
          onSelectedAddressChange={setSelectedAddressId}
          newAddress={newAddress}
          onNewAddressChange={setNewAddress}
        />

        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* Order Details */}
        <OrderDetailsSection
          items={items}
          slug={slug}
          onUpdateQuantity={updateQuantity}
          onRemoveItem={removeItem}
        />

        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* Tip */}
        {config?.tippingEnabled !== false && (
          <>
            <TipSection
              subtotal={subtotal}
              tipPresets={tipPresets}
              selectedTipIndex={selectedTipIndex}
              customTip={customTip}
              onSelectPreset={(i) => {
                setSelectedTipIndex(i);
                setCustomTip("");
              }}
              onSelectCustom={() => setSelectedTipIndex(null)}
              onSelectNoTip={() => {
                setSelectedTipIndex(-1);
                setCustomTip("");
              }}
              onCustomTipChange={setCustomTip}
            />
            <div style={{ borderTop: "1px solid var(--border)" }} />
          </>
        )}

        {/* Promo Code */}
        <PromoCodeSection />

        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* Order Summary */}
        <OrderSummarySection
          subtotal={subtotal}
          tax={tax}
          deliveryFee={deliveryFee}
          tipAmount={tipAmount}
          total={total}
          itemCount={items.length}
          showDeliveryFee={orderType === "delivery"}
        />

        {/* Payment */}
        {securityKey && (
          <>
            <div style={{ borderTop: "1px solid var(--border)" }} />
            <PaymentCardForm
              ref={paymentFormRef}
              securityKey={securityKey}
              onError={setPaymentError}
              disabled={loading}
            />
          </>
        )}

        {paymentError && (
          <div
            className="p-3 rounded-lg text-sm"
            style={{
              backgroundColor: "color-mix(in srgb, #ef4444 10%, var(--bg))",
              color: "#ef4444",
              borderRadius: "var(--radius)",
            }}
          >
            {paymentError}
          </div>
        )}

        {/* Special Instructions */}
        <div className="space-y-2">
          <label
            htmlFor="special-instructions"
            className="text-sm font-semibold"
            style={{ color: "var(--text)" }}
          >
            Special Instructions
          </label>
          <textarea
            id="special-instructions"
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            placeholder="Any notes for the restaurant..."
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-lg resize-none"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              borderRadius: "var(--radius)",
            }}
          />
        </div>
      </main>

      {/* Place Order Button */}
      <PlaceOrderButton
        total={total}
        loading={loading}
        disabled={!canPlaceOrder}
        onClick={handleCheckout}
        isTestMode={!securityKey}
      />

      {/* Auth Dialog */}
      <AuthDialog
        isOpen={showAuth}
        onOpenChange={setShowAuth}
        storeConfigId={storeConfigId}
        onSuccess={() => setShowAuth(false)}
      />
    </>
  );
}
