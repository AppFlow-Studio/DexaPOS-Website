"use client";

import { format } from "date-fns";
import { DollarSign, CreditCard, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelSection, StatRow, StatTile } from "@/components/dashboard/shell";
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
    <Panel>
      <PanelSection
        label={displayDate}
        caption={locationName}
        action={
          <TooltipProvider>
            <Tooltip>
              {/* The trigger wraps a span, not the Button: a disabled button
                  swallows pointer events, so the tooltip explaining *why* it
                  is disabled would never open — which is the only case that
                  needs it. */}
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    onClick={onCloseOut}
                    disabled={closeOutDisabled}
                    className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                  >
                    {isClosingOut ? "Calculating…" : "Close Out & Calculate"}
                  </Button>
                </span>
              </TooltipTrigger>
              {staffStillClockedIn > 0 && (
                <TooltipContent>
                  <p className="max-w-[220px]">
                    {staffStillClockedIn} staff still clocked in — finish shifts
                    before closing out.
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        }
      >
        {/* Four full-size tiles stack to four screenfuls on a phone. Wide
            screens keep the StatRow; phones get a compact 2×2. */}
        <div className="hidden sm:block">
          <StatRow columns={4}>
            {statTiles.map((tile) => (
              <StatTile
                key={tile.key}
                label={tile.label}
                icon={<tile.icon />}
                isLoading={isLoading || !summary}
                value={summary ? tile.getValue(summary) : "—"}
              />
            ))}
          </StatRow>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:hidden">
          {statTiles.map((tile) => (
            <div key={tile.key} className="min-w-0">
              <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                <tile.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{tile.label}</span>
              </p>
              {isLoading || !summary ? (
                <Skeleton className="mt-1 h-6 w-20" />
              ) : (
                <p className="mt-0.5 text-lg font-medium leading-tight tracking-[-0.02em] tabular-nums">
                  {tile.getValue(summary)}
                </p>
              )}
            </div>
          ))}
        </div>
      </PanelSection>
    </Panel>
  );
}
