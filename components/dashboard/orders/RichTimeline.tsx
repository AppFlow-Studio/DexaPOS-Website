"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { OrderFullHistoryTimeline } from "@/types/order-full-history";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  ShoppingCart,
  CreditCard,
  RotateCcw,
  Tag,
  ChefHat,
  Utensils,
  ShieldAlert,
  Settings,
  ArrowRightLeft,
} from "lucide-react";

interface RichTimelineProps {
  events: OrderFullHistoryTimeline[];
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const categoryIcon: Record<
  OrderFullHistoryTimeline["category"],
  React.ReactNode
> = {
  status: <ArrowRightLeft className="h-3.5 w-3.5" />,
  item: <ShoppingCart className="h-3.5 w-3.5" />,
  payment: <CreditCard className="h-3.5 w-3.5" />,
  refund: <RotateCcw className="h-3.5 w-3.5" />,
  discount: <Tag className="h-3.5 w-3.5" />,
  kitchen: <ChefHat className="h-3.5 w-3.5" />,
  session: <Utensils className="h-3.5 w-3.5" />,
  chargeback: <ShieldAlert className="h-3.5 w-3.5" />,
  system: <Settings className="h-3.5 w-3.5" />,
};

const severityDot: Record<OrderFullHistoryTimeline["severity"], string> = {
  info: "bg-gray-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

const severityIcon: Record<
  OrderFullHistoryTimeline["severity"],
  React.ReactNode
> = {
  info: <Info className="h-3 w-3 text-gray-400" />,
  success: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
  warning: <AlertTriangle className="h-3 w-3 text-amber-500" />,
  error: <AlertCircle className="h-3 w-3 text-red-500" />,
};

export function RichTimeline({ events }: RichTimelineProps) {
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  if (!events || events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No timeline events available
      </p>
    );
  }

  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  return (
    <div className="relative">
      <div className="absolute left-[9px] top-0 bottom-0 w-px bg-border" />
      <div className="space-y-4">
        {sorted.map((event, i) => {
          const hasDetails =
            event.details && Object.keys(event.details).length > 0;
          const isOpen = expanded.has(i);

          return (
            <div key={i} className="relative flex gap-3">
              <div className="relative z-10 flex-shrink-0 w-[18px] flex items-center justify-center mt-0.5">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    severityDot[event.severity]
                  )}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-muted-foreground">
                        {categoryIcon[event.category]}
                      </span>
                      <span className="text-sm leading-snug">
                        {event.description}
                      </span>
                      {severityIcon[event.severity]}
                    </div>

                    {(event.actor_name || event.actor_role) && (
                      <p className="text-xs text-muted-foreground">
                        {event.actor_name}
                        {event.actor_role ? ` · ${event.actor_role}` : ""}
                      </p>
                    )}

                    {hasDetails && (
                      <button
                        onClick={() => toggle(i)}
                        className="text-xs text-primary underline-offset-2 hover:underline mt-1"
                      >
                        {isOpen ? "Hide details" : "Show details"}
                      </button>
                    )}

                    {isOpen && hasDetails && (
                      <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                        {JSON.stringify(event.details, null, 2)}
                      </pre>
                    )}
                  </div>

                  <span className="flex-shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(event.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
