"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Package, CircleDollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Greeting hero: a one-sentence recap of the trailing week in plain language,
 * plus an optional attention chip for things the merchant should act on.
 * Replaces the old four-KPI tile row as the top of the dashboard.
 */
export function DashboardGreeting({
  name,
  weekRevenue,
  isLoading,
  outOfStockCount,
}: {
  name?: string | null;
  weekRevenue: number;
  isLoading?: boolean;
  outOfStockCount: number;
}) {
  const firstName = name?.trim().split(/\s+/)[0];

  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(weekRevenue);

  return (
    <div className="rounded-2xl border bg-card px-6 py-6 md:px-8 md:py-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-2xl font-normal text-muted-foreground md:text-[1.75rem]">
            Welcome back{firstName ? `, ${firstName}` : ""}.
          </p>

          {isLoading ? (
            <Skeleton className="mt-3 h-10 w-80" />
          ) : (
            <h2 className="mt-2 max-w-xl text-[1.75rem] font-medium leading-[1.3] tracking-[-0.02em] md:text-[2rem]">
              Your last 7 days brought in{" "}
              <span className="inline-flex items-baseline gap-1.5 text-primary">
                <CircleDollarSign className="h-5 w-5 self-center" />
                {formatted}
              </span>
              {outOfStockCount > 0 ? (
                <>
                  , with{" "}
                  <span className="inline-flex items-baseline gap-1.5 text-amber-600 dark:text-amber-500">
                    <AlertTriangle className="h-5 w-5 self-center" />
                    {outOfStockCount} item{outOfStockCount !== 1 ? "s" : ""}
                  </span>{" "}
                  waiting on you.
                </>
              ) : (
                <> — nothing needs fixing right now.</>
              )}
            </h2>
          )}
        </div>

        {outOfStockCount > 0 && (
          <Link
            href="/dashboard/menu/items"
            className="flex shrink-0 items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm transition-colors hover:bg-amber-100 md:w-[380px] dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
          >
            <span className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <Package className="h-4 w-4 shrink-0" />
              {outOfStockCount} item{outOfStockCount !== 1 ? "s" : ""} unavailable
            </span>
            <span className="flex items-center gap-0.5 font-medium text-amber-900 dark:text-amber-200">
              Restock now
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
