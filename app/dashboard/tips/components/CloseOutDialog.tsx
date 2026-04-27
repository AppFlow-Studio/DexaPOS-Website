"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import type { TodayShift } from "@/app/dashboard/actions/tips";

interface CloseOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  undeclaredStaff: TodayShift[];
  onConfirm: () => void;
  isLoading: boolean;
  targetDate?: string;
}

export function CloseOutDialog({
  open,
  onOpenChange,
  undeclaredStaff,
  onConfirm,
  isLoading,
  targetDate,
}: CloseOutDialogProps) {
  const dateLabel = targetDate
    ? new Date(targetDate + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "today";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close Out & Calculate Tips</AlertDialogTitle>
          <AlertDialogDescription>
            This will calculate the final tip distribution for {dateLabel} based on
            current data. You can still edit or void it before approving.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {undeclaredStaff.length > 0 && (
          <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              <p className="text-sm font-medium mb-1">
                {undeclaredStaff.length} staff member{undeclaredStaff.length !== 1 ? "s" : ""} haven&apos;t
                declared cash tips:
              </p>
              <ul className="text-sm list-disc list-inside">
                {undeclaredStaff.map((s) => (
                  <li key={s.id}>{s.staffName}</li>
                ))}
              </ul>
              <p className="text-xs mt-1.5 text-amber-700 dark:text-amber-300">
                Their calculation will use $0 for cash tips. You can fix this
                via manual adjustment after.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-teal-500 hover:bg-teal-600 text-white"
          >
            {isLoading ? "Calculating..." : "Close Out"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
