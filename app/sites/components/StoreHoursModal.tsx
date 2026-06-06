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
        <Dialog.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          data-slot="dialog-content"
          className="fixed left-1/2 top-1/2 z-[81] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden shadow-xl"
          style={{
            backgroundColor: "var(--bg, #ffffff)",
            borderRadius: "8px",
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-5 pb-4" style={{ borderBottom: "1px solid #f3f4f6" }}>
            <div>
              <Dialog.Title className="text-base font-semibold" style={{ color: "var(--fg, #111827)" }}>
                Store Hours
              </Dialog.Title>
              <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{storeName}</p>

              {/* MUI-style status chip — left border, flat */}
              {isStoreOpen === true ? (
                <span
                  className="inline-flex items-center mt-3 px-2.5 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: "#f0fdf4", borderLeft: "3px solid #22c55e", color: "#14532d" }}
                >
                  Open now
                </span>
              ) : isStoreOpen === false ? (
                <span
                  className="inline-flex items-center mt-3 px-2.5 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: "#fef2f2", borderLeft: "3px solid #ef4444", color: "#7f1d1d" }}
                >
                  Closed
                </span>
              ) : null}
            </div>

            <Dialog.Close asChild>
              <button className="p-1 transition-opacity hover:opacity-50" aria-label="Close">
                <X className="h-4 w-4" style={{ color: "#9CA3AF" }} />
              </button>
            </Dialog.Close>
          </div>

          {/* Weekly schedule */}
          <div className="px-2 py-3">
            {parsed ? (
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {DAYS.map((day, idx) => {
                    const schedule = parsed[day];
                    const isToday = idx === todayIndex;
                    const isEnabled = schedule ? (schedule.enabled ?? !schedule.closed) : false;
                    const is24h = schedule?.is24Hours;
                    const openTime = schedule?.from || schedule?.open;
                    const closeTime = schedule?.to || schedule?.close;

                    let hoursText = "Closed";
                    if (isEnabled) {
                      if (is24h) hoursText = "Open 24 hours";
                      else if (openTime && closeTime) hoursText = `${formatHourLabel(openTime)} – ${formatHourLabel(closeTime)}`;
                    }

                    return (
                      <tr
                        key={day}
                        style={isToday ? { borderLeft: "3px solid var(--primary, #6366f1)" } : { borderLeft: "3px solid transparent" }}
                      >
                        <td
                          className="px-3 py-2.5"
                          style={{ color: isToday ? "var(--primary, #6366f1)" : "#374151", fontWeight: isToday ? 600 : 400 }}
                        >
                          {DAY_LABELS[day]}
                          {isToday && (
                            <span className="ml-2 text-xs font-normal" style={{ color: "var(--primary, #6366f1)", opacity: 0.55 }}>
                              Today
                            </span>
                          )}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right"
                          style={{
                            color: isEnabled ? (isToday ? "var(--primary, #6366f1)" : "#111827") : "#d1d5db",
                            fontWeight: isToday ? 600 : 400,
                          }}
                        >
                          {hoursText}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-center py-6" style={{ color: "#9CA3AF" }}>
                Hours not available
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
