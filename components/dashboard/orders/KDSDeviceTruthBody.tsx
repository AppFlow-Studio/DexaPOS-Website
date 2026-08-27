"use client";

import * as React from "react";
import { format } from "date-fns";
import { Radio, EyeOff, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  KdsDeviceTruthVerdict,
  OrderDeviceTruth,
} from "@/app/dashboard/actions/order-device-truth";

/**
 * Verdict labels for the order sheet's Device view. Kept local to this
 * dashboard component (the HQ support page has its own copy under
 * app/manage/support/kds-truth) so the two surfaces can never drift in what a
 * verdict means.
 */
const VERDICT_META: Record<
  KdsDeviceTruthVerdict,
  { label: string; tone: string; description: string }
> = {
  CONFIRMED: {
    label: "Confirmed",
    tone: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    description:
      "Server routed it and the device acknowledged painting it. The kitchen really showed this.",
  },
  RENDER_SUSPECT: {
    label: "Render suspect",
    tone: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    description:
      "The device received it but never reported painting it.",
  },
  NEVER_SHOWED: {
    label: "Never showed",
    tone: "border-transparent bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    description:
      "Server routed it, the device was online, but the device never reported receiving it.",
  },
  OFFLINE: {
    label: "Offline at fire",
    tone: "border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    description:
      "Routed while the device was offline. Expected, not a bug.",
  },
  GHOST: {
    label: "Ghost",
    tone: "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    description:
      "The device reported an event but the routing log has no decision for this item. Stale cache on the device.",
  },
  NOT_ROUTED: {
    label: "Not routed",
    tone: "border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    description: "The routing log has a non-routed decision for this item.",
  },
  NO_DEVICE_DATA: {
    label: "No device data",
    tone: "border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    description:
      "This display has never reported. Absence of device evidence is not evidence of a fault.",
  },
};

function LoadingBody() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

/**
 * The device side of the story for one order: what each kitchen display
 * reported it received and painted, next to what the server routed.
 *
 * Honesty rule kept on the surface: NO_DEVICE_DATA means the display has never
 * reported (the emitter has not shipped to it yet), not that it is broken.
 */
export function KDSDeviceTruthBody({
  deviceTruth,
  isLoading,
}: {
  deviceTruth: OrderDeviceTruth | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <LoadingBody />;
  }

  if (!deviceTruth || deviceTruth.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-8 text-center">
        <EyeOff className="mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          No device truth for this order
        </p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          The device event ledger is empty for this order. If the kitchen
          reports a missing ticket, the displays may not be reporting yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {!deviceTruth.has_any_device_data && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="font-semibold">
            None of these displays have reported device data yet.
          </span>{" "}
          Every row below is “no device data”, which is not evidence of a
          fault — it means the kitchen displays have not shipped the reporting
          update.
        </p>
      )}

      {deviceTruth.items.map((item) => {
        const meta = VERDICT_META[item.verdict];
        return (
          <div
            key={`${item.order_item_id}-${item.kds_display_id ?? "none"}`}
            className={cn(
              "flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5",
              item.verdict === "NEVER_SHOWED" && "border-red-300/70 bg-red-50/50 dark:border-red-800/60 dark:bg-red-950/20"
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {item.item_name ?? "Item"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.kds_display_name ?? "Unknown display"}
                {item.server_fired_at
                  ? ` · routed ${format(
                      new Date(item.server_fired_at),
                      "HH:mm"
                    )}`
                  : ""}
                {item.arrived_at
                  ? ` · device received ${format(
                      new Date(item.arrived_at),
                      "HH:mm"
                    )}`
                  : ""}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn("shrink-0", meta.tone)}
              title={meta.description}
            >
              {meta.label}
            </Badge>
          </div>
        );
      })}

      {deviceTruth.items.some((i) => i.verdict === "NEVER_SHOWED") && (
        <p className="flex items-start gap-1.5 pt-1 text-xs text-red-700 dark:text-red-300">
          <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Items marked “never showed” were routed to an online display that
          never reported receiving them — the case this tooling exists to find.
        </p>
      )}
      {deviceTruth.items.some((i) => i.verdict === "CONFIRMED") &&
        !deviceTruth.items.some((i) => i.verdict === "NEVER_SHOWED") && (
          <p className="flex items-start gap-1.5 pt-1 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Everything routed was acknowledged as painted by the kitchen
            displays.
          </p>
        )}
    </div>
  );
}
