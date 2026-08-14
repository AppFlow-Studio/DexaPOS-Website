"use client";

import { useState } from "react";
import { ChevronRight, TrendingUp, Clock, DollarSign, ArrowUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, Panel, PanelSection, StatRow, StatTile, InsetTile } from "@/components/dashboard/shell";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useLocationStore } from "@/stores/location-store";
import { useMyTipHistory } from "../hooks/useTipDistribution";
import type { MyTipEntry } from "@/app/dashboard/actions/tips";

const SHIFT_LABELS: Record<string, string> = {
  full_day: "Full Day",
  lunch: "Lunch",
  dinner: "Dinner",
  custom: "Custom",
};

const RANGE_OPTIONS = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 60 days", value: 60 },
  { label: "Last 90 days", value: 90 },
];

function fmt(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function DetailRow({ entry }: { entry: MyTipEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
        onClick={() => setOpen((v) => !v)}
      >
        <TableCell className="py-3 text-sm font-medium">{fmtDate(entry.session_date)}</TableCell>
        <TableCell className="py-3 text-sm text-muted-foreground">
          {SHIFT_LABELS[entry.shift_period] ?? entry.shift_period}
        </TableCell>
        <TableCell className="py-3 text-sm text-muted-foreground">{entry.role_code}</TableCell>
        <TableCell className="py-3 text-right text-sm tabular-nums">{(entry.hours_worked || 0).toFixed(1)}h</TableCell>
        <TableCell className="py-3 text-right text-sm font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
          {fmt(entry.net_tips)}
        </TableCell>
        <TableCell className="py-3">
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
        </TableCell>
      </TableRow>

      {open && (
        <TableRow className="border-b border-border/60 bg-muted/20 last:border-0 hover:bg-muted/20">
          <TableCell colSpan={6} className="py-3 px-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Own Tips</p>
                <p className="font-medium tabular-nums">{fmt(entry.individual_tips_earned)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pool Contributed</p>
                <p className="font-medium text-rose-700 tabular-nums dark:text-rose-400">
                  −{fmt(entry.tip_pool_contributed)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pool Received</p>
                <p className="font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
                  +{fmt(entry.tip_pool_received)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tip-Out Given</p>
                <p className="font-medium text-rose-700 tabular-nums dark:text-rose-400">
                  −{fmt(entry.tip_out_given)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tip-Out Received</p>
                <p className="font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
                  +{fmt(entry.tip_out_received)}
                </p>
              </div>
              {entry.manual_adjustment !== 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Adjustment</p>
                  <p
                    className={`font-medium tabular-nums ${
                      entry.manual_adjustment > 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    {entry.manual_adjustment > 0 ? "+" : ""}
                    {fmt(entry.manual_adjustment)}
                  </p>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function MyTipsPage() {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const [limitDays, setLimitDays] = useState(30);

  const { data: entries = [], isLoading } = useMyTipHistory(
    clerkOrgId,
    selectedLocationId,
    limitDays
  );

  // Aggregate summaries
  const totalNet = entries.reduce((sum, e) => sum + e.net_tips, 0);
  const totalOwn = entries.reduce((sum, e) => sum + e.individual_tips_earned, 0);
  const totalHours = entries.reduce((sum, e) => sum + (e.hours_worked || 0), 0);
  const avgPerShift = entries.length > 0 ? totalNet / entries.length : 0;

  // Weekly breakdown
  const weeklyMap: Record<string, number> = {};
  for (const e of entries) {
    const d = new Date(e.session_date + "T00:00:00");
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().split("T")[0];
    weeklyMap[key] = (weeklyMap[key] || 0) + e.net_tips;
  }
  const weeks = Object.entries(weeklyMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 4);

  return (
    <PageShell>
      <PageHeader
        title="My Tip History"
        subtitle="Your approved tip distributions"
        backHref="/dashboard/tips"
        backLabel="Back to Tips"
        actions={
          <Select value={String(limitDays)} onValueChange={(v) => setLimitDays(Number(v))}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Summary cards */}
      <Panel>
        <div className="px-6 py-6">
          <StatRow columns={4}>
            <StatTile
              label="Net Tips"
              value={fmt(totalNet)}
              meta={`${entries.length} shifts`}
              icon={<DollarSign />}
              isLoading={isLoading}
            />
            <StatTile
              label="Own Tips Earned"
              value={fmt(totalOwn)}
              icon={<TrendingUp />}
              isLoading={isLoading}
            />
            <StatTile
              label="Total Hours"
              value={`${totalHours.toFixed(1)}h`}
              icon={<Clock />}
              isLoading={isLoading}
            />
            <StatTile
              label="Avg / Shift"
              value={fmt(avgPerShift)}
              icon={<ArrowUpDown />}
              isLoading={isLoading}
            />
          </StatRow>
        </div>
      </Panel>

      {/* Weekly rollup */}
      {!isLoading && weeks.length > 0 && (
        <Panel>
          <PanelSection label="Weekly Rollup">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {weeks.map(([weekStart, total]) => (
                <InsetTile
                  key={weekStart}
                  label={`Week of ${new Date(weekStart + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                  value={fmt(total)}
                />
              ))}
            </div>
          </PanelSection>
        </Panel>
      )}

      {/* Detail table */}
      {isLoading ? (
        <Panel>
          <PanelSection label="Shift Breakdown" caption="Click a row to see the full breakdown">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20 ml-auto" />
                </div>
              ))}
            </div>
          </PanelSection>
        </Panel>
      ) : entries.length === 0 ? (
        <Panel padded className="text-center py-12">
          <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No approved tip records found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Approved distributions will appear here once a manager calculates and approves tips.
          </p>
        </Panel>
      ) : (
        <Panel>
          <PanelSection label="Shift Breakdown" caption="Click a row to see the full breakdown">
            <div className="-mx-2 overflow-x-auto px-2">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/60 hover:bg-transparent">
                    <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Date</TableHead>
                    <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Shift</TableHead>
                    <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Role</TableHead>
                    <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Hours</TableHead>
                    <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Net Tips</TableHead>
                    <TableHead className="h-auto w-8 py-2.5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <DetailRow key={entry.session_id} entry={entry} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </PanelSection>
        </Panel>
      )}
    </PageShell>
  );
}
