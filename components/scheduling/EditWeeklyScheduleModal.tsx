"use client";

import { useState, useEffect } from "react";
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
import { format, addDays, startOfWeek } from "date-fns";
import { CalendarDays } from "lucide-react";

interface EditWeeklyScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (startDate: string) => void;
  initialDate?: string;
  scheduleName?: string;
}

export function EditWeeklyScheduleModal({
  open,
  onOpenChange,
  onSave,
  initialDate,
  scheduleName,
}: EditWeeklyScheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    initialDate ? new Date(initialDate) : undefined
  );

  useEffect(() => {
    if (initialDate) {
      setSelectedDate(new Date(initialDate));
    }
  }, [initialDate]);

  const handleSave = () => {
    if (selectedDate) {
      // Ensure we're using the start of the week
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
      onSave(format(weekStart, "yyyy-MM-dd"));
      onOpenChange(false);
    }
  };

  const weekEnd = selectedDate
    ? addDays(startOfWeek(selectedDate, { weekStartsOn: 0 }), 6)
    : null;

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
              ? `Update the start date for "${scheduleName}"`
              : "Select a new start date for this weekly schedule."}
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

          {selectedDate && weekEnd && (
            <div className="p-3 bg-muted/50 rounded-lg border">
              <div className="text-sm text-muted-foreground">
                Selected Week:
              </div>
              <div className="font-medium">
                {format(
                  startOfWeek(selectedDate, { weekStartsOn: 0 }),
                  "MMM d"
                )}{" "}
                - {format(weekEnd, "MMM d, yyyy")}
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
