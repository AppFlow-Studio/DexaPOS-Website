/**
 * Parsing for `locations.business_hours`.
 *
 * The column holds three different shapes in the wild, and may arrive as a JSON
 * string rather than parsed JSON:
 *
 *   1. `[{ day, open, close, closed }]`
 *   2. `{ monday: { enabled, from, to, is24Hours } }`
 *   3. `{ monday: { open, close, closed } }` or `{ monday: "9am–5pm" }`
 *
 * This is the **third** implementation in the codebase — `InfoPanel.tsx` and
 * `OpenClosedIndicator.tsx` each carry their own, neither tested. It is written
 * here rather than imported because both existing copies live inside client
 * components with display logic baked in. Consolidating all three behind this
 * module is a worthwhile follow-up; this one at least has tests.
 *
 * Never throws. Unparseable hours render as no hours, which is what the rest of
 * the renderer expects.
 */

export interface DayHours {
  day: string;
  /** Display-ready, e.g. "9:00 AM – 5:00 PM", "Closed", "Open 24 hours". */
  hours: string;
  closed: boolean;
}

const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export function parseBusinessHours(raw: unknown): DayHours[] {
  const parsed = coerce(raw);
  if (!parsed) return [];

  if (Array.isArray(parsed)) return fromArray(parsed);
  if (typeof parsed === "object") return fromRecord(parsed as Record<string, unknown>);
  return [];
}

function coerce(raw: unknown): unknown {
  if (!raw) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function fromArray(entries: unknown[]): DayHours[] {
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const day = str(e.day) || str(e.name);
      if (!day) return null;

      if (e.closed === true) return { day: capitalize(day), hours: "Closed", closed: true };
      if (e.is24Hours === true) {
        return { day: capitalize(day), hours: "Open 24 hours", closed: false };
      }

      const explicit = str(e.hours);
      if (explicit) return { day: capitalize(day), hours: explicit, closed: false };

      const range = formatRange(e.open ?? e.from, e.close ?? e.to);
      return range
        ? { day: capitalize(day), hours: range, closed: false }
        : { day: capitalize(day), hours: "Closed", closed: true };
    })
    .filter((d): d is DayHours => d !== null);
}

function fromRecord(record: Record<string, unknown>): DayHours[] {
  return DAY_ORDER.map((day) => {
    const value = record[day] ?? record[capitalize(day)];
    if (value == null) return null;

    if (typeof value === "string") {
      return { day: capitalize(day), hours: value, closed: false };
    }
    if (typeof value !== "object") return null;

    const v = value as Record<string, unknown>;

    // Shape 2 uses `enabled` as the closed/open switch.
    if ("enabled" in v && v.enabled !== true) {
      return { day: capitalize(day), hours: "Closed", closed: true };
    }
    if (v.closed === true) return { day: capitalize(day), hours: "Closed", closed: true };
    if (v.is24Hours === true) {
      return { day: capitalize(day), hours: "Open 24 hours", closed: false };
    }

    const range = formatRange(v.open ?? v.from, v.close ?? v.to);
    return range
      ? { day: capitalize(day), hours: range, closed: false }
      : { day: capitalize(day), hours: "Closed", closed: true };
  }).filter((d): d is DayHours => d !== null);
}

/** Formats "09:00"/"17:30" as "9:00 AM – 5:30 PM". Returns null if unusable. */
export function formatRange(open: unknown, close: unknown): string | null {
  const from = formatTime(open);
  const to = formatTime(close);
  if (!from || !to) return null;
  return `${from} – ${to}`;
}

export function formatTime(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;

  const match = /^(\d{1,2}):(\d{2})/.exec(raw);
  // Already display-formatted ("9am", "noon") — pass through untouched rather
  // than mangling a merchant's own wording.
  if (!match) return raw;

  const hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour) || hour < 0 || hour > 24) return null;

  const suffix = hour >= 12 && hour < 24 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minute} ${suffix}`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function capitalize(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
}
