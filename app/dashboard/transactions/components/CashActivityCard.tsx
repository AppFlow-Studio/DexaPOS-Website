"use client";

import { Panel, PanelSection } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
          "border-t border-border/60 pt-3 mt-2 bg-muted/30 -mx-4 px-4 rounded-2xl"
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
          isNegative && "text-rose-600 dark:text-rose-400"
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
  // Calculate what percentage of cash payments are remaining as total cash
  const cashRetentionPercentage =
    totalCashPayments > 0
      ? Math.min((totalCash / totalCashPayments) * 100, 100)
      : 100;

  return (
    <Panel>
      <PanelSection
        label="Cash Activity"
        action={
          onViewCashActivity && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[#0C4FD1] dark:text-[#6CA0FF] h-7 px-2 hover:bg-[#0C4FD1]/10"
              onClick={onViewCashActivity}
            >
              Cash activity
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )
        }
      >
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        ) : (
          <>
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
                className="h-1.5 [&>div]:bg-[#0C4FD1] dark:[&>div]:bg-[#6CA0FF]"
              />
            </div>

            <MetricRow
              label="Total cash"
              value={totalCash}
              isTotal
              info="Final cash amount after all activity"
            />
          </>
        )}
      </PanelSection>
    </Panel>
  );
}
