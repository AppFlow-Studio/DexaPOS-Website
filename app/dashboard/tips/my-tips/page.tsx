"use client";

import { useState } from "react";
import { ChevronRight, TrendingUp, Clock, DollarSign, ArrowUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function SummaryCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
          <Icon className="w-5 h-5 text-teal-600" />
        </div>
      </div>
    </Card>
  );
}

function DetailRow({ entry }: { entry: MyTipEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <TableCell className="font-medium text-sm">{fmtDate(entry.session_date)}</TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {SHIFT_LABELS[entry.shift_period] ?? entry.shift_period}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">{entry.role_code}</TableCell>
        <TableCell className="text-right text-sm">{(entry.hours_worked || 0).toFixed(1)}h</TableCell>
        <TableCell className="text-right text-sm font-semibold text-green-700">
          {fmt(entry.net_tips)}
        </TableCell>
        <TableCell>
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
        </TableCell>
      </TableRow>

      {open && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={6} className="py-3 px-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Own Tips</p>
                <p className="font-medium">{fmt(entry.individual_tips_earned)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pool Contributed</p>
                <p className="font-medium text-red-600">−{fmt(entry.tip_pool_contributed)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pool Received</p>
                <p className="font-medium text-green-600">+{fmt(entry.tip_pool_received)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tip-Out Given</p>
                <p className="font-medium text-red-600">−{fmt(entry.tip_out_given)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tip-Out Received</p>
                <p className="font-medium text-green-600">+{fmt(entry.tip_out_received)}</p>
              </div>
              {entry.manual_adjustment !== 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Adjustment</p>
                  <p className={`font-medium ${entry.manual_adjustment > 0 ? "text-green-600" : "text-red-600"}`}>
                    {entry.manual_adjustment > 0 ? "+" : ""}{fmt(entry.manual_adjustment)}
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
            <span>Tips</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground font-medium">My Tips</span>
          </nav>
          <h1 className="text-2xl font-bold">My Tip History</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your approved tip distributions
          </p>
        </div>

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
      </div>

      {/* Summary cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-28" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            label="Net Tips"
            value={fmt(totalNet)}
            icon={DollarSign}
            sub={`${entries.length} shifts`}
          />
          <SummaryCard
            label="Own Tips Earned"
            value={fmt(totalOwn)}
            icon={TrendingUp}
          />
          <SummaryCard
            label="Total Hours"
            value={`${totalHours.toFixed(1)}h`}
            icon={Clock}
          />
          <SummaryCard
            label="Avg / Shift"
            value={fmt(avgPerShift)}
            icon={ArrowUpDown}
          />
        </div>
      )}

      {/* Weekly rollup */}
      {!isLoading && weeks.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3">Weekly Rollup</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {weeks.map(([weekStart, total]) => (
              <div key={weekStart} className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  Week of {new Date(weekStart + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
                <p className="text-lg font-bold mt-1">{fmt(total)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Detail table */}
      {isLoading ? (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/20">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="divide-y">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-4 py-3 flex gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      ) : entries.length === 0 ? (
        <Card className="p-12 text-center">
          <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No approved tip records found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Approved distributions will appear here once a manager calculates and approves tips.
          </p>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/20">
            <h3 className="font-semibold text-sm">Shift Breakdown</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Click a row to see the full breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  <TableHead>Date</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Net Tips</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <DetailRow key={entry.session_id} entry={entry} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
