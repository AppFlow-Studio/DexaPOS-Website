"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ReportColumn {
  /** Stable key used by the visibility set. */
  id: string;
  /** Label shown in the dropdown. */
  label: string;
  /**
   * Columns that identify the row (the "what am I looking at" column).
   * These stay visible and are not offered as toggles, so a table can never
   * be reduced to a grid of anonymous numbers.
   */
  locked?: boolean;
  /** Hidden on first load at mobile widths. Ignored when `locked`. */
  defaultHidden?: boolean;
}

/**
 * Builds the initial hidden-column set for a table.
 *
 * Kept as a helper (rather than state inside the button) because the table
 * body needs the same set to decide which cells to render, so ownership sits
 * with the page that renders both.
 */
export function initialHiddenColumns(columns: ReportColumn[]): Set<string> {
  return new Set(
    columns.filter((c) => c.defaultHidden && !c.locked).map((c) => c.id),
  );
}

interface MobileColumnsButtonProps {
  columns: ReportColumn[];
  hidden: Set<string>;
  onChange: (next: Set<string>) => void;
  className?: string;
}

/**
 * Mobile-only column picker for the report tables.
 *
 * The report tables are hand-written rather than built from column
 * definitions, so visibility is a plain set of column ids that the table
 * consults per cell. `md:hidden` keeps this off desktop, where every column
 * fits and the control would be noise — it pairs with `useIsMobile()`, which
 * shares the same 768px breakpoint, so the button and the hiding it drives
 * appear and disappear together.
 */
export function MobileColumnsButton({
  columns,
  hidden,
  onChange,
  className,
}: MobileColumnsButtonProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [alignOffset, setAlignOffset] = React.useState(0);

  /**
   * Radix anchors the panel to the trigger, and the trigger sits wherever the
   * toolbar wraps it — usually hard against one edge on a narrow phone, which
   * leaves the menu spilling over the card. Radix's positioning transform
   * lives on a wrapper element we don't render, so it can't be overridden with
   * a class; the supported lever is `alignOffset`. Measuring the gap between
   * the trigger's centre and the viewport's centre when the menu opens turns
   * that lever into "centre this on the screen".
   */
  const recenter = React.useCallback((open: boolean) => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const triggerCenter = rect.left + rect.width / 2;
    setAlignOffset(window.innerWidth / 2 - triggerCenter);
  }, []);

  const toggleable = columns.filter((c) => !c.locked);
  if (toggleable.length === 0) return null;

  const hiddenToggleableCount = [...hidden].filter((id) =>
    toggleable.some((column) => column.id === id),
  ).length;
  const visibleCount = Math.max(0, toggleable.length - hiddenToggleableCount);

  const toggle = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  };

  return (
    <DropdownMenu onOpenChange={recenter}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          size="sm"
          className={cn(
            "h-9 shrink-0 gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium md:hidden",
            className,
          )}
        >
          Columns
          <span className="tabular-nums text-muted-foreground">
            {visibleCount}/{toggleable.length}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        alignOffset={alignOffset}
        collisionPadding={16}
        className="w-52 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Visible columns
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {toggleable.map((column) => {
          const isVisible = !hidden.has(column.id);
          return (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={isVisible}
              // Radix closes the menu on select; keeping it open lets several
              // columns be toggled in one pass.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => toggle(column.id)}
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
