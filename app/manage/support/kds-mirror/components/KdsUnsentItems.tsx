"use client";

import * as React from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  PackageX,
  UtensilsCrossed,
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
  type KdsUnsentItem,
  type KdsUnsentOrder,
} from "@/app/manage/actions/kds-mirror";
import {
  CardField,
  CardGridEmpty,
  LoadError,
  RecordCard,
  RecordCardSkeletons,
  TableEmptyRow,
} from "@/app/manage/transactions/components/ledger-primitives";
import { useKdsUnsentItems } from "../hooks/useKdsMirror";
import {
  CappedItemList,
  KdsNotice,
  NoticeInfoButton,
  NoticeLead,
  orderTypeLabel,
  Pill,
  WindowSelect,
} from "./kds-primitives";

export const UNSENT_WINDOWS = [
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "90d", label: "Last 90 days", ms: 90 * 24 * 60 * 60 * 1000 },
] as const;

export type UnsentWindowKey = (typeof UNSENT_WINDOWS)[number]["key"];

/** Page size for the unsent table and its card grid (UI-DESIGN-SYSTEM §5.7). */
const UNSENT_PAGE_SIZE = 10;

/** The table's column count, for the full-width loading and empty cells. */
const UNSENT_COLUMNS = 7;

function windowMsForKey(key: UnsentWindowKey): number {
  return (
    UNSENT_WINDOWS.find((w) => w.key === key)?.ms ??
    30 * 24 * 60 * 60 * 1000
  );
}

/**
 * Imperative surface for the page's single shared Refresh button. Same model
 * as KdsSendLedgerHandle: re-anchoring the window changes the query key, so
 * the next render fetches a fresh, current window.
 */
export interface KdsUnsentItemsHandle {
  refresh: () => void;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  sent_to_kitchen: "Sent to kitchen",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  accepted: "Accepted",
};

function orderStatusLabel(status: string | null): string {
  if (!status) return "—";
  return ORDER_STATUS_LABEL[status] ?? status;
}

function orderLabel(order: KdsUnsentOrder): string {
  return order.order_number
    ? `#${order.order_number}`
    : order.order_id.slice(0, 8);
}

/**
 * Whether some items on the order fired and these did not. A partial fire is
 * an HQ-2 send failure (UI-DESIGN-SYSTEM §14.3): its glyph is red. "Nothing
 * sent" may just be a draft nobody fired, so it stays neutral.
 */
function Coverage({
  order,
  plain = false,
}: {
  order: KdsUnsentOrder;
  plain?: boolean;
}) {
  const partial = order.sent_item_count > 0;
  const icon = partial ? (
    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
  ) : (
    <PackageX className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  );
  const label = partial ? "Partial fire" : "Nothing sent";
  const title = partial
    ? "Some items fired to the kitchen; these did not."
    : "Nothing on this order ever fired to the kitchen.";

  if (plain) {
    return (
      <span
        title={title}
        className="inline-flex items-center gap-1 text-sm font-medium"
      >
        {icon}
        {label}
      </span>
    );
  }

  return (
    <Pill icon={icon} title={title}>
      {label}
    </Pill>
  );
}

function UnsentOrderRow({ order }: { order: KdsUnsentOrder }) {
  const [expanded, setExpanded] = React.useState(false);
  const toggle = () => setExpanded((v) => !v);
  const createdAt = new Date(order.order_created_at);

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
            aria-label={`${expanded ? "Hide" : "Show"} unsent items for ${orderLabel(order)}`}
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
        <TableCell className="truncate">
          <span className="font-medium tabular-nums">{orderLabel(order)}</span>
          {order.order_type && (
            <Pill className="ml-2 align-middle">
              {orderTypeLabel(order.order_type)}
            </Pill>
          )}
        </TableCell>
        <TableCell className="hidden truncate lg:table-cell">
          <Pill>{orderStatusLabel(order.order_status)}</Pill>
        </TableCell>
        <TableCell
          className="hidden truncate text-sm tabular-nums xl:table-cell"
          title={`${formatDistanceToNow(createdAt, { addSuffix: true })} · ${order.order_created_at}`}
        >
          {format(createdAt, "MMM d, h:mm a")}
        </TableCell>
        <TableCell
          className="truncate text-right tabular-nums"
          title={`${order.unsent_item_count} unsent of ${order.total_item_count} items`}
        >
          <span className="font-medium">{order.unsent_item_count}</span>
          <span className="text-muted-foreground">
            {" "}
            of {order.total_item_count}
          </span>
        </TableCell>
        <TableCell className="hidden truncate text-right tabular-nums text-muted-foreground xl:table-cell">
          {order.sent_item_count}
        </TableCell>
        <TableCell className="truncate">
          <Coverage order={order} />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={UNSENT_COLUMNS}
            className="whitespace-normal bg-muted/30 px-6 py-3"
          >
            <UnsentItemList items={order.items} label={orderLabel(order)} />
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
}

/**
 * The same order as a record card, below `md` (§5.3, D-27): order and status
 * lead, then the unsent and sent counts; the items are one tap away.
 */
function UnsentOrderCard({ order }: { order: KdsUnsentOrder }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <RecordCard selected={expanded}>
      {/* The order id gets the whole line; the created date is on the table
          from `xl` and the status sits beside the counts below. */}
      <p
        className="truncate font-medium tabular-nums"
        title={order.order_created_at}
      >
        {orderLabel(order)}
        {order.order_type && (
          <span className="text-xs font-normal text-muted-foreground">
            {" "}
            · {orderTypeLabel(order.order_type)}
          </span>
        )}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
        <CardField
          label="Unsent"
          value={`${order.unsent_item_count} of ${order.total_item_count}`}
        />
        <CardField label="Sent" value={order.sent_item_count} />
        <CardField
          label="Status"
          value={orderStatusLabel(order.order_status)}
        />
      </div>

      {/* A partial fire is an HQ-2 alarm and stays; "Nothing sent" is already
          said by Sent 0, so the card drops it. */}
      {order.sent_item_count > 0 && (
        <div className="mt-3">
          <Coverage order={order} plain />
        </div>
      )}

      <div className="mt-3">
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
      </div>

      {expanded && (
        <div className="mt-3">
          <UnsentItemList items={order.items} label={orderLabel(order)} />
        </div>
      )}
    </RecordCard>
  );
}

/**
 * The unsent items on one order, capped with the rest in a dialog
 * (`CappedItemList`). The table's expanded row and the record card render
 * this same component, so the two views cannot drift.
 */
function UnsentItemList({
  items,
  label,
}: {
  items: KdsUnsentItem[];
  label: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No unsent item detail recorded for this order.
      </p>
    );
  }

  return (
    <CappedItemList
      items={items}
      getKey={(item) => item.order_item_id}
      dialogTitle={`Unsent items on ${label}`}
      dialogDescription="Every item on this order that never fired to the kitchen."
      renderItem={(item) => (
        <>
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
          {item.category_name && <Pill>{item.category_name}</Pill>}
          {item.prep_station && (
            <Pill icon={<UtensilsCrossed className="text-muted-foreground" />}>
              {item.prep_station}
            </Pill>
          )}
          <span className="text-xs text-muted-foreground">
            added{" "}
            {formatDistanceToNow(new Date(item.created_at), {
              addSuffix: true,
            })}
          </span>
        </>
      )}
    />
  );
}

/** What "unsent" means: the notice from `sm` up, the ⓘ popover on phones. */
const UNSENT_LEAD = "An item is unsent when the kitchen never received it.";

/**
 * The two kinds of unsent order. Inline in the notice; each `<span>` becomes
 * its own paragraph in the phone panel.
 */
function UnsentMeaningBody() {
  return (
    <>
      <span>
        <NoticeLead>Nothing sent</NoticeLead> = the whole order never fired (a
        draft nobody sent, or the send never reached the server).
      </span>{" "}
      <span>
        <NoticeLead>Partial fire</NoticeLead> = some items made it to the
        kitchen but these did not.
      </span>
    </>
  );
}

/** What "unsent" means: the notice from `sm` up. */
function UnsentMeaning() {
  return (
    <p>
      <NoticeLead>What &ldquo;unsent&rdquo; means.</NoticeLead> {UNSENT_LEAD}{" "}
      <UnsentMeaningBody />
    </p>
  );
}

/**
 * The unsent-items tab.
 *
 * WHAT IT ANSWERS: which items are sitting in orders that never fired to the
 * kitchen. The mirror image of the send ledger -- the ledger proves a send
 * arrived; this proves an item never left the order.
 *
 * An order with sent_item_count > 0 alongside unsent items is a partial fire
 * (those items are the ones that did not apply). A fully-unsent order is a
 * draft nobody fired, or a send that never reached the server.
 *
 * No refresh button here: the page's shared Refresh drives this view through
 * the imperative handle, so the screen never shows two Refresh buttons.
 *
 * Renders no outer chrome: the page supplies the `Panel > PanelSection`.
 */
export const KdsUnsentItems = React.forwardRef<
  KdsUnsentItemsHandle,
  {
    locationId: string;
    orderId?: string | null;
    onClearOrder?: () => void;
  }
>(function KdsUnsentItems(
  { locationId, orderId, onClearOrder },
  ref
) {
  const [windowKey, setWindowKey] = React.useState<UnsentWindowKey>("30d");
  const [windowEnd, setWindowEnd] = React.useState(() => Date.now());
  const [windowStart, setWindowStart] = React.useState(
    () => Date.now() - 30 * 24 * 60 * 60 * 1000
  );

  // Same imperative refresh model as the send ledger: re-anchor the window to
  // now (changes the query key -> fresh fetch), never a plain refetch of the
  // fixed window the component mounted with.
  React.useImperativeHandle(ref, () => ({
    refresh: () => {
      const end = Date.now();
      setWindowEnd(end);
      setWindowStart(end - windowMsForKey(windowKey));
    },
  }));

  const toIso = new Date(windowEnd).toISOString();
  const fromIso = new Date(windowStart).toISOString();

  const unsent = useKdsUnsentItems(locationId, fromIso, toIso, orderId);
  const orders = unsent.data ?? [];
  const { pageRows, pagination, setPage } = useClientPagination(
    orders,
    UNSENT_PAGE_SIZE
  );

  const handleWindowChange = (key: UnsentWindowKey) => {
    setWindowKey(key);
    setPage(1);
    const end = Date.now();
    setWindowEnd(end);
    setWindowStart(end - windowMsForKey(key));
  };

  const unsentItemCount = orders.reduce(
    (sum, order) => sum + order.unsent_item_count,
    0
  );
  const fullyUnsent = orders.filter((o) => o.fully_unsent).length;
  const partial = orders.filter(
    (o) => !o.fully_unsent && o.unsent_item_count > 0
  ).length;

  const failedWithoutData = unsent.isError && !unsent.data;
  const figure = (value: number, alarm = false) =>
    failedWithoutData ? (
      "—"
    ) : alarm && value > 0 ? (
      <span className="text-red-600 dark:text-red-400">{value}</span>
    ) : (
      value
    );

  const emptyTitle = "No unsent items in this window";
  const emptyHint =
    "Every non-voided item on every open order created in this window has fired to the kitchen. Widen the window if you are chasing an older order.";

  return (
    <div className="min-w-0 space-y-6">
      {/* Same no-silent-filter rule as the ledger: a ?order= deep link pins
          this view to one order; make it visible and dismissible. */}
      {orderId && (
        <KdsNotice>
          <p>
            <NoticeLead>Showing unsent items for one order.</NoticeLead>{" "}
            {onClearOrder ? (
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
                onClick={onClearOrder}
              >
                Show all orders
              </button>
            ) : (
              "Pick the order from the board to clear."
            )}
          </p>
        </KdsNotice>
      )}

      <div className="flex items-center gap-x-3 gap-y-2 sm:flex-wrap">
        <WindowSelect
          value={windowKey}
          onValueChange={handleWindowChange}
          options={UNSENT_WINDOWS}
        />
        <span className="text-[0.8125rem] text-muted-foreground max-sm:hidden">
          by order created date
        </span>
        {/* Phones: the explanation below moves behind ⓘ (§13.4). */}
        <NoticeInfoButton
          title="What “unsent” means"
          description={UNSENT_LEAD}
          className="sm:hidden"
        >
          <UnsentMeaningBody />
        </NoticeInfoButton>
      </div>

      <StatRow columns={4}>
        <StatTile
          label="Orders with unsent items"
          value={figure(orders.length)}
          isLoading={unsent.isLoading}
        />
        <StatTile
          label="Unsent items"
          value={figure(unsentItemCount)}
          isLoading={unsent.isLoading}
        />
        <StatTile
          label="Fully unsent orders"
          value={figure(fullyUnsent)}
          isLoading={unsent.isLoading}
        />
        <StatTile
          label="Partial fires"
          value={figure(partial, true)}
          isLoading={unsent.isLoading}
        />
      </StatRow>

      <KdsNotice icon={Clock} className="max-sm:hidden">
        <UnsentMeaning />
      </KdsNotice>

      {unsent.isError && (
        <LoadError
          title="We couldn't load unsent items"
          detail={unsent.error instanceof Error ? unsent.error.message : undefined}
          onRetry={() => void unsent.refetch()}
        />
      )}

      {!failedWithoutData && (
        <div className="min-w-0">
          {/*
            §5.3 (D-26): the table from `md`, cards below. Columns are tiered
            so nothing scrolls sideways inside the panel. Order takes what the
            fixed columns leave: md ~414px - 284 = 130; lg adds status
            (670 - 428) = 242; xl adds created + sent (926 - 652) = 274, and
            2xl gives order the rest. `table-fixed` keeps every row one line (§5.7).
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
                <TableHead>Order</TableHead>
                <TableHead className="hidden w-36 lg:table-cell">Status</TableHead>
                <TableHead className="hidden w-36 xl:table-cell">Created</TableHead>
                <TableHead className="w-24 text-right">Unsent</TableHead>
                <TableHead className="hidden w-20 text-right xl:table-cell">
                  Sent
                </TableHead>
                <TableHead className="w-36">Coverage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unsent.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={UNSENT_COLUMNS}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    Loading unsent items…
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableEmptyRow
                  colSpan={UNSENT_COLUMNS}
                  title={emptyTitle}
                  hint={emptyHint}
                />
              ) : (
                pageRows.map((order) => (
                  <UnsentOrderRow key={order.order_id} order={order} />
                ))
              )}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {unsent.isLoading ? (
              <RecordCardSkeletons count={4} />
            ) : pageRows.length === 0 ? (
              <CardGridEmpty title={emptyTitle} hint={emptyHint} />
            ) : (
              pageRows.map((order) => (
                <UnsentOrderCard key={order.order_id} order={order} />
              ))
            )}
          </div>

          <PaginationBar
            pagination={pagination}
            onPageChange={setPage}
            itemLabel="orders"
          />
          {!unsent.isLoading &&
            orders.length > 0 &&
            orders.length <= UNSENT_PAGE_SIZE && (
              <p className="mt-3 text-xs text-muted-foreground tabular-nums sm:text-sm">
                {orders.length} {orders.length === 1 ? "order" : "orders"}
              </p>
            )}
        </div>
      )}
    </div>
  );
});
