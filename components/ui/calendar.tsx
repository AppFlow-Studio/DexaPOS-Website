"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import { DayPicker } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("relative w-full p-3", className)}
      classNames={{
        root: "relative w-full",
        months: "relative flex w-full flex-col gap-4 sm:flex-row",
        month: "w-full space-y-3",
        nav: "absolute inset-x-0 top-0 z-10 flex h-10 items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        ),
        month_caption: "flex h-10 items-center justify-center px-11",
        caption_label: "text-sm font-semibold tracking-tight",
        dropdowns: "flex h-10 items-center justify-center gap-2",
        dropdown_root: "relative rounded-full border bg-background px-2 py-1",
        dropdown: "absolute inset-0 cursor-pointer opacity-0",
        month_grid: "w-full border-collapse",
        weekdays: "grid grid-cols-7",
        weekday:
          "flex h-8 items-center justify-center text-center text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground",
        weeks: "block",
        week: "mt-1 grid grid-cols-7",
        day: "relative flex aspect-square min-h-9 items-center justify-center p-0 text-center text-sm",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-full min-h-9 rounded-full p-0 font-normal tabular-nums aria-selected:opacity-100"
        ),
        selected:
          "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground",
        today:
          "[&>button]:bg-primary/10 [&>button]:font-semibold [&>button]:text-primary",
        outside:
          "[&>button]:text-muted-foreground/50 [&>button:hover]:text-muted-foreground",
        disabled:
          "pointer-events-none opacity-35 [&>button]:text-muted-foreground",
        hidden: "invisible",
        range_start:
          "rounded-l-full bg-primary/15 [&>button]:bg-primary [&>button]:text-primary-foreground",
        range_middle:
          "bg-primary/15 [&>button]:rounded-none [&>button]:bg-transparent [&>button]:text-foreground",
        range_end:
          "rounded-r-full bg-primary/15 [&>button]:bg-primary [&>button]:text-primary-foreground",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) => {
          const Icon =
            orientation === "left"
              ? ChevronLeft
              : orientation === "right"
                ? ChevronRight
                : orientation === "up"
                  ? ChevronUp
                  : ChevronDown;

          return <Icon className={cn("size-4", chevronClassName)} />;
        },
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
