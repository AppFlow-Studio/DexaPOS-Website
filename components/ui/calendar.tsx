"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import { DayPicker, type DropdownProps } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Month/year picker for `captionLayout="dropdown"`. Replaces DayPicker's
 * native <select>, whose option list the browser draws itself — square and
 * as tall as the viewport allows. Radix Select gives the rounded, height-capped
 * list; its chevron is hidden since the pill already reads as a control.
 */
function CalendarDropdown({
  options,
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: DropdownProps) {
  return (
    <Select
      value={value?.toString()}
      disabled={disabled}
      onValueChange={(next) =>
        // DayPicker's handler only reads `e.target.value`.
        onChange?.({
          target: { value: next },
        } as React.ChangeEvent<HTMLSelectElement>)
      }
    >
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className="gap-0 bg-background px-3 font-semibold shadow-none [&>svg]:hidden"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-60 min-w-[6rem]">
        {options?.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value.toString()}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
        // The nav bar spans the whole caption row above it (z-10), so it must
        // let clicks through to the month/year <select>s underneath — only
        // the arrow buttons themselves take pointer events.
        nav: "pointer-events-none absolute inset-x-0 top-0 z-10 flex h-10 items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "pointer-events-auto size-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "pointer-events-auto size-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
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
          "size-full min-h-9 rounded-md p-0 font-normal tabular-nums aria-selected:opacity-100",
          // --ring is the same violet as --primary, so the inherited ring is
          // invisible (1:1 contrast) on a selected day sitting in the
          // primary-filled range band. A foreground-coloured outline is drawn
          // instead: it contrasts against both the white popover (unselected
          // days) and the violet band (selected days), so focus stays visible
          // everywhere. z-10 keeps the outline above neighbouring cells.
          // (WCAG 2.2 focus appearance: 3:1 against adjacent colours.)
          "focus-visible:ring-foreground focus-visible:ring-2 focus-visible:z-10"
        ),
        selected:
          "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground",
        today:
          "[&>button]:bg-accent [&>button]:font-semibold [&>button]:text-accent-foreground",
        outside:
          "[&>button]:text-muted-foreground/50 [&>button:hover]:text-muted-foreground",
        disabled:
          "pointer-events-none opacity-35 [&>button]:text-muted-foreground",
        hidden: "invisible",
        // The whole range is one solid primary band: every day in the span gets
        // the same fill as the endpoints, so nothing inside reads as faded.
        //
        // The fill sits on the day *cell* and the inner buttons are forced
        // transparent, which matters for more than looks: `selected` and
        // `today` also set a button background, and on a day that is both
        // (e.g. today falling inside the range) those equal-specificity rules
        // would otherwise win by source order and paint one day a different
        // colour mid-band. `!` pins the transparent button so the cell's fill
        // is always what shows through.
        range_start:
          "rounded-l-md bg-primary [&>button]:!bg-transparent [&>button]:font-semibold [&>button]:!text-primary-foreground",
        range_middle:
          "bg-primary [&>button]:rounded-none [&>button]:!bg-transparent [&>button]:!text-primary-foreground",
        range_end:
          "rounded-r-md bg-primary [&>button]:!bg-transparent [&>button]:font-semibold [&>button]:!text-primary-foreground",
        ...classNames,
      }}
      components={{
        Dropdown: CalendarDropdown,
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
