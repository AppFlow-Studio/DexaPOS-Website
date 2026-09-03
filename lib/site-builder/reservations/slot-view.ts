/**
 * How a day's free times are presented to a guest: grouped by service, and
 * narrowable to a part of the evening.
 *
 * **Pure list operations, deliberately kept out of the widget.** They are the
 * only part of the grid with real edge cases — overlapping services, two
 * services sharing a name, a filter that matches nothing — and
 * `ReservationWidget` has no test of its own. Here they are unit-testable
 * without mounting anything.
 *
 * Nothing in this module talks to the network or to Supabase. It re-shapes a
 * list the widget has already loaded, which is why filtering by time needs no
 * RPC change and no extra round trip.
 */

import type { AvailabilitySlot } from "./protocol";

/** One run of times belonging to a single named service. */
export interface SlotGroup {
  /** The service period the run came from. */
  id: string;
  /** The merchant's own name for the service. Empty when they gave none. */
  name: string;
  slots: AvailabilitySlot[];
}

/**
 * Splits a day's slots into one group per service period.
 *
 * **Grouped by period id, not by clock time.** Bucketing into "lunch" and
 * "dinner" by an hour threshold would be guessing at something the merchant has
 * already told us: `reservation_service_periods` is them naming their own
 * services, and `get_public_reservation_availability` returns that name on
 * every row.
 *
 * **Order comes from first appearance**, which is free: the RPC ends
 * `ORDER BY 1` on slot time, so the period a day's earliest slot belongs to is
 * also the one a guest should see first. A `Map` preserves insertion order, so
 * no second sort is needed.
 *
 * **Interleaving is why this cannot be a single pass over adjacent runs.** Two
 * active periods may cover the same clock time — a bar service alongside
 * dinner — and `ORDER BY slot_time` then alternates between them,
 * 17:00 Dinner, 17:00 Bar, 17:15 Dinner, and so on. Collecting adjacent slots
 * would turn that into dozens of one-slot groups. Keying on the period gathers
 * each service wherever its slots landed.
 *
 * Two periods sharing a NAME are merged, because a merchant with separate
 * weekday and weekend "Dinner" rows that both match one date would otherwise
 * get two identical headings, which reads as a bug rather than a service.
 */
export function groupSlotsByService(slots: AvailabilitySlot[]): SlotGroup[] {
  const byPeriod = new Map<string, SlotGroup>();

  for (const slot of slots) {
    const existing = byPeriod.get(slot.servicePeriodId);
    if (existing) {
      existing.slots.push(slot);
      continue;
    }
    byPeriod.set(slot.servicePeriodId, {
      id: slot.servicePeriodId,
      name: (slot.serviceName ?? "").trim(),
      slots: [slot],
    });
  }

  const groups: SlotGroup[] = [];
  const byName = new Map<string, SlotGroup>();

  for (const group of byPeriod.values()) {
    // Only named services merge. Two unnamed periods are two different things
    // we have nothing to call, so folding them together would invent a claim.
    if (group.name) {
      const sameName = byName.get(group.name);
      if (sameName) {
        sameName.slots.push(...group.slots);
        sameName.slots.sort((a, b) => a.time.localeCompare(b.time));
        continue;
      }
      byName.set(group.name, group);
    }
    groups.push(group);
  }

  return groups;
}

/**
 * The hours a guest can usefully narrow to: those that actually have a table.
 *
 * SevenRooms offers a fixed clock — every half hour from 6:00 AM — at a
 * restaurant whose first seating is 12:45 PM, so most of their menu leads
 * nowhere. Deriving the options from the loaded slots means every entry returns
 * something, and a lunch-only day offers lunch-only hours without anyone
 * configuring that.
 *
 * Hours rather than half hours because the filter matches a window around the
 * choice, not an exact time — see `filterSlotsNearHour`.
 */
export function availableHours(slots: AvailabilitySlot[]): number[] {
  const hours = new Set<number>();
  for (const slot of slots) {
    const hour = Number(slot.time.slice(0, 2));
    if (Number.isFinite(hour)) hours.add(hour);
  }
  return [...hours].sort((a, b) => a - b);
}

/** How far either side of the chosen hour still counts as "around" it. */
export const TIME_WINDOW_MIN = 60;

/**
 * Slots within `windowMin` either side of `hour:00`.
 *
 * **A window, not "this hour onward".** A guest picking 7 PM means "we want to
 * eat around seven", and answering with 7:00 through closing is a truncation
 * rather than a filter — it hides the 6:45 table that suited them and leaves
 * the 9:30 one they will never take. An hour either side of a 15-minute grid is
 * about nine times, which is a list you can read at a glance.
 *
 * Nothing here reports that the filter hid everything; the widget checks for an
 * empty result and offers to clear it, because silently showing an empty grid
 * would be the same false zero the large-party and load-failure paths already
 * exist to prevent.
 */
export function filterSlotsNearHour(
  slots: AvailabilitySlot[],
  hour: number,
  windowMin: number = TIME_WINDOW_MIN,
): AvailabilitySlot[] {
  const anchor = hour * 60;
  return slots.filter((slot) => {
    const [h, m] = slot.time.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
    return Math.abs(h * 60 + m - anchor) <= windowMin;
  });
}

/** `19` → `7 PM`. The label for one entry in the time filter. */
export function prettyHour(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${suffix}`;
}
