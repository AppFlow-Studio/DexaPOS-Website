"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The pill-shaped "View report" affordance used throughout the dashboard —
 * Overview section headers and the Financial reports card footers both use it
 * so every drill-in link reads the same. The chevron nudges right on hover.
 */
export function OverviewLinkButton({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-background px-3.5 py-2 text-[0.8125rem] font-medium shadow-sm transition-colors hover:bg-muted/60",
        className
      )}
    >
      {children}
      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/**
 * One row inside the Overview container: an icon + label, a headline figure,
 * an optional "View report" link, and free-form detail content beneath.
 *
 * Rows are separated by a hairline rule rather than each being its own card —
 * the container provides the single visual boundary for the whole group.
 */
export function OverviewSection({
  icon: Icon,
  label,
  value,
  isLoading,
  href,
  linkLabel = "View report",
  children,
  className,
  divider = true,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value?: React.ReactNode;
  isLoading?: boolean;
  href?: string;
  linkLabel?: string;
  children?: React.ReactNode;
  className?: string;
  /** First row in the container should pass false. */
  divider?: boolean;
}) {
  return (
    <section
      className={cn(
        "px-6 py-8",
        divider && "border-t border-border/60",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* Section titles carry the brand blue; dark mode uses the same
              brightened variant as the nav rail so they stay legible. */}
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
        </div>

        {href && (
          <OverviewLinkButton href={href}>{linkLabel}</OverviewLinkButton>
        )}
      </div>

      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

/**
 * Two-column detail grid used inside a section (e.g. "Best selling" next to
 * "Least selling", or a list beside a breakdown). Collapses on mobile.
 */
export function OverviewSplit({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">{children}</div>
  );
}

/** Small caption above a detail list inside a section. */
export function OverviewSubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-sm text-muted-foreground">{children}</p>
  );
}

/**
 * A labelled row in a detail list, with a hairline underneath — matches the
 * "Best selling items" / "Top customers" lists.
 */
export function OverviewListRow({
  leading,
  title,
  meta,
  trailing,
  href,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <div className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors group-hover/row:bg-muted/50 hover:bg-muted/50">
      <div className="flex min-w-0 items-center gap-2.5">
        {leading}
        <span
          className={cn(
            "truncate text-sm",
            href && "text-primary group-hover/row:underline"
          )}
        >
          {title}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-sm">
        {meta && <span className="text-muted-foreground">{meta}</span>}
        {trailing && <span className="tabular-nums">{trailing}</span>}
      </div>
    </div>
  );

  // The hairline lives on the wrapper so the hover tint (which is inset by the
  // row's own negative margin) doesn't sit on top of the divider.
  return (
    <div className="border-b border-border/60 last:border-0">
      {href ? (
        <Link href={href} className="group/row block">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

/**
 * Horizontal proportion bar + legend, used for "By platform" / "By source" /
 * "By type" breakdowns.
 */
export function OverviewBreakdown({
  items,
  formatValue,
}: {
  items: { label: string; value: number; color: string }[];
  formatValue?: (value: number) => string;
}) {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  // Hovering a legend row (or a bar segment) focuses that series: everything
  // else fades back so the highlighted one reads clearly against it.
  const [hovered, setHovered] = useState<string | null>(null);
  const isDimmed = (label: string) => hovered !== null && hovered !== label;

  return (
    <div onMouseLeave={() => setHovered(null)}>
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
        {total > 0 ? (
          items.map((item) => (
            <div
              key={item.label}
              onMouseEnter={() => setHovered(item.label)}
              className="cursor-default transition-opacity duration-150"
              style={{
                width: `${(item.value / total) * 100}%`,
                backgroundColor: item.color,
                opacity: isDimmed(item.label) ? 0.25 : 1,
              }}
            />
          ))
        ) : (
          <div className="w-full bg-muted" />
        )}
      </div>
      <div className="mt-3">
        {items.map((item) => (
          <div
            key={item.label}
            onMouseEnter={() => setHovered(item.label)}
            className={cn(
              "-mx-2 flex items-center justify-between gap-3 rounded-md border-b border-border/60 px-2 py-2.5 transition-[opacity,background-color] duration-150 last:border-0 hover:bg-muted/50",
              isDimmed(item.label) && "opacity-40"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm">{item.label}</span>
            </div>
            <span className="text-sm tabular-nums">
              {formatValue ? formatValue(item.value) : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
