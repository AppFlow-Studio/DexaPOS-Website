"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { SchedulePeriod } from "@/types/schedule";
import { addDays, format, startOfWeek } from "date-fns";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Calendar as CalendarIcon,
} from "lucide-react";

// ============================================
// Quick Schedule Modal (New Weekly Schedule)
// ============================================

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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );

  // Calculate week range
  const weekRange = useMemo(() => {
    if (!selectedDate) return null;
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
    const weekEnd = addDays(weekStart, 6);
    return { start: weekStart, end: weekEnd };
  }, [selectedDate]);

  const handleCreate = () => {
    if (selectedDate) {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
      onCreate(format(weekStart, "yyyy-MM-dd"));
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            New Weekly Schedule
          </DialogTitle>
          <DialogDescription>
            Select a week to create a new schedule.
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

          {weekRange && (
            <div className="p-3 bg-muted/50 rounded-lg border">
              <div className="text-sm text-muted-foreground">
                Selected Week:
              </div>
              <div className="font-medium">
                {format(weekRange.start, "MMM d")} -{" "}
                {format(weekRange.end, "MMM d, yyyy")}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!selectedDate}>
            Create Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Period Wizard (3-Step with Animation)
// ============================================

interface PeriodWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: any) => void;
  periodToEdit?: SchedulePeriod | null;
}

type Step = 1 | 2 | 3;

export function PeriodWizard({
  isOpen,
  onClose,
  onComplete,
  periodToEdit,
}: PeriodWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [formData, setFormData] = useState({
    name: "",
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
  });

  // Reset on open/edit
  useEffect(() => {
    if (isOpen) {
      if (periodToEdit) {
        setFormData({
          name: periodToEdit.name,
          startDate: new Date(periodToEdit.startDate),
          endDate: new Date(periodToEdit.endDate),
        });
        setStep(1);
      } else {
        setFormData({
          name: "",
          startDate: new Date(),
          endDate: addDays(new Date(), 30),
        });
        setStep(1);
      }
    }
  }, [periodToEdit, isOpen]);

  const handleNext = () => {
    if (step === 1 && formData.name.trim()) {
      setStep(2);
    } else if (step === 2 && formData.startDate) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  };

  const handleSubmit = () => {
    if (!formData.startDate || !formData.endDate) return;

    if (formData.startDate > formData.endDate) {
      alert("End date must be after start date");
      return;
    }

    onComplete({
      name: formData.name,
      startDate: format(formData.startDate, "yyyy-MM-dd"),
      endDate: format(formData.endDate, "yyyy-MM-dd"),
      status: periodToEdit ? periodToEdit.status : "draft",
      type: "period",
      shifts: periodToEdit ? periodToEdit.shifts : [],
    });
    onClose();
    setStep(1);
  };

  const handleClose = () => {
    onClose();
    setStep(1);
  };

  const stepLabels = ["Name", "Start Date", "End Date"];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            {periodToEdit ? "Edit Period" : "New Schedule Period"}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Step 1: Give your period a name."}
            {step === 2 && "Step 2: Select the start date."}
            {step === 3 && "Step 3: Select the end date."}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 py-3">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                  step === s
                    ? "bg-primary text-primary-foreground scale-110 shadow-lg"
                    : step > s
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s ? <Check className="h-5 w-5" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={`w-12 h-1 mx-1 rounded transition-colors duration-300 ${
                    step > s ? "bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Labels */}
        <div className="flex justify-between text-xs text-muted-foreground px-4 -mt-1 mb-2">
          {stepLabels.map((label, i) => (
            <span
              key={i}
              className={`text-center w-12 ${
                step === i + 1 ? "text-primary font-medium" : ""
              }`}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="min-h-[300px]">
          {/* Step 1: Name */}
          {step === 1 && (
            <div className="space-y-4 p-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="h-8 w-8 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Period Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g., Summer Season 2026"
                  className="text-center text-lg h-12"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground text-center">
                  This name will help identify the schedule period.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Start Date */}
          {step === 2 && (
            <div className="space-y-4 p-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex justify-center border rounded-lg p-2">
                <Calendar
                  mode="single"
                  selected={formData.startDate}
                  onSelect={(date) =>
                    setFormData({ ...formData, startDate: date })
                  }
                  className="rounded-md"
                />
              </div>
              {formData.startDate && (
                <div className="p-3 bg-muted/50 rounded-lg border text-center">
                  <div className="text-sm text-muted-foreground">
                    Start Date:
                  </div>
                  <div className="font-medium">
                    {format(formData.startDate, "EEEE, MMMM d, yyyy")}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: End Date */}
          {step === 3 && (
            <div className="space-y-4 p-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex justify-center border rounded-lg p-2">
                <Calendar
                  mode="single"
                  selected={formData.endDate}
                  onSelect={(date) =>
                    setFormData({ ...formData, endDate: date })
                  }
                  disabled={(date) =>
                    formData.startDate ? date < formData.startDate : false
                  }
                  className="rounded-md"
                />
              </div>
              {formData.startDate && formData.endDate && (
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-center">
                  <div className="text-sm text-muted-foreground">
                    Period Range:
                  </div>
                  <div className="font-medium text-primary">
                    {format(formData.startDate, "MMM d")} -{" "}
                    {format(formData.endDate, "MMM d, yyyy")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formData.name}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <DialogFooter className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={step === 1 ? handleClose : handleBack}
            className="gap-1"
          >
            {step === 1 ? (
              "Cancel"
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                Back
              </>
            )}
          </Button>

          {step < 3 ? (
            <Button
              onClick={handleNext}
              disabled={
                (step === 1 && !formData.name.trim()) ||
                (step === 2 && !formData.startDate)
              }
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!formData.endDate}
              className="gap-2"
            >
              <Check className="h-4 w-4" />
              {periodToEdit ? "Save Changes" : "Create Period"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
