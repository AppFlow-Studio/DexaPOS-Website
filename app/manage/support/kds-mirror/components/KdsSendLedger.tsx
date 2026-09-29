"use client";

import * as React from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ChevronRight,
  ListOrdered,
  Monitor,
  Repeat,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatRow, StatTile } from "@/components/dashboard/shell";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { useClientPagination } from "@/lib/hooks/useClientPagination";
import {
  type KdsSendLedgerEntry,
  type KdsSendLedgerItem,
} from "@/app/manage/actions/kds-mirror";
import {
  CardField,
  CardFields,
  CardGridEmpty,
  LoadError,
  RecordCard,
  RecordCardSkeletons,
  TableEmptyRow,
} from "@/app/manage/transactions/components/ledger-primitives";
import { useKdsSendLedger } from "../hooks/useKdsMirror";
import { KdsNotice, NoticeLead, Pill, WindowSelect } from "./kds-primitives";

export const SEND_LEDGER_WINDOWS = [
  { key: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { key: "6h", label: "Last 6 hours", ms: 6 * 60 * 60 * 1000 },
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

export type SendLedgerWindowKey = (typeof SEND_LEDGER_WINDOWS)[number]["key"];

/** Page size for the ledger table and its card grid (UI-DESIGN-SYSTEM §5.7). */
const LEDGER_PAGE_SIZE = 10;

/** The table's column count, for the full-width loading and empty cells. */
const LEDGER_COLUMNS = 7;

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

function orderLabel(entry: KdsSendLedgerEntry): string {
  return entry.order_number
    ? `#${entry.order_number}`
    : entry.order_id.slice(0, 8);
}

// Send failures are HQ-2 alarms (UI-DESIGN-SYSTEM §14.3): the glyph is red for
// a partial send or a dropped item and amber for a missing routing decision.
// The words say it too; the pill and the row stay neutral.
function DroppedGlyph() {
  return (
    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
  );
}

function NoRouteGlyph() {
  return (
    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
  );
}

/**
 * The anomaly flags for one send. Pills in a table cell; plain words on a
 * record card, where a pill would be a box inside a box (§5.3).
 */
function SendFlags({
  entry,
  plain = false,
}: {
  entry: KdsSendLedgerEntry;
  plain?: boolean;
}) {
  const flags: {
    key: string;
    icon: React.ReactNode;
    label: string;
    title: string;
  }[] = [];

  if (entry.partial) {
    flags.push({
      key: "partial",
      icon: <DroppedGlyph />,
      label: "Partial send",
      title: "Some requested items did not apply.",
    });
  }
  if (hasDropped(entry)) {
    flags.push({
      key: "dropped",
      icon: <DroppedGlyph />,
      label: "Dropped",
      title: "Routing dropped at least one item (no active display matched).",
    });
  }
  if (hasNoRoute(entry)) {
    flags.push({
      key: "no-route",
      icon: <NoRouteGlyph />,
      label: "No route",
      title: "At least one item has no routing decision recorded.",
    });
  }
  if (entry.was_replay) {
    flags.push({
      key: "replay",
      icon: <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
      label: "Replay",
      title: "The POS retried this send with the same idempotency key.",
    });
  }

  if (flags.length === 0) {
    return plain ? null : <span className="text-muted-foreground">—</span>;
  }

  if (plain) {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium">
        {flags.map((flag) => (
          <span
            key={flag.key}
            title={flag.title}
            className="inline-flex items-center gap-1"
          >
            {flag.icon}
            {flag.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Pill key={flag.key} icon={flag.icon} title={flag.title}>
          {flag.label}
        </Pill>
      ))}
    </div>
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
  const toggle = () => setExpanded((v) => !v);

  return (
    <React.Fragment>
      <TableRow
        className="cursor-pointer"
        data-state={expanded ? "selected" : undefined}
        onClick={toggle}
      >
        <TableCell className="w-10 pr-0">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} items for ${orderLabel(entry)}`}
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                expanded && "rotate-90"
              )}
            />
          </button>
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <p className="text-sm font-medium tabular-nums" title={entry.created_at}>
            {format(new Date(entry.created_at), "MMM d, h:mm a")}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(entry.created_at), {
              addSuffix: true,
            })}
          </p>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-medium tabular-nums">{orderLabel(entry)}</span>
            {entry.order_type && <Pill>{entry.order_type}</Pill>}
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums">{entry.order_item_count}</span> item
            {entry.order_item_count === 1 ? "" : "s"} on the order
          </p>
          {onShowOnBoard && (
            <button
              type="button"
              className="mt-0.5 text-xs font-medium text-foreground underline-offset-2 hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                onShowOnBoard(entry.order_id);
              }}
            >
              Show on board
            </button>
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <span className="font-mono text-sm tabular-nums">
            {entry.actually_updated_count} / {entry.requested_count}
          </span>
          <span className="ml-1.5 text-xs text-muted-foreground">
            applied / requested
          </span>
        </TableCell>
        <TableCell>
          <Pill>{ITEM_STATUS_LABEL[entry.item_status] ?? entry.item_status}</Pill>
        </TableCell>
        <TableCell className="max-w-55">
          <p className="truncate text-sm">
            {entry.station_name ?? (
              <span className="text-muted-foreground">Unknown station</span>
            )}
          </p>
          {entry.device_id && (
            <p className="truncate font-mono text-xs text-muted-foreground">
              {entry.device_id}
            </p>
          )}
        </TableCell>
        <TableCell>
          <SendFlags entry={entry} />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={LEDGER_COLUMNS} className="bg-muted/30 px-6 py-3">
            <SendItemList items={entry.items} />
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
}

/** The same send as a record card, below the table's fit breakpoint (§5.3). */
function SendCard({
  entry,
  onShowOnBoard,
}: {
  entry: KdsSendLedgerEntry;
  onShowOnBoard?: (orderId: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <RecordCard selected={expanded}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium tabular-nums">
            {orderLabel(entry)}
            {entry.order_type && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {entry.order_type}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground" title={entry.created_at}>
            {format(new Date(entry.created_at), "MMM d, h:mm a")} ·{" "}
            {formatDistanceToNow(new Date(entry.created_at), {
              addSuffix: true,
            })}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {ITEM_STATUS_LABEL[entry.item_status] ?? entry.item_status}
        </span>
      </div>

      <CardFields>
        <CardField
          label="Applied / requested"
          value={`${entry.actually_updated_count} / ${entry.requested_count}`}
        />
        <CardField
          label="Items on order"
          value={entry.order_item_count}
        />
        <CardField
          label="Station"
          value={entry.station_name ?? "Unknown station"}
        />
        <CardField label="Device" value={entry.device_id ?? "—"} mono />
      </CardFields>

      <div className="mt-3">
        <SendFlags entry={entry} plain />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronRight
            className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")}
          />
          {expanded ? "Hide items" : "Show items"}
        </Button>
        {onShowOnBoard && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-3"
            onClick={() => onShowOnBoard(entry.order_id)}
          >
            Show on board
          </Button>
        )}
      </div>

      {expanded && (
        <div className="mt-3">
          <SendItemList items={entry.items} />
        </div>
      )}
    </RecordCard>
  );
}

/**
 * Per-item routing outcome for one send. The table's expanded row and the
 * record card render this same component, so the two views cannot drift.
 */
function SendItemList({ items }: { items: KdsSendLedgerItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No item-level detail recorded for this send attempt.
      </p>
    );
  }

  return (
    <ol className="space-y-1.5">
      {items.map((item, index) => {
        const routed = item.routed_to.length > 0;
        return (
          <li
            key={item.order_item_id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-background/70 px-3 py-2"
          >
            <span className="w-6 text-xs tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 basis-40 text-sm font-medium">
              {item.item_name}
              {item.quantity > 1 && (
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                  ×{item.quantity}
                </span>
              )}
            </span>
            {item.kitchen_status && (
              <span className="font-mono text-xs text-muted-foreground">
                {item.kitchen_status}
              </span>
            )}
            {item.prep_station && <Pill>{item.prep_station}</Pill>}
            {routed ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="sr-only">Routed to</span>
                {item.routed_to.map((display) => (
                  <Pill
                    key={display}
                    icon={<Monitor className="text-muted-foreground" />}
                  >
                    {display}
                  </Pill>
                ))}
              </div>
            ) : item.dropped ? (
              <Pill
                icon={<DroppedGlyph />}
                title="No active KDS display matched this item; it was dropped."
              >
                Dropped
              </Pill>
            ) : (
              <Pill
                icon={<NoRouteGlyph />}
                title="The routing log has no decision for this item."
              >
                No route recorded
              </Pill>
            )}
          </li>
        );
      })}
    </ol>
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
 * (in the page header) drives this view through the imperative handle below,
 * so the screen never shows two Refresh buttons.
 *
 * Renders no outer chrome: the page supplies the `Panel > PanelSection`.
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

  const toIso = new Date(windowEnd).toISOString();
  const fromIso = new Date(windowStart).toISOString();

  const ledger = useKdsSendLedger(locationId, fromIso, toIso, orderId);
  const entries = ledger.data ?? [];
  // Filter first, then page -- the page size applies to the filtered view.
  const filtered = anomaliesOnly ? entries.filter(isAnomaly) : entries;
  const { pageRows, pagination, setPage } = useClientPagination(
    filtered,
    LEDGER_PAGE_SIZE
  );

  const handleWindowChange = (key: SendLedgerWindowKey) => {
    setWindowKey(key);
    setPage(1);
    const end = Date.now();
    setWindowEnd(end);
    setWindowStart(end - windowMsForKey(key));
  };

  const failedWithoutData = ledger.isError && !ledger.data;
  const figure = (value: number, alarm = false) =>
    failedWithoutData ? (
      "—"
    ) : alarm && value > 0 ? (
      <span className="text-red-600 dark:text-red-400">{value}</span>
    ) : (
      value
    );

  const partial = entries.filter((e) => e.partial).length;
  const dropped = entries.filter((e) => hasDropped(e)).length;
  const replays = entries.filter((e) => e.was_replay).length;

  const emptyTitle = anomaliesOnly
    ? "No anomalies in this window"
    : "No sends recorded in this window";
  const emptyHint = anomaliesOnly
    ? "Every send attempt in this window applied cleanly and routed."
    : "No send attempts reached the server in this window. If the merchant reports items being sent, the POS never reached the server — widen the window or check device connectivity.";

  return (
    <div className="min-w-0 space-y-6">
      {/* A ?order= deep link / "Show on board" pins this view to one order.
          Make that state visible and dismissible instead of silent -- a hidden
          filter reading as "the ledger only has 1 send" is exactly the
          confusion this tab exists to remove. */}
      {orderId && (
        <KdsNotice>
          <p>
            <NoticeLead>Showing send history for one order.</NoticeLead>{" "}
            {onClearOrder ? (
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
                onClick={onClearOrder}
              >
                Show all sends
              </button>
            ) : (
              "Pick the order from the board to clear."
            )}
          </p>
        </KdsNotice>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <WindowSelect
          value={windowKey}
          onValueChange={handleWindowChange}
          options={SEND_LEDGER_WINDOWS}
        />
        <label className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <Switch
            checked={anomaliesOnly}
            onCheckedChange={(value) => {
              setAnomaliesOnly(value);
              setPage(1);
            }}
          />
          Anomalies only
        </label>
      </div>

      <StatRow columns={4}>
        <StatTile
          label="Sends"
          value={figure(entries.length)}
          isLoading={ledger.isLoading}
        />
        <StatTile
          label="Partial sends"
          value={figure(partial, true)}
          isLoading={ledger.isLoading}
        />
        <StatTile
          label="With dropped items"
          value={figure(dropped, true)}
          isLoading={ledger.isLoading}
        />
        <StatTile
          label="Replays"
          value={figure(replays)}
          isLoading={ledger.isLoading}
        />
      </StatRow>

      <KdsNotice icon={ListOrdered}>
        <p>
          <NoticeLead>How to read this ledger.</NoticeLead> A row here is proof
          the POS call reached the server. If the merchant says an order was
          sent and there is <NoticeLead>no row</NoticeLead>, the POS never
          reached us (offline / client error). A{" "}
          <NoticeLead>partial send</NoticeLead> means some items did not apply.
          If items routed (open a row to see the display each item landed on)
          but the kitchen screen is blank, routing worked and the fault is on
          the KDS device — confirm on the Board tab.
        </p>
      </KdsNotice>

      {ledger.isError && (
        <LoadError
          title="We couldn't load the send ledger"
          detail={ledger.error instanceof Error ? ledger.error.message : undefined}
          onRetry={() => void ledger.refetch()}
        />
      )}

      {!failedWithoutData && (
        <div className="min-w-0">
          <Table
            variant="data"
            containerClassName="hidden xl:block"
            className="min-w-[900px]"
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <span className="sr-only">Expand</span>
                </TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={LEDGER_COLUMNS}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    Loading sends…
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableEmptyRow
                  colSpan={LEDGER_COLUMNS}
                  title={emptyTitle}
                  hint={emptyHint}
                />
              ) : (
                pageRows.map((entry) => (
                  <SendRow
                    key={entry.id}
                    entry={entry}
                    onShowOnBoard={onShowOnBoard}
                  />
                ))
              )}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
            {ledger.isLoading ? (
              <RecordCardSkeletons count={4} />
            ) : pageRows.length === 0 ? (
              <CardGridEmpty title={emptyTitle} hint={emptyHint} />
            ) : (
              pageRows.map((entry) => (
                <SendCard
                  key={entry.id}
                  entry={entry}
                  onShowOnBoard={onShowOnBoard}
                />
              ))
            )}
          </div>

          <PaginationBar
            pagination={pagination}
            onPageChange={setPage}
            itemLabel="sends"
          />
          {!ledger.isLoading &&
            filtered.length > 0 &&
            filtered.length <= LEDGER_PAGE_SIZE && (
              <p className="mt-3 text-xs text-muted-foreground tabular-nums sm:text-sm">
                {filtered.length} {filtered.length === 1 ? "send" : "sends"}
              </p>
            )}
        </div>
      )}
    </div>
  );
});
