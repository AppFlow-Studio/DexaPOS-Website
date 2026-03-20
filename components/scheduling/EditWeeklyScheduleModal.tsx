"use client";

import { useState, useEffect, useMemo } from "react";
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
import { format, addDays, startOfWeek, differenceInDays } from "date-fns";
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

export function EditWeeklyScheduleModal({
  open,
  onOpenChange,
  onSave,
  initialDate,
  initialEndDate,
  scheduleName,
}: EditWeeklyScheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    initialDate ? new Date(initialDate) : undefined
  );

  // Derive initial number of weeks from existing schedule range
  const initialWeeks = useMemo(() => {
    if (initialDate && initialEndDate) {
      const days = differenceInDays(new Date(initialEndDate), new Date(initialDate)) + 1;
      return Math.max(1, Math.round(days / 7));
    }
    return 1;
  }, [initialDate, initialEndDate]);

  const [numberOfWeeks, setNumberOfWeeks] = useState(initialWeeks);

  useEffect(() => {
    if (initialDate) {
      setSelectedDate(new Date(initialDate));
    }
  }, [initialDate]);

  useEffect(() => {
    setNumberOfWeeks(initialWeeks);
  }, [initialWeeks]);

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
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Edit Schedule Dates
          </DialogTitle>
          <DialogDescription>
            {scheduleName
              ? `Update the dates for "${scheduleName}"`
              : "Select a new start date and duration."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Start Date</Label>
            <div className="flex justify-center border rounded-lg p-2">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-md"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Schedule Duration</Label>
            <div className="flex gap-2">
              {WEEK_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={numberOfWeeks === opt.value ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setNumberOfWeeks(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {scheduleRange && (
            <div className="p-3 bg-muted/50 rounded-lg border">
              <div className="text-sm text-muted-foreground">
                Schedule Period:
              </div>
              <div className="font-medium">
                {format(scheduleRange.start, "MMM d")} -{" "}
                {format(scheduleRange.end, "MMM d, yyyy")}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {numberOfWeeks} week{numberOfWeeks > 1 ? "s" : ""} &middot; {numberOfWeeks * 7} days
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
