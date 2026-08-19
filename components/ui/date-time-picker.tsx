"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  align?: "start" | "center" | "end";
  compactCalendar?: boolean;
}

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);
const TIME_SELECT_CLASS =
  "!w-0 flex-1 justify-center gap-0 rounded-md px-1 text-[0.8125rem] tabular-nums [&>svg]:hidden";

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
  align = "start",
  compactCalendar = false,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const date = value ? new Date(value) : undefined;
  const isValid = date && !isNaN(date.getTime());

  const hours24 = isValid ? date!.getHours() : 12;
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minute = isValid ? date!.getMinutes() : 0;
  const period: "AM" | "PM" = hours24 >= 12 ? "PM" : "AM";
  const timeValue = isValid
    ? `${String(hours24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
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

  const setClock = (nextHour: number, nextMinute: number, nextPeriod: "AM" | "PM") => {
    const base = isValid ? new Date(date!) : new Date();
    const hour24 = (nextHour % 12) + (nextPeriod === "PM" ? 12 : 0);
    base.setHours(hour24, nextMinute, 0, 0);
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
            "h-9 w-full justify-start border-0 bg-muted/60 text-left font-normal shadow-none",
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
        className="w-[15rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl p-0"
        side="top"
        align="center"
        sideOffset={8}
        collisionPadding={16}
        avoidCollisions
      >
        <Calendar
          mode="single"
          initialFocus
          className="w-full p-2"
          classNames={{
            month: "w-full space-y-1.5",
            nav: "absolute inset-x-0 top-0 z-10 flex h-7 items-center justify-between",
            month_caption: "flex h-7 items-center justify-center px-8",
            caption_label: "text-[0.8125rem] font-semibold tracking-tight",
            weekday:
              "flex h-5 items-center justify-center text-center text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground",
            week: "mt-0.5 grid grid-cols-7",
            day: "relative flex h-7 items-center justify-center p-0 text-center text-xs",
            day_button: cn(
              buttonVariants({ variant: "ghost" }),
              "h-7 w-full min-h-0 rounded-full p-0 text-xs font-normal tabular-nums aria-selected:opacity-100",
            ),
          }}
          selected={isValid ? date : undefined}
          onSelect={handleDaySelect}
        />
        {!dateOnly && (
          <div className="space-y-2 border-t p-2">
            <Input
              type="time"
              aria-label="Time"
              value={timeValue}
              onChange={(event) => {
                const [nextHour, nextMinute] = event.target.value.split(":").map(Number);
                if (!Number.isNaN(nextHour) && !Number.isNaN(nextMinute)) {
                  const nextPeriod = nextHour >= 12 ? "PM" : "AM";
                  setClock(nextHour % 12 || 12, nextMinute, nextPeriod);
                }
              }}
              className="h-8 w-full rounded-full border-0 bg-muted/60 shadow-none"
            />
            <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Time</span>
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Select value={String(hour12)} onValueChange={(value) => setClock(Number(value), minute, period)}>
                <SelectTrigger size="sm" aria-label="Hour" className={TIME_SELECT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-36 min-w-0 rounded-xl border-border/70 p-1">
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)} className="tabular-nums">
                      {String(hour).padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">:</span>
              <Select value={String(minute)} onValueChange={(value) => setClock(hour12, Number(value), period)}>
                <SelectTrigger size="sm" aria-label="Minute" className={TIME_SELECT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-36 min-w-0 rounded-xl border-border/70 p-1">
                  {MINUTES.map((value) => (
                    <SelectItem key={value} value={String(value)} className="tabular-nums">
                      {String(value).padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={period} onValueChange={(value) => setClock(hour12, minute, value as "AM" | "PM")}>
                <SelectTrigger size="sm" aria-label="AM or PM" className={TIME_SELECT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-36 min-w-0 rounded-xl border-border/70 p-1">
                  <SelectItem value="AM">AM</SelectItem>
                  <SelectItem value="PM">PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
