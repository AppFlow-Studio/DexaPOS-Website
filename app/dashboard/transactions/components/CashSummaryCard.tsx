"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Info, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface CashSummaryCardProps {
  expectedCloseoutCash: number;
  actualCloseoutCash: number;
  cashOverageShortage: number;
  expectedDeposit: number;
  actualDeposit: number;
  depositOverageShortage: number;
  isLoading?: boolean;
  onViewCashDrawer?: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function MetricRow({
  label,
  value,
  info,
  showVariance = false,
  varianceValue = 0,
}: {
  label: string;
  value: number;
  info?: string;
  showVariance?: boolean;
  varianceValue?: number;
}) {
  const isPositiveVariance = varianceValue > 0;
  const isNegativeVariance = varianceValue < 0;

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {info && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px]">
                <p className="text-xs">{info}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="text-right">
        <span className="font-mono text-sm tabular-nums">
          {formatCurrency(value)}
        </span>
        {showVariance && varianceValue !== 0 && (
          <span
            className={cn(
              "ml-2 text-xs font-medium",
              isPositiveVariance && "text-emerald-500",
              isNegativeVariance && "text-red-500"
            )}
          >
            {isPositiveVariance ? "+" : ""}
            {formatCurrency(varianceValue)}
          </span>
        )}
      </div>
    </div>
  );
}

export function CashSummaryCard({
  expectedCloseoutCash,
  actualCloseoutCash,
  cashOverageShortage,
  expectedDeposit,
  actualDeposit,
  depositOverageShortage,
  isLoading,
  onViewCashDrawer,
}: CashSummaryCardProps) {
  if (isLoading) {
    return (
      <Card className="border-none shadow-sm bg-card/80 backdrop-blur">
        <CardHeader className="pb-2">
          <div className="h-5 w-28 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Calculate completion percentage (100% = no variance)
  const completionPercentage =
    expectedCloseoutCash > 0
      ? Math.min((actualCloseoutCash / expectedCloseoutCash) * 100, 100)
      : 100;

  return (
    <Card className="border-none shadow-sm bg-card/80 backdrop-blur hover:shadow-md transition-shadow">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-bold tracking-tight">
          Cash Summary
        </CardTitle>
        {onViewCashDrawer && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-primary h-7 px-2 hover:bg-primary/10"
            onClick={onViewCashDrawer}
          >
            Cash drawer
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        <MetricRow
          label="Expected closeout cash"
          value={expectedCloseoutCash}
          info="The amount of cash that should be in the drawer"
        />
        <MetricRow
          label="Actual closeout cash"
          value={actualCloseoutCash}
          info="The actual counted cash in the drawer"
        />
        <MetricRow
          label="Cash overage/shortage"
          value={cashOverageShortage}
          showVariance
          varianceValue={cashOverageShortage}
        />

        {/* Progress indicator */}
        <div className="py-3">
          <Progress
            value={completionPercentage}
            className={cn(
              "h-1.5",
              cashOverageShortage > 0 && "[&>div]:bg-emerald-500",
              cashOverageShortage < 0 && "[&>div]:bg-red-500",
              cashOverageShortage === 0 && "[&>div]:bg-primary"
            )}
          />
        </div>

        <MetricRow
          label="Expected deposit"
          value={expectedDeposit}
          info="Amount that should be deposited"
        />
        <MetricRow
          label="Actual deposit"
          value={actualDeposit}
          info="Actual amount deposited"
        />
        <MetricRow
          label="Deposit overage/shortage"
          value={depositOverageShortage}
        />
      </CardContent>
    </Card>
  );
}
