"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Receipt,
  RotateCcw,
  Tag,
  StickyNote,
  Gift,
  MessageSquare,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatActivityTime } from "@/types/customer";

// =============================================================================
// Timeline Activity Icon Component
// =============================================================================

function TimelineActivityIcon({ type }: { type: string }) {
  const iconClass = "h-5 w-5";

  const config: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
    order:       { icon: <Receipt className={iconClass} />,       bg: "bg-blue-100 dark:bg-blue-900/30",   color: "text-blue-600 dark:text-blue-400" },
    refund:      { icon: <RotateCcw className={iconClass} />,     bg: "bg-red-100 dark:bg-red-900/30",     color: "text-red-600 dark:text-red-400" },
    tag_added:   { icon: <Tag className={iconClass} />,           bg: "bg-purple-100 dark:bg-purple-900/30", color: "text-purple-600 dark:text-purple-400" },
    tag_removed: { icon: <Tag className={iconClass} />,           bg: "bg-gray-100 dark:bg-gray-900/30",   color: "text-gray-500 dark:text-gray-400" },
    note_added:  { icon: <StickyNote className={iconClass} />,    bg: "bg-yellow-100 dark:bg-yellow-900/30", color: "text-yellow-600 dark:text-yellow-400" },
    loyalty:     { icon: <Gift className={iconClass} />,          bg: "bg-green-100 dark:bg-green-900/30", color: "text-green-600 dark:text-green-400" },
    feedback:    { icon: <MessageSquare className={iconClass} />, bg: "bg-orange-100 dark:bg-orange-900/30", color: "text-orange-600 dark:text-orange-400" },
    visit:       { icon: <MapPin className={iconClass} />,        bg: "bg-teal-100 dark:bg-teal-900/30",   color: "text-teal-600 dark:text-teal-400" },
  };

  const entry = config[type] ?? {
    icon: <Receipt className={iconClass} />,
    bg: "bg-muted",
    color: "text-muted-foreground",
  };

  return (
    <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", entry.bg, entry.color)}>
      {entry.icon}
    </div>
  );
}

// =============================================================================
// Timeline Item Component
// =============================================================================

export function TimelineItem({
  item,
  onOrderClick,
}: {
  item: {
    activity_id: string;
    activity_type: string;
    activity_label: string;
    description: string;
    amount_value: number | null;
    currency: string | null;
    created_at: string;
    is_clickable: boolean;
    related_entity_id: string | null;
    related_entity_type: string | null;
  };
  onOrderClick?: (orderId: string) => void;
}) {
  const { time, date } = formatActivityTime(item.created_at);

  const handleClick = () => {
    if (item.is_clickable && item.related_entity_id && item.related_entity_type === "order" && onOrderClick) {
      onOrderClick(item.related_entity_id);
    }
  };

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border-0 bg-background/80 p-3 transition-colors hover:bg-background sm:gap-4 sm:p-4",
        item.is_clickable && "cursor-pointer pr-8"
      )}
      onClick={handleClick}
    >
      <TimelineActivityIcon type={item.activity_type} />
      <div className="flex-1 min-w-0">
        <div className="mb-2 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground">{item.activity_label}</span>
            {item.amount_value !== null && (
              <span className="whitespace-nowrap text-base font-bold text-primary">
                ${item.amount_value.toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="font-medium">{time}</span>
            <span aria-hidden="true">·</span>
            <span className="text-muted-foreground/70">{date}</span>
          </div>
        </div>
        <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.description}</p>
        {item.is_clickable && (
          <ChevronRight className="absolute right-2 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Metric Card Component (Enhanced with subtitle)
// =============================================================================

export function MetricCard({
  title,
  value,
  subtitle,
  badge,
  trend,
  className,
  isLoading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  badge?: string;
  trend?: { direction: "up" | "down" | "flat"; label: string };
  className?: string;
  isLoading?: boolean;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col justify-between p-4 h-auto min-h-32 hover:shadow-md transition-shadow sm:p-5", className)}>
      <div className="min-w-0">
        <span className="text-xs font-semibold text-muted-foreground tracking-normal uppercase">
          {title}
        </span>
      </div>
      {isLoading ? (
        // Widths are relative: a fixed w-32 plus the card padding exceeded a
        // grid-cols-2 track at 360px, so the blocks spilled past the card.
        <div className="mt-3 min-w-0 space-y-2">
          <div className="h-8 w-3/4 max-w-32 bg-muted animate-pulse rounded motion-reduce:animate-none" />
          <div className="h-3 w-1/2 max-w-20 bg-muted animate-pulse rounded motion-reduce:animate-none" />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <div className="flex items-end gap-2.5 mb-2">
              <span className="text-3xl font-bold text-foreground tracking-tight">{value}</span>
              {badge && (
                <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 px-2 py-1 font-semibold">
                  {badge}
                </Badge>
              )}
            </div>
            {trend && (
              <div className={cn(
                "flex items-center gap-1 text-sm font-semibold",
                trend.direction === "up" && "text-green-600 dark:text-green-400",
                trend.direction === "down" && "text-red-600 dark:text-red-400",
                trend.direction === "flat" && "text-muted-foreground",
              )}>
                {trend.direction === "up" && <TrendingUp className="h-4 w-4" />}
                {trend.direction === "down" && <TrendingDown className="h-4 w-4" />}
                {trend.direction === "flat" && <Minus className="h-4 w-4" />}
                <span>{trend.label}</span>
              </div>
            )}
            {subtitle && (
              <span className="text-xs text-muted-foreground block mt-3 leading-relaxed">{subtitle}</span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
