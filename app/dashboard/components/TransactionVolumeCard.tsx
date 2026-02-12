"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Activity,
  Banknote,
  CreditCard,
  Gift,
  Wallet,
  Globe,
} from "lucide-react";
import type {
  TransactionVolumeReport,
  TransactionVolumeRow,
} from "@/app/dashboard/actions/order-analytics";

// ============================================================================
// Helpers
// ============================================================================

const typeIcons: Record<string, React.ReactNode> = {
  Cash: <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
  Card: <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
  "Gift Card": <Gift className="h-4 w-4 text-purple-600 dark:text-purple-400" />,
  "House Account": <Wallet className="h-4 w-4 text-orange-600 dark:text-orange-400" />,
  External: <Globe className="h-4 w-4 text-gray-600 dark:text-gray-400" />,
};

// The 3 core types that always display, even when counts are 0
const CORE_TYPES = ["Cash", "Card", "Gift Card"];

function ensureCoreRows(rows: TransactionVolumeRow[]): TransactionVolumeRow[] {
  const existing = new Set(rows.map((r) => r.type));
  const result = [...rows];

  for (const type of CORE_TYPES) {
    if (!existing.has(type)) {
      result.push({ type, credits: 0, debits: 0, netCount: 0 });
    }
  }

  // Sort: core types first in order, then the rest
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
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-64" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between items-center py-2">
              <Skeleton className="h-4 w-20" />
              <div className="flex gap-6">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
              </div>
            </div>
          ))}
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
  if (isLoading) return <TransactionVolumeSkeleton />;
  if (!report) return null;

  const rows = ensureCoreRows(report.rows);
  const { totals } = report;

  // Flag: high refund ratio (debits > 20% of credits)
  const highRefundRatio =
    totals.credits > 0 && totals.debits / totals.credits > 0.2;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Transaction Volume
          {highRefundRatio && (
            <Badge
              variant="destructive"
              className="text-[10px] h-5 px-1.5"
            >
              High refund ratio
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Credits (Sales) vs. Debits (Refunds/Payouts) — last 30 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Table Header */}
        <div className="grid grid-cols-4 gap-4 pb-2 border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Type</span>
          <span className="text-right">
            <span className="inline-flex items-center gap-1">
              <ArrowDownLeft className="h-3 w-3 text-emerald-500" />
              Credits (In)
            </span>
          </span>
          <span className="text-right">
            <span className="inline-flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3 text-rose-500" />
              Debits (Out)
            </span>
          </span>
          <span className="text-right">Net Count</span>
        </div>

        {/* Rows */}
        <div className="divide-y">
          {rows.map((row) => {
            const icon = typeIcons[row.type] || (
              <Wallet className="h-4 w-4 text-muted-foreground" />
            );
            const isEmpty = row.credits === 0 && row.debits === 0;

            return (
              <div
                key={row.type}
                className={cn(
                  "grid grid-cols-4 gap-4 py-3 items-center text-sm transition-colors",
                  isEmpty && "opacity-50"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/60">
                    {icon}
                  </div>
                  <span className="font-medium">{row.type}</span>
                </div>
                <span className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                  {row.credits}
                </span>
                <span className="text-right font-mono tabular-nums text-rose-600 dark:text-rose-400 font-medium">
                  {row.debits}
                </span>
                <span
                  className={cn(
                    "text-right font-mono tabular-nums font-semibold",
                    row.netCount > 0
                      ? "text-foreground"
                      : row.netCount < 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-muted-foreground"
                  )}
                >
                  {row.netCount}
                </span>
              </div>
            );
          })}
        </div>

        {/* Totals Row */}
        <div className="grid grid-cols-4 gap-4 pt-3 mt-1 border-t-2 items-center">
          <span className="text-sm font-bold">Total</span>
          <span className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-bold text-sm">
            {totals.credits}
          </span>
          <span className="text-right font-mono tabular-nums text-rose-600 dark:text-rose-400 font-bold text-sm">
            {totals.debits}
          </span>
          <span className="text-right font-mono tabular-nums font-bold text-sm">
            {totals.netCount}
          </span>
        </div>

        {/* Insight callout */}
        {highRefundRatio && (
          <div className="mt-4 flex items-start gap-2 py-2.5 px-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/50">
            <Activity className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <span className="font-semibold">Insight:</span> Debit count
              exceeds 20% of credits. Check for frequent small refunds or
              excessive cash drawer payouts.
            </p>
          </div>
        )}

        {/* Footer link */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t">
          <span className="text-xs text-muted-foreground">
            Showing {rows.length} payment types
          </span>
          <Button variant="link" size="sm" className="h-auto p-0" asChild>
            <Link href="/dashboard/transactions">
              View full transaction details
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
