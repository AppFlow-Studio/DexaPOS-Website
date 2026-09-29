"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/*
 * The pieces every KDS tab repeats: the explanatory callout, the time-window
 * select and the pill filter rail. Written once so the four tabs cannot drift.
 *
 * ⚠️ Classes are literal strings in this .tsx on purpose (UI-DESIGN-SYSTEM C7).
 */

/**
 * A neutral callout (§3.5): the notices on this page explain what a view can
 * and cannot prove. They are not alarms, so they take no tint — emphasis comes
 * from the bold lead sentence.
 */
export function KdsNotice({
  icon: Icon,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-[0.8125rem] text-muted-foreground",
        className
      )}
    >
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** The bold lead of a `KdsNotice`. */
export function NoticeLead({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

/**
 * The one neutral status pill (§4.6b, DS-CTL-09). The word carries the
 * meaning; an alarm colours only the glyph passed in `icon`, never the pill.
 * On a muted record card, render the words as plain text instead (§5.3).
 */
export function Pill({
  icon,
  title,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0",
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * A time-window select as a muted toolbar pill (§4.2, §5.2). `SelectTrigger`
 * still ships a border by default (§11), so the material is spelled out.
 */
export function WindowSelect<K extends string>({
  value,
  onValueChange,
  options,
  ariaLabel = "Time window",
  disabled,
}: {
  value: K;
  onValueChange: (value: K) => void;
  options: readonly { key: K; label: string }[];
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as K)}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-9 w-full min-w-0 border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none dark:bg-muted/60 sm:w-40"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * A row of mutually exclusive filter pills on the tab-rail material (§4.5):
 * the active pill is neutral, never a brand fill. Scrolls sideways inside
 * itself on a narrow screen rather than wrapping.
 */
export function PillRail<K extends string>({
  options,
  value,
  onValueChange,
  ariaLabel,
}: {
  options: { key: K; label: string; count?: number }[];
  value: K;
  onValueChange: (value: K) => void;
  ariaLabel: string;
}) {
  return (
    <div className="thin-scrollbar min-w-0 max-w-full overflow-x-auto pb-1">
      <div
        role="group"
        aria-label={ariaLabel}
        className="inline-flex w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1"
      >
        {options.map((option) => {
          const isActive = option.key === value;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onValueChange(option.key)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
              {option.count !== undefined && (
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
