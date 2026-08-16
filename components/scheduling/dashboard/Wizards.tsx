"use client";

import { useState, useMemo } from "react";
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
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Calendar as CalendarIcon,
} from "lucide-react";

const CALENDAR_FRAME_CLASS =
  "rounded-2xl bg-muted/30 p-3 sm:p-4";
const CALENDAR_CLASS = "mx-auto w-full max-w-[360px] p-0";

// ============================================
// Quick Schedule Modal (New Weekly Schedule)
// ============================================

interface QuickScheduleProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (startDate: string, numberOfWeeks: number) => void;
}

const WEEK_OPTIONS = [
  { value: 1, label: "1 Week" },
  { value: 2, label: "2 Weeks" },
  { value: 3, label: "3 Weeks" },
  { value: 4, label: "4 Weeks" },
];

export function QuickScheduleModal({
  isOpen,
  onClose,
  onCreate,
}: QuickScheduleProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );
  const [numberOfWeeks, setNumberOfWeeks] = useState(1);

  // Calculate schedule range based on number of weeks
  const scheduleRange = useMemo(() => {
    if (!selectedDate) return null;
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
    const rangeEnd = addDays(weekStart, numberOfWeeks * 7 - 1);
    return { start: weekStart, end: rangeEnd };
  }, [selectedDate, numberOfWeeks]);

  const handleCreate = () => {
    if (selectedDate) {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
      onCreate(format(weekStart, "yyyy-MM-dd"), numberOfWeeks);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden sm:max-h-[calc(100vh-2rem)] sm:max-w-[470px]">
        <DialogHeader className="shrink-0 pr-10">
          <div className="flex items-start gap-3 text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle>New Schedule</DialogTitle>
              <DialogDescription className="mt-1.5">
                Select a start date and duration for your schedule.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain py-6 pr-2">
          <div className="space-y-2.5">
            <Label className="text-sm font-semibold">Select start date</Label>
            <div className={CALENDAR_FRAME_CLASS}>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                defaultMonth={selectedDate}
                className={CALENDAR_CLASS}
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

        <DialogFooter className="shrink-0 border-t border-border/60 pt-4">
          <Button variant="ghost" onClick={onClose}>
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

export function PeriodWizard(props: PeriodWizardProps) {
  if (!props.isOpen) return null;

  return (
    <PeriodWizardContent
      key={props.periodToEdit?.id ?? "new-period"}
      {...props}
    />
  );
}

function PeriodWizardContent({
  isOpen,
  onClose,
  onComplete,
  periodToEdit,
}: PeriodWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [formData, setFormData] = useState<{
    name: string;
    startDate: Date | undefined;
    endDate: Date | undefined;
  }>(() =>
    periodToEdit
      ? {
          name: periodToEdit.name,
          startDate: parseISO(periodToEdit.startDate),
          endDate: parseISO(periodToEdit.endDate),
        }
      : {
          name: "",
          startDate: new Date(),
          endDate: addDays(new Date(), 30),
        }
  );

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
      <DialogContent className="flex flex-col gap-0 overflow-hidden sm:max-h-[calc(100vh-2rem)] sm:max-w-[480px]">
        <DialogHeader className="shrink-0 pr-10">
          <div className="flex items-start gap-3 text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CalendarIcon className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle>
                {periodToEdit ? "Edit Period" : "New Schedule Period"}
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                {step === 1 && "Give this scheduling period a clear name."}
                {step === 2 && "Choose when this scheduling period begins."}
                {step === 3 && "Choose when this scheduling period ends."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
          <div className="flex items-center justify-center gap-1 py-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300 ${
                    step === s
                      ? "bg-primary text-primary-foreground"
                      : step > s
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > s ? <Check className="h-5 w-5" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`mx-1 h-px w-12 transition-colors duration-300 ${
                      step > s ? "bg-emerald-500" : "bg-border"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="-mt-4 mb-4 flex justify-between px-7 text-[0.7rem] text-muted-foreground">
            {stepLabels.map((label, i) => (
              <span
                key={i}
                className={`w-12 text-center ${
                  step === i + 1 ? "font-medium text-primary" : ""
                }`}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="min-h-[300px]">
          {/* Step 1: Name */}
          {step === 1 && (
            <div className="animate-in space-y-5 fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center justify-center mb-4">
                <div className="flex size-14 items-center justify-center rounded-full bg-muted/50">
                  <FileText className="h-6 w-6 text-primary" />
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
                  className="h-11 rounded-xl bg-muted/30 text-base shadow-none"
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
            <div className="animate-in space-y-4 fade-in slide-in-from-right-4 duration-300">
              <div className={CALENDAR_FRAME_CLASS}>
                <Calendar
                  mode="single"
                  selected={formData.startDate}
                  onSelect={(date) =>
                    setFormData({ ...formData, startDate: date })
                  }
                  defaultMonth={formData.startDate}
                  className={CALENDAR_CLASS}
                />
              </div>
              {formData.startDate && (
                <div className="rounded-2xl bg-primary/[0.07] p-3 text-center">
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
            <div className="animate-in space-y-4 fade-in slide-in-from-right-4 duration-300">
              <div className={CALENDAR_FRAME_CLASS}>
                <Calendar
                  mode="single"
                  selected={formData.endDate}
                  onSelect={(date) =>
                    setFormData({ ...formData, endDate: date })
                  }
                  disabled={(date) =>
                    formData.startDate ? date < formData.startDate : false
                  }
                  defaultMonth={formData.endDate}
                  className={CALENDAR_CLASS}
                />
              </div>
              {formData.startDate && formData.endDate && (
                <div className="rounded-2xl bg-primary/[0.07] p-3 text-center">
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
        </div>

        {/* Footer Navigation */}
        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border/60 pt-4 sm:justify-between">
          <Button
            variant="ghost"
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
