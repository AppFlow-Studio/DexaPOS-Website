"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { ChangeSummary, ShiftConflict } from "@/types/schedule";
import {
  Send,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface PublishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  scheduleType: "period" | "weekly";
  originalScheduleId?: string;
  onPublished?: () => void;
}

export function PublishModal({
  open,
  onOpenChange,
  scheduleId,
  scheduleType,
  originalScheduleId,
  onPublished,
}: PublishModalProps) {
  const router = useRouter();
  const {
    checkShiftConflicts,
    publishSchedule,
    compareSchedules,
    weeklySchedules,
    schedulePeriods,
  } = useScheduleStore();

  const conflicts: ShiftConflict[] = useMemo(
    () => (open ? checkShiftConflicts(scheduleId, scheduleType) : []),
    [open, scheduleId, scheduleType, checkShiftConflicts],
  );

  // Get current schedule for shift count
  const currentSchedule = useMemo(() => {
    if (scheduleType === "weekly") {
      return weeklySchedules.find((s) => s.id === scheduleId);
    }
    return schedulePeriods.find((s) => s.id === scheduleId);
  }, [scheduleId, scheduleType, weeklySchedules, schedulePeriods]);

  // Calculate change summary
  const changeSummary: ChangeSummary = useMemo(() => {
    if (!originalScheduleId) {
      return {
        added: currentSchedule?.shifts.length || 0,
        updated: 0,
        removed: 0,
      };
    }
    return compareSchedules(originalScheduleId, scheduleId);
  }, [originalScheduleId, scheduleId, compareSchedules, currentSchedule]);

  const handlePublish = () => {
    publishSchedule(scheduleId, scheduleType);
    toast.success("Schedule marked as published", {
      description: "This schedule is saved only in this browser. Employees have not been notified.",
    });
    onOpenChange(false);
    onPublished?.();
    // Navigate back to schedules dashboard
    router.push("/dashboard/schedules");
  };

  const hasConflicts = conflicts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Mark Schedule as Published
          </DialogTitle>
          <DialogDescription>
            Review changes before marking this schedule as published in this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Change Summary */}
          <div className="p-4 rounded-lg bg-muted/50 border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Added Shifts
              </span>
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-600 border-green-500/30"
              >
                <TrendingUp className="h-3 w-3 mr-1" />
                {changeSummary.added}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Updated Shifts
              </span>
              <Badge
                variant="outline"
                className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
              >
                <Minus className="h-3 w-3 mr-1" />
                {changeSummary.updated}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Removed Shifts
              </span>
              <Badge
                variant="outline"
                className="bg-red-500/10 text-red-600 border-red-500/30"
              >
                <TrendingDown className="h-3 w-3 mr-1" />
                {changeSummary.removed}
              </Badge>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">Conflicts</span>
              <Badge
                variant="outline"
                className={
                  hasConflicts
                    ? "bg-red-500/10 text-red-600 border-red-500/30"
                    : "bg-muted text-muted-foreground"
                }
              >
                {conflicts.length}
              </Badge>
            </div>
          </div>

          {/* Conflicts Warning */}
          {hasConflicts && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Conflicts Detected</span>
              </div>
              <ScrollArea className="h-24 rounded-md border bg-muted/30 p-3">
                <div className="space-y-2">
                  {conflicts.map((conflict, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Badge variant="destructive" className="text-xs">
                        {conflict.employeeName}
                      </Badge>
                      <span className="text-muted-foreground">
                        has a conflicting shift on {conflict.date}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Schedules are currently stored only in this browser. This action does not share shifts or notify employees.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {hasConflicts ? (
            <Button
              onClick={handlePublish}
              className="bg-yellow-600 hover:bg-yellow-700 text-white gap-2"
            >
              <AlertCircle className="h-4 w-4" />
              Mark as Published Anyway
            </Button>
          ) : (
            <Button onClick={handlePublish} className="gap-2">
              <Send className="h-4 w-4" />
              Mark as Published
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PublishModal;
