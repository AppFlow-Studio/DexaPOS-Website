import type { Reservation } from "@/types/floor-plan";

export const BLOCKING_STATUSES: Reservation["status"][] = [
  "pending",
  "confirmed",
  "reminded",
  "arrived",
  "seated",
];

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
  const [propHour, propMin] = proposed.reservationTime.split(":").map(Number);
  const propStart = propHour * 60 + propMin;
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
    const [resHour, resMin] = res.reservation_time.split(":").map(Number);
    const resStart = resHour * 60 + resMin;
    const resEnd = resStart + (res.duration_minutes ?? 90);
    if (propStart < resEnd && resStart < propEnd) {
      return {
        conflictingReservation: res,
        reason: `Table already reserved for "${res.party_name}" at ${res.reservation_time} (${res.status})`,
      };
    }
  }
  return null;
}
