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
      className={cn("flex items-start gap-4 group", item.is_clickable && "cursor-pointer hover:opacity-80 transition-opacity")}
      onClick={handleClick}
    >
      <TimelineActivityIcon type={item.activity_type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-base">{item.activity_label}</span>
          {item.amount_value !== null && (
            <span className="font-medium text-foreground text-sm">
              ${item.amount_value.toFixed(2)}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </div>
      <div className="text-right flex items-center gap-3 text-sm text-muted-foreground shrink-0">
        <span>{time}</span>
        <span>{date}</span>
        {item.is_clickable && (
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
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
    <Card className={cn("flex flex-col justify-center p-5 h-30", className)}>
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </span>
      {isLoading ? (
        <div className="space-y-1.5">
          <div className="h-7 w-24 bg-muted animate-pulse rounded" />
          <div className="h-3 w-16 bg-muted animate-pulse rounded" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground tracking-tight">{value}</span>
            {badge && (
              <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 px-1.5 py-0">
                {badge}
              </Badge>
            )}
            {trend && (
              <span className={cn(
                "flex items-center gap-0.5 text-xs font-medium",
                trend.direction === "up" && "text-green-600 dark:text-green-400",
                trend.direction === "down" && "text-red-600 dark:text-red-400",
                trend.direction === "flat" && "text-muted-foreground",
              )}>
                {trend.direction === "up" && <TrendingUp className="h-3 w-3" />}
                {trend.direction === "down" && <TrendingDown className="h-3 w-3" />}
                {trend.direction === "flat" && <Minus className="h-3 w-3" />}
                {trend.label}
              </span>
            )}
          </div>
          {subtitle && (
            <span className="text-xs text-muted-foreground mt-0.5">{subtitle}</span>
          )}
        </>
      )}
    </Card>
  );
}
