"use client";

import { useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { ReportPanel as Card, ReportPanelContent as CardContent, ReportPanelHeader as CardHeader, ReportPanelTitle as CardTitle } from "@/components/dashboard/reports/ReportPanel";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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
// Sub-components
// ============================================================================

function WaterfallRow({ item }: { item: WaterfallLineItem }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasTransactions = item.transactions.length > 0;
  const isTotal = item.type === "total";
  const isSubtract = item.type === "subtract";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center justify-between w-full py-3 px-4 text-left transition-colors",
          hasTransactions && "hover:bg-muted/50 cursor-pointer",
          !hasTransactions && "cursor-default",
          isTotal &&
            "mt-2 rounded-2xl border-0 bg-muted/60 py-4"
        )}
        disabled={!hasTransactions}
      >
        <div className="flex items-center gap-2">
          {hasTransactions && (
            <span className="text-muted-foreground">
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          )}
          {!hasTransactions && !isTotal && <span className="w-4" />}
          <span
            className={cn(
              "text-sm",
              isTotal ? "font-bold text-base" : "text-muted-foreground",
              isSubtract && "pl-2"
            )}
          >
            {isSubtract && !isTotal ? `(-) ${item.label}` : ""}
            {item.type === "add" ? `(+) ${item.label}` : ""}
            {isTotal ? `= ${item.label}` : ""}
          </span>
        </div>
        <span
          className={cn(
            "font-mono tabular-nums text-sm",
            isTotal && "font-bold text-base",
            isSubtract && item.amount > 0 && "text-red-500"
          )}
        >
          {isSubtract && item.amount > 0 ? "-" : ""}
          {formatCurrency(Math.abs(item.amount))}
        </span>
      </CollapsibleTrigger>

      {hasTransactions && (
        <CollapsibleContent>
          <div className="ml-6 mr-4 mb-2 border-l-2 border-muted pl-4">
            <div className="max-h-[240px] overflow-y-auto space-y-1">
              {item.transactions.map((tx) => (
                <div
                  key={tx.order_id}
                  className="flex items-center justify-between py-1.5 text-xs text-muted-foreground"
                >
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/dashboard/orders/${tx.order_id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      #{tx.order_number}
                    </Link>
                    <span>
                      {format(new Date(tx.created_at), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1 pt-2 text-xs text-muted-foreground">
              {item.transactions.length} transaction
              {item.transactions.length !== 1 ? "s" : ""}
            </div>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function ValidationBanner({
  validation,
}: {
  validation: WaterfallReport["validation"];
}) {
  if (validation.is_balanced) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-900">
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
        <div>
          <p className="text-sm font-medium text-green-800 dark:text-green-400">
            Balanced
          </p>
          <p className="text-xs text-green-600 dark:text-green-500">
            Net Collected ({formatCurrency(validation.net_collected)}) matches
            Payments Total ({formatCurrency(validation.payments_total)})
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900">
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
      <div>
        <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
          Discrepancy Detected
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Net Collected ({formatCurrency(validation.net_collected)}) vs Payments
          Total ({formatCurrency(validation.payments_total)}) — Difference:{" "}
          {formatCurrency(validation.discrepancy)}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================

function WaterfallSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex justify-between py-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between py-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface WaterfallReportCardProps {
  report: WaterfallReport | null | undefined;
  isLoading?: boolean;
  isError?: boolean;
}

export function WaterfallReportCard({
  report,
  isLoading,
  isError,
}: WaterfallReportCardProps) {
  if (isLoading) return <WaterfallSkeleton />;
  if (isError || !report) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <p className="text-sm font-medium">{isError ? "Failed to load waterfall report" : "No data for this period"}</p>
      {isError && <p className="text-xs">Try refreshing the page or selecting a different date range.</p>}
    </div>
  );

  const { revenue, collections, validation } = report;

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300">
      {/* Section 1: Revenue Logic */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base font-bold tracking-tight">
            Revenue
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Your money — sales minus deductions
          </p>
        </CardHeader>
        <CardContent className="pt-2 pb-4">
          <WaterfallRow item={revenue.gross_sales} />
          <WaterfallRow item={revenue.voids} />
          <WaterfallRow item={revenue.refunds} />
          <WaterfallRow item={revenue.discounts} />
          <WaterfallRow item={revenue.net_revenue} />
        </CardContent>
      </Card>

      {/* Section 2: Collection Logic */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base font-bold tracking-tight">
            Collections
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Money you hold for others — taxes, tips, fees
          </p>
        </CardHeader>
        <CardContent className="pt-2 pb-4">
          <WaterfallRow item={collections.taxes} />
          <WaterfallRow item={collections.tips} />
          <WaterfallRow item={collections.service_fees} />
          <WaterfallRow item={collections.net_collected} />
        </CardContent>
      </Card>

      {/* Validation Banner */}
      <ValidationBanner validation={validation} />
    </div>
  );
}
