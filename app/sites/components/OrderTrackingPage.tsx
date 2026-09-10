"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Phone,
  Loader2,
  XCircle,
  MapPin,
  Navigation,
  Store as StoreIcon,
  Clock4,
} from "lucide-react";
import { useStorefrontPath } from "../lib/use-storefront-path";
import { getOrderTracking, cancelOnlineOrder, type OrderTrackingData } from "../order-actions";
import { useSession } from "../hooks/useSession";
import { OrderStatusWatcher } from "./OrderStatusWatcher";
import { CallServerCard } from "./CallServerCard";
import { formatScheduledTime } from "../lib/format-scheduled-time";
import { getQrOrderStatus } from "../qr-actions";

const subscribeToNothing = () => () => {};

interface OrderTrackingPageProps {
  initialOrder: OrderTrackingData;
  orderId: string;
  slug: string;
  storeName: string;
  logoUrl?: string;
  storePhone?: string | null;
  storeAddress?: string | null;
  storeLat?: number | null;
  storeLng?: number | null;
  storeHours?: unknown;
  storeTimezone?: string | null;
  taxRate?: number; // decimal e.g. 0.08875 — same value used by checkout
}

interface DaySchedule {
  enabled?: boolean;
  from?: string;
  to?: string;
  is24Hours?: boolean;
}
type WeekHours = Partial<Record<
  "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday",
  DaySchedule
>>;

const DAY_KEYS: Array<keyof WeekHours> = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function todayKey(timezone: string | null): keyof WeekHours {
  const now = new Date();
  const dayName = now
    .toLocaleDateString("en-US", { weekday: "long", timeZone: timezone ?? undefined })
    .toLowerCase();
  return (DAY_KEYS.find((d) => d === dayName) ?? "monday") as keyof WeekHours;
}

function formatHourLabel(time: string | undefined): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (Number.isNaN(h)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function todayHoursLabel(hours: unknown, timezone: string | null): string | null {
  if (!hours || typeof hours !== "object") return null;
  const week = hours as WeekHours;
  const day = week[todayKey(timezone)];
  if (!day || !day.enabled) return "Closed today";
  if (day.is24Hours) return "Open 24 hours";
  if (!day.from || !day.to) return null;
  return `${formatHourLabel(day.from)} – ${formatHourLabel(day.to)}`;
}

const TERMINAL_STATUSES = ["completed", "cancelled", "void", "declined"];

const STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting Acceptance",
  accepted: "Accepted",
  sent_to_kitchen: "Sent to Kitchen",
  preparing: "Preparing",
  ready: "Ready for Pickup",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  void: "Voided",
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending:        { bg: "#fffbeb", text: "#92400e", border: "#f59e0b" },
  accepted:       { bg: "#eff6ff", text: "#1e40af", border: "#3b82f6" },
  sent_to_kitchen:{ bg: "#f5f3ff", text: "#4c1d95", border: "#8b5cf6" },
  preparing:      { bg: "#fff7ed", text: "#7c2d12", border: "#f97316" },
  ready:          { bg: "#f0fdf4", text: "#14532d", border: "#22c55e" },
  completed:      { bg: "#f0fdf4", text: "#14532d", border: "#22c55e" },
  cancelled:      { bg: "#fef2f2", text: "#7f1d1d", border: "#ef4444" },
  declined:       { bg: "#fef2f2", text: "#7f1d1d", border: "#ef4444" },
  void:           { bg: "#fef2f2", text: "#7f1d1d", border: "#ef4444" },
};

function formatTime(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function getEstimatedReadyTime(order: OrderTrackingData): { label: string; wallClock: string } | null {
  if (order.readyAt || order.completedAt || order.cancelledAt || order.declinedAt) return null;

  const anchor = order.sentToKitchenAt ?? order.createdAt;
  const readyAt = new Date(new Date(anchor).getTime() + order.estimatedPrepMinutes * 60 * 1000);
  const now = new Date();
  const diffMs = readyAt.getTime() - now.getTime();
  const diffMin = Math.max(0, Math.ceil(diffMs / 60000));
  const wallClock = readyAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  if (diffMin <= 1) return { label: "~1 min", wallClock };
  return { label: `~${diffMin} min`, wallClock };
}

// Maps order status to a 0-based index in the 5-step horizontal strip
function statusToStepIndex(status: string): number {
  switch (status) {
    case "pending":         return 0;
    case "accepted":        return 1;
    case "sent_to_kitchen": return 2;
    case "preparing":       return 2;
    case "ready":           return 3;
    case "completed":       return 4;
    default:                return 0;
  }
}

const PROGRESS_STEPS = ["Placed", "Accepted", "Preparing", "Ready", "Done"] as const;

export function OrderTrackingPage({
  initialOrder,
  orderId,
  slug,
  storeName,
  logoUrl: _logoUrl,
  storePhone,
  storeAddress,
  storeLat,
  storeLng,
  storeHours,
  storeTimezone,
  taxRate = 0,
}: OrderTrackingPageProps) {
  const { sessionToken, qrTableLabel } = useSession();
  const [order, setOrder] = useState<OrderTrackingData>(initialOrder);
  const [isFetching, setIsFetching] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [pendingCountdown, setPendingCountdown] = useState<number | null>(null);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const storePath = useStorefrontPath(slug);


  // Start / clear auto-cancel countdown based on time elapsed since order was placed.
  // This is recalculated on mount and on status change — refresh-safe.
  useEffect(() => {
    if (order.status === "pending") {
      const secondsSincePlaced = Math.floor(
        (Date.now() - new Date(order.createdAt).getTime()) / 1000
      );
      const remaining = Math.max(0, 60 - secondsSincePlaced);
      setPendingCountdown(remaining);
    } else {
      setPendingCountdown(null);
    }
  }, [order.status, order.createdAt]);

  // Tick countdown and auto-cancel when it hits 0
  useEffect(() => {
    if (pendingCountdown === null) return;
    if (pendingCountdown === 0) {
      if (sessionToken) {
        cancelOnlineOrder(orderId, sessionToken, "No response from restaurant within 1 minute", "timeout").then(async (result) => {
          if (result.success) {
            toast.error("Order Cancelled", {
              description: "No response from the restaurant within 1 minute. Your order has been cancelled.",
              duration: 8000,
            });
          }
          await refreshOrder();
        });
      }
      setPendingCountdown(null);
      return;
    }
    const timer = setTimeout(() => setPendingCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [pendingCountdown, orderId, sessionToken]);

  // Poll for updates every 60s
  useEffect(() => {
    if (TERMINAL_STATUSES.includes(order.status)) return;

    const interval = setInterval(async () => {
      setIsFetching(true);
      const { data } = await getOrderTracking(orderId);
      if (data) {
        setOrder(data);
      }
      setIsFetching(false);
    }, 60000);

    return () => clearInterval(interval);
  }, [orderId, order.status]);

  const refreshOrder = useCallback(async () => {
    const { data } = await getOrderTracking(orderId);
    if (data) {
      setOrder(data);
    }
  }, [orderId]);

  // QR-specific fallback polling: keep guest tracking fresher even if realtime
  // delivery is delayed or blocked on the current network.
  useEffect(() => {
    if (!sessionToken || !qrTableLabel || TERMINAL_STATUSES.includes(order.status)) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSeenUpdatedAt: string | null = null;

    const poll = async () => {
      const result = await getQrOrderStatus(sessionToken);
      if (cancelled || !result.success) {
        scheduleNext(5000);
        return;
      }

      if (result.orderId && result.orderId !== orderId) {
        await refreshOrder();
        scheduleNext(result.pollIntervalSeconds ? result.pollIntervalSeconds * 1000 : 5000);
        return;
      }

      const nextUpdatedAt = result.lastUpdatedAt ?? null;
      if (nextUpdatedAt && nextUpdatedAt !== lastSeenUpdatedAt) {
        lastSeenUpdatedAt = nextUpdatedAt;
        await refreshOrder();
      }

      scheduleNext(result.pollIntervalSeconds ? result.pollIntervalSeconds * 1000 : 5000);
    };

    const scheduleNext = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(poll, delayMs);
    };

    scheduleNext(5000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionToken, qrTableLabel, order.status, orderId, refreshOrder]);

  const handleCancel = async () => {
    if (!sessionToken || !cancelReason.trim()) return;
    setIsCancelling(true);
    setCancelError(null);
    const result = await cancelOnlineOrder(orderId, sessionToken, cancelReason.trim(), "customer");
    if (!result.success) {
      setCancelError(result.error ?? "Failed to cancel order");
      setIsCancelling(false);
      return;
    }
    toast.error("Order Cancelled", {
      description: "Your order has been cancelled.",
      duration: 6000,
    });
    await refreshOrder();
    setShowCancelForm(false);
    setIsCancelling(false);
  };

  const isTerminal = TERMINAL_STATUSES.includes(order.status);
  const isCancelled = order.status === "cancelled" || order.status === "void";
  const isDeclined = order.status === "declined";
  const isPending = order.status === "pending";
  const canCustomerCancel = isPending && !!sessionToken;
  const estimatedReady = getEstimatedReadyTime(order);
  const statusColor = STATUS_COLORS[order.status] ?? STATUS_COLORS.pending;
  const currentStepIndex = statusToStepIndex(order.status);

  const storedRate = order.taxRatePercent != null ? order.taxRatePercent / 100 : null;
  const effectiveRate = storedRate ?? taxRate;
  const displayedTax = order.tax > 0
    ? order.tax
    : effectiveRate > 0 ? Math.round(order.subtotal * effectiveRate * 100) / 100 : 0;
  const displayedTotal = order.total > 0 ? order.total : order.subtotal + displayedTax + order.tip;
  const displayedAdjustments = Math.round(
    (displayedTotal - (order.subtotal + displayedTax + order.tip)) * 100
  ) / 100;

  const hoursLabel = todayHoursLabel(storeHours, storeTimezone ?? null);
  const directionsHref = storeLat && storeLng
    ? `https://www.google.com/maps/dir/?api=1&destination=${storeLat},${storeLng}`
    : storeAddress
      ? `https://maps.google.com/?q=${encodeURIComponent(storeAddress)}`
      : null;
  const mapEmbedSrc = storeLat && storeLng
    ? `https://maps.google.com/maps?q=${storeLat},${storeLng}&z=15&output=embed`
    : storeAddress
      ? `https://maps.google.com/maps?q=${encodeURIComponent(storeAddress)}&z=15&output=embed`
      : null;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      {!isTerminal && (
        <OrderStatusWatcher
          orderId={orderId}
          sessionToken={qrTableLabel ? sessionToken : null}
          onDecision={refreshOrder}
          silentStatuses={["cancelled"]}
        />
      )}

      {/* Left panel */}
      <section
        className="w-full lg:w-[440px] lg:min-w-[440px] lg:h-screen lg:overflow-y-auto flex flex-col bg-white"
        style={{ borderRight: "1px solid #e5e7eb" }}
      >
        <header
          className="sticky top-0 z-30 px-4 py-3 flex items-center justify-between bg-white"
          style={{ borderBottom: "1px solid #e5e7eb" }}
        >
          <Link
            href={storePath()}
            className="flex items-center gap-2 text-sm font-medium"
            style={{ color: "#111827" }}
          >
            <ArrowLeft className="h-4 w-4" style={{ color: "var(--primary)" }} />
            Back to menu
          </Link>
          {!TERMINAL_STATUSES.includes(order.status) && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "#6b7280" }}>
              {isFetching
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />}
              {isFetching ? "Updating…" : "Live"}
            </span>
          )}
        </header>

        <main className="px-4 py-6 space-y-5">

          {/* ── Hero: ETA as H1 ── */}
          <div className="text-center space-y-1">
            {estimatedReady && !isCancelled && !isDeclined ? (
              <>
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#111827" }}>
                  Ready by {estimatedReady.wallClock}
                </h1>
                <p className="text-sm" style={{ color: "#6b7280" }}>
                  {mounted ? `${estimatedReady.label} · ` : ""}Order #{order.displayNumber}
                </p>
              </>
            ) : order.requestedTime ? (
              <>
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#111827" }}>
                  Scheduled for {formatScheduledTime(order.requestedTime, order.locationTimezone)}
                </h1>
                <p className="text-sm" style={{ color: "#6b7280" }}>Order #{order.displayNumber}</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#111827" }}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </h1>
                <p className="text-sm" style={{ color: "#6b7280" }}>Order #{order.displayNumber}</p>
              </>
            )}
            {/* Status chip — MUI style */}
            <div className="flex justify-center pt-1">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: statusColor.bg,
                  color: statusColor.text,
                  borderLeft: `3px solid ${statusColor.border}`,
                }}
              >
                {STATUS_LABELS[order.status] ?? order.status}
              </span>
            </div>
          </div>

          {/* ── Horizontal progress strip ── */}
          {!isCancelled && !isDeclined && (
            <div className="rounded-xl px-4 py-4" style={{ border: "1px solid #e5e7eb" }}>
              <div className="flex justify-between mb-2">
                {PROGRESS_STEPS.map((label, i) => {
                  const isCompleted = i < currentStepIndex;
                  const isCurrent = i === currentStepIndex;
                  return (
                    <div key={label} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: isCompleted ? "#16a34a" : isCurrent ? "var(--primary)" : "#d1d5db",
                        }}
                      />
                      <span
                        className="text-[10px] font-medium text-center leading-tight"
                        style={{ color: isCompleted ? "#16a34a" : isCurrent ? "var(--primary)" : "#9ca3af" }}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="relative h-1 rounded-full" style={{ backgroundColor: "#e5e7eb" }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                  style={{
                    backgroundColor: "var(--primary)",
                    width: `${(currentStepIndex / (PROGRESS_STEPS.length - 1)) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Pending countdown ── */}
          {isPending && pendingCountdown !== null && (
            <div
              className="px-4 py-4 space-y-3"
              style={{ backgroundColor: "#fffbeb", borderLeft: "4px solid #f59e0b" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#78350f" }}>
                    Waiting for restaurant
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#92400e", opacity: 0.75 }}>
                    Auto-cancels if no response
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold tabular-nums" style={{ color: "#f59e0b" }}>
                    {pendingCountdown}s
                  </p>
                  <p className="text-xs" style={{ color: "#92400e", opacity: 0.75 }}>remaining</p>
                </div>
              </div>
              {canCustomerCancel && (
                <div style={{ borderTop: "1px solid #fde68a", paddingTop: "12px" }}>
                  {!showCancelForm ? (
                    <button
                      type="button"
                      onClick={() => setShowCancelForm(true)}
                      className="text-sm"
                      style={{ color: "#92400e" }}
                    >
                      Cancel this order
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                        Why do you want to cancel?
                      </p>
                      <textarea
                        rows={3}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="e.g. Changed my mind, ordered by mistake…"
                        className="w-full text-sm px-3 py-2 resize-none outline-none"
                        style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", color: "#111827" }}
                      />
                      {cancelError && <p className="text-xs" style={{ color: "#ef4444" }}>{cancelError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowCancelForm(false); setCancelReason(""); setCancelError(null); }}
                          disabled={isCancelling}
                          className="flex-1 text-sm font-medium py-2"
                          style={{ backgroundColor: "#ffffff", border: "1px solid #d1d5db", color: "#374151" }}
                        >
                          Keep Order
                        </button>
                        <button
                          type="button"
                          onClick={handleCancel}
                          disabled={isCancelling || !cancelReason.trim()}
                          className="flex-1 text-sm font-semibold py-2 disabled:opacity-50"
                          style={{ backgroundColor: "#ef4444", color: "#ffffff" }}
                        >
                          {isCancelling ? "Cancelling…" : "Confirm Cancel"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Declined banner ── */}
          {isDeclined && (
            <div
              className="flex items-start gap-3 px-4 py-3"
              style={{ backgroundColor: "#fef2f2", borderLeft: "4px solid #ef4444" }}
            >
              <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: "#7f1d1d" }}>
                  Order declined
                  {order.declinedAt && (
                    <span className="font-normal ml-2" style={{ opacity: 0.6 }}>{formatTime(order.declinedAt)}</span>
                  )}
                </p>
                {order.declinedReason && (
                  <p className="text-sm mt-0.5" style={{ color: "#7f1d1d", opacity: 0.75 }}>Reason: {order.declinedReason}</p>
                )}
                {storePhone && (
                  <a href={`tel:${storePhone}`} className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium" style={{ color: "#ef4444" }}>
                    <Phone className="h-3.5 w-3.5" />
                    Call {storeName}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ── Cancelled banner ── */}
          {isCancelled && (
            <div
              className="flex items-start gap-3 px-4 py-3"
              style={{ backgroundColor: "#fef2f2", borderLeft: "4px solid #ef4444" }}
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: "#7f1d1d" }}>
                  {order.cancelledBy === "customer"
                    ? "You cancelled this order"
                    : order.status === "void"
                    ? "Order Voided"
                    : "Order Cancelled"}
                  {order.cancelledAt && (
                    <span className="font-normal ml-2" style={{ opacity: 0.6 }}>{formatTime(order.cancelledAt)}</span>
                  )}
                </p>
                {order.cancellationReason && (
                  <p className="text-sm mt-0.5" style={{ color: "#7f1d1d", opacity: 0.75 }}>Reason: {order.cancellationReason}</p>
                )}
                {storePhone && order.cancelledBy !== "customer" && (
                  <a href={`tel:${storePhone}`} className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium" style={{ color: "#ef4444" }}>
                    <Phone className="h-3.5 w-3.5" />
                    Call {storeName}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ── Store info card ── */}
          {(storeAddress || storeLat) && (
            <div style={{ border: "1px solid #e5e7eb" }}>
              <StoreInfoBlock
                storeName={storeName}
                storeAddress={storeAddress ?? null}
                storePhone={storePhone ?? null}
                hoursLabel={hoursLabel}
                directionsHref={directionsHref}
              />
            </div>
          )}

          <CallServerCard />


          {/* ── Order details — collapsible ── */}
          <div style={{ border: "1px solid #e5e7eb" }}>
            <button
              type="button"
              onClick={() => setOrderDetailsOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-left"
              style={{ color: "#111827", backgroundColor: "#f9fafb" }}
            >
              <span>Order details</span>
              <span style={{ color: "#9ca3af", fontSize: "18px", lineHeight: 1 }}>
                {orderDetailsOpen ? "−" : "+"}
              </span>
            </button>
            {orderDetailsOpen && (
              <div className="px-4 pt-3 pb-4 space-y-2 bg-white">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm" style={{ color: "#374151" }}>
                    <span>{item.quantity}× {item.name}</span>
                    <span className="font-medium">${item.subtotal.toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "8px" }} className="space-y-1">
                  <div className="flex justify-between text-sm" style={{ color: "#6b7280" }}>
                    <span>Subtotal</span>
                    <span>${order.subtotal.toFixed(2)}</span>
                  </div>
                  {displayedTax > 0 && (
                    <div className="flex justify-between text-sm" style={{ color: "#6b7280" }}>
                      <span>Tax{effectiveRate > 0 ? ` (${parseFloat((effectiveRate * 100).toFixed(2))}%)` : ""}</span>
                      <span>${displayedTax.toFixed(2)}</span>
                    </div>
                  )}
                  {order.tip > 0 && (
                    <div className="flex justify-between text-sm" style={{ color: "#6b7280" }}>
                      <span>Tip</span>
                      <span>${order.tip.toFixed(2)}</span>
                    </div>
                  )}
                  {Math.abs(displayedAdjustments) > 0.009 && (
                    <div className="flex justify-between text-sm" style={{ color: "#6b7280" }}>
                      <span>{displayedAdjustments > 0 ? "Other fees" : "Adjustments"}</span>
                      <span>
                        {displayedAdjustments > 0 ? "" : "−"}${Math.abs(displayedAdjustments).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold pt-1" style={{ color: "#111827", borderTop: "1px solid #e5e7eb" }}>
                    <span>Total</span>
                    <span>${displayedTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="text-center pb-6">
            <Link href={storePath()} className="text-sm font-medium" style={{ color: "var(--primary)" }}>
              Continue Shopping
            </Link>
          </div>
        </main>
      </section>

      {/* Right panel — full-bleed map (desktop only) */}
      <section className="hidden lg:block flex-1 relative" style={{ backgroundColor: "#e5e7eb" }}>
        {mapEmbedSrc ? (
          <iframe
            title="Pickup location map"
            className="absolute inset-0 w-full h-full"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={mapEmbedSrc}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "#9ca3af" }}>
            Store location unavailable
          </div>
        )}
        <div className="absolute top-6 right-6 w-80 shadow-xl overflow-hidden bg-white" style={{ border: "1px solid #e5e7eb" }}>
          <StoreInfoBlock
            storeName={storeName}
            storeAddress={storeAddress ?? null}
            storePhone={storePhone ?? null}
            hoursLabel={hoursLabel}
            directionsHref={directionsHref}
          />
        </div>
      </section>
    </div>
  );
}

function StoreInfoBlock({
  storeName,
  storeAddress,
  storePhone,
  hoursLabel,
  directionsHref,
}: {
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  hoursLabel: string | null;
  directionsHref: string | null;
}) {
  return (
    <div className="p-4 space-y-3">
      {/* Store name row */}
      <div className="flex items-center gap-2" style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "12px" }}>
        <StoreIcon className="h-4 w-4 flex-shrink-0" style={{ color: "#9ca3af" }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight" style={{ color: "#111827" }}>{storeName}</p>
          <p className="text-xs" style={{ color: "#9ca3af" }}>Pickup location</p>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2">
        {storeAddress && (
          <div className="flex items-start gap-2.5 text-sm" style={{ color: "#374151" }}>
            <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: "#9ca3af" }} />
            <span className="leading-snug">{storeAddress}</span>
          </div>
        )}
        {hoursLabel && (
          <div className="flex items-center gap-2.5 text-sm" style={{ color: "#374151" }}>
            <Clock4 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#9ca3af" }} />
            <span>Today: {hoursLabel}</span>
          </div>
        )}
        {storePhone && (
          <a href={`tel:${storePhone}`} className="flex items-center gap-2.5 text-sm hover:underline" style={{ color: "#374151" }}>
            <Phone className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#9ca3af" }} />
            <span>{storePhone}</span>
          </a>
        )}
      </div>

      {directionsHref && (
        <a
          href={directionsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-semibold mt-1"
          style={{ backgroundColor: "var(--primary)", color: "#ffffff" }}
        >
          <Navigation className="h-4 w-4" />
          Get directions
        </a>
      )}
    </div>
  );
}
