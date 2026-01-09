"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";

interface LaborMeterProps {
  currentCost: number;
  targetCost: number;
  budgetCost: number;
  showDetails?: boolean;
}

export function LaborMeter({
  currentCost,
  targetCost,
  budgetCost,
  showDetails = true,
}: LaborMeterProps) {
  const percentage = useMemo(() => {
    return Math.min((currentCost / budgetCost) * 100, 100);
  }, [currentCost, budgetCost]);

  const variance = useMemo(() => {
    return ((currentCost - targetCost) / targetCost) * 100;
  }, [currentCost, targetCost]);

  const isOverBudget = currentCost > budgetCost;
  const isOverTarget = currentCost > targetCost;

  const getStatusColor = () => {
    if (isOverBudget) return "bg-red-500";
    if (isOverTarget) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <Card className="bg-muted/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-medium">Labor Cost</div>
              <div className="text-2xl font-bold">
                ${currentCost.toLocaleString()}
              </div>
            </div>
          </div>

          <Badge
            variant="outline"
            className={`gap-1 ${
              variance > 0
                ? "bg-red-500/10 text-red-600 border-red-500/30"
                : "bg-green-500/10 text-green-600 border-green-500/30"
            }`}
          >
            {variance > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {variance > 0 ? "+" : ""}
            {variance.toFixed(1)}%
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="relative">
            <Progress value={percentage} className="h-3" />
            {/* Target marker */}
            <div
              className="absolute top-0 h-3 w-0.5 bg-foreground/50"
              style={{ left: `${(targetCost / budgetCost) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>$0</span>
            <span className="flex items-center gap-1">
              <div className="w-1 h-1 rounded-full bg-foreground/50" />
              Target: ${targetCost.toLocaleString()}
            </span>
            <span>Budget: ${budgetCost.toLocaleString()}</span>
          </div>
        </div>

        {/* Warning */}
        {isOverBudget && (
          <div className="flex items-center gap-2 p-2 bg-red-500/10 rounded-lg text-red-600 text-xs">
            <AlertTriangle className="h-4 w-4" />
            Over budget by ${(currentCost - budgetCost).toLocaleString()}
          </div>
        )}

        {showDetails && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Current</div>
              <div className="text-sm font-medium">
                ${currentCost.toLocaleString()}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Target</div>
              <div className="text-sm font-medium">
                ${targetCost.toLocaleString()}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Budget</div>
              <div className="text-sm font-medium">
                ${budgetCost.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LaborMeter;
