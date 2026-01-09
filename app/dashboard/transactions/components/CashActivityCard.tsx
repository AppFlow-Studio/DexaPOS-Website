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

interface CashActivityCardProps {
  totalCashPayments: number;
  cashAdjustments: number;
  cashRefunds: number;
  cashBeforeTipouts: number;
  cashGratuity: number;
  creditNonCashGratuity: number;
  creditNonCashTips: number;
  tipoutsTipsWithheld: number;
  totalCash: number;
  isLoading?: boolean;
  onViewCashActivity?: () => void;
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
  isTotal = false,
  isNegative = false,
}: {
  label: string;
  value: number;
  info?: string;
  isTotal?: boolean;
  isNegative?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2",
        isTotal &&
          "border-t-2 border-foreground/10 pt-3 mt-2 bg-muted/30 -mx-4 px-4"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-sm",
            isTotal ? "font-bold" : "text-muted-foreground"
          )}
        >
          {label}
        </span>
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
      <span
        className={cn(
          "font-mono text-sm tabular-nums",
          isTotal && "font-bold",
          isNegative && "text-red-500"
        )}
      >
        {isNegative && value !== 0 ? "-" : ""}
        {formatCurrency(Math.abs(value))}
      </span>
    </div>
  );
}

export function CashActivityCard({
  totalCashPayments,
  cashAdjustments,
  cashRefunds,
  cashBeforeTipouts,
  cashGratuity,
  creditNonCashGratuity,
  creditNonCashTips,
  tipoutsTipsWithheld,
  totalCash,
  isLoading,
  onViewCashActivity,
}: CashActivityCardProps) {
  if (isLoading) {
    return (
      <Card className="border-none shadow-sm bg-card/80 backdrop-blur">
        <CardHeader className="pb-2">
          <div className="h-5 w-28 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
              <div className="h-4 w-14 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Calculate what percentage of cash payments are remaining as total cash
  const cashRetentionPercentage =
    totalCashPayments > 0
      ? Math.min((totalCash / totalCashPayments) * 100, 100)
      : 100;

  return (
    <Card className="border-none shadow-sm bg-card/80 backdrop-blur hover:shadow-md transition-shadow">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-bold tracking-tight">
          Cash Activity
        </CardTitle>
        {onViewCashActivity && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-primary h-7 px-2 hover:bg-primary/10"
            onClick={onViewCashActivity}
          >
            Cash activity
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-0">
        <MetricRow
          label="Total cash payments"
          value={totalCashPayments}
          info="All payments made with cash"
        />
        <MetricRow
          label="Cash adjustments"
          value={cashAdjustments}
          info="Manual adjustments to cash drawer"
        />
        <MetricRow
          label="Cash refunds"
          value={cashRefunds}
          isNegative={cashRefunds > 0}
          info="Refunds paid in cash"
        />
        <MetricRow
          label="Cash before tipouts"
          value={cashBeforeTipouts}
          info="Cash available before distributing tips"
        />
        <MetricRow
          label="Cash gratuity"
          value={cashGratuity}
          info="Gratuity received in cash"
        />
        <MetricRow
          label="Credit/non-cash gratuity"
          value={creditNonCashGratuity}
          info="Gratuity received through cards"
        />
        <MetricRow
          label="Credit/non-cash tips"
          value={creditNonCashTips}
          isNegative={creditNonCashTips > 0}
          info="Tips paid out from card payments"
        />
        <MetricRow
          label="Tipouts tips withheld"
          value={tipoutsTipsWithheld}
          info="Tips withheld for later distribution"
        />

        {/* Progress indicator */}
        <div className="py-3">
          <Progress
            value={cashRetentionPercentage}
            className="h-1.5 [&>div]:bg-primary"
          />
        </div>

        <MetricRow
          label="Total cash"
          value={totalCash}
          isTotal
          info="Final cash amount after all activity"
        />
      </CardContent>
    </Card>
  );
}
