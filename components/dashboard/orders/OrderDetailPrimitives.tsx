"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  PANEL_NESTED,
} from "@/components/dashboard/shell/tokens";

/**
 * Shared shell for the order-detail page, matching the dashboard Overview
 * language: a single `rounded-2xl` boundary per group, a brand-blue section
 * title, and hairline rules between rows instead of a card per row.
 *
 * These cards are `rounded-2xl` by design — they are tier 2 of the radius
 * scale, nested inside the detail page's column grid rather than being
 * top-level page panels (D-02).
 */
export function DetailCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(PANEL_NESTED, className)}>{children}</div>
  );
}

/**
 * Section title + optional caption and trailing action. The title carries the
 * brand blue (brightened in dark mode so it stays legible against the card),
 * exactly like `OverviewSection` on the dashboard.
 */
export function DetailHeader({
  icon: Icon,
  label,
  caption,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  caption?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-6 pt-6 pb-4",
        className
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
          {Icon && <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" />}
          <span>{label}</span>
        </div>
        {caption && (
          <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Body padding for a `DetailCard`. */
export function DetailBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-6 pb-6", className)}>{children}</div>;
}

/**
 * A label/value line in a summary list (pricing breakdown, order info). Values
 * are tabular so figures line up column-wise down the card.
 *
 * No rule between rows — the label/value alignment already reads as a table,
 * and hairlines on every line made the sidebar cards look busy.
 */
export function DetailRow({
  label,
  value,
  valueClassName,
  emphasis,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  valueClassName?: string;
  /** Renders the row as the group's headline figure. */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-2",
        className
      )}
    >
      <span
        className={cn(
          "text-sm",
          emphasis ? "font-medium" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          emphasis ? "text-base font-medium" : "text-sm",
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}
