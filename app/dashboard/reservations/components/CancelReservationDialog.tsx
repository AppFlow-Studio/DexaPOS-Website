"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useCancelReservation } from "@/app/dashboard/hooks/useReservations";

interface CancelReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  partyName: string;
  date: string;
}

export default function CancelReservationDialog({
  open,
  onOpenChange,
  reservationId,
  partyName,
  date,
}: CancelReservationDialogProps) {
  const [reason, setReason] = useState("");
  const mutation = useCancelReservation(date);

  const handleCancel = async () => {
    await mutation.mutateAsync({ reservationId, reason: reason || undefined });
    onOpenChange(false);
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Reservation</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Cancel reservation for <span className="font-medium">{partyName}</span>?
        </p>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={255}
          placeholder="Reason for cancellation (optional)"
          className="resize-none"
          rows={3}
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep Reservation
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel Reservation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
