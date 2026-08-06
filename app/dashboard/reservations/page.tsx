"use client";

import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  PageShell,
  PageHeader,
  Panel,
  StatRow,
  StatTile,
  LocationIndicator,
} from "@/components/dashboard/shell";
import { DatePopover } from "@/app/dashboard/settings/tips/components/DatePopover";
import {
  DEFAULT_RESERVATION_TIMEZONE,
  zonedToday,
} from "@/lib/reservations/local-time";
import { useReservations } from "@/app/dashboard/hooks/useReservations";
import { useGatedLocationId, useGatedLocation } from "@/stores/location-store";
import ReservationCard from "./components/ReservationCard";
import CreateReservationDialog from "./components/CreateReservationDialog";
import ReservationDetailSheet from "./components/ReservationDetailSheet";
import type { Reservation } from "@/types/floor-plan";

const ACTIVE_STATUSES: Reservation["status"][] = [
  "pending",
  "confirmed",
  "reminded",
  "arrived",
  "seated",
];
const HISTORY_STATUSES: Reservation["status"][] = [
  "completed",
  "cancelled",
  "no_show",
];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ReservationsPage() {
  // Gated resolver: single-active-location accounts (locked to 'all' scope)
  // resolve to their one location. Only treat as "all locations" when no
  // concrete location is resolvable (multi-location on 'all').
  const isAllLocations = !useGatedLocationId();
  const gatedLocation = useGatedLocation();

  // "Today" is the LOCATION's calendar date. Using the UTC date here opened the
  // page on tomorrow every evening for US venues, and then defaulted new
  // bookings to that wrong date.
  const timeZone = gatedLocation?.timezone ?? DEFAULT_RESERVATION_TIMEZONE;
  const today = zonedToday(timeZone);
  const [selectedDate, setSelectedDate] = useState(today);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  const { data: reservations, isLoading, error } =
    useReservations(selectedDate);

  const isToday = selectedDate === today;
  const displayDate = new Date(selectedDate + "T00:00:00").toLocaleDateString(
    undefined,
    {
      weekday: "long",
      month: "long",
      day: "numeric",
    }
  );

  const active = (reservations ?? []).filter((r) =>
    ACTIVE_STATUSES.includes(r.status)
  );
  const history = (reservations ?? []).filter((r) =>
    HISTORY_STATUSES.includes(r.status)
  );
  const covers = active.reduce((sum, r) => sum + (r.party_size ?? 0), 0);

  return (
    <PageShell>
      <PageHeader
        title="Reservations"
        subtitle="Track bookings, arrivals and seating for the selected day"
        indicator={
          <LocationIndicator
            isAllLocations={isAllLocations}
            locationName={gatedLocation?.name}
          />
        }
        actions={
          <Button
            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            onClick={() => setCreateDialogOpen(true)}
            disabled={isAllLocations}
          >
            <Plus className="h-4 w-4" />
            New Reservation
          </Button>
        }
      />

      <Panel className="border-0 rounded-[28px]">
        <div className="flex flex-col gap-4 px-6 pt-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
              {displayDate}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isToday ? "Today" : "Selected day"}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-1 rounded-full bg-muted/60 p-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous day"
                className="size-8 shrink-0 rounded-full"
                onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                className="h-8 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium"
                onClick={() => setSelectedDate(today)}
                disabled={isToday}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next day"
                className="size-8 shrink-0 rounded-full"
                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <DatePopover
              value={selectedDate}
              onChange={(value) => setSelectedDate(value ?? today)}
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm sm:w-48"
            />
          </div>
        </div>

        <div className="px-6 py-6">
          <StatRow
            columns={3}
            className="sm:divide-x-0 [&>*]:sm:pl-0"
          >
            <StatTile
              label="Active"
              value={active.length}
              meta="Pending through seated"
              isLoading={isLoading}
            />
            <StatTile
              label="Expected Covers"
              value={covers}
              meta="Guests across active bookings"
              isLoading={isLoading}
            />
            <StatTile
              label="History"
              value={history.length}
              meta="Completed, cancelled and no-shows"
              isLoading={isLoading}
            />
          </StatRow>
        </div>
      </Panel>

      {isAllLocations && (
        <Alert className="rounded-[20px] border-0 bg-muted/60">
          <AlertDescription>
            Select a specific location to view reservations.
          </AlertDescription>
        </Alert>
      )}

      {!isAllLocations && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-44 animate-pulse rounded-[28px] border-0 bg-muted/60"
                />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive" className="rounded-2xl">
              <AlertDescription>
                Failed to load reservations. Please try again.
              </AlertDescription>
            </Alert>
          ) : (reservations ?? []).length === 0 ? (
            <Panel className="border-0 rounded-[28px]">
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <p className="text-sm text-muted-foreground">
                  No reservations for this date.
                </p>
                <Button
                  variant="outline"
                  className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  New Reservation
                </Button>
              </div>
            </Panel>
          ) : (
            <div className="space-y-6">
              {active.length > 0 && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                        Active Reservations
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Current and upcoming guests.
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 tabular-nums dark:bg-emerald-900/20 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      {active.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">
                    {active.map((r) => (
                      <ReservationCard
                        key={r.id}
                        reservation={r}
                        onClick={() => {
                          setSelectedReservation(r);
                          setDetailSheetOpen(true);
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {history.length > 0 && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                        History
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Completed, cancelled, and no-show reservations.
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                      {history.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">
                    {history.map((r) => (
                      <ReservationCard
                        key={r.id}
                        reservation={r}
                        onClick={() => {
                          setSelectedReservation(r);
                          setDetailSheetOpen(true);
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}

      <CreateReservationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultDate={selectedDate}
        existingReservations={reservations ?? []}
        timeZone={timeZone}
      />

      <ReservationDetailSheet
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        reservation={selectedReservation}
        date={selectedDate}
      />
    </PageShell>
  );
}
