"use client";

import { useScheduleStore } from "@/stores/useScheduleStore";
import { WeeklySchedule, SchedulePeriod } from "@/types/schedule";
import { format, isBefore, startOfDay, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Calendar, Clock } from "lucide-react";
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
  const isExpired = isBefore(
    parseISO(schedule.endDate),
    startOfDay(new Date())
  );

  return (
    <Card
      className={cn(
        "hover:border-primary/50 transition-colors cursor-pointer",
        isExpired && "opacity-75 bg-muted/20"
      )}
      onClick={() => router.push(`/dashboard/schedules/${schedule.id}`)}
    >
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center",
              isExpired
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary"
            )}
          >
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h3
              className={cn(
                "font-semibold",
                isExpired && "text-muted-foreground"
              )}
            >
              {schedule.name}
            </h3>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <span>
                {format(new Date(schedule.startDate), "MMM d")} -{" "}
                {format(new Date(schedule.endDate), "MMM d, yyyy")}
              </span>
              <Badge
                variant={
                  schedule.status === "published" ? "default" : "secondary"
                }
                className="text-[10px] h-5 px-1.5"
              >
                {schedule.status}
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
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Edit2 className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
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

  return (
    <Card
      className="w-[280px] flex-shrink-0 hover:border-primary/50 transition-colors cursor-pointer"
      onClick={() => router.push(`/dashboard/schedules/${period.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <Badge variant="outline">{period.status}</Badge>
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onEdit}
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        </div>
        <CardTitle className="text-base">{period.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Clock className="h-3 w-3" />
          {format(new Date(period.startDate), "MMM d")} -{" "}
          {format(new Date(period.endDate), "MMM d, yyyy")}
        </div>
      </CardContent>
    </Card>
  );
}
