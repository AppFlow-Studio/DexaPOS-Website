"use client";

import { Clock3, Globe, Phone, Star, Users } from "lucide-react";
import type { Reservation } from "@/types/floor-plan";
import { formatPhoneForDisplay } from "@/lib/phone";
import {
  isWebsiteReservation,
  reservationSourceLabel,
  WEBSITE_SOURCE_STYLE,
} from "@/lib/constants/reservation-source";
import {
  reservationStatusLabel,
  reservationStatusStyle,
} from "@/lib/constants/reservation-status";
import { cn } from "@/lib/utils";

interface ReservationCardProps {
  reservation: Reservation;
  onClick: () => void;
}

export default function ReservationCard({
  reservation,
  onClick,
}: ReservationCardProps) {
  const status = reservationStatusStyle(reservation.status);
  const fromWebsite = isWebsiteReservation(reservation.source);

  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 rounded-[28px] border-0 bg-card text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[1.0625rem] font-semibold tracking-[-0.01em]">
              {reservation.party_name}
            </h3>
            <p className="truncate text-[0.8125rem] text-muted-foreground tabular-nums">
              {reservation.confirmation_number}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {/*
            Before VIP and status, because it answers a different question:
            those say how the booking is going, this says the merchant has
            never spoken to this guest.
          */}
          {fromWebsite && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                WEBSITE_SOURCE_STYLE.bg,
                WEBSITE_SOURCE_STYLE.text
              )}
            >
              <Globe className="h-3 w-3" />
              Website
            </span>
          )}
          {reservation.is_vip && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              <Star className="h-3 w-3 fill-current" />
              VIP
            </span>
          )}
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
              status.bg,
              status.text
            )}
          >
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status.dot)}
            />
            {reservationStatusLabel(reservation.status)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 px-5 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock3 className="h-4 w-4 shrink-0" />
            <span className="truncate">Time</span>
          </div>
          <p className="mt-1 text-[1.75rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
            {reservation.reservation_time}
          </p>
          <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground tabular-nums">
            {reservation.duration_minutes ?? 90} min
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            <span className="truncate">Party</span>
          </div>
          <p className="mt-1 text-[1.75rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
            {reservation.party_size}
          </p>
          <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
            {reservation.preferred_section ||
              reservation.seating_preference ||
              "Standard seating"}
          </p>
        </div>
      </div>

      {reservation.phone && (
        <div className="px-5 pb-1">
          <span className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate tabular-nums">
              {formatPhoneForDisplay(reservation.phone)}
            </span>
          </span>
        </div>
      )}

      {(reservation.notes || reservation.special_requests) && (
        <div className="px-5 pb-2 pt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Note:</span>{" "}
          {reservation.special_requests || reservation.notes}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-5 pb-5 pt-2 text-[0.8125rem] text-muted-foreground">
        <span className="truncate">Tap for details</span>
        {/* Not repeated when the badge above already says it. */}
        {!fromWebsite && (
          <span className="shrink-0">{reservationSourceLabel(reservation.source)}</span>
        )}
      </div>
    </button>
  );
}
