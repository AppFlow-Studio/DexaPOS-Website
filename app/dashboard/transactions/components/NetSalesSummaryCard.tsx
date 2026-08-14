"use client";

import { Panel, PanelSection } from "@/components/dashboard/shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Info, Zap, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface NetSalesSummaryCardProps {
  grossSales: number;
  salesDiscounts: number;
  salesRefunds: number;
  netSales: number;
  instantDepositAvailable?: number;
  isLoading?: boolean;
  onDismissDeposit?: () => void;
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
  isHighlighted = false,
  isNegative = false,
}: {
  label: string;
  value: number;
  info?: string;
  isHighlighted?: boolean;
  isNegative?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-3",
        isHighlighted && "rounded-2xl border-0 bg-muted/60 shadow-none -mx-4 px-4"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-sm",
            isHighlighted ? "font-bold" : "text-muted-foreground"
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
          isHighlighted && "font-bold",
          isNegative && "text-rose-600 dark:text-rose-400"
        )}
      >
        {isNegative && value !== 0 ? "-" : ""}
        {formatCurrency(Math.abs(value))}
      </span>
    </div>
  );
}

export function NetSalesSummaryCard({
  grossSales,
  salesDiscounts,
  salesRefunds,
  netSales,
  instantDepositAvailable = 0,
  isLoading,
  onDismissDeposit,
}: NetSalesSummaryCardProps) {
  return (
    <Panel>
      <PanelSection label="Net Sales Summary">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <>
        <MetricRow
          label="Gross sales"
          value={grossSales}
          info="Total sales before any deductions"
        />
        <MetricRow
          label="Sales discounts"
          value={salesDiscounts}
          isNegative={salesDiscounts > 0}
          info="Total discounts applied to orders"
        />
        <MetricRow
          label="Sales refunds"
          value={salesRefunds}
          isNegative={salesRefunds > 0}
          info="Total refunds issued"
        />
        <MetricRow
          label="Net sales"
          value={netSales}
          isHighlighted
          info="Gross sales minus discounts and refunds"
        />
          </>
        )}

        {/* Instant Deposit Banner */}
        {!isLoading && instantDepositAvailable > 0 && (
          <div className="mt-4 p-3 rounded-2xl bg-gradient-to-r from-[#0C4FD1]/10 to-[#0C4FD1]/5 border border-[#0C4FD1]/20 relative group">
            {/* Close: filled, borderless, circular — the search-field
                material. Visible at rest rather than fading in on hover, so
                the dismiss affordance is discoverable without hunting. */}
            <button
              onClick={onDismissDeposit}
              className="absolute top-2 right-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full border-0 bg-muted/60 text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Dismiss</span>
            </button>
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-full bg-[#0C4FD1]/20 dark:bg-[#6CA0FF]/20">
                <Zap className="h-4 w-4 text-[#0C4FD1] dark:text-[#6CA0FF]" />
              </div>
              <div>
                <p className="text-sm">
                  <span className="font-bold text-[#0C4FD1] dark:text-[#6CA0FF]">
                    {formatCurrency(instantDepositAvailable)}
                  </span>{" "}
                  is available to{" "}
                  <button className="text-[#0C4FD1] dark:text-[#6CA0FF] font-semibold hover:underline">
                    instant deposit
                  </button>
                  .
                </p>
              </div>
            </div>
          </div>
        )}
      </PanelSection>
    </Panel>
  );
}
