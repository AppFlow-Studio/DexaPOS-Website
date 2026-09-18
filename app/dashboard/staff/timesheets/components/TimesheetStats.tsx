"use client";

import { Clock3, Timer, WalletCards } from "lucide-react";

import { Panel, StatRow, StatTile } from "@/components/dashboard/shell";
import { formatHours, formatMoney } from "@/lib/timesheets/format";
import type { SummaryTiles } from "@/lib/timesheets/summary";

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/**
 * Total hours · Overtime · Estimated labor cost. "Active shifts" was dropped
 * (ticket): it is live-ops and belongs on the Staff page.
 */
export function TimesheetStats({
  tiles,
  isLoading,
}: {
  tiles: SummaryTiles | null;
  isLoading: boolean;
}) {
  const t = tiles;
  return (
    <Panel padded>
      <StatRow columns={3}>
        <StatTile
          label="Total hours"
          value={t ? formatHours(t.totalMinutes) : "—"}
          meta={
            t
              ? `${plural(t.memberCount, "team member", "team members")} · ${plural(t.shiftCount, "shift", "shifts")}`
              : undefined
          }
          icon={<Clock3 />}
          isLoading={isLoading}
        />
        <StatTile
          label="Overtime hours"
          value={t ? formatHours(t.otMinutes) : "—"}
          meta={
            t
              ? t.otPeople === 0
                ? "No one over 40 hours a week"
                : `${plural(t.otPeople, "person", "people")} over 40 hours a week`
              : undefined
          }
          icon={<Timer />}
          isLoading={isLoading}
        />
        <StatTile
          label="Estimated labor cost"
          value={t ? formatMoney(t.laborCents) : "—"}
          meta={
            t
              ? t.peopleWithoutRate > 0
                ? `Not counted: ${plural(t.peopleWithoutRate, "person", "people")} with no pay rate`
                : "Includes overtime at 1.5×"
              : undefined
          }
          icon={<WalletCards />}
          isLoading={isLoading}
        />
      </StatRow>
    </Panel>
  );
}
