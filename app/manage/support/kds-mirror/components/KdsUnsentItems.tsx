"use client";

import * as React from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  PackageX,
  Send,
  UtensilsCrossed,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type KdsUnsentItem,
  type KdsUnsentOrder,
} from "@/app/manage/actions/kds-mirror";
import { useKdsUnsentItems } from "../hooks/useKdsMirror";
import { TablePagination } from "./TablePagination";

export const UNSENT_WINDOWS = [
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "90d", label: "Last 90 days", ms: 90 * 24 * 60 * 60 * 1000 },
] as const;

export type UnsentWindowKey = (typeof UNSENT_WINDOWS)[number]["key"];

/** Fixed page size for the unsent-items table; the window itself is fetched whole. */
const UNSENT_PAGE_SIZE = 100;

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

function OrderStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <Badge variant="outline">—</Badge>;
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "draft" &&
          "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300",
        status === "completed" &&
          "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
      )}
    >
      {ORDER_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function UnsentOrderRow({ order }: { order: KdsUnsentOrder }) {
  const [expanded, setExpanded] = React.useState(false);
  const partial = order.sent_item_count > 0;

  return (
    <React.Fragment>
      <TableRow
        className={cn(
          "cursor-pointer",
          !partial &&
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
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {order.order_number
                ? `#${order.order_number}`
                : order.order_id.slice(0, 8)}
            </span>
            {order.order_type && (
              <Badge variant="secondary" className="text-[11px]">
                {order.order_type}
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <OrderStatusBadge status={order.order_status} />
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <span className="text-sm" title={order.order_created_at}>
            {format(new Date(order.order_created_at), "MMM d, h:mm a")}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(order.order_created_at), {
              addSuffix: true,
            })}
          </span>
        </TableCell>
        <TableCell>
          <span
            className={cn(
              "font-mono text-sm font-semibold",
              !partial
                ? "text-amber-600 dark:text-amber-400"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {order.unsent_item_count}
          </span>
          <span className="ml-1.5 text-xs text-muted-foreground">
            unsent of {order.total_item_count}
          </span>
        </TableCell>
        <TableCell className="font-mono text-sm text-muted-foreground">
          {order.sent_item_count}
        </TableCell>
        <TableCell>
          {partial ? (
            <Badge
              variant="destructive"
              className="gap-1 text-[11px]"
              title="Some items fired to the kitchen; these did not."
            >
              <AlertTriangle className="h-3 w-3" /> Partial fire
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-amber-300 text-amber-700 text-[11px] dark:border-amber-800 dark:text-amber-300"
              title="Nothing on this order ever fired to the kitchen."
            >
              <PackageX className="h-3 w-3" /> Nothing sent
            </Badge>
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={7} className="bg-muted/30 px-8 py-3">
            <UnsentItemList items={order.items} />
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
}

function UnsentItemList({ items }: { items: KdsUnsentItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No unsent item detail recorded for this order.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/60 rounded-md border bg-background">
      {items.map((item) => (
        <div
          key={item.order_item_id}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2"
        >
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
          {item.category_name && (
            <Badge variant="secondary" className="text-[11px]">
              {item.category_name}
            </Badge>
          )}
          {item.prep_station && (
            <Badge variant="outline" className="gap-1 text-[11px]">
              <UtensilsCrossed className="h-3 w-3" />
              {item.prep_station}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            added {formatDistanceToNow(new Date(item.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      ))}
    </div>
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
  const [page, setPage] = React.useState(0);

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

  const handleWindowChange = (key: UnsentWindowKey) => {
    setWindowKey(key);
    setPage(0);
    const end = Date.now();
    setWindowEnd(end);
    setWindowStart(end - windowMsForKey(key));
  };

  const toIso = new Date(windowEnd).toISOString();
  const fromIso = new Date(windowStart).toISOString();

  const unsent = useKdsUnsentItems(locationId, fromIso, toIso, orderId);
  const orders = unsent.data ?? [];

  const totalPages = Math.max(1, Math.ceil(orders.length / UNSENT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageOrders = orders.slice(
    safePage * UNSENT_PAGE_SIZE,
    (safePage + 1) * UNSENT_PAGE_SIZE
  );

  const unsentItemCount = orders.reduce(
    (sum, order) => sum + order.unsent_item_count,
    0
  );
  const fullyUnsent = orders.filter((o) => o.fully_unsent).length;
  const partial = orders.filter(
    (o) => !o.fully_unsent && o.unsent_item_count > 0
  ).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Same no-silent-filter rule as the ledger: a ?order= deep link pins
          this view to one order; make it visible and dismissible. */}
      {orderId && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <span className="font-medium">
            Showing unsent items for one order.
          </span>
          {onClearOrder ? (
            <button
              type="button"
              className="font-semibold underline underline-offset-2 hover:opacity-80"
              onClick={onClearOrder}
            >
              Show all orders
            </button>
          ) : (
            <span className="text-muted-foreground">
              Pick the order from the board to clear.
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={windowKey}
          onValueChange={(v) => handleWindowChange(v as UnsentWindowKey)}
        >
          <SelectTrigger className="h-8 w-37.5 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNSENT_WINDOWS.map((w) => (
              <SelectItem key={w.key} value={w.key}>
                {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          by order created date
        </span>
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryCard label="Orders w/ unsent items" value={orders.length} tone="default" />
        <SummaryCard label="Unsent items" value={unsentItemCount} tone="warn" />
        <SummaryCard label="Fully unsent orders" value={fullyUnsent} tone="warn" />
        <SummaryCard label="Partial fires" value={partial} tone="danger" />
      </div>

      {/* How to read this */}
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold">What &quot;unsent&quot; means.</span>{" "}
          An item is unsent when the kitchen never received it.
          <span className="font-semibold"> Nothing sent</span> = the whole
          order never fired (a draft nobody sent, or the send never reached
          the server). <span className="font-semibold">Partial fire</span> =
          some items made it to the kitchen but these did not.
        </p>
      </div>

      {unsent.isError && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          Could not load unsent items:{" "}
          {unsent.error instanceof Error ? unsent.error.message : "unknown"}
        </p>
      )}

      {unsent.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
          <Send className="mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">No unsent items in this window</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Every non-voided item on every open order created in this window
            has fired to the kitchen. Widen the window if you are chasing an
            older order.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8" />
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Unsent</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Coverage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageOrders.map((order) => (
                <UnsentOrderRow key={order.order_id} order={order} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!unsent.isLoading && orders.length > 0 && (
        <TablePagination
          page={safePage}
          pageSize={UNSENT_PAGE_SIZE}
          totalCount={orders.length}
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
  tone: "default" | "danger" | "warn";
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "danger" && "text-red-600 dark:text-red-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
