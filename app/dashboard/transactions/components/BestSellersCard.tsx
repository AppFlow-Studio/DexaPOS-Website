"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, TrendingUp, Award } from "lucide-react";
import { cn } from "@/lib/utils";

interface BestSellerItem {
  item_name: string;
  quantity: number;
  revenue: number;
}

interface BestSellersCardProps {
  items: BestSellerItem[];
  isLoading?: boolean;
  onViewAll?: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getRankBadge(rank: number) {
  switch (rank) {
    case 1:
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-600">
          <Award className="h-3.5 w-3.5" />
        </div>
      );
    case 2:
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-400/20 text-gray-500 text-xs font-bold">
          2
        </div>
      );
    case 3:
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-700 text-xs font-bold">
          3
        </div>
      );
    default:
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-medium">
          {rank}
        </div>
      );
  }
}

export function BestSellersCard({
  items,
  isLoading,
  onViewAll,
}: BestSellersCardProps) {
  if (isLoading) {
    return (
      <Card className="border-none shadow-sm bg-card/80 backdrop-blur">
        <CardHeader className="pb-2">
          <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-6 w-6 bg-muted animate-pulse rounded-full" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const topItems = items.slice(0, 5);
  const hasMore = items.length > 5;

  if (topItems.length === 0) {
    return (
      <Card className="border-none shadow-sm bg-card/80 backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Best Sellers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No sales data available for this period
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-bold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Best Sellers
        </CardTitle>
        {hasMore && onViewAll && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-primary h-7 px-2 hover:bg-primary/10"
            onClick={onViewAll}
          >
            View all
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {/* Header row */}
        <div className="flex items-center justify-between py-2 border-b border-muted/30 mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Item
          </span>
          <div className="flex gap-6">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-12 text-right">
              Qty
            </span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-16 text-right">
              Revenue
            </span>
          </div>
        </div>

        {/* Items list */}
        <div className="space-y-1">
          {topItems.map((item, index) => (
            <div
              key={item.item_name}
              className={cn(
                "flex items-center justify-between py-2.5 px-2 -mx-2 rounded-lg transition-colors",
                index === 0 && "bg-amber-500/5",
                "hover:bg-muted/30"
              )}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {getRankBadge(index + 1)}
                <span
                  className={cn(
                    "text-sm truncate",
                    index === 0 ? "font-semibold" : "font-medium"
                  )}
                >
                  {item.item_name}
                </span>
              </div>
              <div className="flex items-center gap-6">
                <span className="text-sm text-muted-foreground w-12 text-right tabular-nums">
                  {item.quantity}
                </span>
                <span
                  className={cn(
                    "text-sm font-mono w-16 text-right tabular-nums",
                    index === 0 && "font-bold text-primary"
                  )}
                >
                  {formatCurrency(item.revenue)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Total row */}
        <div className="flex items-center justify-between py-3 mt-2 border-t-2 border-foreground/10">
          <span className="text-sm font-bold">
            Total ({topItems.length} items)
          </span>
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold w-12 text-right tabular-nums">
              {topItems.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
            <span className="text-sm font-mono font-bold w-16 text-right tabular-nums">
              {formatCurrency(
                topItems.reduce((sum, item) => sum + item.revenue, 0)
              )}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
