"use client";

import type { ReactNode } from "react";
import {
  ArrowUpDown,
  ChevronRight,
  CircleAlert,
  Hourglass,
  Moon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatHours, formatMoney } from "@/lib/timesheets/format";
import type { TimesheetBucket } from "@/lib/timesheets/period";
import {
  cellMatchesReview,
  type SummaryCell,
  type SummaryRow,
  type SummarySort,
  type SummarySortKey,
  type SummaryTotals,
} from "@/lib/timesheets/summary";
import type { TimesheetReviewFilter } from "@/lib/timesheets/types";

interface SummaryGridProps {
  rows: SummaryRow[];
  totals: SummaryTotals;
  buckets: TimesheetBucket[];
  /** Today at the location. */
  today: string;
  isLoading: boolean;
  /** A previous period is on screen while the next one loads. */
  isStale: boolean;
  review: TimesheetReviewFilter | null;
  sort: SummarySort;
  onSortChange: (sort: SummarySort) => void;
  onCellOpen: (row: SummaryRow, bucketIndex: number) => void;
  onPersonOpen: (row: SummaryRow) => void;
  empty: ReactNode;
}

function initials(row: SummaryRow) {
  const { firstName, lastName, displayName } = row.employee;
  const letters = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.trim();
  return (letters || displayName.slice(0, 2)).toUpperCase();
}

function cellLabel(row: SummaryRow, bucket: TimesheetBucket, cell: SummaryCell) {
  const when = bucket.kind === "day" ? `${bucket.label} ${bucket.sublabel}` : bucket.label;
  const parts = [`${row.employee.displayName}, ${when}: ${formatHours(cell.minutes)} hours`];
  if (cell.otMinutes > 0) parts.push(`${formatHours(cell.otMinutes)} overtime`);
  if (cell.hasOvernight) parts.push("a shift ends the next day");
  if (cell.hasOverMax) parts.push("a shift is over 16 hours");
  if (cell.hasMissingOut) parts.push("a shift is missing its clock-out");
  if (cell.hasOnClock) parts.push("on the clock now");
  return parts.join(", ");
}

function CellValue({ cell }: { cell: SummaryCell }) {
  if (cell.minutes === 0 && cell.hasMissingOut) {
    return (
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[0.6875rem] font-medium">
        <CircleAlert className="h-3 w-3 shrink-0" aria-hidden />
        Missing
      </span>
    );
  }
  if (cell.minutes === 0 && cell.hasOnClock) {
    return <span className="whitespace-nowrap text-[0.6875rem] font-medium">On clock</span>;
  }
  return <span className="whitespace-nowrap">{formatHours(cell.minutes)}</span>;
}

/**
 * The second line of a cell: neutral glyphs (never a colour, D-12) and, on a
 * week column, the overtime inside it. Kept off the number's line so a narrow
 * day column never has to fit "☾ ⧗ 222.48" side by side.
 */
function CellMeta({ cell, showOt }: { cell: SummaryCell; showOt: boolean }) {
  const hasGlyphs =
    cell.hasOvernight || cell.hasOverMax || (cell.hasMissingOut && cell.minutes > 0);
  if (!hasGlyphs && !(showOt && cell.otMinutes > 0)) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[0.6875rem] leading-4 text-muted-foreground">
      {cell.hasOvernight && <Moon className="h-3 w-3 shrink-0" aria-hidden />}
      {cell.hasOverMax && <Hourglass className="h-3 w-3 shrink-0" aria-hidden />}
      {cell.hasMissingOut && cell.minutes > 0 && <CircleAlert className="h-3 w-3 shrink-0" aria-hidden />}
      {showOt && cell.otMinutes > 0 && (
        <span className="whitespace-nowrap">{formatHours(cell.otMinutes)} OT</span>
      )}
    </span>
  );
}

function PayValue({ row }: { row: SummaryRow }) {
  if (row.payState === "empty") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (row.payState === "none") {
    return (
      <span className="flex flex-col items-end">
        <span className="text-muted-foreground">—</span>
        <span className="text-xs text-muted-foreground">No pay rate</span>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end">
      <span>{formatMoney(row.payCents)}</span>
      {row.payState === "partial" && (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {row.shiftsWithoutRate} without a rate
        </span>
      )}
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSortChange,
  align = "end",
}: {
  label: string;
  sortKey: SummarySortKey;
  sort: SummarySort;
  onSortChange: (sort: SummarySort) => void;
  align?: "start" | "end";
}) {
  const active = sort.key === sortKey;
  // Names read A–Z first; figures read largest first. A second click flips.
  const firstDirection = sortKey === "name" ? "asc" : "desc";
  return (
    <div className={cn("flex", align === "end" ? "justify-end" : "justify-start")}>
      <Button
        variant="ghost"
        className="h-8 rounded-full px-2 font-medium"
        onClick={() =>
          onSortChange({
            key: sortKey,
            direction: active
              ? sort.direction === "asc"
                ? "desc"
                : "asc"
              : firstDirection,
          })
        }
      >
        {label}
        <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    </div>
  );
}

function ariaSort(sort: SummarySort, key: SummarySortKey) {
  if (sort.key !== key) return "none" as const;
  return sort.direction === "asc" ? ("ascending" as const) : ("descending" as const);
}

// Sticky first column: the row fill is translucent (bg-card/70 on a
// bg-muted/20 well), so a sticky cell with the same class would let the day
// columns show through as they scroll under it. These are opaque mixes that
// read as the same tone.
const STICKY_BODY =
  "sticky left-0 z-10 bg-[color-mix(in_oklch,var(--muted)_6%,var(--card))] group-hover:bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))]";
const STICKY_BAND = "sticky left-0 z-10 bg-[color-mix(in_oklch,var(--muted)_58%,var(--card))]";

export function SummaryGrid({
  rows,
  totals,
  buckets,
  today,
  isLoading,
  isStale,
  review,
  sort,
  onSortChange,
  onCellOpen,
  onPersonOpen,
  empty,
}: SummaryGridProps) {
  const showSkeleton = isLoading && rows.length === 0;
  const footerLabel = buckets[0]?.kind === "week" ? "Weekly total" : "Daily total";
  // Fixed layout: name and figure columns are pinned, the period's columns
  // share what is left equally — auto layout let one wide cell ("Missing")
  // push its neighbours around and a week overflowed a 1440px screen.
  const minWidth = 200 + buckets.length * 64 + 320;

  return (
    <div
      className={cn("min-w-0 space-y-3 transition-opacity", isStale && "opacity-60")}
      aria-busy={isLoading || isStale}
    >
      {/* Wide screens: the grid. */}
      <Table
        variant="data"
        containerClassName="hidden xl:block"
        className="table-fixed"
        style={{ minWidth }}
      >
        <TableHeader className="[&_tr]:border-0">
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={cn("w-50", STICKY_BAND)} aria-sort={ariaSort(sort, "name")}>
              <SortHeader label="Team member" sortKey="name" sort={sort} onSortChange={onSortChange} align="start" />
            </TableHead>
            {buckets.map((bucket) => {
              const isToday = bucket.start <= today && today <= bucket.end;
              return (
                <TableHead key={bucket.key} className="h-auto py-2 text-right">
                  <span className="flex flex-col items-end leading-4">
                    <span className="whitespace-nowrap text-[0.8125rem] font-medium tabular-nums">
                      {bucket.label}
                    </span>
                    <span
                      className={cn(
                        "whitespace-nowrap text-xs tabular-nums",
                        isToday ? "font-medium text-foreground" : "font-normal text-muted-foreground",
                      )}
                    >
                      {isToday && bucket.kind === "day" ? "Today" : bucket.sublabel}
                    </span>
                  </span>
                </TableHead>
              );
            })}
            <TableHead className="w-24" aria-sort={ariaSort(sort, "total")}>
              <SortHeader label="Total" sortKey="total" sort={sort} onSortChange={onSortChange} />
            </TableHead>
            <TableHead className="w-28" aria-sort={ariaSort(sort, "ot")}>
              <SortHeader label="Overtime" sortKey="ot" sort={sort} onSortChange={onSortChange} />
            </TableHead>
            <TableHead className="w-28" aria-sort={ariaSort(sort, "pay")}>
              <SortHeader label="Est. pay" sortKey="pay" sort={sort} onSortChange={onSortChange} />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {showSkeleton ? (
            Array.from({ length: 8 }).map((_, index) => (
              <TableRow key={`loading-${index}`} className="border-0">
                <TableCell className={STICKY_BODY}>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 animate-pulse rounded-full bg-muted/70 motion-reduce:animate-none" />
                    <div className="h-4 w-28 animate-pulse rounded-full bg-muted/70 motion-reduce:animate-none" />
                  </div>
                </TableCell>
                {Array.from({ length: buckets.length + 3 }).map((__, i) => (
                  <TableCell key={i}>
                    <div className="ml-auto h-4 w-12 animate-pulse rounded-full bg-muted/70 motion-reduce:animate-none" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell colSpan={buckets.length + 4} className="h-24 text-center">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.employee.staffProfileId} className="group border-0">
                <TableCell className={cn("overflow-hidden", STICKY_BODY)}>
                  <button
                    type="button"
                    onClick={() => onPersonOpen(row)}
                    className="flex min-w-0 items-center gap-3 rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Avatar className="h-9 w-9 shrink-0 bg-muted">
                      {row.employee.avatarUrl && (
                        <AvatarImage src={row.employee.avatarUrl} alt="" />
                      )}
                      <AvatarFallback className="bg-muted text-xs text-muted-foreground">
                        {initials(row)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium hover:underline">
                        {row.employee.displayName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {!row.employee.isActiveMember
                          ? "No longer active"
                          : row.employee.roleName ?? "Team member"}
                      </span>
                    </span>
                  </button>
                </TableCell>
                {row.cells.map((cell, index) => {
                  const bucket = buckets[index];
                  if (cell.shiftIds.length === 0) {
                    return (
                      <TableCell key={bucket.key} className="text-right tabular-nums text-muted-foreground">
                        <span className="px-2">—</span>
                      </TableCell>
                    );
                  }
                  const ringed = cellMatchesReview(cell, review);
                  return (
                    <TableCell key={bucket.key} className="px-1.5 text-right tabular-nums">
                      <button
                        type="button"
                        onClick={() => onCellOpen(row, index)}
                        aria-label={cellLabel(row, bucket, cell)}
                        title={cellLabel(row, bucket, cell)}
                        className={cn(
                          "inline-flex max-w-full flex-col items-end rounded-2xl px-1.5 py-1 transition-colors",
                          "hover:bg-muted hover:ring-1 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          ringed && "bg-muted ring-1 ring-border",
                        )}
                      >
                        <CellValue cell={cell} />
                        <CellMeta cell={cell} showOt={bucket.kind === "week"} />
                      </button>
                    </TableCell>
                  );
                })}
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    row.totalMinutes === 0 && "text-muted-foreground",
                  )}
                >
                  {formatHours(row.totalMinutes)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    row.otMinutes === 0 && "text-muted-foreground",
                  )}
                >
                  {row.otMinutes > 0 ? formatHours(row.otMinutes) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <PayValue row={row} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {!showSkeleton && rows.length > 0 && (
          // A band, not a rule (§5.5): same fill as the header, no border-t.
          <tfoot className="bg-muted/50 font-medium">
            <tr className="border-0">
              <td className={cn("px-5 py-3.5", STICKY_BAND)}>{footerLabel}</td>
              {totals.cells.map((cell, index) => (
                <td key={buckets[index].key} className="px-3.5 py-3.5 text-right tabular-nums">
                  {formatHours(cell.minutes)}
                </td>
              ))}
              <td className="px-3 py-3.5 text-right tabular-nums">{formatHours(totals.totalMinutes)}</td>
              <td className="px-3 py-3.5 text-right tabular-nums">{formatHours(totals.otMinutes)}</td>
              <td className="px-3 py-3.5 text-right tabular-nums">{formatMoney(totals.payCents)}</td>
            </tr>
          </tfoot>
        )}
      </Table>

      {/* Phones and tablets: one card per person (§5.3), never a sideways table. */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        {showSkeleton ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border-0 bg-muted/45 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-32 max-w-full" />
                  <Skeleton className="h-3 w-20 max-w-full" />
                </div>
              </div>
              <Skeleton className="mt-5 h-11 w-full" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="col-span-full flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 px-4 py-6 text-center">
            {empty}
          </div>
        ) : (
          rows.map((row) => (
            <article
              key={row.employee.staffProfileId}
              className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0 bg-muted">
                    {row.employee.avatarUrl && <AvatarImage src={row.employee.avatarUrl} alt="" />}
                    <AvatarFallback className="bg-muted text-xs text-muted-foreground">
                      {initials(row)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{row.employee.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {!row.employee.isActiveMember
                        ? "No longer active"
                        : row.employee.roleName ?? "Team member"}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-medium leading-tight tracking-[-0.02em] tabular-nums">
                    {formatHours(row.totalMinutes)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {row.missingOutCount > 0
                      ? `${row.missingOutCount} missing clock-out${row.missingOutCount === 1 ? "" : "s"}`
                      : row.otMinutes > 0
                        ? `${formatHours(row.otMinutes)} overtime`
                        : "No overtime"}
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "mt-4 gap-1",
                  buckets.length <= 7 ? "grid" : "no-scrollbar flex overflow-x-auto",
                )}
                style={
                  buckets.length <= 7
                    ? { gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }
                    : undefined
                }
              >
                {row.cells.map((cell, index) => {
                  const bucket = buckets[index];
                  const short = bucket.kind === "day" ? bucket.label.slice(0, 1) : `W${index + 1}`;
                  const content = (
                    <>
                      <span className="text-[0.6875rem] text-muted-foreground">{short}</span>
                      <span className="text-xs font-medium tabular-nums">
                        {cell.shiftIds.length === 0
                          ? "—"
                          : cell.minutes === 0 && cell.hasMissingOut
                            ? "Missing"
                            : cell.minutes === 0 && cell.hasOnClock
                              ? "On clock"
                              : formatHours(cell.minutes)}
                      </span>
                    </>
                  );
                  const base =
                    "flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5";
                  return cell.shiftIds.length === 0 ? (
                    <div key={bucket.key} className={cn(base, "bg-muted/60 text-muted-foreground")}>
                      {content}
                    </div>
                  ) : (
                    <button
                      key={bucket.key}
                      type="button"
                      onClick={() => onCellOpen(row, index)}
                      aria-label={cellLabel(row, bucket, cell)}
                      className={cn(
                        base,
                        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        cellMatchesReview(cell, review) || cell.hasMissingOut
                          ? "bg-muted ring-1 ring-border"
                          : "bg-muted/60 hover:bg-muted",
                      )}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Est. pay</p>
                  <p className="text-sm font-medium tabular-nums">
                    {row.payState === "none"
                      ? "No pay rate"
                      : row.payState === "empty"
                        ? "—"
                        : formatMoney(row.payCents)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 rounded-full px-3 text-muted-foreground"
                  onClick={() => onPersonOpen(row)}
                >
                  Shifts
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
