"use client";

import * as React from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ChevronRight,
  ListFilter,
  ListOrdered,
  Monitor,
  Repeat,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import {
  CappedItemList,
  KdsNotice,
  NoticeLead,
  Pill,
  WindowSelect,
} from "./kds-primitives";

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
const LEDGER_COLUMNS = 8;

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

/** Every anomaly flag a send carries, alarms (red, then amber) first. */
function sendFlags(entry: KdsSendLedgerEntry) {
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
  return flags;
}

/**
 * The anomaly flags for one send. In a table cell the row stays one line
 * (§5.7): the first flag as a pill, then "+N" naming the rest in its title.
 * On a record card they are plain words, where a pill would be a box inside
 * a box (§5.3).
 */
function SendFlags({
  entry,
  plain = false,
}: {
  entry: KdsSendLedgerEntry;
  plain?: boolean;
}) {
  const flags = sendFlags(entry);

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

  const [first, ...rest] = flags;
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      <Pill icon={first.icon} title={first.title}>
        {first.label}
      </Pill>
      {rest.length > 0 && (
        <span
          className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground"
          title={rest.map((flag) => flag.label).join(", ")}
        >
          +{rest.length}
        </span>
      )}
    </div>
  );
}

/** "Sep 30, 2:14 PM", with the relative age and raw timestamp for a title. */
function sentAt(entry: KdsSendLedgerEntry) {
  const date = new Date(entry.created_at);
  return {
    label: format(date, "MMM d, h:mm a"),
    relative: formatDistanceToNow(date, { addSuffix: true }),
  };
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
  const time = sentAt(entry);

  return (
    <React.Fragment>
      <TableRow
        className="cursor-pointer"
        data-state={expanded ? "selected" : undefined}
        onClick={toggle}
      >
        <TableCell className="pr-0">
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
        <TableCell
          className="hidden truncate text-sm font-medium tabular-nums lg:table-cell"
          title={`${time.relative} · ${entry.created_at}`}
        >
          {time.label}
        </TableCell>
        <TableCell className="truncate">
          <span className="font-medium tabular-nums">{orderLabel(entry)}</span>
          {entry.order_type && (
            <Pill className="ml-2 align-middle">{entry.order_type}</Pill>
          )}
        </TableCell>
        <TableCell
          className="truncate text-right tabular-nums"
          title={`${entry.actually_updated_count} applied of ${entry.requested_count} requested`}
        >
          {entry.actually_updated_count} / {entry.requested_count}
        </TableCell>
        <TableCell className="hidden truncate lg:table-cell">
          <Pill>{ITEM_STATUS_LABEL[entry.item_status] ?? entry.item_status}</Pill>
        </TableCell>
        <TableCell
          className="hidden truncate text-sm xl:table-cell"
          title={entry.station_name ?? undefined}
        >
          {entry.station_name ?? (
            <span className="text-muted-foreground">Unknown station</span>
          )}
        </TableCell>
        <TableCell
          className="hidden truncate font-mono text-xs text-muted-foreground 2xl:table-cell"
          title={entry.device_id ?? undefined}
        >
          {entry.device_id ?? "—"}
        </TableCell>
        <TableCell className="truncate">
          <SendFlags entry={entry} />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={LEDGER_COLUMNS}
            className="whitespace-normal bg-muted/30 px-6 py-3"
          >
            <SendDetail entry={entry} onShowOnBoard={onShowOnBoard} />
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
}

/**
 * The same send as a record card, below `md` (§5.3, D-27). Order and send
 * status lead; the pairs are what support acts on. Items on the order and the
 * device id are one tap away in the expanded detail.
 */
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
          label="Station"
          value={entry.station_name ?? "Unknown station"}
        />
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
          <SendDetail entry={entry} />
        </div>
      )}
    </RecordCard>
  );
}

/**
 * The expanded detail of one send: the fields the one-line row and the phone
 * card leave out (items on the order, origin station and device), then the
 * per-item routing outcome. The table's expanded row and the record card
 * render this same component, so the two views cannot drift. Only the row
 * passes `onShowOnBoard` (its cell has no room for the link); the card has
 * the action in its footer.
 */
function SendDetail({
  entry,
  onShowOnBoard,
}: {
  entry: KdsSendLedgerEntry;
  onShowOnBoard?: (orderId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="tabular-nums">{entry.order_item_count}</span> item
          {entry.order_item_count === 1 ? "" : "s"} on the order
        </span>
        <span className="min-w-0 break-all">
          {entry.station_name ?? "Unknown station"}
          {entry.device_id && (
            <span className="font-mono"> · {entry.device_id}</span>
          )}
        </span>
        {onShowOnBoard && (
          <button
            type="button"
            className="font-medium text-foreground underline-offset-2 hover:underline"
            onClick={() => onShowOnBoard(entry.order_id)}
          >
            Show on board
          </button>
        )}
      </div>
      <SendItemList items={entry.items} label={orderLabel(entry)} />
    </div>
  );
}

/** Dropped first, then no routing decision, then routed (§5.7 rank-then-slice). */
function sendItemRank(item: KdsSendLedgerItem): number {
  if (item.dropped) return 0;
  return item.routed_to.length === 0 ? 1 : 2;
}

/**
 * Per-item routing outcome for one send, capped with the rest in a dialog
 * (`CappedItemList`). The table's expanded row and the record card render
 * this same component, so the two views cannot drift.
 */
function SendItemList({
  items,
  label,
}: {
  items: KdsSendLedgerItem[];
  label: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No item-level detail recorded for this send attempt.
      </p>
    );
  }

  return (
    <CappedItemList
      ordered
      items={items}
      getKey={(item) => item.order_item_id}
      rank={sendItemRank}
      dialogTitle={`Items in the send for ${label}`}
      dialogDescription="Every requested item and the display it routed to, in the order the POS sent them."
      renderItem={(item, index) => {
        const routed = item.routed_to.length > 0;
        return (
          <>
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
          </>
        );
      }}
    />
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
        {/* A filter chip (DS-CTL-03), not a Switch: a Switch fills
            `--primary` when on (§3.5). Tinted and borderless; the pressed
            state is said by aria-pressed and a neutral fill, never a hue. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={anomaliesOnly}
          onClick={() => {
            setAnomaliesOnly((v) => !v);
            setPage(1);
          }}
          className="h-11 border-0 bg-muted/60 px-3 text-[0.8125rem] text-muted-foreground shadow-none hover:bg-muted hover:text-foreground sm:h-9 aria-pressed:bg-muted aria-pressed:text-foreground"
        >
          <ListFilter className="h-3.5 w-3.5" />
          Anomalies only
        </Button>
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
          {/*
            §5.3 (D-26): the table from `md`, cards below. Columns are tiered
            so nothing scrolls sideways inside the panel. Order takes what the
            fixed columns leave: md ~414px - 284 = 130; lg adds time + status
            (256 of the extra 256) = 130; xl adds station = 210; 2xl adds the
            device id = 242. `table-fixed` keeps every row one line (§5.7).
          */}
          <Table
            variant="data"
            bounded={false}
            containerClassName="hidden md:block"
            className="table-fixed"
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-11">
                  <span className="sr-only">Expand</span>
                </TableHead>
                <TableHead className="hidden w-36 lg:table-cell">Time</TableHead>
                <TableHead>Order</TableHead>
                <TableHead
                  className="w-20 text-right"
                  title="Items applied / requested"
                >
                  Applied
                </TableHead>
                <TableHead className="hidden w-28 lg:table-cell">Status</TableHead>
                <TableHead className="hidden w-44 xl:table-cell">Station</TableHead>
                <TableHead className="hidden w-56 2xl:table-cell">Device</TableHead>
                <TableHead className="w-40">Flags</TableHead>
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
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
