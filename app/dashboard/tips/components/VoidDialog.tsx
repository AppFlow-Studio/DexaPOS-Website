"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface VoidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  isLoading: boolean;
}

export function VoidDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: VoidDialogProps) {
  const [reason, setReason] = useState("");

  const isValid = reason.trim().length >= 10;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(reason.trim());
      setReason("");
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason("");
        onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void This Distribution?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently mark the distribution as voided. It cannot be
            undone. A reason is required for the audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="void-reason">Reason *</Label>
          <Textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this distribution being voided? (min 10 characters)"
            rows={3}
            className="border-0 bg-muted/40 text-muted-foreground placeholder:text-muted-foreground/60"
          />
          {reason.length > 0 && !isValid && (
            <p className="text-xs text-destructive">
              Reason must be at least 10 characters ({reason.trim().length}/10)
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isValid || isLoading}
          >
            {isLoading ? "Voiding..." : "Void Distribution"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
