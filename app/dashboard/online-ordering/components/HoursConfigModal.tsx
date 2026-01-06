"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  WeeklySchedule,
  DaySchedule,
  dayOrder,
  getDayLabel,
} from "../hooks/useOnlineOrderingSettings";
import { Clock, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface HoursConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  schedule: WeeklySchedule;
  onSave: (schedule: WeeklySchedule) => void;
}

// Generate time options from 00:00 to 23:30 in 30-minute intervals
const generateTimeOptions = () => {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute of [0, 30]) {
      const time = `${hour.toString().padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}`;
      options.push(time);
    }
  }
  return options;
};

const timeOptions = generateTimeOptions();

// Format time for display
const formatTime12h = (time: string): string => {
  if (!time) return "00:00 AM";
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
};

interface DayRowProps {
  day: keyof WeeklySchedule;
  schedule: DaySchedule;
  onChange: (schedule: DaySchedule) => void;
  onCopyToAll: () => void;
}

function DayRow({ day, schedule, onChange, onCopyToAll }: DayRowProps) {
  const [showCopied, setShowCopied] = useState(false);

  const handleCopyToAll = () => {
    onCopyToAll();
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "grid grid-cols-[120px_60px_1fr_100px_40px] gap-3 items-center py-3 px-4 rounded-lg transition-colors",
        schedule.enabled ? "bg-card" : "bg-muted/30"
      )}
    >
      {/* Day Name */}
      <div className="flex items-center gap-2">
        <Label
          className={cn(
            "font-medium",
            !schedule.enabled && "text-muted-foreground"
          )}
        >
          {getDayLabel(day)}
        </Label>
      </div>

      {/* Enable Toggle */}
      <Switch
        checked={schedule.enabled}
        onCheckedChange={(enabled) => onChange({ ...schedule, enabled })}
        aria-label={`Enable ${getDayLabel(day)}`}
      />

      {/* Time Pickers */}
      {schedule.enabled && !schedule.is24Hours ? (
        <div className="flex items-center gap-2">
          <Select
            value={schedule.from}
            onValueChange={(from) => onChange({ ...schedule, from })}
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue>{formatTime12h(schedule.from)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {timeOptions.map((time) => (
                <SelectItem key={time} value={time}>
                  {formatTime12h(time)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-muted-foreground">to</span>

          <Select
            value={schedule.to}
            onValueChange={(to) => onChange({ ...schedule, to })}
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue>{formatTime12h(schedule.to)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {timeOptions.map((time) => (
                <SelectItem key={time} value={time}>
                  {formatTime12h(time)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : schedule.enabled && schedule.is24Hours ? (
        <div className="text-sm text-muted-foreground">Open 24 hours</div>
      ) : (
        <div className="text-sm text-muted-foreground">Closed</div>
      )}

      {/* 24 Hours Checkbox */}
      {schedule.enabled && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`24h-${day}`}
            checked={schedule.is24Hours}
            onCheckedChange={(is24Hours) =>
              onChange({ ...schedule, is24Hours: !!is24Hours })
            }
          />
          <Label
            htmlFor={`24h-${day}`}
            className="text-sm text-muted-foreground cursor-pointer"
          >
            24H
          </Label>
        </div>
      )}
      {!schedule.enabled && <div />}

      {/* Copy to All Button */}
      {schedule.enabled && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleCopyToAll}
          title="Copy to all days"
        >
          {showCopied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      )}
      {!schedule.enabled && <div />}
    </div>
  );
}

export function HoursConfigModal({
  open,
  onOpenChange,
  title,
  description,
  schedule,
  onSave,
}: HoursConfigModalProps) {
  const [localSchedule, setLocalSchedule] = useState<WeeklySchedule>(schedule);

  // Sync local state when modal opens
  useEffect(() => {
    if (open) {
      setLocalSchedule(schedule);
    }
  }, [open, schedule]);

  const updateDay = (day: keyof WeeklySchedule, daySchedule: DaySchedule) => {
    setLocalSchedule((prev) => ({
      ...prev,
      [day]: daySchedule,
    }));
  };

  const copyToAllDays = (day: keyof WeeklySchedule) => {
    const source = localSchedule[day];
    const updated: WeeklySchedule = { ...localSchedule };
    for (const d of dayOrder) {
      updated[d] = { ...source };
    }
    setLocalSchedule(updated);
    toast.success("Hours copied to all days");
  };

  const handleSave = () => {
    onSave(localSchedule);
    onOpenChange(false);
    toast.success("Hours updated");
  };

  const handleCancel = () => {
    setLocalSchedule(schedule);
    onOpenChange(false);
  };

  // Quick actions
  const setAllClosed = () => {
    const updated: WeeklySchedule = { ...localSchedule };
    for (const day of dayOrder) {
      updated[day] = { ...updated[day], enabled: false };
    }
    setLocalSchedule(updated);
  };

  const setWeekdaysOnly = () => {
    const updated: WeeklySchedule = { ...localSchedule };
    for (const day of dayOrder) {
      updated[day] = {
        ...updated[day],
        enabled: day !== "saturday" && day !== "sunday",
      };
    }
    setLocalSchedule(updated);
  };

  const setAllOpen = () => {
    const updated: WeeklySchedule = { ...localSchedule };
    for (const day of dayOrder) {
      updated[day] = { ...updated[day], enabled: true };
    }
    setLocalSchedule(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {/* Quick Actions */}
          <div className="flex gap-2 mb-4 px-1">
            <Button variant="outline" size="sm" onClick={setAllOpen}>
              All Open
            </Button>
            <Button variant="outline" size="sm" onClick={setWeekdaysOnly}>
              Weekdays Only
            </Button>
            <Button variant="outline" size="sm" onClick={setAllClosed}>
              All Closed
            </Button>
          </div>

          {/* Days List */}
          <div className="space-y-2">
            {dayOrder.map((day) => (
              <DayRow
                key={day}
                day={day}
                schedule={localSchedule[day]}
                onChange={(daySchedule) => updateDay(day, daySchedule)}
                onCopyToAll={() => copyToAllDays(day)}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Hours</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
