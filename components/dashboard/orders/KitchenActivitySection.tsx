"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  DetailCard,
  DetailHeader,
  DetailBody,
} from "@/components/dashboard/orders/OrderDetailPrimitives";
import { cn } from "@/lib/utils";
import {
  Send,
  Flame,
  Eye,
  ChefHat,
  CheckCircle2,
  ArrowUpFromLine,
} from "lucide-react";
import type { OrderFullHistoryItem } from "@/types/order-full-history";

type KitchenEvent = OrderFullHistoryItem["kitchen_events"][number];

const stepMeta: Record<
  KitchenEvent["event_type"],
  { label: string; icon: React.ReactNode; tone: string }
> = {
  kitchen_sent: {
    label: "Sent",
    icon: <Send className="h-3.5 w-3.5" />,
    tone: "text-sky-600 bg-sky-100 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800",
  },
  kitchen_fired: {
    label: "Fired",
    icon: <Flame className="h-3.5 w-3.5" />,
    tone: "text-orange-600 bg-orange-100 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  },
  kitchen_acknowledged: {
    label: "Acknowledged",
    icon: <Eye className="h-3.5 w-3.5" />,
    tone: "text-indigo-600 bg-indigo-100 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800",
  },
  kitchen_preparing: {
    label: "Preparing",
    icon: <ChefHat className="h-3.5 w-3.5" />,
    tone: "text-amber-600 bg-amber-100 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  },
  kitchen_ready: {
    label: "Ready",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    tone: "text-emerald-600 bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  kitchen_bumped: {
    label: "Bumped",
    icon: <ArrowUpFromLine className="h-3.5 w-3.5" />,
    tone: "text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800",
  },
};

const stepOrder: KitchenEvent["event_type"][] = [
  "kitchen_sent",
  "kitchen_fired",
  "kitchen_acknowledged",
  "kitchen_preparing",
  "kitchen_ready",
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "0s";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec === 0 ? `${min}m` : `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin === 0 ? `${hr}h` : `${hr}h ${remMin}m`;
}

function ItemRow({ item }: { item: OrderFullHistoryItem }) {
  const events = item.kitchen_events ?? [];

  // De-dupe by event_type (keep earliest occurrence for the main stepper);
  // bumps are appended separately below.
  const earliestByType = new Map<KitchenEvent["event_type"], KitchenEvent>();
  for (const e of events) {
    const existing = earliestByType.get(e.event_type);
    if (!existing || Date.parse(e.timestamp) < Date.parse(existing.timestamp)) {
      earliestByType.set(e.event_type, e);
    }
  }
  const bumps = events.filter((e) => e.event_type === "kitchen_bumped");

  // Pick the steps that actually have a timestamp, in canonical order.
  const reached = stepOrder
    .map((t) => earliestByType.get(t))
    .filter(Boolean) as KitchenEvent[];

  const firstTs = reached[0]?.timestamp;
  const lastReady = earliestByType.get("kitchen_ready");
  const totalMs =
    firstTs && lastReady
      ? Date.parse(lastReady.timestamp) - Date.parse(firstTs)
      : null;

  if (reached.length === 0 && bumps.length === 0) {
    return (
      <div className="rounded-lg px-2 py-3 transition-colors hover:bg-muted/50">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">
            {item.quantity}× {item.item_name}
          </span>
          <span className="text-xs text-muted-foreground italic">
            No kitchen activity recorded
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg px-2 py-3 space-y-3 transition-colors hover:bg-muted/50",
        item.is_voided && "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "font-medium text-sm truncate",
              item.is_voided && "line-through"
            )}
          >
            {item.quantity}× {item.item_name}
          </span>
          {item.is_voided && (
            <Badge variant="destructive" className="text-[10px]">
              Voided
            </Badge>
          )}
          {item.kitchen_status && !item.is_voided && (
            <Badge variant="outline" className="text-[10px] capitalize">
              {item.kitchen_status}
            </Badge>
          )}
        </div>
        {totalMs != null && totalMs > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            Total: <span className="font-medium">{formatDuration(totalMs)}</span>
          </span>
        )}
      </div>

      {/* Stepper */}
      <div className="flex items-start gap-0 flex-wrap">
        {reached.map((step, idx) => {
          const meta = stepMeta[step.event_type];
          const prev = reached[idx - 1];
          const deltaMs = prev
            ? Date.parse(step.timestamp) - Date.parse(prev.timestamp)
            : null;
          return (
            <React.Fragment key={`${step.event_type}-${idx}`}>
              {idx > 0 && (
                <div className="flex flex-col items-center pt-2 px-1 min-w-[40px]">
                  <div className="h-px w-full bg-border" />
                  {deltaMs != null && (
                    <span className="text-[10px] text-muted-foreground mt-1">
                      +{formatDuration(deltaMs)}
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-col items-start gap-1 min-w-[120px]">
                <div
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
                    meta.tone
                  )}
                >
                  {meta.icon}
                  <span className="font-medium">{meta.label}</span>
                </div>
                <div className="pl-1">
                  <p className="text-[11px] text-muted-foreground">
                    {formatTime(step.timestamp)}
                  </p>
                  {(step.actor_name || step.display_name) && (
                    <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                      {step.display_name && <span>{step.display_name}</span>}
                      {step.display_name && step.actor_name && <span> · </span>}
                      {step.actor_name && <span>{step.actor_name}</span>}
                    </p>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Bumps (per display, after the main lifecycle) */}
      {bumps.length > 0 && (
        <div className="pt-2 border-t space-y-1">
          {bumps.map((b, idx) => (
            <div
              key={`bump-${idx}`}
              className="flex items-center gap-2 text-[11px] text-muted-foreground"
            >
              <ArrowUpFromLine className="h-3 w-3" />
              <span>Bumped {formatTime(b.timestamp)}</span>
              {b.display_name && <span>· {b.display_name}</span>}
              {b.actor_name && <span>· {b.actor_name}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface KitchenActivitySectionProps {
  items: OrderFullHistoryItem[];
}

export function KitchenActivitySection({ items }: KitchenActivitySectionProps) {
  // Only render the card if at least one item has any kitchen event.
  const hasActivity = items.some(
    (it) => (it.kitchen_events?.length ?? 0) > 0
  );
  if (!hasActivity) return null;

  // Show non-voided items first; keep voided ones in case they were bumped/voided
  // late in the kitchen lifecycle.
  const sorted = [...items].sort((a, b) => {
    if (a.is_voided !== b.is_voided) return a.is_voided ? 1 : -1;
    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });

  return (
    <DetailCard>
      <DetailHeader
        icon={ChefHat}
        label="Kitchen Activity"
        caption="Per-item KDS lifecycle — sent, acknowledged, preparing, ready"
      />
      <DetailBody className="-mx-2">
        {sorted.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </DetailBody>
    </DetailCard>
  );
}
