"use client";

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Banknote,
  CreditCard,
  Gift,
  Wallet,
  Globe,
  TrendingUp,
  TrendingDown,
  Info,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { OverviewLinkButton } from "./OverviewSection";
import type {
  TransactionVolumeReport,
  TransactionVolumeRow,
} from "@/app/dashboard/actions/order-analytics";

// ============================================================================
// Helpers
// ============================================================================

const typeConfig: Record<
  string,
  {
    icon: React.ReactNode;
    subtitle: string;
    iconBg: string;
  }
> = {
  Card: {
    icon: <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
    subtitle: "Visa, Mastercard, Amex",
    iconBg: "bg-blue-50 dark:bg-blue-950/40",
  },
  Cash: {
    icon: <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
    subtitle: "Physical currency",
    iconBg: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  "Gift Card": {
    icon: <Gift className="h-4 w-4 text-purple-600 dark:text-purple-400" />,
    subtitle: "Digital & Physical",
    iconBg: "bg-purple-50 dark:bg-purple-950/40",
  },
  "House Account": {
    icon: <Wallet className="h-4 w-4 text-orange-600 dark:text-orange-400" />,
    subtitle: "Store credit",
    iconBg: "bg-orange-50 dark:bg-orange-950/40",
  },
  External: {
    icon: <Globe className="h-4 w-4 text-gray-600 dark:text-gray-400" />,
    subtitle: "Third-party payments",
    iconBg: "bg-gray-50 dark:bg-gray-950/40",
  },
};

const CORE_TYPES = ["Card", "Cash", "Gift Card"];

function ensureCoreRows(rows: TransactionVolumeRow[]): TransactionVolumeRow[] {
  const existing = new Set(rows.map((r) => r.type));
  const result = [...rows];

  for (const type of CORE_TYPES) {
    if (!existing.has(type)) {
      result.push({ type, credits: 0, debits: 0, netCount: 0 });
    }
  }

  return result.sort((a, b) => {
    const aIdx = CORE_TYPES.indexOf(a.type);
    const bIdx = CORE_TYPES.indexOf(b.type);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.type.localeCompare(b.type);
  });
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function TransactionVolumeSkeleton() {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-4">
        <Skeleton className="h-5 w-48 max-w-full" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Skeleton className="h-8 w-full rounded-full" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between items-center py-3">
                <Skeleton className="h-4 w-32" />
                <div className="flex gap-8">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface TransactionVolumeCardProps {
  report: TransactionVolumeReport | null | undefined;
  isLoading?: boolean;
}

export function TransactionVolumeCard({
  report,
  isLoading,
}: TransactionVolumeCardProps) {
  const [sortByDebits, setSortByDebits] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 5;

  if (isLoading) return <TransactionVolumeSkeleton />;
  if (!report) return null;

  const allRows = ensureCoreRows(report.rows);
  const { totals } = report;
  const totalVolume = totals.credits + totals.debits;
  const creditPercent = totalVolume > 0 ? Math.round((totals.credits / totalVolume) * 100) : 0;
  const debitPercent = totalVolume > 0 ? 100 - creditPercent : 0;

  // Sort rows
  const sortedRows = [...allRows].sort((a, b) => {
    if (sortByDebits) return b.debits - a.debits;
    return b.credits - a.credits;
  });

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);
  const pagedRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card className="border shadow-sm">
      {/* Header */}
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-[1.0625rem] font-semibold text-[#0C4FD1]! dark:text-[#6CA0FF]!">
              Transaction Volume Analysis
            </h3>
            <p className="text-sm text-muted-foreground">
              Detailed breakdown of inflow vs. outflow payment metrics.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Sort Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Sort by Debits
              </span>
              <button
                onClick={() => setSortByDebits(!sortByDebits)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  sortByDebits ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm",
                    sortByDebits ? "translate-x-[18px]" : "translate-x-[3px]"
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Legend + Total Volume */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="text-xs font-medium text-muted-foreground">
                Credits ({creditPercent}%)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
              <span className="text-xs font-medium text-muted-foreground">
                Debits ({debitPercent}%)
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Total Volume
            </p>
            <p className="text-xl font-bold tracking-tight">
              {totalVolume.toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                txns
              </span>
            </p>
          </div>
        </div>

        {/* Stacked Progress Bar. Each segment reserves at least enough room for
            its own label (`min-w`) so a lopsided split — e.g. 96% in / 4% out —
            still centres "8 OUT" inside the orange block instead of letting the
            text overflow past its edge. */}
        <div className="flex h-8 rounded-lg overflow-hidden">
          {creditPercent > 0 && (
            <div
              className="bg-primary flex min-w-fit items-center justify-center whitespace-nowrap px-2 text-white text-xs font-semibold transition-all"
              style={{ width: `${creditPercent}%` }}
            >
              {totals.credits.toLocaleString()} IN
            </div>
          )}
          {debitPercent > 0 && (
            <div
              className="bg-orange-500 flex min-w-fit items-center justify-center whitespace-nowrap px-2 text-white text-xs font-semibold transition-all"
              style={{ width: `${debitPercent}%` }}
            >
              {totals.debits.toLocaleString()} OUT
            </div>
          )}
        </div>

        {/* Table — scrollable so names never get crushed */}
        <div className="overflow-x-auto -mx-6 px-6">
          <div style={{ minWidth: "340px" }}>
            {/* Table Header */}
            <div className="grid grid-cols-[minmax(100px,1fr)_80px_80px] sm:grid-cols-[minmax(130px,1fr)_90px_90px_100px] gap-x-3 pb-3 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1">
                Payment Type <Info className="h-3 w-3 shrink-0" />
              </span>
              <span className="text-right flex items-center justify-end gap-1">
                Credits <Info className="h-3 w-3 shrink-0" />
              </span>
              <span className="text-right flex items-center justify-end gap-1">
                Debits <Info className="h-3 w-3 shrink-0" />
              </span>
              <span className="hidden sm:block text-center">Net Ratio</span>
            </div>

            {/* Rows */}
            <div className="divide-y">
              {pagedRows.map((row) => {
                const config = typeConfig[row.type] || {
                  icon: <Wallet className="h-4 w-4 text-muted-foreground" />,
                  subtitle: "Other payments",
                  iconBg: "bg-muted/60",
                };
                const rowTotal = row.credits + row.debits;
                const efficiency =
                  rowTotal > 0
                    ? Math.round((row.credits / rowTotal) * 100)
                    : 0;
                const displayName =
                  row.type === "Card" ? "Card Payments" :
                  row.type === "Cash" ? "Cash Transactions" :
                  row.type === "Gift Card" ? "Gift Cards" :
                  row.type;

                return (
                  <div
                    key={row.type}
                    className="grid grid-cols-[minmax(100px,1fr)_80px_80px] sm:grid-cols-[minmax(130px,1fr)_90px_90px_100px] gap-x-3 py-3 items-center"
                  >
                    {/* Payment Type */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={cn(
                          "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
                          config.iconBg
                        )}
                      >
                        {config.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight truncate">
                          {displayName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate hidden sm:block">
                          {config.subtitle}
                        </p>
                      </div>
                    </div>

                    {/* Credits */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums">
                        {row.credits.toLocaleString()}
                      </p>
                      {row.credits > 0 && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-0.5">
                          <TrendingUp className="h-3 w-3" />+
                          {totalVolume > 0
                            ? ((row.credits / totalVolume) * 100).toFixed(1)
                            : "0.0"}
                          %
                        </p>
                      )}
                    </div>

                    {/* Debits */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums text-orange-600 dark:text-orange-400">
                        {row.debits.toLocaleString()}
                      </p>
                      {row.debits > 0 && (
                        <p className="text-[11px] text-orange-600 dark:text-orange-400 flex items-center justify-end gap-0.5">
                          <TrendingDown className="h-3 w-3" />+
                          {totalVolume > 0
                            ? ((row.debits / totalVolume) * 100).toFixed(1)
                            : "0.0"}
                          %
                        </p>
                      )}
                    </div>

                    {/* Net Ratio / Efficiency — hidden on mobile */}
                    <div className="hidden sm:flex flex-col items-center gap-1 shrink-0">
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${efficiency}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {efficiency}% Efficiency
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer. Stacks under sm: side by side, the count text is squeezed
            into a narrow column at 360px and the link crowds it. */}
        <div className="flex flex-col gap-3 pt-3 border-t sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Showing {pagedRows.length} payment method{pagedRows.length !== 1 ? "s" : ""}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-3 w-3 mr-0.5" />
                  Prev
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs font-semibold"
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="h-3 w-3 ml-0.5" />
                </Button>
              </div>
            )}
          </div>

          <OverviewLinkButton href="/dashboard/transactions">
            View full transaction details
          </OverviewLinkButton>
        </div>
      </CardContent>
    </Card>
  );
}
