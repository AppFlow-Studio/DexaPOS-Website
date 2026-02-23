"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  ShoppingCart,
  CreditCard,
  RefreshCw,
  Tag,
  ChefHat,
  Armchair,
  AlertTriangle,
  Server,
  ChevronDown,
  ChevronUp,
  Clock,
  ToggleLeft,
} from "lucide-react";
import type {
  OrderFullHistory,
  OrderFullHistoryTimelineEvent,
  TimelineCategory,
  TimelineSeverity,
} from "@/types/order-full-history";

// ─── Category config ───

interface CategoryConfig {
  label: string;
  icon: React.ReactNode;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const CATEGORY_CONFIG: Record<TimelineCategory, CategoryConfig> = {
  status: {
    label: "Status",
    icon: <ClipboardList className="h-3.5 w-3.5" />,
    emoji: "📋",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/40",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  item: {
    label: "Items",
    icon: <ShoppingCart className="h-3.5 w-3.5" />,
    emoji: "🛒",
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-100 dark:bg-violet-900/40",
    borderColor: "border-violet-200 dark:border-violet-800",
  },
  payment: {
    label: "Payments",
    icon: <CreditCard className="h-3.5 w-3.5" />,
    emoji: "💳",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/40",
    borderColor: "border-emerald-200 dark:border-emerald-800",
  },
  refund: {
    label: "Refunds",
    icon: <RefreshCw className="h-3.5 w-3.5" />,
    emoji: "🔄",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/40",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
  discount: {
    label: "Discounts",
    icon: <Tag className="h-3.5 w-3.5" />,
    emoji: "🏷",
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-100 dark:bg-pink-900/40",
    borderColor: "border-pink-200 dark:border-pink-800",
  },
  kitchen: {
    label: "Kitchen",
    icon: <ChefHat className="h-3.5 w-3.5" />,
    emoji: "🍳",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/40",
    borderColor: "border-orange-200 dark:border-orange-800",
  },
  session: {
    label: "Session",
    icon: <Armchair className="h-3.5 w-3.5" />,
    emoji: "🪑",
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-100 dark:bg-teal-900/40",
    borderColor: "border-teal-200 dark:border-teal-800",
  },
  chargeback: {
    label: "Chargeback",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    emoji: "🚨",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/40",
    borderColor: "border-red-200 dark:border-red-800",
  },
  system: {
    label: "System",
    icon: <Server className="h-3.5 w-3.5" />,
    emoji: "⚙️",
    color: "text-gray-500 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-800/40",
    borderColor: "border-gray-200 dark:border-gray-700",
  },
};

const SEVERITY_CONFIG: Record<
  TimelineSeverity,
  { label: string; dotColor: string; badgeClass: string }
> = {
  info: {
    label: "info",
    dotColor: "bg-gray-400 dark:bg-gray-500",
    badgeClass:
      "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700",
  },
  success: {
    label: "success",
    dotColor: "bg-emerald-500",
    badgeClass:
      "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  },
  warning: {
    label: "warning",
    dotColor: "bg-amber-500",
    badgeClass:
      "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  },
  error: {
    label: "error",
    dotColor: "bg-red-500",
    badgeClass:
      "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  },
};

const ALL_CATEGORIES: TimelineCategory[] = [
  "status",
  "item",
  "kitchen",
  "payment",
  "refund",
  "discount",
  "session",
  "chargeback",
  "system",
];

// ─── Helpers ───

function formatAbsoluteTime(dateString: string): string {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatRelativeToOrder(
  dateString: string,
  orderCreatedAt: string
): string {
  const d = new Date(dateString).getTime();
  const base = new Date(orderCreatedAt).getTime();
  if (isNaN(d) || isNaN(base)) return dateString;
  const diffMs = d - base;
  if (diffMs <= 0) return "Order start";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `+${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  const remainSec = diffSec % 60;
  if (diffMin < 60)
    return remainSec > 0 ? `+${diffMin}m ${remainSec}s` : `+${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  const remainMin = diffMin % 60;
  return remainMin > 0
    ? `+${diffHour}h ${remainMin}m`
    : `+${diffHour}h`;
}

function formatDetailValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return JSON.stringify(value, null, 2);
  if (typeof value === "object")
    return JSON.stringify(value, null, 2);
  return String(value);
}

// ─── Sub-components ───

function CategoryFilterBar({
  categories,
  activeCategories,
  onToggle,
  onReset,
  eventCounts,
}: {
  categories: TimelineCategory[];
  activeCategories: Set<TimelineCategory>;
  onToggle: (cat: TimelineCategory) => void;
  onReset: () => void;
  eventCounts: Map<TimelineCategory, number>;
}) {
  const allActive = activeCategories.size === categories.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={onReset}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors border",
          allActive
            ? "bg-foreground text-background border-foreground"
            : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
        )}
      >
        All
      </button>
      {categories.map((cat) => {
        const cfg = CATEGORY_CONFIG[cat];
        const count = eventCounts.get(cat) ?? 0;
        if (count === 0) return null;
        const isActive = activeCategories.has(cat);
        return (
          <button
            key={cat}
            onClick={() => onToggle(cat)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors border",
              isActive
                ? `${cfg.bgColor} ${cfg.color} ${cfg.borderColor}`
                : "bg-muted/30 text-muted-foreground/60 border-transparent hover:bg-muted/50 hover:text-muted-foreground"
            )}
          >
            <span className={cn("shrink-0", isActive ? cfg.color : "opacity-50")}>
              {cfg.icon}
            </span>
            {cfg.label}
            <span
              className={cn(
                "text-[10px] font-normal",
                isActive ? "opacity-80" : "opacity-50"
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TimelineEventRow({
  event,
  orderCreatedAt,
  useRelativeTime,
  isExpanded,
  onToggleExpand,
}: {
  event: OrderFullHistoryTimelineEvent;
  orderCreatedAt: string;
  useRelativeTime: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const catCfg = CATEGORY_CONFIG[event.category] ?? CATEGORY_CONFIG.system;
  const sevCfg = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.info;
  const hasDetails =
    event.details && Object.keys(event.details).length > 0;

  const timeStr = useRelativeTime
    ? formatRelativeToOrder(event.timestamp, orderCreatedAt)
    : formatAbsoluteTime(event.timestamp);

  return (
    <div className="group relative flex gap-3">
      {/* Timeline connector line — rendered by parent, dots here */}
      <div className="relative z-10 flex flex-col items-center shrink-0 w-5">
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full ring-2 ring-background mt-1.5 shrink-0",
            sevCfg.dotColor
          )}
        />
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex-1 min-w-0 pb-4 cursor-pointer",
          hasDetails && "hover:opacity-90"
        )}
        onClick={hasDetails ? onToggleExpand : undefined}
      >
        {/* Main row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 space-y-0.5">
            {/* Time + description */}
            <div className="flex items-start gap-2">
              <span className="text-[11px] font-mono text-muted-foreground shrink-0 pt-px tabular-nums w-[80px]">
                {timeStr}
              </span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={cn("shrink-0", catCfg.color)}>
                  {catCfg.icon}
                </span>
                <span className="text-sm leading-snug break-words">
                  {event.description}
                </span>
              </div>
            </div>

            {/* Actor + details subtitle */}
            {(event.actor_name || event.actor_role) && (
              <div className="flex items-center gap-1.5 pl-[80px] ml-2">
                <span className="text-xs text-muted-foreground">
                  {event.actor_name}
                  {event.actor_role &&
                    event.actor_role !== "Staff" &&
                    event.actor_role !== "System" &&
                    ` (${event.actor_role})`}
                  {!event.actor_name &&
                    event.actor_role === "System" &&
                    "System"}
                </span>
              </div>
            )}
          </div>

          {/* Severity badge */}
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-4 font-normal capitalize",
                sevCfg.badgeClass
              )}
            >
              {sevCfg.label}
            </Badge>
            {hasDetails && (
              <span className="text-muted-foreground/50">
                {isExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && hasDetails && (
          <div className="mt-2 ml-[80px] pl-2 space-y-1 rounded-lg bg-muted/40 border p-3 text-xs">
            {Object.entries(event.details!).map(([key, value]) => {
              if (value === null || value === undefined) return null;
              return (
                <div key={key} className="flex items-start gap-2">
                  <span className="font-medium text-muted-foreground shrink-0 min-w-[100px]">
                    {key.replace(/_/g, " ")}:
                  </span>
                  <span className="text-foreground break-all">
                    {formatDetailValue(value)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───

interface OrderFullTimelineProps {
  fullHistory: OrderFullHistory | null;
  isLoading: boolean;
}

export function OrderFullTimeline({
  fullHistory,
  isLoading,
}: OrderFullTimelineProps) {
  const [activeCategories, setActiveCategories] = React.useState<
    Set<TimelineCategory>
  >(new Set(ALL_CATEGORIES));
  const [expandedEvents, setExpandedEvents] = React.useState<Set<string>>(
    new Set()
  );
  const [useRelativeTime, setUseRelativeTime] = React.useState(false);

  const timeline = fullHistory?.timeline ?? [];
  const orderCreatedAt = fullHistory?.order?.created_at ?? "";

  const eventCounts = React.useMemo(() => {
    const map = new Map<TimelineCategory, number>();
    for (const e of timeline) {
      map.set(e.category, (map.get(e.category) ?? 0) + 1);
    }
    return map;
  }, [timeline]);

  const presentCategories = React.useMemo(
    () => ALL_CATEGORIES.filter((c) => (eventCounts.get(c) ?? 0) > 0),
    [eventCounts]
  );

  const filteredTimeline = React.useMemo(
    () => timeline.filter((e) => activeCategories.has(e.category)),
    [timeline, activeCategories]
  );

  const handleToggleCategory = React.useCallback(
    (cat: TimelineCategory) => {
      setActiveCategories((prev) => {
        const next = new Set(prev);
        if (next.has(cat)) {
          next.delete(cat);
          if (next.size === 0) return new Set(ALL_CATEGORIES);
        } else {
          next.add(cat);
        }
        return next;
      });
    },
    []
  );

  const handleResetCategories = React.useCallback(() => {
    setActiveCategories(new Set(ALL_CATEGORIES));
  }, []);

  const toggleExpanded = React.useCallback((key: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-7 w-12 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
        <div className="space-y-4 pt-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-2.5 w-2.5 rounded-full mt-1.5 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!fullHistory) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Full history not available for this order.
      </p>
    );
  }

  if (timeline.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* Filter bar + controls */}
        <div className="space-y-2">
          <CategoryFilterBar
            categories={presentCategories}
            activeCategories={activeCategories}
            onToggle={handleToggleCategory}
            onReset={handleResetCategories}
            eventCounts={eventCounts}
          />

          {/* Time toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setUseRelativeTime((p) => !p)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Clock className="h-3 w-3" />
              {useRelativeTime ? "Relative times" : "Absolute times"}
              <ToggleLeft
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  useRelativeTime && "rotate-180"
                )}
              />
            </button>
            <span className="text-[10px] text-muted-foreground/60">
              {filteredTimeline.length} of {timeline.length} events
            </span>
          </div>
        </div>

        {/* Timeline */}
        {filteredTimeline.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No events match the selected filters.
          </p>
        ) : (
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-[9px] top-3 bottom-3 w-px bg-border" />

            <div className="space-y-0">
              {filteredTimeline.map((event, index) => {
                const key = `${event.timestamp}-${event.event_type}-${index}`;
                return (
                  <TimelineEventRow
                    key={key}
                    event={event}
                    orderCreatedAt={orderCreatedAt}
                    useRelativeTime={useRelativeTime}
                    isExpanded={expandedEvents.has(key)}
                    onToggleExpand={() => toggleExpanded(key)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            End of timeline ({timeline.length} event
            {timeline.length !== 1 ? "s" : ""})
          </span>
        </div>
      </div>
    </>
  );
}
