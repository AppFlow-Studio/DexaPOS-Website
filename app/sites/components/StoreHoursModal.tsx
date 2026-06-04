"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const DAY_LABELS: Record<string, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

function formatHourLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  const displayM = (m || 0).toString().padStart(2, "0");
  return `${displayH}:${displayM} ${period}`;
}

function parseHours(businessHours: any): Record<string, any> | null {
  if (!businessHours) return null;
  if (typeof businessHours === "string") {
    try {
      return JSON.parse(businessHours);
    } catch {
      return null;
    }
  }
  return businessHours;
}

function getTodayIndex(timezone?: string | null): number {
  if (timezone) {
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
      });
      const parts = fmt.formatToParts(new Date());
      const short = parts.find((p) => p.type === "weekday")?.value?.toLowerCase();
      const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      if (short && short in map) return map[short];
    } catch {}
  }
  return new Date().getDay();
}

interface StoreHoursModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessHours: any;
  timezone?: string | null;
  storeName: string;
  isStoreOpen?: boolean | null;
}

export function StoreHoursModal({
  open,
  onOpenChange,
  businessHours,
  timezone,
  storeName,
  isStoreOpen,
}: StoreHoursModalProps) {
  const parsed = parseHours(businessHours);
  const todayIndex = getTodayIndex(timezone);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[81] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          style={{ backgroundColor: "var(--bg, #ffffff)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <Dialog.Title
                className="text-base font-semibold"
                style={{ color: "var(--fg, #111827)" }}
              >
                Store Hours
              </Dialog.Title>
              <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                {storeName}
              </p>
            </div>
            <Dialog.Close asChild>
              <button
                className="rounded-full p-1.5 transition-colors hover:bg-black/5"
                aria-label="Close"
              >
                <X className="h-4 w-4" style={{ color: "#6B7280" }} />
              </button>
            </Dialog.Close>
          </div>

          {/* Status badge */}
          <div className="mb-5">
            {isStoreOpen === true ? (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
                style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                Open now
              </span>
            ) : isStoreOpen === false ? (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
                style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                Closed
              </span>
            ) : null}
          </div>

          {/* Weekly schedule */}
          {parsed ? (
            <div className="space-y-2">
              {DAYS.map((day, idx) => {
                const schedule = parsed[day];
                const isToday = idx === todayIndex;
                const isEnabled = schedule ? (schedule.enabled ?? !schedule.closed) : false;
                const is24h = schedule?.is24Hours;
                const openTime = schedule?.from || schedule?.open;
                const closeTime = schedule?.to || schedule?.close;

                let hoursText = "Closed";
                if (isEnabled) {
                  if (is24h) {
                    hoursText = "Open 24 hours";
                  } else if (openTime && closeTime) {
                    hoursText = `${formatHourLabel(openTime)} – ${formatHourLabel(closeTime)}`;
                  }
                }

                return (
                  <div
                    key={day}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg text-sm"
                    style={
                      isToday
                        ? {
                            backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)",
                            fontWeight: 600,
                          }
                        : {}
                    }
                  >
                    <span
                      style={{
                        color: isToday ? "var(--primary)" : "#374151",
                        fontWeight: isToday ? 600 : 400,
                      }}
                    >
                      {DAY_LABELS[day]}
                      {isToday && (
                        <span
                          className="ml-1.5 text-xs font-normal"
                          style={{ color: "var(--primary)", opacity: 0.7 }}
                        >
                          Today
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        color: isEnabled
                          ? isToday
                            ? "var(--primary)"
                            : "#374151"
                          : "#9CA3AF",
                        fontWeight: isToday ? 600 : 400,
                      }}
                    >
                      {hoursText}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-center py-4" style={{ color: "#9CA3AF" }}>
              Hours not available
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
