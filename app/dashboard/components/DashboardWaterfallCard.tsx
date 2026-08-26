"use client";

import { useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
  Receipt,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { OverviewLinkButton } from "./OverviewSection";
import type {
  WaterfallReport,
  WaterfallLineItem,
} from "@/app/dashboard/actions/waterfall-report";

// ============================================================================
// Helpers
// ============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ============================================================================
// Waterfall Row (compact version for dashboard)
// ============================================================================

function WaterfallRow({ item }: { item: WaterfallLineItem }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasTransactions = item.transactions.length > 0;
  const isTotal = item.type === "total";
  const isSubtract = item.type === "subtract";

  const icon = isTotal ? (
    <Minus className="h-3 w-3" />
  ) : isSubtract ? (
    <TrendingDown className="h-3 w-3 text-rose-500" />
  ) : (
    <TrendingUp className="h-3 w-3 text-emerald-500" />
  );

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center justify-between w-full py-2.5 px-3 text-left transition-all rounded-lg group",
          hasTransactions && "hover:bg-muted/60 cursor-pointer",
          !hasTransactions && "cursor-default",
          isTotal && "bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/10 mt-3 py-3"
        )}
        disabled={!hasTransactions}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex items-center justify-center w-6 h-6 rounded-md",
              isTotal
                ? "bg-primary/10"
                : isSubtract
                ? "bg-rose-50 dark:bg-rose-950/30"
                : "bg-emerald-50 dark:bg-emerald-950/30"
            )}
          >
            {icon}
          </div>
          <span
            className={cn(
              "text-sm",
              isTotal ? "font-semibold" : "text-muted-foreground"
            )}
          >
            {item.label}
          </span>
          {hasTransactions && (
            <span className="text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </span>
          )}
        </div>
        <span
          className={cn(
            "font-mono tabular-nums text-sm",
            isTotal && "font-bold text-base",
            isSubtract && item.amount > 0 && "text-rose-500"
          )}
        >
          {isSubtract && item.amount > 0 ? "-" : ""}
          {formatCurrency(Math.abs(item.amount))}
        </span>
      </CollapsibleTrigger>

      {hasTransactions && (
        <CollapsibleContent>
          <div className="ml-8 mr-3 mb-1.5 border-l-2 border-muted/60 pl-3">
            <div className="max-h-[160px] overflow-y-auto space-y-0.5 py-1">
              {item.transactions.slice(0, 8).map((tx) => (
                <div
                  key={tx.order_id}
                  className="flex items-center justify-between py-1 text-xs text-muted-foreground"
                >
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/orders/${tx.order_id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      #{tx.order_number}
                    </Link>
                    <span className="hidden sm:inline">
                      {format(new Date(tx.created_at), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
              {item.transactions.length > 8 && (
                <p className="text-[11px] text-muted-foreground/60 pt-1">
                  +{item.transactions.length - 8} more
                </p>
              )}
            </div>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================

function WaterfallCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-56" />
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex justify-between items-center py-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
        <Skeleton className="h-px w-full" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex justify-between items-center py-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface DashboardWaterfallCardProps {
  report: WaterfallReport | null | undefined;
  isLoading?: boolean;
}

export function DashboardWaterfallCard({
  report,
  isLoading,
}: DashboardWaterfallCardProps) {
  if (isLoading) return <WaterfallCardSkeleton />;
  if (!report) return null;

  const { revenue, collections, validation } = report;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-[1.0625rem] font-semibold text-[#0C4FD1]! dark:text-[#6CA0FF]! flex items-center gap-2">
            <Receipt className="h-[1.125rem] w-[1.125rem] shrink-0" />
            Net Collected Statement
          </CardTitle>
          <CardDescription>Revenue waterfall</CardDescription>
        </div>
        <OverviewLinkButton href="/dashboard/reports/financials">
          Details
        </OverviewLinkButton>
      </CardHeader>
      <CardContent className="flex-1 space-y-1">
        {/* Revenue Section */}
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-3 pb-1">
            Revenue
          </p>
          <WaterfallRow item={revenue.gross_sales} />
          <WaterfallRow item={revenue.voids} />
          <WaterfallRow item={revenue.refunds} />
          <WaterfallRow item={revenue.discounts} />
          <WaterfallRow item={revenue.net_revenue} />
        </div>

        {/* Divider */}
        <div className="h-px bg-border/50 my-3" />

        {/* Collections Section */}
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-3 pb-1">
            Collections
          </p>
          <WaterfallRow item={collections.taxes} />
          <WaterfallRow item={collections.tips} />
          <WaterfallRow item={collections.service_fees} />
          <WaterfallRow item={collections.net_collected} />
        </div>

        {/* Validation Banner (compact) */}
        <div className="pt-3">
          {validation.is_balanced ? (
            <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/50">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Balanced — {formatCurrency(validation.net_collected)}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/50">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Discrepancy: {formatCurrency(validation.discrepancy)}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
