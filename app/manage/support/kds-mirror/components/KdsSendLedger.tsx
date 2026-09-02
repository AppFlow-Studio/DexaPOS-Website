"use client";

import * as React from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ListOrdered,
  Monitor,
  Repeat,
  Send,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type KdsSendLedgerEntry,
  type KdsSendLedgerItem,
} from "@/app/manage/actions/kds-mirror";
import { useKdsSendLedger } from "../hooks/useKdsMirror";
import { TablePagination } from "./TablePagination";

export const SEND_LEDGER_WINDOWS = [
  { key: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { key: "6h", label: "Last 6 hours", ms: 6 * 60 * 60 * 1000 },
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

export type SendLedgerWindowKey = (typeof SEND_LEDGER_WINDOWS)[number]["key"];

/** Fixed page size for the ledger table; the window itself is fetched whole. */
const LEDGER_PAGE_SIZE = 100;

function windowMsForKey(key: SendLedgerWindowKey): number {
  return (
    SEND_LEDGER_WINDOWS.find((w) => w.key === key)?.ms ??
    24 * 60 * 60 * 1000
  );
}

/**
 * Imperative surface for the page's single shared Refresh button.
 *
 * `refresh()` re-anchors the window to "now" -- the whole point. The window
 * bounds are part of the query key, so simply re-running the old query would
 * keep serving the fixed window the component mounted with (new sends after
 * that anchor would never appear, which reads as "refresh does nothing").
 */
export interface KdsSendLedgerHandle {
  refresh: () => void;
}

/** An item that was requested but routing never produced a decision for. */
function hasNoRoute(entry: KdsSendLedgerEntry): boolean {
  return entry.items.some(
    (item) => item.routed_to.length === 0 && !item.dropped
  );
}

/** At least one requested item was dropped by routing (no active display). */
function hasDropped(entry: KdsSendLedgerEntry): boolean {
  return entry.items.some((item) => item.dropped);
}

function isAnomaly(entry: KdsSendLedgerEntry): boolean {
  return (
    entry.partial || hasDropped(entry) || hasNoRoute(entry) || entry.was_replay
  );
}

const ITEM_STATUS_LABEL: Record<string, string> = {
  sent: "Sent",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
};

function ItemStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className="font-mono text-[11px]">
      {ITEM_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function SendRow({
  entry,
  onShowOnBoard,
}: {
  entry: KdsSendLedgerEntry;
  onShowOnBoard?: (orderId: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const dropped = hasDropped(entry);
  const noRoute = hasNoRoute(entry);

  return (
    <React.Fragment>
      <TableRow
        className={cn(
          "cursor-pointer",
          entry.partial &&
            "bg-red-50/60 hover:bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-950/30",
          !entry.partial &&
            dropped &&
            "bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell className="w-8 pr-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <span className="text-sm font-medium" title={entry.created_at}>
            {format(new Date(entry.created_at), "MMM d, h:mm a")}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(entry.created_at), {
              addSuffix: true,
            })}
          </span>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {entry.order_number
                ? `#${entry.order_number}`
                : entry.order_id.slice(0, 8)}
            </span>
            {entry.order_type && (
              <Badge variant="secondary" className="text-[11px]">
                {entry.order_type}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {entry.order_item_count} item
            {entry.order_item_count === 1 ? "" : "s"} on the order
          </div>
          {onShowOnBoard && (
            <button
              type="button"
              className="mt-0.5 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
              onClick={(event) => {
                event.stopPropagation();
                onShowOnBoard(entry.order_id);
              }}
            >
              Show on board
            </button>
          )}
        </TableCell>
        <TableCell>
          <span
            className={cn(
              "font-mono text-sm",
              entry.partial
                ? "font-semibold text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400"
            )}
          >
            {entry.actually_updated_count} / {entry.requested_count}
          </span>
          <span className="ml-1.5 text-xs text-muted-foreground">
            applied / requested
          </span>
          {entry.partial && (
            <div className="text-xs font-medium text-red-600 dark:text-red-400">
              Partial send
            </div>
          )}
        </TableCell>
        <TableCell>
          <ItemStatusBadge status={entry.item_status} />
        </TableCell>
        <TableCell className="max-w-55">
          <div className="truncate text-sm">
            {entry.station_name ?? (
              <span className="text-muted-foreground">Unknown station</span>
            )}
          </div>
          {entry.device_id && (
            <div className="truncate font-mono text-xs text-muted-foreground">
              {entry.device_id}
            </div>
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {entry.was_replay && (
              <Badge
                variant="outline"
                className="gap-1 text-[11px]"
                title="The POS retried this send with the same idempotency key."
              >
                <Repeat className="h-3 w-3" /> Replay
              </Badge>
            )}
            {dropped && (
              <Badge
                variant="destructive"
                className="gap-1 text-[11px]"
                title="Routing dropped at least one item (no active display matched)."
              >
                <AlertTriangle className="h-3 w-3" /> Dropped
              </Badge>
            )}
            {noRoute && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-300 text-amber-700 text-[11px] dark:border-amber-800 dark:text-amber-300"
                title="At least one item has no routing decision recorded."
              >
                No route
              </Badge>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={7} className="bg-muted/30 px-8 py-3">
            <SendItemList items={entry.items} />
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
}

function SendItemList({ items }: { items: KdsSendLedgerItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No item-level detail recorded for this send attempt.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/60 rounded-md border bg-background">
      {items.map((item, index) => {
        const routed = item.routed_to.length > 0;
        return (
          <div
            key={item.order_item_id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2"
          >
            <span className="w-6 text-xs tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <span className="min-w-45 flex-1 text-sm font-medium">
              {item.item_name}
              {item.quantity > 1 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ×{item.quantity}
                </span>
              )}
            </span>
            {item.kitchen_status && (
              <span className="font-mono text-xs text-muted-foreground">
                {item.kitchen_status}
              </span>
            )}
            {item.prep_station && (
              <Badge variant="secondary" className="text-[11px]">
                {item.prep_station}
              </Badge>
            )}
            {routed ? (
              <div className="flex items-center gap-1">
                <Send className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                {item.routed_to.map((display) => (
                  <Badge
                    key={display}
                    variant="outline"
                    className="gap-1 border-emerald-200 text-emerald-700 text-[11px] dark:border-emerald-800 dark:text-emerald-300"
                  >
                    <Monitor className="h-3 w-3" />
                    {display}
                  </Badge>
                ))}
              </div>
            ) : item.dropped ? (
              <Badge
                variant="destructive"
                className="gap-1 text-[11px]"
                title="No active KDS display matched this item; it was dropped."
              >
                <AlertTriangle className="h-3 w-3" /> Dropped
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-amber-300 text-amber-700 text-[11px] dark:border-amber-800 dark:text-amber-300"
                title="The routing log has no decision for this item."
              >
                No route recorded
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The send-attempt ledger tab.
 *
 * WHAT IT ANSWERS: did the server receive the kitchen send, from which
 * station, and did every requested item apply? This is the half of the
 * "orders are not reaching the KDS" diagnosis the board mirror cannot give on
 * its own -- the mirror only reconstructs what the server says a station
 * SHOULD show. A row here is proof the POS call reached the server; a missing
 * row for an order the merchant swears they fired is proof it did not.
 *
 * Rows are expandable to the per-item routing outcome (which display each item
 * landed on, or that it was dropped). The "Anomalies only" toggle filters to
 * partial sends, dropped items, items with no routing decision, and replays.
 *
 * There is deliberately no refresh button here: the page's shared Refresh
 * (in KdsMirrorControls) drives this view through the imperative handle below,
 * so the screen never shows two Refresh buttons.
 */
export const KdsSendLedger = React.forwardRef<
  KdsSendLedgerHandle,
  {
    locationId: string;
    orderId?: string | null;
    onShowOnBoard?: (orderId: string) => void;
    onClearOrder?: () => void;
  }
>(function KdsSendLedger(
  { locationId, orderId, onShowOnBoard, onClearOrder },
  ref
) {
  const [windowKey, setWindowKey] = React.useState<SendLedgerWindowKey>(
    "24h"
  );
  // Never default this on: a deep link to a specific order (orderId set) would
  // otherwise hide that very order's row when the send applied cleanly.
  const [anomaliesOnly, setAnomaliesOnly] = React.useState(false);
  const [page, setPage] = React.useState(0);

  // Window bounds live in state, initialized lazily and advanced only in the
  // window-change handler or the imperative refresh -- never in an effect.
  // Both bounds are part of the ledger query key, so deriving them from
  // Date.now() during render would mint a new key on every render and refetch
  // forever.
  const [windowEnd, setWindowEnd] = React.useState(() => Date.now());
  const [windowStart, setWindowStart] = React.useState(
    () => Date.now() - 24 * 60 * 60 * 1000
  );

  // Expose refresh() to the page's single shared Refresh button. Re-anchoring
  // the window changes the query key, so the next render fetches a fresh,
  // current window -- a plain refetch of the old key would keep returning the
  // fixed window this component mounted with.
  React.useImperativeHandle(ref, () => ({
    refresh: () => {
      const end = Date.now();
      setWindowEnd(end);
      setWindowStart(end - windowMsForKey(windowKey));
    },
  }));

  const handleWindowChange = (key: SendLedgerWindowKey) => {
    setWindowKey(key);
    setPage(0);
    const end = Date.now();
    setWindowEnd(end);
    setWindowStart(end - windowMsForKey(key));
  };

  const toIso = new Date(windowEnd).toISOString();
  const fromIso = new Date(windowStart).toISOString();

  const ledger = useKdsSendLedger(locationId, fromIso, toIso, orderId);
  // Filter first, then page -- "100 max per page" applies to the filtered view.
  const filtered = (ledger.data ?? []).filter(
    (entry) => !anomaliesOnly || isAnomaly(entry)
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / LEDGER_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    safePage * LEDGER_PAGE_SIZE,
    (safePage + 1) * LEDGER_PAGE_SIZE
  );

  const sends = ledger.data?.length ?? 0;
  const partial = (ledger.data ?? []).filter((e) => e.partial).length;
  const dropped = (ledger.data ?? []).filter((e) => hasDropped(e)).length;
  const replays = (ledger.data ?? []).filter((e) => e.was_replay).length;

  return (
    <div className="flex flex-col gap-3">
      {/* A ?order= deep link / "Show on board" pins this view to one order.
          Make that state visible and dismissible instead of silent -- a hidden
          filter reading as "the ledger only has 1 send" is exactly the
          confusion this tab exists to remove. */}
      {orderId && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <span className="font-medium">Showing send history for one order.</span>
          {onClearOrder ? (
            <button
              type="button"
              className="font-semibold underline underline-offset-2 hover:opacity-80"
              onClick={onClearOrder}
            >
              Show all sends
            </button>
          ) : (
            <span className="text-muted-foreground">
              Pick the order from the board to clear.
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select
            value={windowKey}
            onValueChange={(v) =>
              handleWindowChange(v as SendLedgerWindowKey)
            }
          >
            <SelectTrigger className="h-8 w-37.5 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEND_LEDGER_WINDOWS.map((w) => (
                <SelectItem key={w.key} value={w.key}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              checked={anomaliesOnly}
              onCheckedChange={(value) => {
                setAnomaliesOnly(value);
                setPage(0);
              }}
            />
            Anomalies only
          </label>
        </div>
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryCard label="Sends" value={sends} tone="default" />
        <SummaryCard label="Partial sends" value={partial} tone="danger" />
        <SummaryCard label="With dropped items" value={dropped} tone="warn" />
        <SummaryCard label="Replays" value={replays} tone="info" />
      </div>

      {/* How to read this */}
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
        <ListOrdered className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold">How to read this ledger.</span> A row
          here is proof the POS call reached the server. If the merchant says an
          order was sent and there is <span className="font-semibold">no
          row</span>, the POS never reached us (offline / client error). A{" "}
          <span className="font-semibold">partial send</span> means some items
          did not apply. If items routed (green display chips) but the kitchen
          screen is blank, routing worked and the fault is on the KDS
          device — confirm on the Board tab.
        </p>
      </div>

      {ledger.isError && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          Could not load the send ledger:{" "}
          {ledger.error instanceof Error ? ledger.error.message : "unknown"}
        </p>
      )}

      {ledger.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
          <Send className="mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            {anomaliesOnly ? "No anomalies in this window" : "No sends recorded"}
          </p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            {anomaliesOnly
              ? "Every send attempt in this window applied cleanly and routed."
              : "No send attempts reached the server in this window. If the merchant reports items being sent, the POS never reached the server — widen the window or check device connectivity."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8" />
                <TableHead>Time</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((entry) => (
                <SendRow
                  key={entry.id}
                  entry={entry}
                  onShowOnBoard={onShowOnBoard}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!ledger.isLoading && filtered.length > 0 && (
        <TablePagination
          page={safePage}
          pageSize={LEDGER_PAGE_SIZE}
          totalCount={filtered.length}
          onPageChange={setPage}
        />
      )}
    </div>
  );
});

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "danger" | "warn" | "info";
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "danger" && "text-red-600 dark:text-red-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "info" && "text-sky-600 dark:text-sky-400"
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
