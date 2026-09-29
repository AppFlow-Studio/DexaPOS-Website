"use client";

import * as React from "react";
import { EyeOff, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { KdsDeviceTruthHealthRow } from "@/app/manage/actions/kds-device-truth";
import { CardGridEmpty } from "@/app/manage/transactions/components/ledger-primitives";

/**
 * Rolling seven-day per-display health cards for a location.
 *
 * The headline number is the ack rate: of the items the server routed to a
 * display, how many did that display acknowledge painting. A display with
 * `device_reporting = false` has NEVER reported, so its other numbers are not
 * evidence of a fault -- the whole card defers to that fact, in the same way
 * the per-item verdicts return NO_DEVICE_DATA.
 *
 * Clicking a card selects that display for the timeline and divergence list.
 *
 * Neutral throughout (UI-DESIGN-SYSTEM §3.5): device-truth findings are not
 * HQ-2 alarms, so a render-suspect count is marked by weight, not amber.
 */
export function KdsDisplayHealthCards({
  rows,
  selectedDisplayId,
  onSelectDisplay,
  isLoading,
}: {
  rows: KdsDeviceTruthHealthRow[];
  selectedDisplayId: string | null;
  onSelectDisplay: (displayId: string | null) => void;
  isLoading: boolean;
}) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl bg-muted/45 p-4">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-3 h-8 w-24" />
            <Skeleton className="mt-2 h-3 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <CardGridEmpty
        title="No KDS displays at this location"
        hint="Health covers every KDS display configured here. Add a display in the location's KDS settings and it will appear once it has routed items."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => {
        const isSelected = selectedDisplayId === row.kds_display_id;
        const reporting = row.device_reporting === true;
        const routed = row.routed_items ?? 0;
        const acked = row.acked_items ?? 0;
        const suspect = row.render_suspect_items ?? 0;

        return (
          <button
            key={row.kds_display_id ?? row.display_name ?? "unknown"}
            type="button"
            aria-pressed={isSelected}
            onClick={() =>
              onSelectDisplay(
                isSelected ? null : (row.kds_display_id ?? null)
              )
            }
            className={cn(
              "flex min-w-0 flex-col gap-2 rounded-2xl p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              // The selected card is a state: a ring, not a new box (§5.3).
              isSelected
                ? "bg-muted ring-1 ring-border"
                : "bg-muted/45 hover:bg-muted/70"
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              {reporting ? (
                <Radio className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-sm font-medium">
                {row.display_name ?? "Unnamed display"}
              </span>
              {isSelected && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  Selected
                </span>
              )}
            </div>

            {!reporting ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  No device data.
                </span>{" "}
                This display has never reported — the POS emitter has not
                shipped to it yet. Its other numbers are not evidence of a fault.
              </p>
            ) : (
              <>
                <p className="text-2xl font-medium leading-tight tracking-[-0.02em] tabular-nums">
                  {row.ack_rate_pct !== null
                    ? `${row.ack_rate_pct.toFixed(1)}%`
                    : "—"}
                  <span className="ml-1.5 text-xs font-normal tracking-normal text-muted-foreground">
                    acked
                  </span>
                </p>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground tabular-nums">
                      {routed}
                    </span>{" "}
                    routed
                  </span>
                  <span>
                    <span className="font-medium text-foreground tabular-nums">
                      {acked}
                    </span>{" "}
                    acked
                  </span>
                  <span>
                    <span className="font-medium text-foreground tabular-nums">
                      {row.arrived_items ?? 0}
                    </span>{" "}
                    arrived
                  </span>
                  {suspect > 0 && (
                    <span className="font-medium text-foreground">
                      <span className="tabular-nums">{suspect}</span>{" "}
                      render-suspect
                    </span>
                  )}
                </p>
              </>
            )}

            {routed === 0 && reporting && (
              <p className="text-xs text-muted-foreground">
                Nothing routed to this display in the last 7 days.
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
