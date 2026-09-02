"use client";

import * as React from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight, History, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import type { KdsBoardSnapshotIndexEntry } from "@/app/manage/actions/kds-mirror";

export const TIMELINE_WINDOWS = [
  { key: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { key: "6h", label: "Last 6 hours", ms: 6 * 60 * 60 * 1000 },
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
] as const;

export type TimelineWindowKey = (typeof TIMELINE_WINDOWS)[number]["key"];

const REASON_LABEL: Record<KdsBoardSnapshotIndexEntry["reason"], string> = {
  item_arrived: "Item arrived",
  item_ready: "Marked ready",
  item_served: "Served",
  manual: "Manual capture",
};

/**
 * Replay scrubber.
 *
 * THE MODEL: the slider has count + 1 positions. Positions 0..count-1 are
 * stored snapshots, oldest to newest. The final position IS live.
 *
 * That last part is the whole design. Previously "live" was a null index while
 * the slider still sat parked over the newest snapshot, so the control showed a
 * LIVE badge and a selected timestamp at the same time and there was no way to
 * tell "following the board" apart from "looking at the most recent capture".
 * Making live a real, reachable position on the track removes the ambiguity:
 * you can always see where you are, and dragging to the right end returns to
 * live rather than selecting a snapshot that merely looks current.
 */
export function KdsMirrorTimeline({
  snapshots,
  isLoading,
  selectedIndex,
  onSelectIndex,
  windowKey,
  onWindowChange,
  isLive,
  onReturnToLive,
}: {
  snapshots: KdsBoardSnapshotIndexEntry[];
  isLoading: boolean;
  selectedIndex: number | null;
  onSelectIndex: (index: number) => void;
  windowKey: TimelineWindowKey;
  onWindowChange: (key: TimelineWindowKey) => void;
  isLive: boolean;
  onReturnToLive: () => void;
}) {
  const count = snapshots.length;
  const livePosition = count;
  const position = isLive ? livePosition : (selectedIndex ?? livePosition);
  const selected = isLive ? null : (snapshots[selectedIndex ?? 0] ?? null);

  const handleSlider = (next: number) => {
    if (next >= livePosition) {
      onReturnToLive();
    } else {
      onSelectIndex(next);
    }
  };

  const windowLabel =
    TIMELINE_WINDOWS.find((w) => w.key === windowKey)?.label.toLowerCase() ??
    "window";

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border p-3 transition-colors",
        isLive ? "bg-card" : "border-violet-400 bg-violet-50/50 dark:bg-violet-950/20"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <History className="h-4 w-4" />
          <span className="text-sm font-medium">Replay</span>
        </div>

        <p className="text-xs text-muted-foreground">
          What this station&apos;s board looked like earlier.
        </p>

        <div className="ml-auto flex items-center gap-1">
          {TIMELINE_WINDOWS.map((w) => (
            <Button
              key={w.key}
              variant={windowKey === w.key ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onWindowChange(w.key)}
            >
              {w.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : count === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          Nothing recorded in the {windowLabel}. Either nothing fired at this
          station, or no order has been sent since board history was switched
          on.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Previous change"
              disabled={position <= 0}
              onClick={() => handleSlider(position - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Slider
              className="flex-1"
              min={0}
              max={livePosition}
              step={1}
              value={[position]}
              onValueChange={(value) => handleSlider(value[0])}
              aria-label="Board history position"
            />

            {/* The right end of the track is live, and is labelled so on the
                track itself -- not only in a badge somewhere else. */}
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                isLive
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Radio className="h-3 w-3" />
              Live
            </span>

            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Next change"
              disabled={position >= livePosition}
              onClick={() => handleSlider(position + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* One status line, never two competing ones. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {isLive ? (
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                Following the board live
              </span>
            ) : (
              <>
                <span className="font-medium text-violet-700 dark:text-violet-300">
                  {selected
                    ? format(new Date(selected.captured_at), "HH:mm:ss")
                    : "--"}
                </span>
                {selected && (
                  <>
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(new Date(selected.captured_at), {
                        addSuffix: true,
                      })}
                    </span>
                    <span className="text-muted-foreground">
                      {REASON_LABEL[selected.reason]}
                    </span>
                    <span className="text-muted-foreground">
                      {selected.ticket_count} ticket
                      {selected.ticket_count === 1 ? "" : "s"},{" "}
                      {selected.item_count} item
                      {selected.item_count === 1 ? "" : "s"}
                    </span>
                  </>
                )}
                <span className="tabular-nums text-muted-foreground">
                  change {position + 1} of {count}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7"
                  onClick={onReturnToLive}
                >
                  <Radio className="h-3.5 w-3.5" />
                  Back to live
                </Button>
              </>
            )}

            {isLive && (
              <span className="ml-auto text-muted-foreground">
                {count} change{count === 1 ? "" : "s"} recorded in the{" "}
                {windowLabel} &middot; drag left to step back
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
