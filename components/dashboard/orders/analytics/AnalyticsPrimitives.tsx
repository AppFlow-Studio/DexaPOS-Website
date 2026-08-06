"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
// Imported from the leaf modules, not the `shell` barrel: the barrel
// re-exports this file's chart constants, so going through it would cycle.
import {
  BRAND_ACCENT,
} from "@/components/dashboard/shell/tokens";
import {
  StatTile as ShellStatTile,
  StatRow as ShellStatRow,
} from "@/components/dashboard/shell/StatTile";

/**
 * Shared building blocks for the Orders → Analytics page.
 *
 * These mirror the language established by the dashboard Overview
 * (`app/dashboard/components/OverviewSection.tsx`): a single rounded container
 * per tab, sections separated by vertical rhythm rather than each being its own
 * bordered+shadowed card, brand-blue section titles, and large tabular-nums
 * figures carrying the emphasis.
 */

/**
 * Brand blue used for section titles.
 *
 * @deprecated Import `BRAND_ACCENT` from `@/components/dashboard/shell`. Kept
 * as an alias so existing call sites keep working; both now resolve to the
 * `--brand` token rather than a hardcoded hex.
 */
export const ANALYTICS_ACCENT = BRAND_ACCENT;

/**
 * The rounded container a whole tab's sections live inside. Deliberately has no
 * `overflow-hidden` — that would clip the sticky controls bar above it.
 */
export function AnalyticsPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("analytics-flat rounded-3xl border bg-card", className)}>
      {children}
    </div>
  );
}

/**
 * One row inside an AnalyticsPanel: icon + label, an optional headline figure,
 * optional trailing control, and free-form content beneath.
 */
export function AnalyticsSection({
  icon: Icon,
  label,
  value,
  caption,
  isLoading,
  action,
  children,
  className,
  divider = true,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value?: React.ReactNode;
  caption?: React.ReactNode;
  isLoading?: boolean;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** First row in a panel should pass false. */
  divider?: boolean;
}) {
  // `divider` is accepted for call-site symmetry with AnalyticsRow but no
  // longer draws a rule: sections are separated by their own vertical rhythm
  // instead, so the panel reads as one continuous surface.
  void divider;

  return (
    <section className={cn("px-6 py-8", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
            {Icon && <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" />}
            <span>{label}</span>
          </div>

          {isLoading ? (
            <Skeleton className="mt-2 h-10 w-36" />
          ) : (
            value !== undefined && (
              <div className="mt-1 text-[2rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
                {value}
              </div>
            )
          )}

          {caption && (
            <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>

      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

/**
 * @deprecated Import `StatTile` / `StatRow` from `@/components/dashboard/shell`.
 *
 * Re-exported here so the analytics page keeps working unchanged. The shell
 * versions are identical apart from dropping the no-op `accent` prop, which
 * never applied a colour: tinted figures competed with the brand-blue section
 * headings, so figures always read in the default foreground.
 */
export const StatTile = ShellStatTile;
export const StatRow = ShellStatRow;

/**
 * Wraps an existing analytics Card so it reads as a section of the panel.
 *
 * The card's own border/shadow/background are stripped by the panel's
 * `.analytics-flat` rules; this supplies the horizontal padding the card no
 * longer provides. `DualPricingCard` returns null when a merchant has no dual
 * pricing — the `:empty` rule keeps that from leaving a band of padding behind.
 */
export function AnalyticsRow({
  children,
  first,
  className,
}: {
  children: React.ReactNode;
  /** Kept for call-site symmetry; no longer changes rendering. */
  first?: boolean;
  className?: string;
}) {
  // No top hairline: sections are separated by the vertical rhythm the cards
  // already set, so the panel reads as one continuous surface.
  void first;

  return (
    <div className={cn("min-w-0 px-6 empty:hidden", className)}>
      {children}
    </div>
  );
}

/**
 * Recharts axis/grid styling. These read the theme tokens directly — note they
 * are raw `rgb()`/`oklch()` values in this project, so they must NOT be wrapped
 * in `hsl(...)`; doing so yields invalid CSS and Recharts silently falls back
 * to its own defaults (which is what made axis labels render dark red).
 */
export const CHART_GRID = {
  stroke: "var(--border)",
  strokeDasharray: "3 3",
} as const;

export const CHART_TICK = {
  fontSize: 12,
  fill: "var(--muted-foreground)",
} as const;

export const CHART_CURSOR_FILL =
  "color-mix(in srgb, var(--muted) 40%, transparent)";

/**
 * Shared Recharts tooltip. Every card had its own near-identical copy built
 * from hardcoded slate/gray pairs; this is the single themed version.
 */
export function ChartTooltipPanel({
  label,
  items,
}: {
  label?: React.ReactNode;
  items: { name?: React.ReactNode; value: React.ReactNode; color?: string }[];
}) {
  return (
    <div className="rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
      {label !== undefined && label !== null && label !== "" && (
        <p className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">
          {label}
        </p>
      )}
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-6"
          >
            <div className="flex items-center gap-2">
              {item.color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              )}
              {item.name !== undefined && (
                <span className="text-[0.8125rem] text-muted-foreground">
                  {item.name}
                </span>
              )}
            </div>
            <span className="text-[0.8125rem] tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Small caption above a detail block inside a section. */
export function AnalyticsSubLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("mb-3 text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}
