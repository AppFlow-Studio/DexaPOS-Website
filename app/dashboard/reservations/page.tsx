"use client";

import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
const HISTORY_STATUSES: Reservation["status"][] = ["completed", "cancelled", "no_show"];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export default function ReservationsPage() {
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _location = useSelectedLocation();
  const isAllLocations = useIsAllLocations();

  const { data: reservations, isLoading, error } = useReservations(selectedDate);

  const isToday = selectedDate === today;
  const displayDate = new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const active = (reservations ?? []).filter((r) => ACTIVE_STATUSES.includes(r.status));
  const history = (reservations ?? []).filter((r) => HISTORY_STATUSES.includes(r.status));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reservations</h1>
          <p className="text-muted-foreground">Manage guest reservations</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Reservation
        </Button>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedDate(addDays(selectedDate, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-center">
          <span className="font-medium">
            {isToday ? "Today — " : ""}
            {displayDate}
          </span>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-40"
        />
      </div>

      {/* Location guard */}
      {isAllLocations && (
        <Alert>
          <AlertDescription>
            Select a specific location to view reservations.
          </AlertDescription>
        </Alert>
      )}

      {/* Content */}
      {!isAllLocations && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load reservations. Please try again.
              </AlertDescription>
            </Alert>
          ) : (reservations ?? []).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No reservations for this date.
            </div>
          ) : (
            <div className="space-y-6">
              {active.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Active ({active.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                </div>
              )}

              {history.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    History ({history.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                </div>
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
