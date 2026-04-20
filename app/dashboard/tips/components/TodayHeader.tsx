"use client";

import { format } from "date-fns";
import { DollarSign, CreditCard, Users, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TodaySummary } from "@/app/dashboard/actions/tips";
import { formatMoney } from "../lib/constants";

interface TodayHeaderProps {
  date: string;
  locationName: string;
  summary: TodaySummary | null;
  isLoading: boolean;
  staffStillClockedIn: number;
  undeclaredStaffCount: number;
  onCloseOut: () => void;
  isClosingOut?: boolean;
}

const statTiles = [
  {
    key: "payments",
    label: "Total Payments",
    icon: CreditCard,
    getValue: (s: TodaySummary) => s.totalPayments.toString(),
  },
  {
    key: "tips",
    label: "Tips Collected",
    icon: DollarSign,
    getValue: (s: TodaySummary) => formatMoney(s.totalTipsCollected),
  },
  {
    key: "staff",
    label: "Staff Clocked In",
    icon: Users,
    getValue: (s: TodaySummary) => s.staffClockedIn.toString(),
  },
  {
    key: "hours",
    label: "Hours Worked",
    icon: Clock,
    getValue: (s: TodaySummary) => `${s.totalHoursWorked}h`,
  },
] as const;

export function TodayHeader({
  date,
  locationName,
  summary,
  isLoading,
  staffStillClockedIn,
  undeclaredStaffCount,
  onCloseOut,
  isClosingOut,
}: TodayHeaderProps) {
  const displayDate = format(new Date(date + "T00:00:00"), "EEEE, MMMM d, yyyy");
  const closeOutDisabled = staffStillClockedIn > 0 || isClosingOut;

  return (
    <div className="space-y-4">
      {/* Date + Location + CTA */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{displayDate}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{locationName}</p>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  onClick={onCloseOut}
                  disabled={closeOutDisabled}
                  className="bg-teal-500 hover:bg-teal-600 text-white shrink-0"
                >
                  {isClosingOut ? "Calculating..." : "Close Out & Calculate"}
                </Button>
              </div>
            </TooltipTrigger>
            {staffStillClockedIn > 0 && (
              <TooltipContent>
                <p>
                  {staffStillClockedIn} staff still clocked in — finish shifts
                  before closing out.
                </p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* 4 Stat Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statTiles.map((tile) => (
          <Card
            key={tile.key}
            className="p-4 bg-teal-50/50 border-teal-100 dark:bg-teal-950/20 dark:border-teal-900/30"
          >
            <div className="flex items-center gap-2 mb-1">
              <tile.icon className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {tile.label}
              </span>
            </div>
            {isLoading || !summary ? (
              <Skeleton className="h-7 w-20 mt-1" />
            ) : (
              <p className="text-xl font-bold text-foreground">
                {tile.getValue(summary)}
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
