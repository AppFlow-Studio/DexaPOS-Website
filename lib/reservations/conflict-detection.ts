import type { Reservation } from "@/types/floor-plan";

export const BLOCKING_STATUSES: Reservation["status"][] = [
  "pending",
  "confirmed",
  "reminded",
  "arrived",
  "seated",
];

/**
 * `HH:MM` (or `HH:MM:SS`) to minutes past midnight.
 *
 * Wall-clock arithmetic, deliberately — never `Date`. These values mean "7pm at
 * the restaurant" and carry no offset, so parsing them into an instant would
 * attach whichever timezone the runtime happens to be in. See `local-time.ts`
 * for the same reasoning applied to dates.
 */
export function minutesFromHHMM(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Minutes past midnight back to zero-padded `HH:MM`. */
export function hhmmFromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Do two half-open intervals `[start, end)` overlap?
 *
 * **Half-open is the whole point.** A table turning at 19:00 is free for a
 * 19:00 booking: the previous party's interval ends exactly where the next
 * begins, and treating that as a clash would lose a seating every turn. The
 * strict inequalities on both sides are what encode that.
 *
 * One definition shared by the conflict check and the availability engine, so
 * the grid a guest is shown and the guard that accepts their booking can never
 * disagree about what "occupied" means.
 */
export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface ConflictResult {
  conflictingReservation: Reservation;
  reason: string;
}

export function detectReservationConflict(
  proposed: {
    reservationDate: string; // YYYY-MM-DD
    reservationTime: string; // HH:MM
    durationMinutes: number;
    assignedTableIds?: string[];
  },
  existing: Reservation[],
): ConflictResult | null {
  const propStart = minutesFromHHMM(proposed.reservationTime);
  const propEnd = propStart + proposed.durationMinutes;

  for (const res of existing) {
    if (!BLOCKING_STATUSES.includes(res.status)) continue;
    if (res.reservation_date !== proposed.reservationDate) continue;
    if (
      proposed.assignedTableIds &&
      proposed.assignedTableIds.length > 0
    ) {
      const hasTableOverlap =
        res.assigned_table_ids?.some((id) =>
          proposed.assignedTableIds!.includes(id),
        ) ?? false;
      if (!hasTableOverlap) continue;
    } else {
      continue;
    }
    const resStart = minutesFromHHMM(res.reservation_time);
    const resEnd = resStart + (res.duration_minutes ?? 90);
    if (rangesOverlap(propStart, propEnd, resStart, resEnd)) {
      return {
        conflictingReservation: res,
        reason: `Table already reserved for "${res.party_name}" at ${res.reservation_time} (${res.status})`,
      };
    }
  }
  return null;
}
