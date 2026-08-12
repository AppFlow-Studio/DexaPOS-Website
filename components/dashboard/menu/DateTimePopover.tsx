"use client";

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Date + time picker for "snooze until" fields.
 *
 * Replaces `<input type="datetime-local">`. The native picker's dropdown is
 * painted by the browser outside the React tree, so inside a dialog with
 * `overflow-hidden` it gets clipped and cannot be positioned. This renders the
 * calendar in a Radix popover instead, which portals above the dialog (z-[200])
 * and opens upward and centred over the trigger.
 *
 * Value contract matches the native input it replaces: a local `yyyy-MM-ddTHH:mm`
 * string, so callers can keep using `new Date(value)`.
 */

const VALUE_FORMAT = "yyyy-MM-dd'T'HH:mm";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
/** 5-minute granularity — enough for a snooze deadline, short enough to scan. */
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

/** `flex-1` + `w-0` so the three share the row evenly instead of one collapsing
 *  to a single glyph. `[&>svg]:hidden` drops the trigger's chevron — at this
 *  width it crowded the value; the row reads clearly as a time without it. */
const SELECT_CLASS =
  "!w-0 flex-1 justify-center gap-0 rounded-md px-1 text-[0.8125rem] tabular-nums [&>svg]:hidden";

const parseValue = (s: string): Date | undefined => {
  if (!s) return undefined;
  const d = parse(s, VALUE_FORMAT, new Date());
  return isValid(d) ? d : undefined;
};

/** Merge a chosen calendar day with the time already held in `base`. */
function withTimeFrom(day: Date, base: Date | undefined): Date {
  const next = new Date(day);
  next.setHours(base ? base.getHours() : 12, base ? base.getMinutes() : 0, 0, 0);
  return next;
}

export function DateTimePopover({
  value,
  onChange,
  id,
  placeholder = "Pick date & time",
  min,
  className,
}: {
  /** Local `yyyy-MM-ddTHH:mm` string, or empty. */
  value: string;
  /** Emits the same shape, or `""` when cleared. */
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  /** Earliest selectable moment, same string shape. */
  min?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const selected = parseValue(value);
  const minDate = min ? parseValue(min) : undefined;

  const emit = (d: Date) => onChange(format(d, VALUE_FORMAT));

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    emit(withTimeFrom(day, selected));
  };

  // Time is edited as 12-hour parts; the calendar only moves the day.
  const hours24 = selected ? selected.getHours() : 12;
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minute = selected ? selected.getMinutes() : 0;
  const period: "AM" | "PM" = hours24 >= 12 ? "PM" : "AM";

  const setClock = (h12: number, m: number, p: "AM" | "PM") => {
    const h24 = (h12 % 12) + (p === "PM" ? 12 : 0);
    const d = new Date(selected ?? new Date());
    d.setHours(h24, m, 0, 0);
    emit(d);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "h-9 w-full min-w-0 justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">
            {selected ? format(selected, "MMM d, yyyy · h:mm a") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      {/* Opens upward, centred. The width is pinned: Calendar is `w-full` with
          aspect-square day cells, so an `w-auto` container let the grid stretch
          and the rows grew as tall as they were wide. collisionPadding keeps it
          clear of the viewport edge inside a scrolled dialog. */}
      <PopoverContent
        className="w-[16.5rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl p-0"
        side="top"
        align="center"
        sideOffset={8}
        collisionPadding={16}
        avoidCollisions
      >
        {/* Compact overrides. The shared Calendar sizes day cells with
            `aspect-square min-h-9`, so row height tracks the grid width and the
            month caption ended up pushed out of the popover. Fixed short rows
            keep the whole picker inside the panel. */}
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleDaySelect}
          disabled={minDate ? { before: minDate } : undefined}
          autoFocus
          className="w-full p-2"
          classNames={{
            month: "w-full space-y-1.5",
            nav: "absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between",
            month_caption: "flex h-8 items-center justify-center px-9",
            caption_label: "text-[0.8125rem] font-semibold tracking-tight",
            weekday:
              "flex h-6 items-center justify-center text-center text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground",
            week: "mt-0.5 grid grid-cols-7",
            day: "relative flex h-8 items-center justify-center p-0 text-center text-[0.8125rem]",
            day_button: cn(
              buttonVariants({ variant: "ghost" }),
              "h-8 w-full min-h-0 rounded-full p-0 text-[0.8125rem] font-normal tabular-nums aria-selected:opacity-100",
            ),
          }}
        />
        {/* Radix Select, not a native <select>: the native option list is drawn
            by the OS, so it cannot be rounded to match the panel and it spilled
            outside the dialog. SelectContent portals at z-[200] and caps itself
            to --radix-select-content-available-height, so it stays on screen. */}
        <div className="flex items-center gap-1.5 border-t p-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Select
              value={String(hour12)}
              onValueChange={(v) => setClock(Number(v), minute, period)}
            >
              <SelectTrigger size="sm" aria-label="Hour" className={SELECT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="min-w-0">
                {HOURS.map((h) => (
                  <SelectItem key={h} value={String(h)} className="tabular-nums">
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">:</span>
            <Select
              value={String(minute)}
              onValueChange={(v) => setClock(hour12, Number(v), period)}
            >
              <SelectTrigger size="sm" aria-label="Minute" className={SELECT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="min-w-0">
                {/* Include the current minute when it is off the 5-minute grid,
                    so an existing value is never silently rounded away. */}
                {(MINUTES.includes(minute)
                  ? MINUTES
                  : [...MINUTES, minute].sort((a, b) => a - b)
                ).map((m) => (
                  <SelectItem
                    key={m}
                    value={String(m)}
                    className="tabular-nums"
                  >
                    {String(m).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={period}
              onValueChange={(v) => setClock(hour12, minute, v as "AM" | "PM")}
            >
              <SelectTrigger size="sm" aria-label="AM or PM" className={SELECT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="min-w-0">
                <SelectItem value="AM">AM</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 px-3"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default DateTimePopover;
