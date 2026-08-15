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
import { Button } from "@/components/ui/button";
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

/**
 * The per-shift figure breakdown, shared by the wide table's expanded row and
 * the phone/tablet card so the two layouts can never drift apart.
 */
function TipBreakdown({ entry }: { entry: MyTipEntry }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border-0 bg-muted/60 p-4 shadow-none sm:grid-cols-3 lg:grid-cols-5">
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] text-muted-foreground">Own Tips</p>
        <p className="mt-0.5 text-sm font-medium tabular-nums">
          {fmt(entry.individual_tips_earned)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] text-muted-foreground">Pool Contributed</p>
        <p className="mt-0.5 text-sm font-medium tabular-nums text-rose-700 dark:text-rose-400">
          −{fmt(entry.tip_pool_contributed)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] text-muted-foreground">Pool Received</p>
        <p className="mt-0.5 text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
          +{fmt(entry.tip_pool_received)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] text-muted-foreground">Tip-Out Given</p>
        <p className="mt-0.5 text-sm font-medium tabular-nums text-rose-700 dark:text-rose-400">
          −{fmt(entry.tip_out_given)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] text-muted-foreground">Tip-Out Received</p>
        <p className="mt-0.5 text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
          +{fmt(entry.tip_out_received)}
        </p>
      </div>
      {entry.manual_adjustment !== 0 && (
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] text-muted-foreground">Adjustment</p>
          <p
            className={`mt-0.5 text-sm font-medium tabular-nums ${
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
  );
}

/** Phone/tablet card — the staff pattern's replacement for a scrolling table. */
function TipEntryCard({ entry }: { entry: MyTipEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{fmtDate(entry.session_date)}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {SHIFT_LABELS[entry.shift_period] ?? entry.shift_period} · {entry.role_code}
          </p>
        </div>
        <p className="shrink-0 text-[1.375rem] font-medium leading-tight tracking-[-0.02em] tabular-nums text-emerald-700 dark:text-emerald-400">
          {fmt(entry.net_tips)}
        </p>
      </div>

      <div className="mt-5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-5">
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">Hours</p>
          <p className="mt-0.5 text-sm font-medium tabular-nums">
            {(entry.hours_worked || 0).toFixed(1)}h
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">Own tips</p>
          <p className="mt-0.5 text-sm font-medium tabular-nums">
            {fmt(entry.individual_tips_earned)}
          </p>
        </div>
      </div>

      <div className="mt-5 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3 text-[0.8125rem] font-medium"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <ChevronRight
            className={`mr-1.5 h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          />
          {open ? "Hide breakdown" : "Full breakdown"}
        </Button>
      </div>

      {open && (
        <div className="mt-3">
          <TipBreakdown entry={entry} />
        </div>
      )}
    </article>
  );
}

function DetailRow({ entry }: { entry: MyTipEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <TableCell className="text-sm font-medium">{fmtDate(entry.session_date)}</TableCell>
        <TableCell className="text-sm">
          <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {SHIFT_LABELS[entry.shift_period] ?? entry.shift_period}
          </span>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">{entry.role_code}</TableCell>
        <TableCell className="text-right text-sm tabular-nums">
          {(entry.hours_worked || 0).toFixed(1)}h
        </TableCell>
        <TableCell className="text-right text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
          {fmt(entry.net_tips)}
        </TableCell>
        <TableCell>
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
        </TableCell>
      </TableRow>

      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="px-0 pb-4 pt-0">
            <TipBreakdown entry={entry} />
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
            <SelectTrigger className="h-9 w-36 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm">
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
          {/* Four full-size tiles stack to four screenfuls on a phone. Wide
              screens keep the StatRow; phones get a compact 2×2. */}
          <div className="hidden sm:block">
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

          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:hidden">
            {[
              { label: "Net Tips", value: fmt(totalNet), Icon: DollarSign },
              { label: "Own Tips Earned", value: fmt(totalOwn), Icon: TrendingUp },
              { label: "Total Hours", value: `${totalHours.toFixed(1)}h`, Icon: Clock },
              { label: "Avg / Shift", value: fmt(avgPerShift), Icon: ArrowUpDown },
            ].map(({ label, value, Icon }) => (
              <div key={label} className="min-w-0">
                <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </p>
                {isLoading ? (
                  <Skeleton className="mt-1 h-6 w-20" />
                ) : (
                  <p className="mt-0.5 text-lg font-medium leading-tight tracking-[-0.02em] tabular-nums">
                    {value}
                  </p>
                )}
              </div>
            ))}
          </div>
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
          <PanelSection label="Shift Breakdown" caption="Open a shift to see the full breakdown">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-2xl" />
              ))}
            </div>
          </PanelSection>
        </Panel>
      ) : entries.length === 0 ? (
        <Panel>
          <PanelSection label="Shift Breakdown">
            <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
              <DollarSign className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-medium text-foreground">No approved tip records found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Approved distributions appear here once a manager calculates and approves tips.
              </p>
            </div>
          </PanelSection>
        </Panel>
      ) : (
        <Panel>
          <PanelSection label="Shift Breakdown" caption="Open a shift to see the full breakdown">
            {/* Wide screens get the table; phones and tablets get cards, so a
                6-column row never becomes a horizontal scroller. Matches
                StaffDataTable. */}
            <Table
              variant="data"
              containerClassName="hidden xl:block"
              className="min-w-[720px]"
            >
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Date</TableHead>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Shift</TableHead>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Role</TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Hours</TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Net Tips</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <DetailRow key={entry.session_id} entry={entry} />
                ))}
              </TableBody>
            </Table>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
              {entries.map((entry) => (
                <TipEntryCard key={entry.session_id} entry={entry} />
              ))}
            </div>
          </PanelSection>
        </Panel>
      )}
    </PageShell>
  );
}
