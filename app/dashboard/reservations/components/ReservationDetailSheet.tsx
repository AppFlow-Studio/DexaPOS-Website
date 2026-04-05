"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Star, Loader2 } from "lucide-react";
import {
  useUpdateReservationStatus,
  useCancelReservation,
} from "@/app/dashboard/hooks/useReservations";
import CancelReservationDialog from "./CancelReservationDialog";
import type { Reservation } from "@/types/floor-plan";

const STATUS_COLORS: Record<Reservation["status"], string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  reminded: "bg-purple-100 text-purple-800",
  arrived: "bg-orange-100 text-orange-800",
  seated: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-600",
  no_show: "bg-red-100 text-red-800",
  cancelled: "bg-red-100 text-red-800",
};

type StatusTransition = {
  label: string;
  status: Reservation["status"];
};

const STATUS_TRANSITIONS: Partial<Record<Reservation["status"], StatusTransition[]>> = {
  pending: [{ label: "Confirm", status: "confirmed" }],
  confirmed: [{ label: "Mark Arrived", status: "arrived" }],
  reminded: [{ label: "Mark Arrived", status: "arrived" }],
  arrived: [
    { label: "Seat Guest", status: "seated" },
    { label: "Mark No-Show", status: "no_show" },
  ],
  seated: [{ label: "Complete", status: "completed" }],
};

const CANCELLABLE_STATUSES: Reservation["status"][] = [
  "pending",
  "confirmed",
  "reminded",
  "arrived",
];

interface ReservationDetailSheetProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

export default function ReservationDetailSheet({
  reservation,
  open,
  onOpenChange,
  date,
}: ReservationDetailSheetProps) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const updateStatus = useUpdateReservationStatus(date);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _cancelMutation = useCancelReservation(date);

  if (!reservation) return null;

  const transitions = STATUS_TRANSITIONS[reservation.status] ?? [];
  const canCancel = CANCELLABLE_STATUSES.includes(reservation.status);
  const isTerminal = ["completed", "cancelled", "no_show"].includes(reservation.status);

  const formatTimestamp = (iso?: string) => {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              {reservation.party_name}
              {reservation.is_vip && (
                <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  VIP
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription className="flex items-center gap-2">
              <Badge className={STATUS_COLORS[reservation.status]}>
                {reservation.status.replace("_", " ")}
              </Badge>
              <span className="text-xs text-muted-foreground">
                #{reservation.confirmation_number}
              </span>
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            {/* Core details */}
            <div className="space-y-2">
              <InfoRow label="Date" value={reservation.reservation_date} />
              <InfoRow label="Time" value={reservation.reservation_time} />
              <InfoRow label="Duration" value={`${reservation.duration_minutes} min`} />
              <InfoRow label="Party Size" value={String(reservation.party_size)} />
              <InfoRow label="Phone" value={reservation.phone} />
              <InfoRow label="Email" value={reservation.email} />
            </div>

            <Separator />

            {/* Tables & seating */}
            <div className="space-y-2">
              <InfoRow
                label="Assigned Tables"
                value={
                  reservation.assigned_tables && reservation.assigned_tables.length > 0
                    ? reservation.assigned_tables.join(", ")
                    : "None assigned"
                }
              />
              <InfoRow label="Preferred Section" value={reservation.preferred_section} />
              <InfoRow label="Seating Preference" value={reservation.seating_preference} />
            </div>

            {/* Timestamps */}
            {(reservation.arrived_at || reservation.seated_at) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <InfoRow label="Arrived At" value={formatTimestamp(reservation.arrived_at)} />
                  <InfoRow label="Seated At" value={formatTimestamp(reservation.seated_at)} />
                </div>
              </>
            )}

            {/* Notes */}
            {(reservation.notes || reservation.special_requests) && (
              <>
                <Separator />
                <div className="space-y-2">
                  {reservation.notes && (
                    <div className="text-sm">
                      <p className="text-muted-foreground mb-1">Notes</p>
                      <p>{reservation.notes}</p>
                    </div>
                  )}
                  {reservation.special_requests && (
                    <div className="text-sm">
                      <p className="text-muted-foreground mb-1">Special Requests</p>
                      <p>{reservation.special_requests}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Cancellation reason */}
            {reservation.cancellation_reason && (
              <>
                <Separator />
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Cancellation Reason</p>
                  <p>{reservation.cancellation_reason}</p>
                </div>
              </>
            )}

            <Separator />

            {/* Actions */}
            <div className="space-y-2">
              {isTerminal ? (
                <p className="text-sm text-muted-foreground">No further actions</p>
              ) : (
                <>
                  {transitions.map((t) => (
                    <Button
                      key={t.status}
                      className="w-full"
                      variant="outline"
                      disabled={updateStatus.isPending}
                      onClick={() =>
                        updateStatus.mutate({
                          reservationId: reservation.id,
                          status: t.status,
                        })
                      }
                    >
                      {updateStatus.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t.label}
                    </Button>
                  ))}
                  {canCancel && (
                    <Button
                      className="w-full"
                      variant="destructive"
                      onClick={() => setCancelDialogOpen(true)}
                    >
                      Cancel Reservation
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <CancelReservationDialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          setCancelDialogOpen(open);
          if (!open) onOpenChange(false);
        }}
        reservationId={reservation.id}
        partyName={reservation.party_name}
        date={date}
      />
    </>
  );
}
