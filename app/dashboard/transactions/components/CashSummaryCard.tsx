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
        {/* Over/short is stated in words and sign, not colour (D-12) — the
            merchant needs to know which it is, and green/red alone doesn't
            survive a colour-blind reader or a greyscale print. */}
        {showVariance && varianceValue !== 0 && (
          <span className="ml-2 text-xs font-medium text-muted-foreground">
            {isPositiveVariance ? "+" : "−"}
            {formatCurrency(Math.abs(varianceValue))}{" "}
            {isPositiveVariance ? "over" : "short"}
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
  // Calculate completion percentage (100% = no variance)
  const completionPercentage =
    expectedCloseoutCash > 0
      ? Math.min((actualCloseoutCash / expectedCloseoutCash) * 100, 100)
      : 100;

  return (
    <Panel>
      <PanelSection
        label="Cash Summary"
        action={
          onViewCashDrawer && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[#0C4FD1] dark:text-[#6CA0FF] h-7 px-2 hover:bg-[#0C4FD1]/10"
              onClick={onViewCashDrawer}
            >
              Cash drawer
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )
        }
      >
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <>
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

            {/* Progress indicator — one brand-blue fill regardless of variance
                (D-12); the over/short figure above already states direction. */}
            <div className="py-3">
              <Progress
                value={completionPercentage}
                className="h-1.5 [&>div]:bg-[#0C4FD1] dark:[&>div]:bg-[#6CA0FF]"
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
          </>
        )}
      </PanelSection>
    </Panel>
  );
}
