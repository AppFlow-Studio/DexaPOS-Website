"use client";

import { Panel, PanelSection } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

/**
 * Rank chip. One neutral shell for every position (D-12) — the gold/bronze
 * medal palette was decorative colour doing no work the number wasn't already
 * doing. Rank 1 keeps the award glyph and a slightly stronger fill, so the top
 * seller is still distinguishable without a second hue.
 */
function getRankBadge(rank: number) {
  if (rank === 1) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-foreground">
        <Award className="h-3.5 w-3.5" />
      </div>
    );
  }
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/60 text-xs font-medium tabular-nums text-muted-foreground">
      {rank}
    </div>
  );
}

export function BestSellersCard({
  items,
  isLoading,
  onViewAll,
}: BestSellersCardProps) {
  const topItems = items.slice(0, 5);
  const hasMore = items.length > 5;

  if (!isLoading && topItems.length === 0) {
    return (
      <Panel>
        <PanelSection
          icon={TrendingUp}
          label="Best Sellers"
        >
          <p className="text-sm text-muted-foreground text-center py-4">
            No sales data available for this period
          </p>
        </PanelSection>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelSection
        icon={TrendingUp}
        label="Best Sellers"
        action={
          hasMore && onViewAll && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[#0C4FD1] dark:text-[#6CA0FF] h-7 px-2 hover:bg-[#0C4FD1]/10"
              onClick={onViewAll}
            >
              View all
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )
        }
      >
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 w-32 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Column labels — no rule beneath (§5.5). */}
            <div className="mb-2 flex items-center justify-between pb-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Item
              </span>
              <div className="flex gap-6">
                <span className="w-12 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Qty
                </span>
                <span className="w-16 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
                    "flex min-w-0 items-center justify-between gap-2 rounded-2xl px-2 py-2.5 transition-colors",
                    // Top seller sits in a neutral well, not an amber wash (D-12).
                    index === 0 && "bg-muted/40",
                    "hover:bg-muted/60"
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {getRankBadge(index + 1)}
                    <span
                      className={cn(
                        "min-w-0 break-words text-sm",
                        index === 0 ? "font-semibold" : "font-medium"
                      )}
                    >
                      {item.item_name}
                    </span>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-6">
                    <span className="w-7 text-right text-sm text-muted-foreground tabular-nums sm:w-12">
                      {item.quantity}
                    </span>
                    {/* Brand blue is reserved for section headings (D-03) —
                        weight alone marks the top figure. */}
                    <span
                      className={cn(
                        "w-10 text-right font-mono text-xs tabular-nums sm:w-16 sm:text-sm",
                        index === 0 && "font-bold"
                      )}
                    >
                      {formatCurrency(item.revenue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Total row */}
            <div className="mt-2 flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
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
          </>
        )}
      </PanelSection>
    </Panel>
  );
}
