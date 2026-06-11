"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateTimePickerProps {
  /** ISO 8601 string (e.g. "2026-06-09T13:30:00Z") or null. */
  value: string | null;
  /** Receives an ISO string (UTC, seconds precision) or null when cleared. */
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Hide the time field and treat the value as date-only. */
  dateOnly?: boolean;
  className?: string;
  id?: string;
}

/**
 * Date (+ time) picker that renders fully inside the app DOM via a Popover,
 * so it never overflows narrow/mobile viewports the way the native
 * `datetime-local` widget does. Time uses a native `type="time"` input whose
 * popup is a small wheel that stays within the screen.
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  dateOnly = false,
  className,
  id,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const date = value ? new Date(value) : undefined;
  const isValid = date && !isNaN(date.getTime());

  // "HH:mm" derived from the current value for the time input.
  const timeStr = isValid
    ? `${String(date!.getHours()).padStart(2, "0")}:${String(
        date!.getMinutes()
      ).padStart(2, "0")}`
    : "";

  const emit = (next: Date | undefined) => {
    if (!next || isNaN(next.getTime())) {
      onChange(null);
      return;
    }
    onChange(next.toISOString().slice(0, 19) + "Z");
  };

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) {
      emit(undefined);
      return;
    }
    const next = new Date(day);
    if (dateOnly) {
      next.setHours(0, 0, 0, 0);
    } else if (isValid) {
      // Preserve the existing time of day.
      next.setHours(date!.getHours(), date!.getMinutes(), 0, 0);
    } else {
      next.setHours(0, 0, 0, 0);
    }
    emit(next);
    if (dateOnly) setOpen(false);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [h, m] = e.target.value.split(":").map((n) => parseInt(n, 10));
    const base = isValid ? new Date(date!) : new Date();
    base.setHours(Number.isNaN(h) ? 0 : h, Number.isNaN(m) ? 0 : m, 0, 0);
    emit(base);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "h-9 w-full justify-start text-left font-normal",
            !isValid && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">
            {isValid
              ? format(date!, dateOnly ? "MMM d, yyyy" : "MMM d, yyyy · h:mm a")
              : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-[calc(100vw-2rem)] p-0"
        align="start"
      >
        <Calendar
          mode="single"
          initialFocus
          selected={isValid ? date : undefined}
          onSelect={handleDaySelect}
        />
        {!dateOnly && (
          <div className="flex items-center gap-2 border-t p-3">
            <span className="text-sm text-muted-foreground">Time</span>
            <Input
              type="time"
              value={timeStr}
              onChange={handleTimeChange}
              className="h-8 w-auto flex-1"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
