"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Monitor,
  TabletSmartphone,
  Globe,
  Truck,
  UtensilsCrossed,
  LayoutGrid,
} from "lucide-react";
import { OverviewLinkButton } from "./OverviewSection";
import type { NetCollectedBySourceReport } from "@/app/dashboard/actions/order-analytics";

// ============================================================================
// Helpers
// ============================================================================

const sourceIcons: Record<string, React.ReactNode> = {
  POS: <Monitor className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
  Kiosk: <TabletSmartphone className="h-4 w-4 text-purple-600 dark:text-purple-400" />,
  Online: <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
  "Third-Party": <Truck className="h-4 w-4 text-orange-600 dark:text-orange-400" />,
  Catering: <UtensilsCrossed className="h-4 w-4 text-rose-600 dark:text-rose-400" />,
};

const sourceDescriptions: Record<string, string> = {
  POS: "Staff-Assisted",
  Kiosk: "Customer-Driven",
  Online: "Customer-Driven",
  "Third-Party": "Delivery Partners",
  Catering: "Event Orders",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function NetCollectedBySourceSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-56 max-w-full" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </CardHeader>
      <CardContent>
        {/* Mirrors the real table: same scroll container, min-width and
            3-column grid, so the rows land without the layout shifting. */}
        <div className="-mx-6 overflow-x-auto px-6">
          <div className="min-w-[22rem]">
            <div className="grid grid-cols-3 gap-4 pb-2 border-b">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-3 w-full" />
              ))}
            </div>
            <div className="divide-y">
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid grid-cols-3 gap-4 py-3 items-center"
                >
                  {Array.from({ length: 3 }).map((__, colIndex) => (
                    <Skeleton key={colIndex} className="h-4 w-full" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface NetCollectedBySourceCardProps {
  report: NetCollectedBySourceReport | null | undefined;
  isLoading?: boolean;
}

export function NetCollectedBySourceCard({
  report,
  isLoading,
}: NetCollectedBySourceCardProps) {
  if (isLoading) return <NetCollectedBySourceSkeleton />;
  if (!report) return null;

  const { rows, totals } = report;

  // Find highest revenue source
  const topSource = rows.length > 0
    ? rows.reduce((top, r) => (r.netCollected > top.netCollected ? r : top), rows[0])
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[1.0625rem] font-semibold text-[#0C4FD1]! dark:text-[#6CA0FF]! flex items-center gap-2">
          <LayoutGrid className="h-[1.125rem] w-[1.125rem] shrink-0" />
          Net Collected by Channel
        </CardTitle>
        <CardDescription>
          Revenue breakdown by order source
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Three money/label columns do not fit 360px, so the table scrolls
            inside its own container rather than wrapping headers onto two
            lines or clipping at the card edge. min-w keeps the columns
            aligned once scrolling starts. */}
        <div className="-mx-6 overflow-x-auto px-6">
          <div className="min-w-[22rem]">
        {/* Table Header */}
        <div className="grid grid-cols-3 gap-4 pb-2 border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Source</span>
          <span className="text-right">Transactions</span>
          <span className="text-right">Net Collected ($)</span>
        </div>

        {/* Rows */}
        <div className="divide-y">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No order data available for this period
              </p>
            </div>
          ) : (
            rows.map((row) => {
              const icon = sourceIcons[row.source] || (
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              );
              const desc = sourceDescriptions[row.source] || "";
              const isTop = topSource && row.source === topSource.source && rows.length > 1;
              const pctOfTotal =
                totals.netCollected > 0
                  ? ((row.netCollected / totals.netCollected) * 100).toFixed(1)
                  : "0.0";

              return (
                <div
                  key={row.source}
                  className={cn(
                    "grid grid-cols-3 gap-4 py-3 items-center text-sm transition-colors",
                    isTop && "bg-blue-50/50 dark:bg-blue-950/10 -mx-3 px-3 rounded-lg"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {/* Decorative only — the source name says the same thing,
                        and the badge costs ~38px the label needs on phones. */}
                    <div className="hidden sm:flex items-center justify-center w-7 h-7 shrink-0 rounded-lg bg-muted/60">
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium">{row.source}</span>
                      {desc && (
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {desc}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-right font-mono tabular-nums font-medium">
                    {row.transactionCount}
                  </span>
                  <div className="text-right">
                    <span className="font-mono tabular-nums font-semibold">
                      {formatCurrency(row.netCollected)}
                    </span>
                    <p className="text-[10px] text-muted-foreground">
                      {pctOfTotal}%
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Totals Row */}
        {rows.length > 0 && (
          <div className="grid grid-cols-3 gap-4 pt-3 mt-1 border-t-2 items-center">
            <span className="text-sm font-bold">Total</span>
            <span className="text-right font-mono tabular-nums font-bold text-sm">
              {totals.transactionCount}
            </span>
            <span className="text-right font-mono tabular-nums font-bold text-sm">
              {formatCurrency(totals.netCollected)}
            </span>
          </div>
        )}
          </div>
        </div>

        {/* Insight callout */}
        {topSource && rows.length > 1 && (
          <div className="mt-4 flex items-start gap-2 py-2.5 px-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/50">
            <LayoutGrid className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-400">
              <span className="font-semibold">Top channel:</span>{" "}
              {topSource.source} drives{" "}
              {totals.netCollected > 0
                ? ((topSource.netCollected / totals.netCollected) * 100).toFixed(0)
                : 0}
              % of net collected revenue.
            </p>
          </div>
        )}

        {/* Footer link */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t">
          <span className="text-xs text-muted-foreground">
            {rows.length} channel{rows.length !== 1 ? "s" : ""}
          </span>
          <OverviewLinkButton href="/dashboard/orders/analytics">
            View order analytics
          </OverviewLinkButton>
        </div>
      </CardContent>
    </Card>
  );
}
