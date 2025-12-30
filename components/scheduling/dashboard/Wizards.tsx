"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { SchedulePeriod, WeeklySchedule } from "@/types/schedule";
import { addDays, format, parseISO } from "date-fns";

interface PeriodWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: any) => void; // Typed as any for flexibility for now, ideally strictly typed
  periodToEdit?: SchedulePeriod | null;
}

export function PeriodWizard({
  isOpen,
  onClose,
  onComplete,
  periodToEdit,
}: PeriodWizardProps) {
  const [formData, setFormData] = useState({
    name: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    if (periodToEdit) {
      setFormData({
        name: periodToEdit.name,
        startDate: periodToEdit.startDate,
        endDate: periodToEdit.endDate,
      });
    } else {
      setFormData({
        name: "",
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: format(addDays(new Date(), 30), "yyyy-MM-dd"),
      });
    }
  }, [periodToEdit, isOpen]);

  const handleSubmit = () => {
    if (
      formData.startDate &&
      formData.endDate &&
      formData.startDate > formData.endDate
    ) {
      alert("End date must be after start date");
      return;
    }

    onComplete({
      ...formData,
      status: periodToEdit ? periodToEdit.status : "draft",
      type: "period",
      shifts: periodToEdit ? periodToEdit.shifts : [],
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {periodToEdit ? "Edit Period" : "New Schedule Period"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Period Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., Summer Season 2024"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) =>
                  setFormData({ ...formData, startDate: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) =>
                  setFormData({ ...formData, endDate: e.target.value })
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Save Period</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface QuickScheduleProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (startDate: string) => void;
}

export function QuickScheduleModal({
  isOpen,
  onClose,
  onCreate,
}: QuickScheduleProps) {
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Weekly Schedule</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label>Start Date (Monday)</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <p className="text-sm text-muted-foreground mt-2">
            Creating schedule for week of {startDate}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onCreate(startDate)}>Create Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
