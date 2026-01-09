"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Info, ChevronRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface UnpaidOrdersCardProps {
  unpaidAmount: number;
  unpaidCount?: number;
  isLoading?: boolean;
  onViewUnpaid?: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function UnpaidOrdersCard({
  unpaidAmount,
  unpaidCount = 0,
  isLoading,
  onViewUnpaid,
}: UnpaidOrdersCardProps) {
  if (isLoading) {
    return (
      <Card className="border-none shadow-sm bg-card/80 backdrop-blur">
        <CardHeader className="pb-2">
          <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-6 w-24 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const hasUnpaid = unpaidAmount > 0;

  return (
    <Card
      className={cn(
        "border-none shadow-sm backdrop-blur hover:shadow-md transition-shadow",
        hasUnpaid ? "bg-amber-500/5 border border-amber-500/20" : "bg-card/80"
      )}
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-bold tracking-tight">
            Unpaid Orders
          </CardTitle>
          {hasUnpaid && (
            <div className="p-1 rounded-full bg-amber-500/20">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
            </div>
          )}
        </div>
        {onViewUnpaid && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-primary h-7 px-2 hover:bg-primary/10"
            onClick={onViewUnpaid}
          >
            Unpaid orders
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Unpaid amount</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px]">
                  <p className="text-xs">
                    Total outstanding balance from unpaid orders
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "font-mono text-lg font-bold tabular-nums",
                hasUnpaid && "text-amber-600"
              )}
            >
              {formatCurrency(unpaidAmount)}
            </span>
            {unpaidCount > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {unpaidCount} order{unpaidCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
