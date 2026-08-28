"use client";

import * as React from "react";
import { MonitorX, Radio, Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { KdsDeviceTruthHealthRow } from "@/app/manage/actions/kds-device-truth";

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
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return null;
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
            onClick={() =>
              onSelectDisplay(
                isSelected ? null : (row.kds_display_id ?? null)
              )
            }
            className={cn(
              "flex flex-col gap-2 rounded-lg border bg-card p-3 text-left shadow-sm transition-colors",
              isSelected
                ? "border-ring ring-1 ring-ring"
                : "hover:border-border/80 hover:bg-accent/40"
            )}
          >
            <div className="flex items-center gap-2">
              {reporting ? (
                <Radio className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-sm font-semibold">
                {row.display_name ?? "Unnamed display"}
              </span>
              {isSelected && (
                <Eye className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </div>

            {!reporting ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <span className="font-semibold">No device data.</span> This
                display has never reported — the POS emitter has not shipped to
                it yet. Its other numbers are not evidence of a fault.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">{routed}</span>{" "}
                  routed
                </span>
                <span>
                  <span className="font-semibold text-foreground">{acked}</span>{" "}
                  acked
                </span>
                <span>
                  <span className="font-semibold text-foreground">
                    {row.arrived_items ?? 0}
                  </span>{" "}
                  arrived
                </span>
                {suspect > 0 && (
                  <Badge
                    variant="outline"
                    className="border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                  >
                    {suspect} render-suspect
                  </Badge>
                )}
                {row.ack_rate_pct !== null && (
                  <Badge
                    variant="outline"
                    className="border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {row.ack_rate_pct.toFixed(1)}% acked
                  </Badge>
                )}
              </div>
            )}

            {routed === 0 && reporting && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MonitorX className="h-3 w-3" />
                Nothing routed to this display in the last 7 days.
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
