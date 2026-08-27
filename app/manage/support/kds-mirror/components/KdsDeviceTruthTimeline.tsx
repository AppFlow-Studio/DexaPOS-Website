"use client";

import * as React from "react";
import { format } from "date-fns";
import { GitCompareArrows, Radio, Server } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type {
  KdsDisplayTruthWindow,
  KdsDeviceTruthEvent,
  KdsDeviceTruthItem,
} from "@/app/manage/actions/kds-device-truth";

/**
 * A lane renders at most this many entries and reveals the rest on demand.
 * A busy display's 24h window can hold thousands of events per lane; drawing
 * them all at once is a wall of DOM for a view whose job is "spot the gap".
 */
const TIMELINE_PAGE_SIZE = 100;

const EVENT_LABEL: Record<string, { label: string; dot: string }> = {
  arrived: {
    label: "Received by device",
    dot: "bg-sky-500",
  },
  ack: {
    label: "Painted (ack)",
    dot: "bg-emerald-500",
  },
  start_preparing: {
    label: "Started preparing",
    dot: "bg-slate-400",
  },
  mark_ready: {
    label: "Marked ready",
    dot: "bg-slate-400",
  },
  bump_done: {
    label: "Bumped done",
    dot: "bg-slate-400",
  },
  recalled: {
    label: "Recalled",
    dot: "bg-slate-400",
  },
  void_shown: {
    label: "Void shown",
    dot: "bg-slate-400",
  },
  void_cleared: {
    label: "Void cleared",
    dot: "bg-slate-400",
  },
};

interface TimelineEntry {
  ts: string;
  lane: "server" | "device";
  label: string;
  dot: string;
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
          ? "Routed to display"
          : `Routing: ${item.server_outcome ?? "unknown"}`,
      dot:
        item.server_outcome === "routed"
          ? "bg-emerald-500"
          : "bg-slate-400",
      itemName: item.item_name,
      orderNumber: item.order_number,
      skewMs: null,
    }));
}

function deviceEntries(window: KdsDisplayTruthWindow): TimelineEntry[] {
  return window.device_events.map<TimelineEntry>(
    (event: KdsDeviceTruthEvent) => {
      const meta = EVENT_LABEL[event.event_type] ?? {
        label: event.event_type,
        dot: "bg-slate-400",
      };
      return {
        // Order the timeline on SERVER receipt time (received_at) — device
        // clocks drift, sleep and lie; received_at is the only ordering key.
        ts: event.received_at,
        lane: "device",
        label: meta.label,
        dot: meta.dot,
        itemName: null,
        orderNumber: null,
        skewMs: event.clock_skew_ms,
      };
    }
  );
}

/**
 * One column of the truth timeline. Module-scope (not created inside the
 * parent's render) so the paginated rows do not remount on every parent
 * re-render, and `react-hooks/static-components` stays satisfied.
 */
function Lane({
  title,
  icon,
  entries,
  visibleCount,
  emptyText,
  emptyDot,
  onShowMore,
}: {
  title: string;
  icon: React.ReactNode;
  entries: TimelineEntry[];
  /** How many of `entries` are currently drawn (incremental pagination). */
  visibleCount: number;
  emptyText: string;
  emptyDot: string;
  onShowMore: () => void;
}) {
  const shown = entries.slice(0, visibleCount);
  const remaining = entries.length - visibleCount;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {entries.length} event{entries.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="max-h-80 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", emptyDot)} />
            {emptyText}
          </div>
        ) : (
          <ol className="space-y-3">
            {shown.map((entry, i) => (
              <li key={`${entry.lane}-${i}`} className="flex gap-2">
                <div className="flex flex-col items-center">
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", entry.dot)} />
                  {i < shown.length - 1 && (
                    <span className="w-px flex-1 bg-border" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium">
                    {format(new Date(entry.ts), "HH:mm:ss")}
                    {entry.skewMs !== null && (
                      <span
                        className="ml-1 text-[10px] text-muted-foreground"
                        title={`Device clock skew ${entry.skewMs} ms vs server`}
                      >
                        (skew {entry.skewMs} ms)
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.label}
                    {entry.itemName ? ` · ${entry.itemName}` : ""}
                    {entry.orderNumber ? ` · #${entry.orderNumber}` : ""}
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
            className="mt-3 w-full"
            onClick={onShowMore}
          >
            Show {Math.min(TIMELINE_PAGE_SIZE, remaining)} more · {remaining}
            remaining
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

  const [prevWindow, setPrevWindow] = React.useState(window);
  if (prevWindow !== window) {
    setPrevWindow(window);
    setServerVisible(TIMELINE_PAGE_SIZE);
    setDeviceVisible(TIMELINE_PAGE_SIZE);
  }

  if (isLoading && !window) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!window) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
        <GitCompareArrows className="mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Pick a display to see its truth timeline</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The server lane and the device lane are drawn side by side so a gap on
          the right is visible at a glance.
        </p>
      </div>
    );
  }

  const server = serverEntries(window).sort((a, b) => a.ts.localeCompare(b.ts));
  const device = deviceEntries(window).sort((a, b) => a.ts.localeCompare(b.ts));
  const hasDeviceData =
    window.has_any_device_data && device.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Lane
        title="Server lane"
        icon={<Server className="h-4 w-4 text-muted-foreground" />}
        entries={server}
        visibleCount={serverVisible}
        emptyText="Nothing in the routing log for this display in the window."
        emptyDot="bg-slate-400"
        onShowMore={() =>
          setServerVisible((v) => v + TIMELINE_PAGE_SIZE)
        }
      />
      <Lane
        title="Device lane"
        icon={<Radio className="h-4 w-4 text-muted-foreground" />}
        entries={device}
        visibleCount={deviceVisible}
        emptyText={
          hasDeviceData
            ? "The device is reporting, but reported nothing in this window."
            : "This display has never reported — the POS emitter has not shipped to it yet."
        }
        emptyDot={hasDeviceData ? "bg-slate-400" : "bg-amber-400"}
        onShowMore={() =>
          setDeviceVisible((v) => v + TIMELINE_PAGE_SIZE)
        }
      />
    </div>
  );
}
