"use client";

import { CheckCircle2, Clock, CalendarClock } from "lucide-react";
import Link from "next/link";
import { useStorefrontPath } from "../../lib/use-storefront-path";
import { formatScheduledTime } from "../../lib/format-scheduled-time";
import { CallServerCard } from "../CallServerCard";

interface SnapshotItem {
  name: string;
  quantity: number;
  price: number;
  modifiers: Array<{ name: string; price: number }>;
}

interface OrderConfirmationProps {
  displayNumber?: string;
  estimatedTime?: number;
  orderId?: string;
  slug: string;
  isPending?: boolean;
  requestedTime?: string | null;
  locationTimezone?: string;
  snapshotItems?: SnapshotItem[];
  snapshotSubtotal?: number;
  snapshotTax?: number;
  snapshotTip?: number;
  snapshotDiscount?: number;
  snapshotDeliveryFee?: number;
  snapshotTotal?: number;
  snapshotOrderType?: "pickup" | "delivery";
  snapshotCardType?: string | null;
  snapshotCardLast4?: string | null;
  snapshotPayCash?: boolean;
}

const STATUS_STEPS = ["Placed", "Accepted", "Preparing", "Ready", "Picked up"] as const;

const CARD_BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  master_card: "Mastercard",
  amex: "Amex",
  american_express: "Amex",
  discover: "Discover",
};

function cardBrandLabel(cardType?: string | null): string {
  if (!cardType) return "Card";
  const key = cardType.trim().toLowerCase();
  return CARD_BRAND_LABELS[key] ?? cardType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function etaLabel(estimatedTime: number, requestedTime?: string | null, locationTimezone?: string): string {
  // Scheduled order
  if (requestedTime && locationTimezone) return "";
  // ASAP — compute wall-clock time
  const readyAt = new Date(Date.now() + estimatedTime * 60000);
  const timeStr = readyAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Ready by ~${timeStr}`;
}

export function OrderConfirmation({
  displayNumber,
  estimatedTime,
  orderId,
  slug,
  isPending,
  requestedTime,
  locationTimezone,
  snapshotItems = [],
  snapshotSubtotal = 0,
  snapshotTax = 0,
  snapshotTip = 0,
  snapshotDiscount = 0,
  snapshotDeliveryFee = 0,
  snapshotTotal = 0,
  snapshotOrderType,
  snapshotCardType,
  snapshotCardLast4,
  snapshotPayCash,
}: OrderConfirmationProps) {
  const storePath = useStorefrontPath(slug);
  const scheduledLabel = requestedTime && locationTimezone
    ? formatScheduledTime(requestedTime, locationTimezone)
    : null;

  // Current step index for status strip: Placed (0) while pending, Accepted (1) once confirmed
  const currentStepIndex = isPending ? 0 : 1;

  const paymentLine = snapshotPayCash
    ? "Cash in store"
    : snapshotCardLast4
      ? `${cardBrandLabel(snapshotCardType)} ···· ${snapshotCardLast4}`
      : snapshotCardType
        ? cardBrandLabel(snapshotCardType)
        : null;

  const etaText = !isPending && !scheduledLabel && estimatedTime
    ? etaLabel(estimatedTime, requestedTime, locationTimezone)
    : null;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-white py-10 px-4">
      <div className="max-w-lg mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <CheckCircle2
              className="w-14 h-14"
              style={{ color: "#16a34a" }}
              strokeWidth={1.75}
            />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#111827" }}>
            Order Confirmed
          </h1>
          {displayNumber && (
            <p className="text-base font-medium" style={{ color: "#6b7280" }}>
              Order #{displayNumber}
            </p>
          )}
        </div>

        {/* ── ETA / Scheduled band ── */}
        {scheduledLabel ? (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }}
          >
            <CalendarClock className="h-5 w-5 flex-shrink-0" style={{ color: "var(--primary)" }} />
            <div>
              <p className="text-xs font-medium" style={{ color: "#6b7280" }}>Scheduled for</p>
              <p className="text-sm font-semibold" style={{ color: "#111827" }}>{scheduledLabel}</p>
            </div>
          </div>
        ) : isPending ? (
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ backgroundColor: "#fffbeb", borderLeft: "4px solid #f59e0b" }}
          >
            <Clock className="h-4 w-4 flex-shrink-0 animate-pulse" style={{ color: "#f59e0b" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#78350f" }}>Awaiting restaurant acceptance</p>
              <p className="text-xs mt-0.5" style={{ color: "#92400e", opacity: 0.75 }}>Usually within 1 minute</p>
            </div>
          </div>
        ) : etaText ? (
          <p className="text-center text-sm font-medium" style={{ color: "#6b7280" }}>
            {etaText}
          </p>
        ) : null}

        {/* ── Status strip ── */}
        <div
          className="rounded-xl px-4 py-4"
          style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}
        >
          <div className="flex items-center justify-between gap-1">
            {STATUS_STEPS.map((label, i) => {
              const isCompleted = i < currentStepIndex;
              const isCurrent = i === currentStepIndex;
              return (
                <div key={label} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: isCompleted
                        ? "#16a34a"
                        : isCurrent
                          ? "var(--primary)"
                          : "#d1d5db",
                    }}
                  />
                  <span
                    className="text-[10px] font-medium text-center leading-tight"
                    style={{
                      color: isCompleted ? "#16a34a" : isCurrent ? "var(--primary)" : "#9ca3af",
                    }}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Horizontal connector bar */}
          <div className="relative mt-1 -mx-1">
            <div className="h-0.5 w-full rounded-full" style={{ backgroundColor: "#e5e7eb" }} />
            <div
              className="absolute top-0 left-0 h-0.5 rounded-full transition-all"
              style={{
                backgroundColor: "var(--primary)",
                width: `${(currentStepIndex / (STATUS_STEPS.length - 1)) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* ── Receipt block ── */}
        {snapshotItems.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}
          >
            {/* Items */}
            <div className="px-5 pt-5 pb-3 space-y-3">
              {snapshotItems.map((item, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="text-sm font-medium" style={{ color: "#111827" }}>
                      <span className="font-normal" style={{ color: "#6b7280" }}>{item.quantity}×&nbsp;</span>
                      {item.name}
                    </span>
                    <span className="text-sm font-medium flex-shrink-0" style={{ color: "#111827" }}>
                      {fmt(item.price)}
                    </span>
                  </div>
                  {item.modifiers.map((m, j) => (
                    <p key={j} className="text-xs pl-5" style={{ color: "#9ca3af" }}>
                      {m.name}
                    </p>
                  ))}
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid #e5e7eb" }} />

            {/* Totals */}
            <div className="px-5 py-3 space-y-1.5">
              {snapshotSubtotal > 0 && (
                <div className="flex justify-between text-sm" style={{ color: "#6b7280" }}>
                  <span>Subtotal</span>
                  <span>{fmt(snapshotSubtotal)}</span>
                </div>
              )}
              {snapshotDiscount > 0 && (
                <div className="flex justify-between text-sm font-medium" style={{ color: "#16a34a" }}>
                  <span>Discount</span>
                  <span>−{fmt(snapshotDiscount)}</span>
                </div>
              )}
              {snapshotDeliveryFee > 0 && (
                <div className="flex justify-between text-sm" style={{ color: "#6b7280" }}>
                  <span>Delivery</span>
                  <span>{fmt(snapshotDeliveryFee)}</span>
                </div>
              )}
              {snapshotTax > 0 && (
                <div className="flex justify-between text-sm" style={{ color: "#6b7280" }}>
                  <span>Tax</span>
                  <span>{fmt(snapshotTax)}</span>
                </div>
              )}
              {snapshotTip > 0 && (
                <div className="flex justify-between text-sm" style={{ color: "#6b7280" }}>
                  <span>Tip</span>
                  <span>{fmt(snapshotTip)}</span>
                </div>
              )}
            </div>

            {/* Total row */}
            <div
              className="px-5 py-3 flex justify-between items-center"
              style={{ borderTop: "1px solid #e5e7eb" }}
            >
              <span className="font-bold text-base" style={{ color: "#111827" }}>Total</span>
              <span className="font-bold text-lg" style={{ color: "#111827" }}>{fmt(snapshotTotal)}</span>
            </div>

            {/* Payment method */}
            {paymentLine && (
              <div
                className="px-5 py-3 flex justify-between items-center"
                style={{ borderTop: "1px solid #e5e7eb", backgroundColor: "#f9fafb" }}
              >
                <span className="text-sm" style={{ color: "#6b7280" }}>Paid</span>
                <span className="text-sm font-medium" style={{ color: "#111827" }}>{paymentLine}</span>
              </div>
            )}
          </div>
        )}

        <CallServerCard />


        {/* ── Footer CTAs ── */}
        <div className="flex flex-col gap-3 pt-1">
          {orderId && (
            <Link
              href={storePath(`/order/${orderId}`)}
              className="w-full py-3.5 font-bold text-base text-center rounded-lg transition-opacity hover:opacity-90"
              style={{
                backgroundColor: "var(--primary)",
                color: "#ffffff",
                borderRadius: "8px",
              }}
            >
              View Live Status
            </Link>
          )}
          <Link
            href={storePath()}
            className="w-full py-3.5 font-semibold text-base text-center rounded-lg transition-colors"
            style={{
              backgroundColor: "#ffffff",
              color: "var(--primary)",
              border: "1.5px solid var(--primary)",
              borderRadius: "8px",
            }}
          >
            Continue Shopping
          </Link>
        </div>

      </div>
    </div>
  );
}
