// Shared receipt formatters — used by every web-rendered receipt surface
// (dashboard ReceiptModal, guest /receipts page) and by the upcoming email
// receipt template. Keep all receipt-display formatting in one place so the
// surfaces can never drift in phone shape or date format.

import { DEFAULT_REPORTING_TIMEZONE } from "@/lib/reporting/date-range";

/**
 * Format a US phone number as `(718) 887-0100`.
 *
 * Accepts whatever shape is stored on `locations.phone` (digits, dashes,
 * `+1…`, etc.). Falls back to the raw input when it isn't a recognizable
 * 10- or 11-digit US number so we never mangle international numbers.
 */
export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const national =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return raw.trim();
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/**
 * Format an order timestamp in the store's local timezone, one consistent
 * format for both the receipt body and footer. Never render-time, never
 * browser-local, never raw UTC.
 *
 * @param iso       order timestamp (ISO string from the DB)
 * @param timeZone  IANA tz (location.timezone); falls back to America/New_York
 *                  to match the shipped global date-picker convention.
 */
export function formatReceiptDateTime(
  iso: string | null | undefined,
  timeZone?: string | null
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || DEFAULT_REPORTING_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
