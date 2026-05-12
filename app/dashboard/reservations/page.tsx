"use client";

import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useReservations } from "@/app/dashboard/hooks/useReservations";
import { useSelectedLocation, useIsAllLocations } from "@/stores/location-store";
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
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _location = useSelectedLocation();
  const isAllLocations = useIsAllLocations();

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

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Reservations
            </h1>
          </div>
        </div>

        <Button
          size="lg"
          className="rounded-2xl px-5"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          New Reservation
        </Button>
      </div>

      <Card className="rounded-[24px] border-border/70 bg-background/95 py-0 shadow-sm">
        <CardContent className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-foreground">
              {displayDate}
            </div>
            <div className="text-sm text-muted-foreground">
              {active.length} active reservations
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-muted/30 p-2">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl"
                onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[170px] px-2 text-center font-medium text-foreground">
                {displayDate}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl"
                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-11 w-full rounded-2xl border-border/70 bg-background sm:w-44"
            />
          </div>
        </CardContent>
      </Card>

      {isAllLocations && (
        <Alert className="rounded-2xl border-border/70">
          <AlertDescription>
            Select a specific location to view reservations.
          </AlertDescription>
        </Alert>
      )}

      {!isAllLocations && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-44 animate-pulse rounded-[24px] border border-border/70 bg-muted/40"
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
            <Card className="rounded-[24px] border-border/70 bg-background/95 py-0 shadow-sm">
              <CardContent className="px-6 py-14 text-center text-muted-foreground">
                No reservations for this date.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {active.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">
                        Active Reservations
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Current and upcoming guests.
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-100 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100"
                    >
                      {active.length}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
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
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">
                        History
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Completed, cancelled, and no-show reservations.
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full border border-slate-500/20 bg-slate-500/10 px-3 py-1 text-sm text-slate-200 dark:border-slate-400/20 dark:bg-slate-400/10 dark:text-slate-200"
                    >
                      {history.length}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
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
      />

      <ReservationDetailSheet
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        reservation={selectedReservation}
        date={selectedDate}
      />
    </div>
  );
}
