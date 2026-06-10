"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  className?: string;
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
}

export function DateRangePicker({
  className,
  date,
  setDate,
}: DateRangePickerProps) {
  const handleFromSelect = (from: Date | undefined) => {
    if (!from) {
      setDate({ from: undefined, to: date?.to });
      return;
    }
    // If from is after current to, clear to
    const to = date?.to && from > date.to ? undefined : date?.to;
    setDate({ from, to });
  };

  const handleToSelect = (to: Date | undefined) => {
    if (!to) {
      setDate({ from: date?.from, to: undefined });
      return;
    }
    // If to is before current from, clear from
    const from = date?.from && to < date.from ? undefined : date?.from;
    setDate({ from, to });
  };

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {/* Start date */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-9 justify-start text-left font-normal w-[140px]",
              !date?.from && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            {date?.from ? format(date.from, "MMM dd, y") : <span>Start date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto min-w-[280px] p-0" align="start">
          <Calendar
            initialFocus
            mode="single"
            selected={date?.from}
            onSelect={handleFromSelect}
            toDate={date?.to}
          />
        </PopoverContent>
      </Popover>

      <span className="text-muted-foreground text-sm">→</span>

      {/* End date */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-9 justify-start text-left font-normal w-[140px]",
              !date?.to && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            {date?.to ? format(date.to, "MMM dd, y") : <span>End date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto min-w-[280px] p-0" align="start">
          <Calendar
            initialFocus
            mode="single"
            selected={date?.to}
            onSelect={handleToSelect}
            fromDate={date?.from}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
