"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { format } from "date-fns";
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
import { OrderSummarySection } from "./OrderSummarySection";
import { PromoCodeSection } from "./PromoCodeSection";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { PlaceOrderButton } from "./PlaceOrderButton";
import { OrderConfirmation } from "./OrderConfirmation";
import { PaymentCardForm, type PaymentCardFormHandle } from "./PaymentCardForm";
import {
  type PlaceOrderItem,
  checkDeliveryZone,
  validatePromoCode,
} from "../../order-actions";
import type { AppliedPromo } from "./PromoCodeSection";
import { isStoreOpenNow } from "../StoreInfoBar";
import { sendOrderConfirmationEmail } from "../../recovery-actions";
import { getSavedAddresses, addSavedAddress, type SavedAddress } from "../../customer-actions";
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
    timezone?: string | null;
  };
  config?: Partial<OnlineOrderingConfig> | null;
  storeConfigId: string;
  slug: string;
  taxRate?: number; // decimal (e.g. 0.08875) — fetched server-side
  pricingDisclosureText?: string | null;
}

function formatCheckoutSummaryLine(
  orderType: "pickup" | "delivery",
  pickupTime: "asap" | "scheduled",
  scheduledDate: Date | undefined,
  scheduledTime: string,
  prepTime: number,
  storeAddress: string
): string {
  if (pickupTime === "scheduled" && scheduledDate && scheduledTime) {
    const parts = scheduledTime.split(":").map(Number);
    const h = parts[0] ?? 0;
    const m = parts[1] ?? 0;
    const dt = new Date(scheduledDate);
    dt.setHours(h, m, 0, 0);
    const label = orderType === "pickup" ? "Pickup" : "Delivery";
    return `${label} · ${format(dt, "EEE, MMM d · h:mm a")}`;
  }
  if (orderType === "pickup") {
    return `Pickup · ASAP (~${prepTime} min) · ${storeAddress}`;
  }
  return `Delivery · ASAP`;
}

export function CheckoutPage({
  site,
  location,
  config,
  storeConfigId,
  slug,
  taxRate = 0,
  pricingDisclosureText,
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
    isPending?: boolean;
    requestedTime?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  // Contact
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailOptIn, setEmailOptIn] = useState(true);
  const [smsOptIn, setSmsOptIn] = useState(true);

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
  const [saveNewAddress, setSaveNewAddress] = useState(false);

  // Promo code
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);

  // Delivery zone eligibility check
  const [zoneCheckState, setZoneCheckState] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [zoneCheckMessage, setZoneCheckMessage] = useState<string | undefined>();
  const zoneDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tip
  const tipPresets = (config?.tipConfig?.presetPercentages as number[]) ?? [15, 18, 20, 25];
  const [selectedTipIndex, setSelectedTipIndex] = useState<number | null>(1);
  const [customTip, setCustomTip] = useState("");
  const tipPercent = selectedTipIndex !== null && selectedTipIndex >= 0 ? tipPresets[selectedTipIndex] : 0;

  // Special instructions
  const [specialInstructions, setSpecialInstructions] = useState("");

  // taxRate is passed as a prop from the server route — no client-side fetch needed

  // Payment
  const paymentFormRef = useRef<PaymentCardFormHandle>(null);
  const [tokenizationKey, setTokenizationKey] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [payCashInStore, setPayCashInStore] = useState(false);

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
  const discountAmount = appliedPromo?.discountAmount ?? 0;
  const total = Math.max(0, subtotal - discountAmount + tax + tipAmount + deliveryFee);

  // Pre-fill contact from session
  useEffect(() => {
    if (customer?.name) {
      const parts = customer.name.split(" ");
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" ") || "");
    }
    if (customer?.email) setEmail(customer.email);
  }, [customer]);

  // Fetch storefront payment bootstrap config for NMI tokenization — enables the card tokenization form
  useEffect(() => {
    if (!storeConfigId) return;

    setPaymentError(null);
    setTokenizationKey(null);
    fetch(`${SUPABASE_URL}/functions/v1/process-online-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        store_config_id: storeConfigId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.provider === "nmi") {
          setTokenizationKey(data.tokenization_key ?? null);
        } else {
          setTokenizationKey(null);
          // Don't show error if payment simply isn't configured — just hide the form
          if (data.error?.includes("not configured")) {
            console.log("NMI payment not configured for this store");
          } else {
            setPaymentError(data.error || "Failed to initialize payment.");
          }
        }
      })
      .catch(() => {
        setTokenizationKey(null);
        setPaymentError("Failed to connect to payment service.");
      });
  }, [storeConfigId]);

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

  // Debounced delivery zone check — fires when customer types a new address.
  // Resets when switching away from delivery or selecting a saved address.
  useEffect(() => {
    if (orderType !== "delivery" || selectedAddressId !== "new") {
      setZoneCheckState("idle");
      setZoneCheckMessage(undefined);
      return;
    }

    const { street, city, state, zip } = newAddress;
    const hasEnoughInput = street.trim().length > 3 && city.trim().length > 0;

    if (!hasEnoughInput) {
      setZoneCheckState("idle");
      setZoneCheckMessage(undefined);
      return;
    }

    setZoneCheckState("checking");

    if (zoneDebounceRef.current) clearTimeout(zoneDebounceRef.current);
    zoneDebounceRef.current = setTimeout(async () => {
      try {
        const result = await checkDeliveryZone(storeConfigId, { street, city, state, zip });
        if (result.valid) {
          setZoneCheckState("valid");
          setZoneCheckMessage("Great news — we deliver to this address!");
        } else {
          setZoneCheckState("invalid");
          setZoneCheckMessage(result.reason ?? "We don't deliver to this address.");
        }
      } catch {
        setZoneCheckState("idle");
        setZoneCheckMessage(undefined);
      }
    }, 700);

    return () => {
      if (zoneDebounceRef.current) clearTimeout(zoneDebounceRef.current);
    };
  }, [orderType, selectedAddressId, newAddress.street, newAddress.city, newAddress.state, newAddress.zip, storeConfigId]);

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

  const handleApplyPromo = async (code: string): Promise<string | undefined> => {
    const { sessionToken } = useSession.getState();
    const customerId = customer ? (customer as any).id : undefined;
    const result = await validatePromoCode(storeConfigId, code, subtotal, customerId);
    if (!result.valid) return result.error;
    setAppliedPromo({
      code: code.toUpperCase(),
      promotionName: result.promotionName ?? code,
      discountAmount: result.discountAmount ?? 0,
    });
    return undefined;
  };

  const handleCheckout = () => {
    handlePlaceOrder();
  };

  const handlePlaceOrder = async () => {
    const { sessionToken } = useSession.getState();

    setLoading(true);
    setPaymentError(null);

    // Step 1: Tokenize card via NMI (skip if no tokenization key — test mode, or cash payment)
    let paymentToken: string | undefined;
    let paymentCardType: string | null = null;
    let paymentCardLastFour: string | null = null;
    if (tokenizationKey && !payCashInStore) {
      try {
        if (!paymentFormRef.current) {
          throw new Error("Payment form not ready. Please wait a moment.");
        }
        const cardValidation = paymentFormRef.current.validateCardInput();
        if (!cardValidation.valid) {
          throw new Error(cardValidation.error || "Please complete card details.");
        }
        const tokenizedCard = await paymentFormRef.current.tokenize();
        paymentToken = tokenizedCard.tokenId;
        paymentCardType = tokenizedCard.cardType;
        paymentCardLastFour = tokenizedCard.cardLastFour;
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

    // Build requested time — encode in the location's timezone so "6:30 PM"
    // means 6:30 PM at the store, not 6:30 PM in the customer's browser locale.
    let requestedTime: string | null = null;
    if (pickupTime === "scheduled" && scheduledDate && scheduledTime) {
      const [hours, minutes] = scheduledTime.split(":").map(Number);
      const locationTz = location.timezone ?? "America/New_York";
      // Step 1: resolve the calendar date (year/month/day) in the store's timezone,
      //         because the customer might be in a different day boundary.
      const calParts = new Intl.DateTimeFormat("en-US", {
        timeZone: locationTz,
        year: "numeric", month: "numeric", day: "numeric",
      }).formatToParts(scheduledDate).reduce<Record<string, number>>((acc, p) => {
        if (p.type !== "literal") acc[p.type] = Number(p.value);
        return acc;
      }, {});
      // Step 2: naive UTC Date with those wall-clock values
      const utcCandidate = new Date(Date.UTC(calParts.year, calParts.month - 1, calParts.day, hours, minutes, 0));
      // Step 3: see what clock that UTC moment maps to in the store's TZ
      const tzParts = new Intl.DateTimeFormat("en-US", {
        timeZone: locationTz, hour: "numeric", minute: "numeric", hour12: false,
      }).formatToParts(utcCandidate);
      const tzH = Number(tzParts.find(p => p.type === "hour")?.value ?? hours);
      const tzM = Number(tzParts.find(p => p.type === "minute")?.value ?? minutes);
      // Step 4: shift by the difference to land on the correct UTC moment
      const offsetMs = (hours * 60 + minutes - (tzH * 60 + tzM)) * 60000;
      requestedTime = new Date(utcCandidate.getTime() + offsetMs).toISOString();
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
      quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
      notes: item.notes,
      modifiers: item.selectedModifiers?.map((m) => ({
        id: m.id,
        name: m.name,
        price: m.price,
        quantity: 1,
        groupName: null,
      })),
    }));

    // Persist transactional notification opt-ins to the session so the
    // notification helper picks them up when the order row is created.
    if (sessionToken) {
      const { updateSession } = await import("@/app/sites/session-actions");
      await updateSession(sessionToken, {
        customerEmailOptIn: emailOptIn,
        customerSmsOptIn: smsOptIn,
      }).catch(() => {});
    }

    // Step 2: Call create-online-order edge function with the NMI payment token
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
            // Always send store_config_id so the edge function can resolve the store even if session is invalid/expired.
            store_config_id: storeConfigId,
            ...(sessionToken ? { session_token: sessionToken } : {}),
            items: orderItems,
            order_type: orderType,
            delivery_address: deliveryAddress,
            requested_time: requestedTime,
            tip: tipAmount,
            special_instructions: instructions || undefined,
            pay_cash_in_store: payCashInStore,
            ...(paymentToken ? { payment_token: paymentToken } : {}),
            ...(paymentCardType ? { payment_card_type: paymentCardType } : {}),
            ...(paymentCardLastFour ? { payment_card_last_four: paymentCardLastFour } : {}),
            // Contact info (always sent — edge function uses session data if available)
            customer_name: `${firstName} ${lastName}`.trim() || undefined,
            customer_phone: customer?.phone || normalizePhone(phone) || phone.trim() || undefined,
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
          isPending: !result.auto_accepted,
          requestedTime: requestedTime,
        });
        if (result.order_id) {
          useSession.getState().setActiveOrderId(result.order_id);
          // Fire transactional receipt email + confirmation SMS.
          import("@/app/sites/notification-actions")
            .then(({ notifyOrderPlaced }) => notifyOrderPlaced(result.order_id))
            .catch((err) => console.error("[checkout] notifyOrderPlaced:", err));
        }
        // Save delivery address if requested
        if (saveNewAddress && isAuthenticated && orderType === "delivery" && selectedAddressId === "new" && newAddress.street) {
          const { sessionToken } = useSession.getState();
          if (sessionToken) {
            addSavedAddress(sessionToken, {
              label: newAddress.street,
              addressLine1: newAddress.street,
              addressLine2: null,
              city: newAddress.city,
              state: newAddress.state,
              postalCode: newAddress.zip,
              deliveryNotes: newAddress.notes || null,
              isDefault: savedAddresses.length === 0,
            });
          }
        }
        setStep("confirmation");
        clearCart();

        // Fire-and-forget order confirmation email
        if (result.order_id && email) {
          sendOrderConfirmationEmail(result.order_id, email).catch(() => {});
        }
      } else if (result.success && result.requires_redirect && result.payment_url) {
        // Hosted redirect fallback is not expected in the NMI embedded flow, but keep the branch safe.
        window.location.href = result.payment_url;
      } else {
        const detail =
          typeof result.details === "object" && result.details !== null && "error" in result.details
            ? String((result.details as { error?: string }).error)
            : typeof result.details === "object" && result.details !== null && "rpc" in result.details
              ? String((result.details as { rpc?: { error?: string } }).rpc?.error)
              : "";
        const errorMsg = detail || result.error || result.code || "Failed to place your order.";
        // Surface zone rejection prominently and sync UI state so the address
        // widget also turns red without requiring a re-type.
        if (result.code === "outside_delivery_zone") {
          setZoneCheckState("invalid");
          setZoneCheckMessage(result.error ?? "We don't deliver to this address.");
        }
        setPaymentError(errorMsg);
      }
    } catch {
      setLoading(false);
      setPaymentError("Network error. Please check your connection and try again.");
    }
  };

  // Loading skeleton while hydrating
  if (!hydrated) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
        <CheckoutHeader slug={slug} storeName={site?.title || location.name} logoUrl={site?.logo_url} />
        <div className="max-w-6xl mx-auto p-4 space-y-6">
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
          isPending={orderResult.isPending}
          requestedTime={orderResult.requestedTime}
          locationTimezone={location.timezone ?? "America/New_York"}
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

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const phoneValid = !!(customer?.phone) || isValidPhone(phone);
  const deliveryAddressValid =
    orderType !== "delivery" ||
    (selectedAddressId !== "new"
      ? !!savedAddresses.find((a) => a.id === selectedAddressId)
      : newAddress.street.trim().length > 0 && newAddress.city.trim().length > 0);
  const minOrder = config?.minimumOrderAmount ?? 0;
  const meetsMinOrder = subtotal >= minOrder;
  // null = no hours configured → allow ordering; false = closed; true = open
  const storeOpen = isStoreOpenNow(config?.operatingHours ?? (location as any).business_hours);
  const storeIsClosed = storeOpen === false;
  const zoneBlocked = orderType === "delivery" && selectedAddressId === "new" && zoneCheckState === "invalid";
  const paymentMethodReady =
    !config?.acceptOnlinePayments || payCashInStore || Boolean(tokenizationKey);
  const canPlaceOrder =
    firstName.trim().length > 0 &&
    emailValid &&
    phoneValid &&
    deliveryAddressValid &&
    meetsMinOrder &&
    !storeIsClosed &&
    paymentMethodReady &&
    !zoneBlocked &&
    items.length > 0;

  const prepTimeMins = config?.preparationLeadTime ?? 20;
  const summaryLine = formatCheckoutSummaryLine(
    orderType,
    pickupTime,
    scheduledDate,
    scheduledTime,
    prepTimeMins,
    storeAddress
  );
  const displayStoreName = site?.title || location.name;

  return (
    <>
      <CheckoutHeader slug={slug} storeName={displayStoreName} logoUrl={site?.logo_url} />

      <main className="max-w-6xl mx-auto p-4 pb-32 lg:pb-10">
        <div className="flex items-center justify-between">
          <div className="flex justify-end w-full">
            <Link
              href={storePath()}
              className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold border rounded-full transition-colors"
              style={{
                borderColor: "var(--primary)",
                color: "var(--primary)",
                borderRadius: "9999px",
              }}
            >
              Back to menu
            </Link>
          </div>
        </div>

        {/* Store closed banner */}
        {storeIsClosed && (
          <div
            className="p-4 rounded-lg text-sm font-medium text-center"
            style={{
              backgroundColor: "color-mix(in srgb, #ef4444 10%, var(--bg))",
              color: "#ef4444",
              border: "1px solid color-mix(in srgb, #ef4444 40%, transparent)",
              borderRadius: "var(--radius)",
            }}
          >
            This store is currently closed and not accepting orders.
          </div>
        )}

        {/* items-start + self-start on sidebar: required so sticky sidebar works in CSS Grid (Square-style checkout) */}
        <div className="mt-6 flex flex-col lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8 lg:items-start">
          {/* Left: express → contact → order type → payment → notes */}
          <div className="min-w-0 space-y-6 lg:pr-8 lg:border-r lg:border-[var(--border)] order-1">
            <ContactSection
              isAuthenticated={isAuthenticated}
              customerPhone={customer?.phone}
              firstName={firstName}
              lastName={lastName}
              email={email}
              phone={phone}
              emailOptIn={emailOptIn}
              smsOptIn={smsOptIn}
              onFirstNameChange={setFirstName}
              onLastNameChange={setLastName}
              onEmailChange={setEmail}
              onPhoneChange={setPhone}
              onEmailOptInChange={setEmailOptIn}
              onSmsOptInChange={setSmsOptIn}
              onSignInClick={() => { setAuthMode("signin"); setShowAuth(true); }}
              onSignUpClick={() => { setAuthMode("signup"); setShowAuth(true); }}
            />

            <div style={{ borderTop: "1px solid var(--border)" }} />

            <OrderTypeSection
              orderType={orderType}
              onOrderTypeChange={(type) => { setOrderType(type); if (type === "delivery") setPayCashInStore(false); }}
              pickupEnabled={pickupEnabled}
              deliveryEnabled={deliveryEnabled}
              pickupTime={pickupTime}
              onPickupTimeChange={setPickupTime}
              scheduledDate={scheduledDate}
              onScheduledDateChange={setScheduledDate}
              scheduledTime={scheduledTime}
              onScheduledTimeChange={setScheduledTime}
              maxFutureDays={config?.futureOrderMaxDays || 30}
              prepTime={prepTimeMins}
              operatingHours={config?.operatingHours}
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
              isAuthenticated={isAuthenticated}
              saveNewAddress={saveNewAddress}
              onSaveNewAddressChange={setSaveNewAddress}
              zoneCheckState={zoneCheckState}
              zoneCheckMessage={zoneCheckMessage}
            />

            <div style={{ borderTop: "1px solid var(--border)" }} />

            {config?.acceptOnlinePayments && (
              <>
                {orderType === "pickup" && (
                  <div
                    className="flex items-center justify-between px-4 py-3 rounded-lg"
                    style={{
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--card)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        Pay cash in store
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Pay at the counter when you pick up
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={payCashInStore}
                      onClick={() => setPayCashInStore((v) => !v)}
                      style={{
                        position: "relative",
                        display: "inline-flex",
                        alignItems: "center",
                        flexShrink: 0,
                        cursor: "pointer",
                        width: "44px",
                        height: "24px",
                        borderRadius: "9999px",
                        border: "none",
                        padding: 0,
                        backgroundColor: payCashInStore ? "var(--primary)" : "#94a3b8",
                        transition: "background-color 0.2s ease",
                        outline: "none",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: "2px",
                          left: payCashInStore ? "22px" : "2px",
                          width: "20px",
                          height: "20px",
                          borderRadius: "9999px",
                          backgroundColor: "#ffffff",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                          transition: "left 0.2s ease",
                        }}
                      />
                    </button>
                  </div>
                )}
                {!payCashInStore && (
                  <PaymentCardForm
                    ref={paymentFormRef}
                    tokenizationKey={tokenizationKey}
                    onError={setPaymentError}
                    disabled={loading}
                  />
                )}
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
          </div>

          {/* Right: one sticky sidebar — follows scroll like Square / Butter Smashburgers (single page scrollbar) */}
          <aside
            className="min-w-0 mt-10 space-y-6 rounded-xl border p-5 shadow-sm lg:mt-0 lg:sticky lg:top-20 lg:z-10 lg:self-start order-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
            aria-label="Order summary"
          >
            <div className="lg:-mx-1">
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-secondary)" }}
              >
                {orderType === "pickup" ? "Pickup at" : "Delivery"}
              </p>
              <h2
                className="mt-1 font-bold text-base"
                style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
              >
                {displayStoreName}
              </h2>
              <p className="text-sm mt-1 leading-snug" style={{ color: "var(--text-secondary)" }}>
                {summaryLine}
              </p>
            </div>

            <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <OrderDetailsSection
                items={items}
                slug={slug}
                onUpdateQuantity={updateQuantity}
                onRemoveItem={removeItem}
              />
            </div>

            <PromoCodeSection
              subtotal={subtotal}
              appliedPromo={appliedPromo}
              onApply={handleApplyPromo}
              onRemove={() => setAppliedPromo(null)}
            />

            {config?.tippingEnabled !== false && (
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
            )}

            {minOrder > 0 && !meetsMinOrder && (
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: "color-mix(in srgb, #f59e0b 12%, var(--bg))",
                  color: "#b45309",
                  border: "1px solid #fcd34d",
                  borderRadius: "var(--radius)",
                }}
              >
                Minimum order is ${minOrder.toFixed(2)}. Add ${(minOrder - subtotal).toFixed(2)} more to continue.
              </div>
            )}

            <div className="border-t pt-4 space-y-4" style={{ borderColor: "var(--border)" }}>
              <OrderSummarySection
                subtotal={subtotal}
                tax={tax}
                deliveryFee={deliveryFee}
                tipAmount={tipAmount}
                total={total}
                itemCount={items.length}
                showDeliveryFee={orderType === "delivery"}
                taxRate={taxRate}
                discountAmount={discountAmount}
                promoCode={appliedPromo?.code}
                pricingDisclosureText={pricingDisclosureText}
              />
              <div className="pt-2">
                <PlaceOrderButton
                  layout="inline"
                  total={total}
                  loading={loading}
                  disabled={!canPlaceOrder}
                  onClick={handleCheckout}
                  isTestMode={!tokenizationKey && !payCashInStore}
                />
              </div>
            </div>
          </aside>
        </div>
      </main>

      <div className="hidden">
        <PlaceOrderButton
          total={total}
          loading={loading}
          disabled={!canPlaceOrder}
          onClick={handleCheckout}
          isTestMode={!tokenizationKey && !payCashInStore}
          layout="fixed"
        />
      </div>

      {/* Auth Dialog */}
      <AuthDialog
        isOpen={showAuth}
        onOpenChange={setShowAuth}
        storeConfigId={storeConfigId}
        defaultMode={authMode}
        onSuccess={() => setShowAuth(false)}
      />
    </>
  );
}
