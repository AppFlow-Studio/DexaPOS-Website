"use client";

import { Info, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FinancialSummaryCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  info?: string;
  className?: string;
}

export function FinancialSummaryCard({
  title,
  value,
  description,
  trend,
  info,
  className,
}: FinancialSummaryCardProps) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border-0 bg-muted/60 px-4 py-4 shadow-none",
        className
      )}
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          {info && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">{info}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="flex items-baseline justify-between">
          <p className="text-xl font-medium leading-tight tracking-[-0.02em] tabular-nums">
            {typeof value === "number"
              ? value.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })
              : value}
          </p>

          {trend && (
            <div
              className={cn(
                "flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full",
                trend.isPositive
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-red-500/10 text-red-500"
              )}
            >
              {trend.isPositive ? (
                <ArrowUpRight className="h-3 w-3 mr-0.5" />
              ) : (
                <ArrowDownRight className="h-3 w-3 mr-0.5" />
              )}
              {trend.value}%
            </div>
          )}
        </div>

        {description && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
