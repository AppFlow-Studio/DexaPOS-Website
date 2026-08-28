"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { addDays, differenceInDays, format, parseISO, startOfWeek } from "date-fns";
import { CalendarDays } from "lucide-react";

const WEEK_OPTIONS = [
  { value: 1, label: "1 Week" },
  { value: 2, label: "2 Weeks" },
  { value: 3, label: "3 Weeks" },
  { value: 4, label: "4 Weeks" },
];

interface EditWeeklyScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (startDate: string, numberOfWeeks?: number) => void;
  initialDate?: string;
  initialEndDate?: string;
  scheduleName?: string;
}

export function EditWeeklyScheduleModal(props: EditWeeklyScheduleModalProps) {
  if (!props.open) return null;

  return (
    <EditWeeklyScheduleModalContent
      key={`${props.initialDate ?? "new"}-${props.initialEndDate ?? "open"}`}
      {...props}
    />
  );
}

function EditWeeklyScheduleModalContent({
  open,
  onOpenChange,
  onSave,
  initialDate,
  initialEndDate,
  scheduleName,
}: EditWeeklyScheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    initialDate ? parseISO(initialDate) : undefined
  );

  const initialWeeks = (() => {
    if (initialDate && initialEndDate) {
      const days = differenceInDays(parseISO(initialEndDate), parseISO(initialDate)) + 1;
      return Math.max(1, Math.round(days / 7));
    }
    return 1;
  })();

  const [numberOfWeeks, setNumberOfWeeks] = useState(initialWeeks);

  const handleSave = () => {
    if (selectedDate) {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
      onSave(format(weekStart, "yyyy-MM-dd"), numberOfWeeks);
      onOpenChange(false);
    }
  };

  const scheduleRange = useMemo(() => {
    if (!selectedDate) return null;
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
    const end = addDays(start, numberOfWeeks * 7 - 1);
    return { start, end };
  }, [selectedDate, numberOfWeeks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-y-auto sm:max-h-[calc(100vh-2rem)] sm:max-w-[470px]">
        <DialogHeader className="pr-10">
          <div className="flex items-start gap-3 text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle>Edit Schedule Dates</DialogTitle>
              <DialogDescription className="mt-1.5">
                {scheduleName
                  ? `Update the dates for "${scheduleName}"`
                  : "Select a new start date and duration."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-6">
          <div className="space-y-2.5">
            <Label className="text-sm font-semibold">Select start date</Label>
            <div className="rounded-2xl bg-muted/30 p-3 sm:p-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                defaultMonth={selectedDate}
                className="mx-auto w-full max-w-[360px] p-0"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <Label className="text-sm font-semibold">Schedule duration</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WEEK_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={numberOfWeeks === opt.value ? "default" : "outline"}
                  size="sm"
                  className="w-full shadow-none"
                  onClick={() => setNumberOfWeeks(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {scheduleRange && (
            <div className="rounded-2xl bg-primary/[0.07] p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                Schedule period
              </div>
              <div className="mt-1 font-semibold tabular-nums">
                {format(scheduleRange.start, "MMM d")} -{" "}
                {format(scheduleRange.end, "MMM d, yyyy")}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {numberOfWeeks} week{numberOfWeeks > 1 ? "s" : ""} &middot; {numberOfWeeks * 7} days
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!selectedDate}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditWeeklyScheduleModal;
