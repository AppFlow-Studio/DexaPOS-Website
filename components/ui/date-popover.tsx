"use client";

import { useState } from "react";
import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePopoverProps {
  /** Value as a `yyyy-MM-dd` string (or empty). */
  value: string;
  /** Emits a `yyyy-MM-dd` string, or `null` when cleared. */
  onChange: (value: string | null) => void;
  id?: string;
  placeholder?: string;
  /** Minimum selectable date as `yyyy-MM-dd`. */
  min?: string;
  /** Maximum selectable date as `yyyy-MM-dd`. */
  max?: string;
  /** Horizontal alignment for the calendar relative to its trigger. */
  align?: "start" | "center" | "end";
  className?: string;
}

const toDate = (s: string): Date | undefined =>
  s ? parse(s, "yyyy-MM-dd", new Date()) : undefined;

export function DatePopover({
  value,
  onChange,
  id,
  placeholder = "Pick a date",
  min,
  max,
  align = "start",
  className,
}: DatePopoverProps) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const minDate = min ? toDate(min) : undefined;
  const maxDate = max ? toDate(max) : undefined;
  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full min-w-0 justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">
            {selected ? format(selected, "MMM d, yyyy") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      {/* `w-auto` overrides the primitive's fixed `w-72`, which is narrower
          than the calendar grid and clipped the trailing columns.
          `collisionPadding` keeps it off the viewport edge when the trigger
          sits low or far right (e.g. inside a scrolled dialog). */}
      <PopoverContent
        className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl p-0"
        align={align}
        collisionPadding={16}
        avoidCollisions
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          defaultMonth={selected ?? maxDate ?? minDate}
          disabled={disabledDays.length > 0 ? disabledDays : undefined}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
