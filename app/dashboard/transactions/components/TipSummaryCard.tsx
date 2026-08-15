"use client";

import { Panel, PanelSection } from "@/components/dashboard/shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface TipSummaryCardProps {
  tipsCollected: number;
  tipsRefunded: number;
  totalTips: number;
  isLoading?: boolean;
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
        "flex items-center justify-between py-3",
        // Inset well instead of a rule (§5.5).
        isTotal && "-mx-4 mt-2 rounded-2xl bg-muted/60 px-4"
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
      {/* No sign tinting (D-12). */}
      <span
        className={cn(
          "font-mono text-sm tabular-nums",
          isTotal && "text-base font-bold"
        )}
      >
        {isNegative && value !== 0 ? "−" : ""}
        {formatCurrency(Math.abs(value))}
      </span>
    </div>
  );
}

export function TipSummaryCard({
  tipsCollected,
  tipsRefunded,
  totalTips,
  isLoading,
}: TipSummaryCardProps) {
  return (
    <Panel>
      <PanelSection label="Tip Summary">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <MetricRow
              label="Tips collected"
              value={tipsCollected}
              info="Total tips added to orders"
            />
            <MetricRow
              label="Tips refunded"
              value={tipsRefunded}
              info="Tips returned during refunds"
            />
            <MetricRow
              label="Total tips"
              value={totalTips}
              isTotal
              info="Net tips after refunds"
            />
          </>
        )}
      </PanelSection>
    </Panel>
  );
}
