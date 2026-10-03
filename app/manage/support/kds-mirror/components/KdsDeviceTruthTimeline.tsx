"use client";

import * as React from "react";
import { format } from "date-fns";
import { Radio, Server } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type {
  KdsDisplayTruthWindow,
  KdsDeviceTruthEvent,
  KdsDeviceTruthItem,
} from "@/app/manage/actions/kds-device-truth";
import { CardGridEmpty } from "@/app/manage/transactions/components/ledger-primitives";
import { SegmentedFilter } from "./kds-primitives";

/**
 * A lane renders at most this many entries and reveals the rest on demand.
 * A busy display's 24h window can hold thousands of events per lane; drawing
 * them all at once is a wall of DOM for a view whose job is "spot the gap".
 */
const TIMELINE_PAGE_SIZE = 100;

/**
 * Clock skew is said on a row only when it is large enough to matter; a few
 * milliseconds on every device row is noise. The exact value is always in the
 * row's tooltip.
 */
const SKEW_NOTE_MS = 5000;

/**
 * Event labels. There is no per-event colour (UI-DESIGN-SYSTEM §3.5): the
 * label says what happened, and `key` events — the ones the routed-vs-seen
 * comparison turns on — are marked by weight.
 */
const EVENT_LABEL: Record<string, { label: string; key: boolean }> = {
  arrived: { label: "Received by device", key: true },
  ack: { label: "Painted (ack)", key: true },
  start_preparing: { label: "Started preparing", key: false },
  mark_ready: { label: "Marked ready", key: false },
  bump_done: { label: "Bumped done", key: false },
  recalled: { label: "Recalled", key: false },
  void_shown: { label: "Void shown", key: false },
  void_cleared: { label: "Void cleared", key: false },
};

interface TimelineEntry {
  ts: string;
  lane: "server" | "device";
  /** What happened. Null for a routed server entry: the lane already says so. */
  label: string | null;
  isKey: boolean;
  itemName: string | null;
  orderNumber: string | null;
  skewMs: number | null;
}

function serverEntries(window: KdsDisplayTruthWindow): TimelineEntry[] {
  return window.items
    .filter((item) => item.server_fired_at)
    .map<TimelineEntry>((item: KdsDeviceTruthItem) => ({
      ts: item.server_fired_at!,
      lane: "server",
      label:
        item.server_outcome === "routed"
          ? null
          : `Not routed (${item.server_outcome ?? "unknown"})`,
      isKey: item.server_outcome === "routed",
      itemName: item.item_name,
      orderNumber: item.order_number,
      skewMs: null,
    }));
}

function deviceEntries(window: KdsDisplayTruthWindow): TimelineEntry[] {
  // Name the item on each device row too, so the two lanes read against each
  // other: the event carries only the order item id.
  const itemById = new Map(
    window.items.map((item) => [item.order_item_id, item] as const)
  );
  return window.device_events.map<TimelineEntry>(
    (event: KdsDeviceTruthEvent) => {
      const meta = EVENT_LABEL[event.event_type] ?? {
        label: event.event_type,
        key: false,
      };
      return {
        // Order the timeline on SERVER receipt time (received_at) — device
        // clocks drift, sleep and lie; received_at is the only ordering key.
        ts: event.received_at,
        lane: "device",
        label: meta.label,
        isKey: meta.key,
        itemName: itemById.get(event.order_item_id)?.item_name ?? null,
        orderNumber: itemById.get(event.order_item_id)?.order_number ?? null,
        skewMs: event.clock_skew_ms,
      };
    }
  );
}

/**
 * One column of the truth timeline. Module-scope (not created inside the
 * parent's render) so the paginated rows do not remount on every parent
 * re-render, and `react-hooks/static-components` stays satisfied.
 *
 * A lane is a chronological feed (§5.7): it scrolls inside a viewport-relative
 * cap rather than paging, because there is no "most important" entry to page to.
 */
function Lane({
  title,
  icon,
  entries,
  visibleCount,
  emptyText,
  onShowMore,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  entries: TimelineEntry[];
  /** How many of `entries` are currently drawn (incremental pagination). */
  visibleCount: number;
  emptyText: string;
  onShowMore: () => void;
  className?: string;
}) {
  const shown = entries.slice(0, visibleCount);
  const remaining = entries.length - visibleCount;

  return (
    <div className={cn("min-w-0 rounded-2xl bg-muted/45", className)}>
      {/* Phones name the lane and its count in the segmented switch above. */}
      <div className="flex items-center gap-2 px-4 pt-4 max-md:hidden">
        {icon}
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {entries.length} event{entries.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="thin-scrollbar max-h-[min(60vh,32rem)] overflow-y-auto p-4">
        {entries.length === 0 ? (
          <p className="py-4 text-[0.8125rem] text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          <ol className="space-y-3">
            {shown.map((entry, i) => (
              <li key={`${entry.lane}-${i}`} className="flex gap-2">
                {/* The vertical rail is the timeline's structure, not a
                    divider between sections. */}
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      entry.isKey ? "bg-foreground" : "bg-muted-foreground/50"
                    )}
                  />
                  {i < shown.length - 1 && (
                    <span className="w-px flex-1 bg-border" />
                  )}
                </div>
                <div
                  className="min-w-0"
                  title={
                    entry.skewMs !== null
                      ? `Device clock skew ${entry.skewMs} ms vs server`
                      : undefined
                  }
                >
                  <p className="text-xs font-medium tabular-nums">
                    {format(new Date(entry.ts), "HH:mm:ss")}
                    {entry.skewMs !== null &&
                      Math.abs(entry.skewMs) >= SKEW_NOTE_MS && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          (clock {Math.round(entry.skewMs / 1000)}s off)
                        </span>
                      )}
                  </p>
                  <p
                    className={cn(
                      "truncate text-xs",
                      entry.isKey
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {[
                      entry.label,
                      entry.itemName,
                      entry.orderNumber && `#${entry.orderNumber.replace(/^#+/, "")}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Unnamed item"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {remaining > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-9 w-full"
            onClick={onShowMore}
          >
            Show {Math.min(TIMELINE_PAGE_SIZE, remaining)} more ·{" "}
            <span className="tabular-nums">{remaining}</span> remaining
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Server lane vs device lane for one display window.
 *
 * Left column: what the routing log says the server fired to this display.
 * Right column: what the device itself reported receiving and painting.
 * Reading the two columns side by side is the whole point — a routed item with
 * no device entry on the right is the NEVER_SHOWED case; an ack on the right
 * next to a routed entry is CONFIRMED.
 *
 * Both lanes order on server time. The device's own clock is shown only as a
 * skew hint (tooltip), never as the ordering key — DESIGN NOTE 2 of the
 * migration.
 */
export function KdsDeviceTruthTimeline({
  window,
  isLoading,
}: {
  window: KdsDisplayTruthWindow | null;
  isLoading: boolean;
}) {
  // Incremental pagination per lane — starts at one page and reveals more on
  // demand. Reset when a new window replaces the data set: never in an effect
  // (that would cascade); this is the React-recommended "adjust state during
  // render when a prop changes" pattern, keyed on the window reference so a
  // refetch-in-flight with a placeholder does not reset.
  const [serverVisible, setServerVisible] = React.useState(TIMELINE_PAGE_SIZE);
  const [deviceVisible, setDeviceVisible] = React.useState(TIMELINE_PAGE_SIZE);

  // Phones show one lane at a time: two stacked scroll wells, each up to 60vh,
  // would trap the thumb (§5.7). From `md` both lanes sit side by side.
  const [phoneLane, setPhoneLane] = React.useState<"server" | "device">(
    "server"
  );

  const [prevWindow, setPrevWindow] = React.useState(window);
  if (prevWindow !== window) {
    setPrevWindow(window);
    setServerVisible(TIMELINE_PAGE_SIZE);
    setDeviceVisible(TIMELINE_PAGE_SIZE);
  }

  if (isLoading && !window) {
    return (
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const server = window
    ? serverEntries(window).sort((a, b) => a.ts.localeCompare(b.ts))
    : [];
  const device = window
    ? deviceEntries(window).sort((a, b) => a.ts.localeCompare(b.ts))
    : [];

  // One sentence for an empty window, not two empty lanes (§4.9).
  if (!window || (server.length === 0 && device.length === 0)) {
    return (
      <CardGridEmpty
        title="Nothing routed or reported in this window"
        hint={
          window && !window.has_any_device_data
            ? "This display has never reported, so only the server lane can fill in. Widen the window to look further back."
            : "Widen the window to look further back, or check that the display is online."
        }
      />
    );
  }

  const hasDeviceData = window.has_any_device_data && device.length > 0;

  return (
    <div className="space-y-3">
      <SegmentedFilter
        ariaLabel="Timeline lane"
        value={phoneLane}
        onValueChange={setPhoneLane}
        options={[
          { key: "server", label: "Server lane", count: server.length },
          { key: "device", label: "Device lane", count: device.length },
        ]}
        className="md:hidden"
      />
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <Lane
          className={cn(phoneLane !== "server" && "max-md:hidden")}
          title="Server lane"
          icon={<Server className="h-4 w-4 text-muted-foreground" />}
          entries={server}
          visibleCount={serverVisible}
          emptyText="Nothing in the routing log for this display in the window."
          onShowMore={() =>
            setServerVisible((v) => v + TIMELINE_PAGE_SIZE)
          }
        />
        <Lane
          className={cn(phoneLane !== "device" && "max-md:hidden")}
          title="Device lane"
          icon={<Radio className="h-4 w-4 text-muted-foreground" />}
          entries={device}
          visibleCount={deviceVisible}
          emptyText={
            hasDeviceData
              ? "The device is reporting, but reported nothing in this window."
              : "This display has never reported — the POS emitter has not shipped to it yet."
          }
          onShowMore={() =>
            setDeviceVisible((v) => v + TIMELINE_PAGE_SIZE)
          }
        />
      </div>
    </div>
  );
}
