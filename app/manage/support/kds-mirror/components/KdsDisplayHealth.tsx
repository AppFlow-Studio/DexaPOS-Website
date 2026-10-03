"use client";

import * as React from "react";
import { EyeOff, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { useClientPagination } from "@/lib/hooks/useClientPagination";
import type { KdsDeviceTruthHealthRow } from "@/app/manage/actions/kds-device-truth";
import {
  CardGridEmpty,
  RecordCardSkeletons,
} from "@/app/manage/transactions/components/ledger-primitives";

/** Page size for the health table and its card grid (UI-DESIGN-SYSTEM §5.7). */
const HEALTH_PAGE_SIZE = 10;

const NO_DEVICE_DATA_HINT =
  "This display has never reported — the POS emitter has not shipped to it yet. Its other numbers are not evidence of a fault.";

function displayKey(row: KdsDeviceTruthHealthRow): string {
  return row.kds_display_id ?? row.display_name ?? "unknown";
}

function ackRateLabel(row: KdsDeviceTruthHealthRow): string {
  return row.ack_rate_pct !== null ? `${row.ack_rate_pct.toFixed(1)}%` : "—";
}

/**
 * Rolling seven-day per-display health for a location.
 *
 * The headline number is the ack rate: of the items the server routed to a
 * display, how many did that display acknowledge painting. A display with
 * `device_reporting = false` has NEVER reported, so its device-side numbers
 * are not evidence of a fault -- they read "—", in the same way the per-item
 * verdicts return NO_DEVICE_DATA.
 *
 * A table from `md`, cards below (§5.3, D-26). Selecting a row or card picks
 * that display for the timeline and divergence list.
 *
 * Neutral throughout (UI-DESIGN-SYSTEM §3.5): device-truth findings are not
 * HQ-2 alarms, so a render-suspect count is marked by weight, not amber.
 */
export function KdsDisplayHealth({
  rows,
  selectedDisplayId,
  onSelectDisplay,
  isLoading,
}: {
  rows: KdsDeviceTruthHealthRow[];
  selectedDisplayId: string | null;
  onSelectDisplay: (displayId: string | null) => void;
  isLoading: boolean;
}) {
  const { pageRows, pagination, setPage } = useClientPagination(
    rows,
    HEALTH_PAGE_SIZE
  );

  // Skeletons match the breakpoint (§5.4): table rows from `md`, cards below.
  if (isLoading && rows.length === 0) {
    return (
      <>
        <div className="hidden space-y-2 md:block">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
          <RecordCardSkeletons count={2} />
        </div>
      </>
    );
  }

  if (rows.length === 0) {
    return (
      <CardGridEmpty
        title="No KDS displays at this location"
        hint="Health covers every KDS display configured here. Add a display in the location's KDS settings and it will appear once it has routed items."
      />
    );
  }

  const toggle = (row: KdsDeviceTruthHealthRow, isSelected: boolean) =>
    onSelectDisplay(isSelected ? null : (row.kds_display_id ?? null));

  const anyNotReporting = rows.some((row) => row.device_reporting !== true);

  return (
    <div className="min-w-0">
      {/*
        §5.3 (D-26): the table from `md`, cards below. Columns are tiered so
        nothing scrolls sideways inside the panel: display, ack rate and
        render-suspect from `md`; routed and acked from `lg`; arrived from
        `xl`. `table-fixed` keeps every cell to one line (§5.7).
      */}
      <Table
        variant="data"
        bounded={false}
        containerClassName="hidden md:block"
        className="table-fixed"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Display</TableHead>
            <TableHead className="w-32 text-right">Ack rate</TableHead>
            <TableHead className="w-32 text-right">Render suspect</TableHead>
            <TableHead className="hidden w-24 text-right lg:table-cell">
              Routed
            </TableHead>
            <TableHead className="hidden w-24 text-right lg:table-cell">
              Acked
            </TableHead>
            <TableHead className="hidden w-24 text-right xl:table-cell">
              Arrived
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((row) => {
            const isSelected = selectedDisplayId === row.kds_display_id;
            const reporting = row.device_reporting === true;
            const suspect = row.render_suspect_items ?? 0;
            const name = row.display_name ?? "Unnamed display";
            // Device-side counts mean nothing for a display that never reported.
            const deviceFigure = (value: number | null) =>
              reporting ? (value ?? 0) : "—";

            return (
              <TableRow
                key={displayKey(row)}
                className={cn(
                  "cursor-pointer",
                  // Attention by weight, not a tinted row (§3.5).
                  reporting && suspect > 0 && "font-medium"
                )}
                data-state={isSelected ? "selected" : undefined}
                onClick={() => toggle(row, isSelected)}
              >
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    {reporting ? (
                      <Radio className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      title={name}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(row, isSelected);
                      }}
                      className="min-w-0 truncate rounded-full text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {name}
                    </button>
                    {isSelected && (
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        Selected
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell
                  className="truncate text-right tabular-nums"
                  title={
                    !reporting
                      ? NO_DEVICE_DATA_HINT
                      : (row.routed_items ?? 0) === 0
                        ? "Nothing routed to this display in the last 7 days."
                        : undefined
                  }
                >
                  {reporting ? (
                    ackRateLabel(row)
                  ) : (
                    <span className="font-medium">No device data</span>
                  )}
                </TableCell>
                <TableCell className="truncate text-right tabular-nums">
                  {deviceFigure(row.render_suspect_items)}
                </TableCell>
                <TableCell className="hidden truncate text-right tabular-nums lg:table-cell">
                  {row.routed_items ?? 0}
                </TableCell>
                <TableCell className="hidden truncate text-right tabular-nums lg:table-cell">
                  {deviceFigure(row.acked_items)}
                </TableCell>
                <TableCell className="hidden truncate text-right tabular-nums xl:table-cell">
                  {deviceFigure(row.arrived_items)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Phones: one selectable card per display (§5.3). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
        {pageRows.map((row) => {
          const isSelected = selectedDisplayId === row.kds_display_id;
          const reporting = row.device_reporting === true;
          const routed = row.routed_items ?? 0;
          const suspect = row.render_suspect_items ?? 0;

          return (
            <button
              key={displayKey(row)}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(row, isSelected)}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-2xl p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // The selected card is a state: a ring, not a new box (§5.3).
                isSelected
                  ? "bg-muted ring-1 ring-border"
                  : "bg-muted/45 hover:bg-muted/70"
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                {reporting ? (
                  <Radio className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate text-sm font-medium">
                  {row.display_name ?? "Unnamed display"}
                </span>
                {isSelected && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    Selected
                  </span>
                )}
              </span>

              {!reporting ? (
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    No device data.
                  </span>{" "}
                  {NO_DEVICE_DATA_HINT}
                </span>
              ) : (
                <>
                  <span className="text-2xl font-medium leading-tight tracking-[-0.02em] tabular-nums">
                    {ackRateLabel(row)}
                    <span className="ml-1.5 text-xs font-normal tracking-normal text-muted-foreground">
                      acked
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground tabular-nums">
                        {routed}
                      </span>{" "}
                      routed
                    </span>
                    {suspect > 0 && (
                      <span className="font-medium text-foreground">
                        <span className="tabular-nums">{suspect}</span>{" "}
                        render-suspect
                      </span>
                    )}
                  </span>
                  {routed === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Nothing routed to this display in the last 7 days.
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      <PaginationBar
        pagination={pagination}
        onPageChange={setPage}
        itemLabel="displays"
      />
      {rows.length <= HEALTH_PAGE_SIZE && (
        <p className="mt-3 text-sm text-muted-foreground tabular-nums max-sm:hidden">
          {rows.length} {rows.length === 1 ? "display" : "displays"}
        </p>
      )}

      {/* The table says "No device data" in a cell; the reason is said once
          here so it reads without a tooltip (§3.5 words first). */}
      {anyNotReporting && (
        <p className="mt-2 hidden text-xs text-muted-foreground md:block">
          <span className="font-medium text-foreground">No device data</span>{" "}
          means the display has never reported — the POS emitter has not
          shipped to it yet. Its numbers read &ldquo;—&rdquo; because absence
          of device evidence is not evidence of a fault.
        </p>
      )}
    </div>
  );
}
