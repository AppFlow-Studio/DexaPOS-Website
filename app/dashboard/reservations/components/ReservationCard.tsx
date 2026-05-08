"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock3, Phone, Sparkles, Star, Users } from "lucide-react";
import type { Reservation } from "@/types/floor-plan";
import { formatPhoneForDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<Reservation["status"], string> = {
  pending: "border-amber-200 bg-amber-50/90 text-amber-900",
  confirmed: "border-sky-200 bg-sky-50/90 text-sky-900",
  reminded: "border-fuchsia-200 bg-fuchsia-50/90 text-fuchsia-900",
  arrived: "border-orange-200 bg-orange-50/90 text-orange-900",
  seated: "border-emerald-200 bg-emerald-50/90 text-emerald-900",
  completed: "border-slate-200 bg-slate-100/90 text-slate-700",
  no_show: "border-rose-200 bg-rose-50/90 text-rose-900",
  cancelled: "border-rose-200 bg-rose-50/90 text-rose-900",
};

const STATUS_ACCENTS: Record<Reservation["status"], string> = {
  pending: "from-amber-400 via-amber-300 to-transparent",
  confirmed: "from-sky-500 via-sky-300 to-transparent",
  reminded: "from-fuchsia-500 via-fuchsia-300 to-transparent",
  arrived: "from-orange-500 via-orange-300 to-transparent",
  seated: "from-emerald-500 via-emerald-300 to-transparent",
  completed: "from-slate-400 via-slate-300 to-transparent",
  no_show: "from-rose-500 via-rose-300 to-transparent",
  cancelled: "from-rose-500 via-rose-300 to-transparent",
};

interface ReservationCardProps {
  reservation: Reservation;
  onClick: () => void;
}

function formatStatus(status: Reservation["status"]) {
  if (status === "no_show") return "No-Show";
  return status.replace("_", " ");
}

export default function ReservationCard({
  reservation,
  onClick,
}: ReservationCardProps) {
  return (
    <Card
      className="group relative cursor-pointer overflow-hidden border-border/70 bg-background/95 transition-all duration-200 hover:-translate-y-1 hover:border-border hover:shadow-xl"
      onClick={onClick}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-80",
          STATUS_ACCENTS[reservation.status]
        )}
      />

      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">
                  {reservation.party_name}
                </h3>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {reservation.confirmation_number}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {reservation.is_vip && (
              <Badge className="border-amber-200 bg-amber-50 text-amber-900 shadow-sm">
                <Star className="mr-1 h-3 w-3 fill-current" />
                VIP
              </Badge>
            )}
            <Badge className={cn("border px-2.5 py-1 capitalize shadow-sm", STATUS_COLORS[reservation.status])}>
              {formatStatus(reservation.status)}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-muted/35 px-3 py-3">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              Schedule
            </div>
            <div className="text-sm font-medium text-foreground">
              {reservation.reservation_time}
            </div>
            <div className="text-xs text-muted-foreground">
              Duration {reservation.duration_minutes ?? 90} min
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/35 px-3 py-3">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Party
            </div>
            <div className="text-sm font-medium text-foreground">
              {reservation.party_size} {reservation.party_size === 1 ? "guest" : "guests"}
            </div>
            <div className="text-xs text-muted-foreground">
              {reservation.preferred_section || reservation.seating_preference || "Standard seating"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {reservation.phone && (
            <span className="inline-flex items-center gap-2 rounded-full bg-muted/45 px-3 py-1.5">
              <Phone className="h-3.5 w-3.5" />
              {formatPhoneForDisplay(reservation.phone)}
            </span>
          )}
          {reservation.seating_preference && (
            <span className="inline-flex items-center gap-2 rounded-full bg-muted/45 px-3 py-1.5">
              {reservation.seating_preference}
            </span>
          )}
        </div>

        {(reservation.notes || reservation.special_requests) && (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background px-3 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Note:</span>{" "}
            {reservation.special_requests || reservation.notes}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border/70 pt-1 text-xs text-muted-foreground">
          <span className="uppercase tracking-[0.16em]">Tap for details</span>
          <span className="capitalize">{reservation.source?.replaceAll("_", " ") || "dashboard"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
