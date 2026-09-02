"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Landmark,
  Banknote,
  CreditCard,
  ShieldOff,
} from "lucide-react";
import { OverviewLinkButton } from "./OverviewSection";
import type { TaxableRevenueByTenderReport } from "@/app/dashboard/actions/order-analytics";

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

function formatPercent(value: number): string {
  return `${value.toFixed(3)}%`;
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function TaxableRevenueSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-56 max-w-full" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </CardHeader>
      <CardContent>
        {/* Mirrors the real table below: the same overflow-x-auto +
            min-w-[640px] + 6-column grid. The previous free-form flex row
            was ~416px wide with no scroll container, so it clipped at the
            card edge on phones and did not match the layout it stood in for. */}
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-6 gap-3 pb-2 border-b">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-3 w-full" />
              ))}
            </div>
            <div className="divide-y">
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid grid-cols-6 gap-3 py-3 items-center"
                >
                  {Array.from({ length: 6 }).map((__, colIndex) => (
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

interface TaxableRevenueByTenderCardProps {
  report: TaxableRevenueByTenderReport | null | undefined;
  isLoading?: boolean;
}

export function TaxableRevenueByTenderCard({
  report,
  isLoading,
}: TaxableRevenueByTenderCardProps) {
  if (isLoading) return <TaxableRevenueSkeleton />;
  if (!report) return null;

  const { rows, nonTaxableRevenue, totals } = report;
  const hasData = rows.length > 0 || nonTaxableRevenue > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[1.0625rem] font-semibold text-[#0C4FD1]! dark:text-[#6CA0FF]! flex items-center gap-2">
          <Landmark className="h-[1.125rem] w-[1.125rem] shrink-0" />
          Taxable Revenue by Tender Type
        </CardTitle>
        <CardDescription>
          Tax collected split by Cash vs. Card
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No tax data available for this period
            </p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-6 gap-3 pb-2 border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Tax Name</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Tax Collected</span>
                  <span className="text-right">Taxable Revenue</span>
                  <span className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <Banknote className="h-3 w-3 text-emerald-500" />
                      Cash
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <CreditCard className="h-3 w-3 text-blue-500" />
                      Card
                    </span>
                  </span>
                </div>

                {/* Tax Rate Rows */}
                <div className="divide-y">
                  {rows.map((row) => (
                    <div
                      key={`${row.taxName}-${row.taxRate}`}
                      className="grid grid-cols-6 gap-3 py-3 items-center text-sm transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/60">
                          <Landmark className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <span className="font-medium truncate">{row.taxName}</span>
                      </div>
                      <span className="text-right font-mono tabular-nums text-muted-foreground">
                        {formatPercent(row.taxRate)}
                      </span>
                      <span className="text-right font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                        {formatCurrency(row.totalTaxCollected)}
                      </span>
                      <span className="text-right font-mono tabular-nums font-medium">
                        {formatCurrency(row.totalTaxableRevenue)}
                      </span>
                      <span className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatCurrency(row.cashTaxableRevenue)}
                      </span>
                      <span className="text-right font-mono tabular-nums text-blue-600 dark:text-blue-400 font-medium">
                        {formatCurrency(row.cardTaxableRevenue)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Totals Row */}
                {rows.length > 0 && (
                  <div className="grid grid-cols-6 gap-3 pt-3 mt-1 border-t-2 items-center">
                    <span className="text-sm font-bold">Total</span>
                    <span />
                    <span className="text-right font-mono tabular-nums font-bold text-sm text-amber-600 dark:text-amber-400">
                      {formatCurrency(totals.totalTaxCollected)}
                    </span>
                    <span className="text-right font-mono tabular-nums font-bold text-sm">
                      {formatCurrency(totals.totalTaxableRevenue)}
                    </span>
                    <span className="text-right font-mono tabular-nums font-bold text-sm text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(totals.cashTaxableRevenue)}
                    </span>
                    <span className="text-right font-mono tabular-nums font-bold text-sm text-blue-600 dark:text-blue-400">
                      {formatCurrency(totals.cardTaxableRevenue)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Non-Taxable Revenue */}
            {nonTaxableRevenue > 0 && (
              <div className="mt-4 flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/40 border">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/60">
                    <ShieldOff className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="text-sm font-medium">Non-Taxable Revenue</span>
                    <p className="text-[10px] text-muted-foreground">
                      Tax-exempt items
                    </p>
                  </div>
                </div>
                <span className="font-mono tabular-nums font-semibold text-sm">
                  {formatCurrency(nonTaxableRevenue)}
                </span>
              </div>
            )}

            {/* Split payment note */}
            <div className="mt-4 flex items-start gap-2 py-2.5 px-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/50">
              <Landmark className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <span className="font-semibold">Note:</span> Split payments are
                pro-rated proportionally (e.g., 50% Cash / 50% Card splits the
                taxable revenue evenly between tender types).
              </p>
            </div>
          </>
        )}

        {/* Footer link */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t">
          <span className="text-xs text-muted-foreground">
            {rows.length} tax rate{rows.length !== 1 ? "s" : ""}
          </span>
          <OverviewLinkButton href="/dashboard/reports/financials">
            View financial reports
          </OverviewLinkButton>
        </div>
      </CardContent>
    </Card>
  );
}
