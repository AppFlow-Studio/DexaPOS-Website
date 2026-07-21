// ============================================================================
// Shared 86 / out-of-stock (snooze) formatting helpers.
// ----------------------------------------------------------------------------
// One definition of "is this snooze active right now" and how to label it, so
// the item-editor control, the menus-page row badge/toggle, and the modifier
// toggle all read the same. snoozed_until contract: null = live, "infinity" =
// until manually restored, ISO string = timed.
// ============================================================================

import { formatDistanceToNow } from "date-fns";

/** True while a snooze is still in effect (future timestamp or "infinity"). */
export function isActivelySnoozed(snoozedUntil: string | null | undefined): boolean {
  if (!snoozedUntil) return false;
  if (snoozedUntil === "infinity") return true;
  const t = new Date(snoozedUntil).getTime();
  return Number.isFinite(t) && t > Date.now();
}

/** Full sentence for a banner, e.g. "Out of stock — back in about 1 hour". */
export function snoozeLabel(snoozedUntil: string): string {
  if (snoozedUntil === "infinity") return "Out of stock — until you restore it";
  const t = new Date(snoozedUntil).getTime();
  if (!Number.isFinite(t)) return "Out of stock — until you restore it";
  return `Out of stock — back ${formatDistanceToNow(new Date(snoozedUntil), {
    addSuffix: true,
  })}`;
}

/** Compact label for a badge, e.g. "Out of stock · back in 1 hour". */
export function snoozeShortLabel(snoozedUntil: string): string {
  if (snoozedUntil === "infinity") return "Out of stock";
  const t = new Date(snoozedUntil).getTime();
  if (!Number.isFinite(t)) return "Out of stock";
  return `Out of stock · back ${formatDistanceToNow(new Date(snoozedUntil), {
    addSuffix: true,
  })}`;
}
