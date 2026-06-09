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
  className,
}: DatePopoverProps) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const minDate = min ? toDate(min) : undefined;

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
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          disabled={minDate ? { before: minDate } : undefined}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
