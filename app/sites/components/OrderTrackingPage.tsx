"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Flame,
  Package,
  CircleCheck,
  AlertTriangle,
  ArrowLeft,
  Phone,
  Loader2,
  Hourglass,
  XCircle,
} from "lucide-react";
import { useStorefrontPath } from "../lib/use-storefront-path";
import { getOrderTracking, cancelOnlineOrder, type OrderTrackingData } from "../order-actions";
import { useSession } from "../hooks/useSession";
import { OrderStatusWatcher } from "./OrderStatusWatcher";

interface OrderTrackingPageProps {
  initialOrder: OrderTrackingData;
  orderId: string;
  slug: string;
  storeName: string;
  logoUrl?: string;
  storePhone?: string | null;
  taxRate?: number; // decimal e.g. 0.08875 — same value used by checkout
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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "color-mix(in srgb, #f59e0b 15%, var(--bg))", text: "#f59e0b" },
  accepted: { bg: "color-mix(in srgb, #3b82f6 15%, var(--bg))", text: "#3b82f6" },
  sent_to_kitchen: { bg: "color-mix(in srgb, #8b5cf6 15%, var(--bg))", text: "#8b5cf6" },
  preparing: { bg: "color-mix(in srgb, #f97316 15%, var(--bg))", text: "#f97316" },
  ready: { bg: "color-mix(in srgb, #22c55e 15%, var(--bg))", text: "#22c55e" },
  completed: { bg: "color-mix(in srgb, #22c55e 15%, var(--bg))", text: "#22c55e" },
  cancelled: { bg: "color-mix(in srgb, #ef4444 15%, var(--bg))", text: "#ef4444" },
  declined: { bg: "color-mix(in srgb, #ef4444 15%, var(--bg))", text: "#ef4444" },
  void: { bg: "color-mix(in srgb, #ef4444 15%, var(--bg))", text: "#ef4444" },
};

interface TimelineStep {
  label: string;
  icon: React.ReactNode;
  timestamp: string | null;
  isActive: boolean;
  isDone: boolean;
}

function buildTimeline(order: OrderTrackingData): TimelineStep[] {
  // Acceptance step is always shown.
  // isDone when acceptedAt is set (manual accept) or sentToKitchenAt is set (auto-accept skips acceptedAt).
  const acceptanceDone = !!order.acceptedAt || !!order.sentToKitchenAt;
  const acceptanceTimestamp = order.acceptedAt ?? order.sentToKitchenAt;

  const steps: TimelineStep[] = [
    {
      label: "Order Placed",
      icon: <CheckCircle2 className="h-5 w-5" />,
      timestamp: order.createdAt,
      isActive: true,
      isDone: true,
    },
    {
      label: "Awaiting Acceptance",
      icon: <Hourglass className="h-5 w-5" />,
      timestamp: acceptanceTimestamp,
      isActive: order.status === "pending" || acceptanceDone,
      isDone: acceptanceDone,
    },
    {
      label: "Sent to Kitchen",
      icon: <Clock className="h-5 w-5" />,
      timestamp: order.sentToKitchenAt,
      isActive: !!order.sentToKitchenAt,
      isDone: !!order.sentToKitchenAt,
    },
    {
      label: "Preparing",
      icon: <Flame className="h-5 w-5" />,
      timestamp: order.startedPreparingAt,
      isActive: !!order.startedPreparingAt,
      isDone: !!order.startedPreparingAt,
    },
    {
      label: "Ready for Pickup",
      icon: <Package className="h-5 w-5" />,
      timestamp: order.readyAt,
      isActive: !!order.readyAt,
      isDone: !!order.readyAt,
    },
    {
      label: "Completed",
      icon: <CircleCheck className="h-5 w-5" />,
      timestamp: order.completedAt,
      isActive: !!order.completedAt,
      isDone: !!order.completedAt,
    },
  ];

  return steps;
}

function formatSecondsAgo(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m ago`;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function getEstimatedReadyTime(order: OrderTrackingData): string | null {
  if (order.readyAt || order.completedAt || order.cancelledAt || order.declinedAt) return null;

  // Use sentToKitchenAt (when prep actually started) as the anchor; fall back to createdAt
  const anchor = order.sentToKitchenAt ?? order.createdAt;
  const readyAt = new Date(new Date(anchor).getTime() + order.estimatedPrepMinutes * 60 * 1000);
  const now = new Date();
  const diffMs = readyAt.getTime() - now.getTime();
  const diffMin = Math.max(0, Math.ceil(diffMs / 60000));

  if (diffMin === 0) return "Any moment now";
  return `~${diffMin} min`;
}

export function OrderTrackingPage({
  initialOrder,
  orderId,
  slug,
  storeName,
  logoUrl,
  storePhone,
  taxRate = 0,
}: OrderTrackingPageProps) {
  const { sessionToken } = useSession();
  const [order, setOrder] = useState<OrderTrackingData>(initialOrder);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [isFetching, setIsFetching] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [pendingCountdown, setPendingCountdown] = useState<number | null>(null);
  const storePath = useStorefrontPath(slug);

  // Tick relative timestamp every second
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  // Start / clear 60-second auto-cancel countdown based on order status
  useEffect(() => {
    if (order.status === "pending") {
      setPendingCountdown(60);
    } else {
      setPendingCountdown(null);
    }
  }, [order.status]);

  // Tick countdown and auto-cancel when it hits 0
  useEffect(() => {
    if (pendingCountdown === null) return;
    if (pendingCountdown === 0) {
      if (sessionToken) {
        cancelOnlineOrder(orderId, sessionToken, "No response from restaurant within 1 minute").then(async (result) => {
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
        setLastUpdated(new Date());
        setSecondsAgo(0);
      }
      setIsFetching(false);
    }, 60000);

    return () => clearInterval(interval);
  }, [orderId, order.status]);

  const refreshOrder = useCallback(async () => {
    const { data } = await getOrderTracking(orderId);
    if (data) {
      setOrder(data);
      setLastUpdated(new Date());
      setSecondsAgo(0);
    }
  }, [orderId]);

  const handleCancel = async () => {
    if (!sessionToken || !cancelReason.trim()) return;
    setIsCancelling(true);
    setCancelError(null);
    const result = await cancelOnlineOrder(orderId, sessionToken, cancelReason.trim());
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
  const timeline = buildTimeline(order);
  // Pulse on the first active-but-not-done step (current waiting step).
  // Fall back to the last completed step if all are done.
  const lastDoneIndex = timeline.reduce((acc, step, i) => (step.isDone ? i : acc), -1);
  const activeNotDoneIndex = timeline.findIndex((step) => step.isActive && !step.isDone);
  const pulseIndex = activeNotDoneIndex >= 0 ? activeNotDoneIndex : lastDoneIndex;
  const estimatedTime = getEstimatedReadyTime(order);
  const statusColor = STATUS_COLORS[order.status] ?? STATUS_COLORS.pending;

  // Use the stored tax_amount (actual amount charged at time of order).
  // Fall back to recomputing from the live rate only for old orders that stored $0 tax
  // due to the prior tax_category SQL bug.
  const storedRate = order.taxRatePercent != null ? order.taxRatePercent / 100 : null;
  const effectiveRate = storedRate ?? taxRate;
  const displayedTax = order.tax > 0
    ? order.tax
    : effectiveRate > 0 ? Math.round(order.subtotal * effectiveRate * 100) / 100 : 0;
  const displayedTotal = order.subtotal + displayedTax + order.tip;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      {/* Realtime watcher — immediately refreshes page when merchant accepts/declines.
          'cancelled' is silent here because we show that toast directly (avoids race condition). */}
      {!isTerminal && (
        <OrderStatusWatcher
          orderId={orderId}
          onDecision={refreshOrder}
          silentStatuses={["cancelled"]}
        />
      )}
      {/* Header */}
      <header
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{
          backgroundColor: "var(--bg)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link
          href={storePath()}
          className="flex items-center gap-1 text-sm font-medium"
          style={{ color: "var(--primary)" }}
        >
          <ArrowLeft className="h-4 w-4" />
          {storeName}
        </Link>
        {logoUrl && (
          <img
            src={logoUrl}
            alt={storeName}
            className="h-8 w-8 rounded-full object-cover ml-auto"
          />
        )}
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-6">
        {/* Order banner */}
        <div className="text-center space-y-2">
          <h1
            className="text-4xl font-bold"
            style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
          >
            {order.displayNumber}
          </h1>
          <span
            className="inline-block px-3 py-1 rounded-full text-sm font-semibold"
            style={{
              backgroundColor: statusColor.bg,
              color: statusColor.text,
            }}
          >
            {STATUS_LABELS[order.status] ?? order.status}
          </span>

          {/* Live indicator */}
          {!TERMINAL_STATUSES.includes(order.status) && (
            <div className="flex items-center justify-center gap-1.5 mt-1">
              {isFetching ? (
                <Loader2
                  className="h-3 w-3 animate-spin"
                  style={{ color: "var(--text-secondary)" }}
                />
              ) : (
                <span
                  className="inline-block h-2 w-2 rounded-full animate-pulse"
                  style={{ backgroundColor: "var(--primary)" }}
                />
              )}
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {isFetching ? "Updating…" : `Last updated ${formatSecondsAgo(secondsAgo)}`}
              </span>
            </div>
          )}
        </div>

        {/* Pending countdown card */}
        {isPending && pendingCountdown !== null && (
          <div
            className="text-center px-6 py-4 rounded-xl"
            style={{
              backgroundColor: "color-mix(in srgb, #f59e0b 10%, var(--bg))",
              border: "1px solid #f59e0b",
              borderRadius: "var(--radius)",
            }}
          >
            <p className="text-sm" style={{ color: "#f59e0b" }}>
              Waiting for restaurant response
            </p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: "#f59e0b" }}>
              {pendingCountdown}s
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              Order will be cancelled automatically if no response
            </p>
          </div>
        )}

        {/* Estimated time card */}
        {estimatedTime && !isCancelled && !isDeclined && !isPending && (
          <div
            className="text-center px-6 py-4 rounded-xl"
            style={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Estimated ready in
            </p>
            <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>
              {estimatedTime}
            </p>
          </div>
        )}

        {/* Declined banner */}
        {isDeclined && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{
              backgroundColor: "color-mix(in srgb, #ef4444 10%, var(--bg))",
              border: "1px solid #ef4444",
              borderRadius: "var(--radius)",
            }}
          >
            <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm" style={{ color: "#ef4444" }}>
                Your order was declined by the restaurant
                {order.declinedAt && (
                  <span className="font-normal ml-2 opacity-75">{formatTime(order.declinedAt)}</span>
                )}
              </p>
              {order.declinedReason && (
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                  Reason: {order.declinedReason}
                </p>
              )}
              {storePhone && (
                <a
                  href={`tel:${storePhone}`}
                  className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium"
                  style={{ color: "#ef4444" }}
                >
                  <Phone className="h-4 w-4" />
                  Call {storeName}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Cancelled banner */}
        {isCancelled && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{
              backgroundColor: "color-mix(in srgb, #ef4444 10%, var(--bg))",
              border: "1px solid #ef4444",
              borderRadius: "var(--radius)",
            }}
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm" style={{ color: "#ef4444" }}>
                {order.cancelledBy === "customer"
                  ? "You cancelled this order"
                  : order.status === "void"
                  ? "Order Voided"
                  : "Order Cancelled"}
                {order.cancelledAt && (
                  <span className="font-normal ml-2 opacity-75">{formatTime(order.cancelledAt)}</span>
                )}
              </p>
              {order.cancellationReason && (
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                  Reason: {order.cancellationReason}
                </p>
              )}
              {storePhone && order.cancelledBy !== "customer" && (
                <a
                  href={`tel:${storePhone}`}
                  className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium"
                  style={{ color: "#ef4444" }}
                >
                  <Phone className="h-4 w-4" />
                  Call {storeName}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Cancel order — available while pending */}
        {canCustomerCancel && (
          <div
            className="px-4 py-4 rounded-xl"
            style={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            {!showCancelForm ? (
              <button
                type="button"
                onClick={() => setShowCancelForm(true)}
                className="text-sm font-medium"
                style={{ color: "#ef4444" }}
              >
                Cancel this order
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  Why do you want to cancel?
                </p>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Changed my mind, ordered by mistake…"
                  className="w-full text-sm px-3 py-2 rounded-lg resize-none outline-none"
                  style={{
                    backgroundColor: "var(--bg)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
                {cancelError && (
                  <p className="text-xs" style={{ color: "#ef4444" }}>{cancelError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowCancelForm(false); setCancelReason(""); setCancelError(null); }}
                    disabled={isCancelling}
                    className="flex-1 text-sm font-medium py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  >
                    Keep Order
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isCancelling || !cancelReason.trim()}
                    className="flex-1 text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
                    style={{ backgroundColor: "#ef4444", color: "#ffffff" }}
                  >
                    {isCancelling ? "Cancelling…" : "Confirm Cancel"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status timeline */}
        {!isCancelled && !isDeclined && (
          <div
            className="px-4 py-5 rounded-xl"
            style={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            <h2
              className="text-sm font-semibold mb-4"
              style={{ color: "var(--text)" }}
            >
              Order Progress
            </h2>
            <div className="space-y-0">
              {timeline.map((step, i) => {
                const isLast = i === timeline.length - 1;
                return (
                  <div key={step.label} className="flex gap-3">
                    {/* Icon + line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0${!isTerminal && i === pulseIndex ? " animate-pulse" : ""}`}
                        style={{
                          backgroundColor: step.isDone
                            ? "var(--primary)"
                            : "var(--bg)",
                          color: step.isDone ? "#FFFFFF" : "var(--text)",
                          border: step.isDone
                            ? "none"
                            : "2px solid var(--border)",
                        }}
                      >
                        {step.icon}
                      </div>
                      {!isLast && (
                        <div
                          className="w-0.5 flex-1 min-h-6"
                          style={{
                            backgroundColor: step.isDone && timeline[i + 1]?.isDone
                              ? "var(--primary)"
                              : "var(--border)",
                          }}
                        />
                      )}
                    </div>
                    {/* Label + time */}
                    <div className="pb-6">
                      <p
                        className="text-sm font-medium"
                        style={{
                          color: "var(--text)",
                        }}
                      >
                        {step.label}
                      </p>
                      {step.timestamp && (
                        <p
                          className="text-xs mt-0.5 opacity-80"
                          style={{ color: "var(--text)" }}
                        >
                          {formatTime(step.timestamp)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Order summary */}
        <div
          className="px-4 py-5 rounded-xl"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
          }}
        >
          <h2
            className="text-sm font-semibold mb-3"
            style={{ color: "var(--text)" }}
          >
            Order Summary
          </h2>

          {/* Items */}
          <div className="space-y-2 mb-4">
            {order.items.map((item, i) => (
              <div
                key={i}
                className="flex justify-between text-sm"
                style={{ color: "var(--text)" }}
              >
                <span>
                  {item.quantity}x {item.name}
                </span>
                <span className="font-medium">${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div
            className="pt-3 space-y-1"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div
              className="flex justify-between text-sm"
              style={{ color: "var(--text)" }}
            >
              <span>Subtotal</span>
              <span>${order.subtotal.toFixed(2)}</span>
            </div>
            <div
              className="flex justify-between text-sm"
              style={{ color: "var(--text)" }}
            >
              <span>Tax{effectiveRate > 0 ? ` (${parseFloat((effectiveRate * 100).toFixed(2))}%)` : ""}</span>
              <span>${displayedTax.toFixed(2)}</span>
            </div>
            {order.tip > 0 && (
              <div
                className="flex justify-between text-sm"
                style={{ color: "var(--text)" }}
              >
                <span>Tip</span>
                <span>${order.tip.toFixed(2)}</span>
              </div>
            )}
            <div
              className="flex justify-between text-sm font-bold pt-2"
              style={{
                color: "var(--text)",
                borderTop: "1px solid var(--border)",
              }}
            >
              <span>Total</span>
              <span>${displayedTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Continue shopping + contact */}
        <div className="text-center pb-8 space-y-3">
          <Link
            href={storePath()}
            className="text-sm font-medium block"
            style={{ color: "var(--primary)" }}
          >
            Continue Shopping
          </Link>
          {storePhone && (
            <a
              href={`tel:${storePhone}`}
              className="inline-flex items-center gap-1.5 text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              <Phone className="h-4 w-4" />
              {storePhone}
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
