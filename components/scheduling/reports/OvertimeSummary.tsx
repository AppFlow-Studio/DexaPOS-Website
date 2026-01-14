"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";

interface OvertimeData {
  totalOvertimeHours: number;
  overtimeEmployees: {
    name: string;
    hours: number;
  }[];
  trend: number; // Percentage change from last week
}

interface OvertimeSummaryProps {
  data: OvertimeData;
}

export function OvertimeSummary({ data }: OvertimeSummaryProps) {
  const isOverBudget = data.trend > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Overtime Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">{data.totalOvertimeHours}h</div>
            <div className="text-sm text-muted-foreground">Total Overtime</div>
          </div>
          <Badge
            variant="outline"
            className={
              isOverBudget
                ? "bg-red-500/10 text-red-600 border-red-500/30"
                : "bg-green-500/10 text-green-600 border-green-500/30"
            }
          >
            {isOverBudget ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {isOverBudget ? "+" : ""}
            {data.trend.toFixed(1)}% vs Last Week
          </Badge>
        </div>

        {data.overtimeEmployees.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="text-sm font-medium text-muted-foreground">
              Top Overtime Employees
            </div>
            {data.overtimeEmployees.slice(0, 3).map((emp, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
              >
                <span className="text-sm font-medium">{emp.name}</span>
                <span className="text-sm text-muted-foreground">
                  {emp.hours}h OT
                </span>
              </div>
            ))}
          </div>
        )}

        {data.totalOvertimeHours > 20 && (
          <div className="flex items-center gap-2 p-2 bg-yellow-500/10 rounded-lg text-yellow-700 dark:text-yellow-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs">
              Overtime exceeds 20h threshold. Consider adjusting schedules.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OvertimeSummary;
