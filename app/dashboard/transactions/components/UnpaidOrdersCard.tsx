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
  const hasUnpaid = unpaidAmount > 0;

  return (
    // No amber alarm tint on the panel (D-12): an outstanding balance is a
    // normal state, and a whole panel changing colour made it the loudest
    // thing on the tab. The count and the figure say it.
    <Panel>
      <PanelSection
        label={
          <span className="flex items-center gap-2">
            Unpaid Orders
            {hasUnpaid && (
              <span className="rounded-full bg-muted/60 p-1 text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
              </span>
            )}
          </span>
        }
        action={
          onViewUnpaid && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[#0C4FD1] dark:text-[#6CA0FF] h-7 px-2 hover:bg-[#0C4FD1]/10"
              onClick={onViewUnpaid}
            >
              Unpaid orders
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-6 w-24" />
          </div>
        ) : (
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
              <span className="font-mono text-lg font-bold tabular-nums">
                {formatCurrency(unpaidAmount)}
              </span>
              {unpaidCount > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {unpaidCount} order{unpaidCount !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
        )}
      </PanelSection>
    </Panel>
  );
}
