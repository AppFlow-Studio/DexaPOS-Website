"use client";

import * as React from "react";
import { format } from "date-fns";
import { ListFilter } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import type {
  KdsDeviceTruthItem,
  KdsDeviceTruthVerdict,
} from "@/app/manage/actions/kds-device-truth";
import {
  CardField,
  CardFields,
  CardGridEmpty,
  RecordCard,
  RecordCardSkeletons,
} from "@/app/manage/transactions/components/ledger-primitives";
import { VERDICT_META } from "./verdictMeta";
import { Pill } from "./kds-primitives";

/**
 * The divergence list is paginated client-side over the fetched window (so the
 * summary counts and the timeline still cover the whole window, not just the
 * current page), at the standard 10 rows (UI-DESIGN-SYSTEM §5.7).
 */
const DIVERGENCE_PAGE_SIZE = 10;

/**
 * Verdicts that mean "the server and the device disagree about what happened".
 * These are the rows support actually cares about; everything else is
 * confirming the healthy path or explaining an expected one.
 */
const DIVERGENCE_VERDICTS: KdsDeviceTruthVerdict[] = [
  "NEVER_SHOWED",
  "RENDER_SUSPECT",
  "GHOST",
];

function serverFiredLabel(item: KdsDeviceTruthItem): string {
  return item.server_fired_at
    ? format(new Date(item.server_fired_at), "HH:mm")
    : "—";
}

/**
 * What the device reported. A NEVER_SHOWED item has no device events by
 * definition, so its cell says whether the device was online when it fired,
 * which is the fact support needs to read the verdict.
 */
function deviceLabel(item: KdsDeviceTruthItem): string {
  const parts = [item.arrived && "arrived", item.acked && "acked"].filter(
    Boolean
  );
  if (parts.length > 0) return parts.join(", ");
  if (item.verdict === "NEVER_SHOWED") {
    return item.device_online_at_fire === false
      ? "Offline when fired"
      : "Online when fired";
  }
  return "—";
}

/**
 * The routed-vs-seen list for a display window.
 *
 * Defaults to divergences only (NEVER_SHOWED / RENDER_SUSPECT / GHOST), with a
 * toggle to reveal every item including the confirmed and expected ones.
 * Every row carries the verdict word AND its explanation (in the title),
 * because "offline" is not a bug and "no device data" is not even evidence —
 * support should not have to remember which is which.
 *
 * Verdicts are neutral pills (§4.6b). A NEVER_SHOWED row is marked by weight.
 */
export function KdsDivergenceList({
  items,
  isLoading,
}: {
  items: KdsDeviceTruthItem[];
  isLoading: boolean;
}) {
  const [showAll, setShowAll] = React.useState(false);

  const divergences = items.filter((item) =>
    DIVERGENCE_VERDICTS.includes(item.verdict)
  );
  const visible = showAll ? items : divergences;
  const { pageRows, pagination, setPage } = useClientPagination(
    visible,
    DIVERGENCE_PAGE_SIZE
  );

  // A new window replaces the data set — re-anchor to the first page. Never
  // in an effect (that would cascade); this is the React-recommended "adjust
  // state during render when a prop changes" pattern, keyed on the items
  // reference so a refetch-in-flight with a placeholder does not reset.
  const [prevItems, setPrevItems] = React.useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setPage(1);
  }

  const toggleShowAll = () => {
    setShowAll((v) => !v);
    setPage(1);
  };

  // Skeletons match the breakpoint (§5.4): table rows from `md`, cards below.
  if (isLoading && items.length === 0) {
    return (
      <>
        <div className="hidden space-y-2 md:block">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
          <RecordCardSkeletons count={2} />
        </div>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <CardGridEmpty
        title="No routed items in this window"
        hint="Nothing to compare — the routing log has no entries for this display in the selected window."
      />
    );
  }

  if (visible.length === 0) {
    return (
      <div className="col-span-full flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 text-center">
        <p className="text-sm font-medium">
          All clear — no divergences in this window
        </p>
        <p className="text-xs text-muted-foreground">
          Everything the server routed was acknowledged as painted by the
          device.{" "}
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            Show all items
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-muted-foreground">
          {!showAll
            ? `${divergences.length} item(s) where the server and the device disagree`
            : `${items.length} item(s) routed or reported in this window`}
        </p>
        {/* A filter chip (DS-CTL-03): tinted and borderless, pressed state
            said by aria-pressed and the label. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={showAll}
          onClick={toggleShowAll}
          className="h-11 border-0 bg-muted/60 px-3 text-[0.8125rem] text-muted-foreground shadow-none hover:bg-muted hover:text-foreground sm:h-9"
        >
          <ListFilter className="h-3.5 w-3.5" />
          {showAll ? "Divergences only" : "Show all items"}
        </Button>
      </div>

      {/*
        §5.3 (D-26): the table from `md`, cards below. Columns are tiered so
        nothing scrolls sideways inside the panel: item, order and verdict
        from `md`; server routed and device from `lg`; kitchen status from
        `xl`. `table-fixed` lets every cell truncate to one line (§5.7).
      */}
      <Table
        variant="data"
        bounded={false}
        containerClassName="hidden md:block"
        className="table-fixed"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Item</TableHead>
            <TableHead className="w-20">Order</TableHead>
            <TableHead className="hidden w-32 xl:table-cell">
              Kitchen status
            </TableHead>
            <TableHead className="hidden w-32 lg:table-cell">
              Server routed
            </TableHead>
            <TableHead className="hidden w-40 lg:table-cell">Device</TableHead>
            <TableHead className="w-36">Verdict</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((item) => {
            const meta = VERDICT_META[item.verdict];
            return (
              <TableRow
                key={item.order_item_id}
                className={cn(
                  // Attention by weight, not a tinted row (§3.5).
                  meta.needsAttention
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <TableCell
                  className="truncate font-medium text-foreground"
                  title={item.item_name ?? undefined}
                >
                  {item.item_name ?? "—"}
                </TableCell>
                <TableCell className="truncate tabular-nums">
                  {item.order_number ?? "—"}
                </TableCell>
                <TableCell className="hidden truncate xl:table-cell">
                  {item.kitchen_status ?? "—"}
                </TableCell>
                <TableCell className="hidden truncate tabular-nums lg:table-cell">
                  {serverFiredLabel(item)}
                </TableCell>
                <TableCell className="hidden truncate lg:table-cell">
                  {item.arrived || item.acked ? (
                    <span className="flex gap-1">
                      {item.arrived && <Pill>arrived</Pill>}
                      {item.acked && <Pill>acked</Pill>}
                    </span>
                  ) : (
                    deviceLabel(item)
                  )}
                </TableCell>
                <TableCell className="truncate">
                  <Pill title={meta.description} className="text-foreground">
                    {meta.label}
                  </Pill>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/*
        §5.3 (D-27): item and verdict lead, then four pairs. There is no
        per-item detail view, so the card keeps its four.
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
        {pageRows.map((item) => {
          const meta = VERDICT_META[item.verdict];
          return (
            <RecordCard key={item.order_item_id}>
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 min-w-0 font-medium">
                  {item.item_name ?? "—"}
                </p>
                <span
                  title={meta.description}
                  className={cn(
                    "shrink-0 text-xs",
                    meta.needsAttention
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {meta.label}
                </span>
              </div>
              <CardFields>
                <CardField label="Order" value={item.order_number ?? "—"} />
                <CardField
                  label="Kitchen status"
                  value={item.kitchen_status ?? "—"}
                />
                <CardField label="Server routed" value={serverFiredLabel(item)} />
                <CardField label="Device" value={deviceLabel(item)} />
              </CardFields>
            </RecordCard>
          );
        })}
      </div>

      <PaginationBar
        pagination={pagination}
        onPageChange={setPage}
        itemLabel="items"
      />

      {!showAll && items.length > divergences.length && (
        <p className="text-xs text-muted-foreground">
          <span className="tabular-nums">
            {items.length - divergences.length}
          </span>{" "}
          confirmed / expected item(s) hidden. Use &ldquo;Show all items&rdquo;
          to see them.
        </p>
      )}
    </div>
  );
}
