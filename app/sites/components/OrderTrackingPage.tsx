"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Flame,
  Package,
  CircleCheck,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { useStorefrontPath } from "../lib/use-storefront-path";
import { getOrderTracking, type OrderTrackingData } from "../order-actions";

interface OrderTrackingPageProps {
  initialOrder: OrderTrackingData;
  orderId: string;
  slug: string;
  storeName: string;
  logoUrl?: string;
}

const TERMINAL_STATUSES = ["completed", "cancelled", "void"];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Order Placed",
  sent_to_kitchen: "Sent to Kitchen",
  preparing: "Preparing",
  ready: "Ready for Pickup",
  completed: "Completed",
  cancelled: "Cancelled",
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
  const steps: TimelineStep[] = [
    {
      label: "Order Placed",
      icon: <CheckCircle2 className="h-5 w-5" />,
      timestamp: order.createdAt,
      isActive: true,
      isDone: true,
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

function formatTime(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getEstimatedReadyTime(order: OrderTrackingData): string | null {
  if (order.readyAt || order.completedAt || order.cancelledAt) return null;

  const createdAt = new Date(order.createdAt);
  const readyAt = new Date(createdAt.getTime() + order.estimatedPrepMinutes * 60 * 1000);
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
}: OrderTrackingPageProps) {
  const [order, setOrder] = useState<OrderTrackingData>(initialOrder);
  const storePath = useStorefrontPath(slug);

  // Poll for updates every 10s
  useEffect(() => {
    if (TERMINAL_STATUSES.includes(order.status)) return;

    const interval = setInterval(async () => {
      const { data } = await getOrderTracking(orderId);
      if (data) setOrder(data);
    }, 10000);

    return () => clearInterval(interval);
  }, [orderId, order.status]);

  const isCancelled = order.status === "cancelled" || order.status === "void";
  const timeline = buildTimeline(order);
  const estimatedTime = getEstimatedReadyTime(order);
  const statusColor = STATUS_COLORS[order.status] ?? STATUS_COLORS.pending;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
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
            #{order.displayNumber}
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
        </div>

        {/* Estimated time card */}
        {estimatedTime && !isCancelled && (
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
            <p
              className="text-2xl font-bold"
              style={{ color: "var(--text)" }}
            >
              {estimatedTime}
            </p>
          </div>
        )}

        {/* Cancelled banner */}
        {isCancelled && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{
              backgroundColor: "color-mix(in srgb, #ef4444 10%, var(--bg))",
              border: "1px solid #ef4444",
              borderRadius: "var(--radius)",
            }}
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0" style={{ color: "#ef4444" }} />
            <div>
              <p className="font-semibold text-sm" style={{ color: "#ef4444" }}>
                Order {order.status === "void" ? "Voided" : "Cancelled"}
              </p>
              {order.cancelledAt && (
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {formatTime(order.cancelledAt)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Status timeline */}
        {!isCancelled && (
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
              style={{ color: "var(--text-secondary)" }}
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
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: step.isDone
                            ? "var(--primary)"
                            : "var(--bg)",
                          color: step.isDone ? "#FFFFFF" : "var(--text-secondary)",
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
                          color: step.isDone ? "var(--text)" : "var(--text-secondary)",
                        }}
                      >
                        {step.label}
                      </p>
                      {step.timestamp && (
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "var(--text-secondary)" }}
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
            style={{ color: "var(--text-secondary)" }}
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
              style={{ color: "var(--text-secondary)" }}
            >
              <span>Subtotal</span>
              <span>${order.subtotal.toFixed(2)}</span>
            </div>
            <div
              className="flex justify-between text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              <span>Tax</span>
              <span>${order.tax.toFixed(2)}</span>
            </div>
            {order.tip > 0 && (
              <div
                className="flex justify-between text-sm"
                style={{ color: "var(--text-secondary)" }}
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
              <span>${order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Continue shopping */}
        <div className="text-center pb-8">
          <Link
            href={storePath()}
            className="text-sm font-medium"
            style={{ color: "var(--primary)" }}
          >
            Continue Shopping
          </Link>
        </div>
      </main>
    </div>
  );
}
