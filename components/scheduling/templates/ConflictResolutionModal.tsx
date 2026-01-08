import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { ConflictDetail } from "@/lib/scheduling-rules";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: ConflictDetail[];
  onKeepExisting: () => void;
  onOverride: () => void;
}

export function ConflictResolutionModal({
  isOpen,
  onClose,
  conflicts,
  onKeepExisting,
  onOverride,
}: ConflictResolutionModalProps) {
  const conflictCount = conflicts.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-yellow-500 mb-2">
            <ShieldAlert className="h-6 w-6" />
            <DialogTitle className="text-xl text-foreground">
              Template Conflicts Detected
            </DialogTitle>
          </div>
          <DialogDescription className="text-base">
            There are{" "}
            <span className="font-bold text-foreground">{conflictCount}</span>{" "}
            shifts in the template that conflict with existing shifts in this
            schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 rounded-md p-3 border my-2">
          <p className="text-sm text-muted-foreground mb-2 font-medium flex items-center gap-2">
            <Info className="w-4 h-4" />
            Conflict Summary:
          </p>
          <ScrollArea className="h-[120px] rounded-md border bg-background p-2">
            <ul className="space-y-2">
              {conflicts.map((c, i) => (
                <li
                  key={i}
                  className="text-xs flex flex-col gap-0.5 pb-2 border-b last:border-0 border-dashed"
                >
                  <span className="font-semibold text-foreground">
                    {c.templateShift.dayOfWeek === 0
                      ? "Sunday"
                      : c.templateShift.dayOfWeek === 1
                      ? "Monday"
                      : "Day " + c.templateShift.dayOfWeek}
                    {" • "}
                    {format(
                      c.conflictingWith?.id ? new Date() : new Date(),
                      "HH:mm"
                    )}
                    {/* Note: Real dates are tricky without context, simplified for now */}
                    {c.templateShift.role} Shift
                  </span>
                  <span className="text-muted-foreground">
                    Overlaps with existing:{" "}
                    <span className="text-red-500">
                      {(c.conflictingWith as any)?.role || "Shift"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0 mt-4">
          <Button
            onClick={onKeepExisting}
            variant="secondary"
            className="w-full justify-between group"
          >
            <span>Keep Existing Shifts</span>
            <span className="text-xs text-muted-foreground group-hover:text-foreground/80">
              (Skip conflicting template shifts)
            </span>
          </Button>

          <Button
            onClick={onOverride}
            variant="destructive"
            className="w-full justify-between group"
          >
            <span>Override Existing Shifts</span>
            <span className="text-xs text-white/80">
              (Replace conflicts with template)
            </span>
          </Button>

          <Button onClick={onClose} variant="ghost" className="w-full mt-2">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
