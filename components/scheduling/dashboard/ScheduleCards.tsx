"use client";

import { useScheduleStore } from "@/stores/useScheduleStore";
import { WeeklySchedule, SchedulePeriod } from "@/types/schedule";
import { format, isBefore, startOfDay, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Calendar, Clock, GitBranch } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function WeeklyScheduleCard({
  schedule,
  onEdit,
  onDelete,
}: {
  schedule: WeeklySchedule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const { findOrCreateDraft, compareSchedules } = useScheduleStore();

  const isExpired = isBefore(
    parseISO(schedule.endDate),
    startOfDay(new Date())
  );

  const isDraftEdit = schedule.status === "draft-edit";
  // Check if draft has actual changes
  const hasChanges =
    isDraftEdit && schedule.originalScheduleId
      ? (() => {
          const changes = compareSchedules(
            schedule.originalScheduleId,
            schedule.id
          );
          return (
            changes.added > 0 || changes.updated > 0 || changes.removed > 0
          );
        })()
      : false;

  const handleClick = () => {
    // If draft or draft-edit, navigate directly
    if (schedule.status === "draft" || schedule.status === "draft-edit") {
      router.push(`/dashboard/schedules/${schedule.id}`);
    } else {
      // If published, create/find a draft copy and navigate to it
      const draftId = findOrCreateDraft(schedule.id, "weekly");
      router.push(`/dashboard/schedules/${draftId}`);
    }
  };

  return (
    <div
      className={cn(
        "group cursor-pointer rounded-2xl bg-muted/30 px-4 py-4 transition-colors hover:bg-muted/50",
        isExpired && "opacity-70",
        hasChanges && "bg-amber-500/10 hover:bg-amber-500/20"
      )}
      onClick={handleClick}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              isExpired
                ? "bg-muted text-muted-foreground"
                : hasChanges
                ? "bg-yellow-500/10 text-yellow-600"
                : "bg-primary/10 text-primary"
            )}
          >
            {hasChanges ? (
              <GitBranch className="h-5 w-5" />
            ) : (
              <Calendar className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <h3
              className={cn(
                "truncate font-semibold",
                isExpired && "text-muted-foreground"
              )}
            >
              {schedule.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="tabular-nums">
                {format(parseISO(schedule.startDate), "MMM d")} -{" "}
                {format(parseISO(schedule.endDate), "MMM d, yyyy")}
              </span>
              <Badge
                variant={
                  schedule.status === "published"
                    ? "default"
                    : hasChanges
                    ? "outline"
                    : "secondary"
                }
                className={cn(
                  "text-[10px] h-5 px-1.5",
                  hasChanges &&
                    "border-yellow-500 text-yellow-600 bg-yellow-500/10"
                )}
              >
                {hasChanges ? "Unsaved" : schedule.status}
              </Badge>
              {isExpired && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 px-1.5 border-dashed text-muted-foreground"
                      >
                        Week Completed
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>This week has ended</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit schedule dates">
            <Edit2 className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete schedule">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PeriodCard({
  period,
  onEdit,
  onDelete,
}: {
  period: SchedulePeriod;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const { findOrCreateDraft, compareSchedules } = useScheduleStore();

  const isDraftEdit = period.status === "draft-edit";

  // Check if draft has actual changes
  const hasChanges =
    isDraftEdit && period.originalScheduleId
      ? (() => {
          const changes = compareSchedules(
            period.originalScheduleId,
            period.id
          );
          return (
            changes.added > 0 || changes.updated > 0 || changes.removed > 0
          );
        })()
      : false;

  const handleClick = () => {
    // If draft or draft-edit, navigate directly
    if (period.status === "draft" || period.status === "draft-edit") {
      router.push(`/dashboard/schedules/${period.id}`);
    } else {
      // If published, create/find a draft copy and navigate to it
      const draftId = findOrCreateDraft(period.id, "period");
      router.push(`/dashboard/schedules/${draftId}`);
    }
  };

  return (
    <div
      className={cn(
        "w-[260px] flex-shrink-0 cursor-pointer rounded-2xl bg-muted/40 p-4 transition-colors hover:bg-muted/60 sm:w-[290px]",
        hasChanges && "bg-amber-500/10 hover:bg-amber-500/20"
      )}
      onClick={handleClick}
    >
        <div className="flex items-start justify-between gap-3">
          <Badge
            variant="secondary"
            className={cn(
              hasChanges && "border-yellow-500 text-yellow-600 bg-yellow-500/10"
            )}
          >
            {hasChanges ? "Unsaved" : period.status}
          </Badge>
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onEdit}
              aria-label="Edit schedule period"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label="Delete schedule period"
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        </div>
        <h4 className="mt-3 flex items-center gap-2 truncate font-semibold">
          {hasChanges && <GitBranch className="h-4 w-4 text-yellow-600" />}
          {period.name}
        </h4>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
          <Clock className="h-3 w-3" />
          {format(parseISO(period.startDate), "MMM d")} -{" "}
          {format(parseISO(period.endDate), "MMM d, yyyy")}
        </div>
    </div>
  );
}
