"use client";

import * as React from "react";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, ListFilter } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  KdsDeviceTruthItem,
  KdsDeviceTruthVerdict,
} from "@/app/manage/actions/kds-device-truth";
import { VERDICT_META, verdictToneClass } from "./verdictMeta";
import { TablePagination } from "./TablePagination";

/**
 * The divergence list is paginated client-side over the fetched window (so the
 * summary counts and the timeline still cover the whole window, not just the
 * current page). 25 rows per page keeps the table snappy on a busy display's
 * 24h window without a second round trip.
 */
const DIVERGENCE_PAGE_SIZE = 25;

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

/**
 * The routed-vs-seen list for a display window.
 *
 * Defaults to divergences only (NEVER_SHOWED / RENDER_SUSPECT / GHOST), with a
 * toggle to reveal every item including the confirmed and expected ones.
 * Every row carries the verdict badge AND its explanation, because "offline"
 * is not a bug and "no device data" is not even evidence — support should not
 * have to remember which is which.
 */
export function KdsDivergenceList({
  items,
  isLoading,
}: {
  items: KdsDeviceTruthItem[];
  isLoading: boolean;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const [page, setPage] = React.useState(0);

  // A new window / toggle replaces the data set — re-anchor to the first page.
  // Never in an effect (that would cascade); this is the React-recommended
  // "adjust state during render when a prop changes" pattern, keyed on the
  // items reference so a refetch-in-flight with a placeholder does not reset.
  const [prevItems, setPrevItems] = React.useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setPage(0);
  }

  const divergences = items.filter((item) =>
    DIVERGENCE_VERDICTS.includes(item.verdict)
  );
  const visible = showAll ? items : divergences;

  // Clamp against the current data set too, so paging never lingers past the
  // end when the list shrinks under the current page.
  const totalPages = Math.max(1, Math.ceil(visible.length / DIVERGENCE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = visible.slice(
    safePage * DIVERGENCE_PAGE_SIZE,
    (safePage + 1) * DIVERGENCE_PAGE_SIZE
  );

  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
        <CheckCircle2 className="mb-2 h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm font-medium">No routed items in this window</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing to compare — the routing log has no entries for this display
          in the selected window.
        </p>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
        <CheckCircle2 className="mb-2 h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm font-medium">No divergences in this window</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Everything the server routed was acknowledged as painted by the
          device.
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="ml-1 font-medium text-primary underline underline-offset-2"
          >
            Show all items
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {divergences.length > 0 && !showAll
            ? `${divergences.length} item(s) where the server and the device disagree`
            : `${items.length} item(s) routed or reported in this window`}
        </p>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent"
        >
          <ListFilter className="h-3 w-3" />
          {showAll ? "Divergences only" : "Show all items"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-muted/50">
            <tr className="text-muted-foreground">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Order</th>
              <th className="px-3 py-2 font-medium">Kitchen status</th>
              <th className="px-3 py-2 font-medium">Server routed</th>
              <th className="px-3 py-2 font-medium">Device</th>
              <th className="px-3 py-2 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pageRows.map((item) => {
              const meta = VERDICT_META[item.verdict];
              return (
                <tr
                  key={item.order_item_id}
                  className={cn(
                    "align-top",
                    item.verdict === "NEVER_SHOWED" && "bg-red-50/50 dark:bg-red-950/20"
                  )}
                >
                  <td className="max-w-[220px] px-3 py-2">
                    <span className="line-clamp-2 font-medium">
                      {item.item_name ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.order_number ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.kitchen_status ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.server_fired_at
                      ? format(new Date(item.server_fired_at), "HH:mm")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.arrived || item.acked ? (
                      <span className="flex gap-1">
                        {item.arrived && <Badge variant="outline">arrived</Badge>}
                        {item.acked && (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          >
                            acked
                          </Badge>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-start gap-1">
                      <Badge
                        variant="outline"
                        className={verdictToneClass(item.verdict)}
                        title={meta.description}
                      >
                        {meta.label}
                      </Badge>
                      {item.verdict === "NEVER_SHOWED" && (
                        <span className="flex items-center gap-1 text-red-700 dark:text-red-300">
                          <AlertTriangle className="h-3 w-3" />
                          {item.device_online_at_fire === false
                            ? "device was offline"
                            : "device was online"}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isLoading && visible.length > 0 && (
        <TablePagination
          page={safePage}
          pageSize={DIVERGENCE_PAGE_SIZE}
          totalCount={visible.length}
          onPageChange={setPage}
        />
      )}

      {!showAll && items.length > divergences.length && (
        <p className="text-xs text-muted-foreground">
          {items.length - divergences.length} confirmed / expected item(s)
          hidden. Use “Show all items” to see them.
        </p>
      )}
    </div>
  );
}
