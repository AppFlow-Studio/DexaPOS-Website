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

interface RevenueSummaryCardProps {
  netSales: number;
  gratuity: number;
  taxAmount: number;
  tips: number;
  paidInTotal: number;
  totalAmount: number;
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
        "flex min-w-0 flex-wrap items-center justify-between gap-2 py-3",
        // The total is set apart by an inset well, not a rule (§5.5).
        isTotal && "mt-2 rounded-2xl bg-muted/60 px-4"
      )}
    >
      <div className="flex min-w-0 max-w-[70%] items-start gap-2">
        <span
          className={cn(
            "min-w-0 break-words text-sm leading-snug",
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
      {/* Figures are never tinted by sign or significance (D-12): weight and
          the leading minus carry it, so the column reads as one scale. */}
      <span
        className={cn(
          "ml-auto shrink-0 max-w-[30%] text-right font-mono text-sm tabular-nums",
          isTotal && "text-base font-bold"
        )}
      >
        {isNegative && value !== 0 ? "−" : ""}
        {formatCurrency(Math.abs(value))}
      </span>
    </div>
  );
}

export function RevenueSummaryCard({
  netSales,
  gratuity,
  taxAmount,
  tips,
  paidInTotal,
  totalAmount,
  isLoading,
}: RevenueSummaryCardProps) {
  return (
    <Panel>
      <PanelSection label="Revenue Summary">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <MetricRow
              label="Net sales"
              value={netSales}
              info="Total sales after discounts and before tips"
            />
            <MetricRow label="Gratuity" value={gratuity} />
            <MetricRow
              label="Tax amount"
              value={taxAmount}
              info="Total tax collected"
            />
            <MetricRow label="Tips" value={tips} info="Tips added by customers" />
            <MetricRow
              label="Paid in total"
              value={paidInTotal}
              info="Amount paid through pay-in"
            />
            <MetricRow label="Total amount" value={totalAmount} isTotal />
          </>
        )}
      </PanelSection>
    </Panel>
  );
}
