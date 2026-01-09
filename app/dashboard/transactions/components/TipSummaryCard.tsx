"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        isTotal && "border-t-2 border-foreground/10 pt-4 mt-2"
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
          isTotal && "font-bold text-base",
          isNegative && "text-red-500"
        )}
      >
        {formatCurrency(value)}
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
  if (isLoading) {
    return (
      <Card className="border-none shadow-sm bg-card/80 backdrop-blur">
        <CardHeader className="pb-2">
          <div className="h-5 w-28 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-sm bg-card/80 backdrop-blur hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold tracking-tight">
          Tip Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
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
      </CardContent>
    </Card>
  );
}
