"use client";

import { useState, useMemo } from "react";
import { useVoidsReport, useFinancialKPIs } from "../../hooks/useOrderAnalytics";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { subDays, format } from "date-fns";
import { ReportPanel as Card, ReportPanelContent as CardContent, ReportPanelHeader as CardHeader, ReportPanelTitle as CardTitle } from "@/components/dashboard/reports/ReportPanel";
import { ReportPageHeader } from "@/components/dashboard/reports/ReportPageHeader";
import { PageShell, Panel, StatRow, StatTile } from "@/components/dashboard/shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ShieldAlert,
  RefreshCcw,
  DollarSign,
  FileWarning,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSelectedLocation } from "@/stores/location-store";
import { exportToCsv } from "@/utils/export";
import { Download } from "lucide-react";
import { useReportingQueryRange } from "@/app/dashboard/hooks/useReportingDateRange";

// A "discrepancy" combines both void and refund events into one unified timeline
type DiscrepancyType = "void" | "refund";

interface DiscrepancyRow {
  id: string;
  type: DiscrepancyType;
  timestamp: string;
  order_number: string;
  order_id: string;
  description: string;
  reason: string;
  staff: string;
  amount: number;
}

type SortKey = "timestamp" | "amount" | "type" | "staff";
type SortDir = "asc" | "desc";

function SortIcon({ col, active, dir }: { col: SortKey; active: SortKey; dir: SortDir }) {
  if (col !== active) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40 ml-1 shrink-0" />;
  return dir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />
    : <ArrowDown className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />;
}

const TYPE_CONFIG: Record<DiscrepancyType, { label: string; color: string; bg: string; icon: typeof AlertTriangle }> = {
  void:   { label: "Void",   color: "text-rose-600",  bg: "bg-rose-50",  icon: AlertTriangle },
  refund: { label: "Refund", color: "text-amber-600", bg: "bg-amber-50", icon: RefreshCcw },
};

const exportColumns = [
  { key: "timestamp", header: "Time", format: (v: string) => format(new Date(v), "MM/dd/yyyy HH:mm") },
  { key: "type", header: "Type", format: (v: string) => v.charAt(0).toUpperCase() + v.slice(1) },
  { key: "order_number", header: "Order #", format: (v: string) => `#${v}` },
  { key: "description", header: "Description" },
  { key: "reason", header: "Reason" },
  { key: "staff", header: "Staff" },
  { key: "amount", header: "Amount", format: (v: number) => `-$${v.toFixed(2)}` },
];

export default function DiscrepancyReportPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_30_days");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | DiscrepancyType>("all");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const selectedLocation = useSelectedLocation();
  const queryDateRange = useReportingQueryRange(dateRange);
  const { data: voidsData, isLoading: voidsLoading, isError: voidsError } = useVoidsReport(queryDateRange.from, queryDateRange.to);
  const { data: financialKPIs, isLoading: analyticsLoading, isError: analyticsError } = useFinancialKPIs(queryDateRange.from, queryDateRange.to);

  const isLoading = voidsLoading || analyticsLoading;
  const isError = voidsError || analyticsError;

  // Merge voids + refunds into unified discrepancy rows
  const allRows: DiscrepancyRow[] = useMemo(() => {
    const rows: DiscrepancyRow[] = [];
    (voidsData?.voids ?? []).forEach((v, i) => {
      rows.push({
        id: `void-${i}`,
        type: "void",
        timestamp: v.voided_at,
        order_number: v.order_number,
        order_id: v.order_id,
        description: `${v.quantity}× ${v.item_name}`,
        reason: v.reason || "No reason given",
        staff: v.voided_by || "Unknown",
        amount: v.amount,
      });
    });
    (voidsData?.refunds ?? []).forEach((r, i) => {
      rows.push({
        id: `refund-${i}`,
        type: "refund",
        timestamp: r.refunded_at,
        order_number: r.order_number,
        order_id: r.order_id,
        description: "Order refund",
        reason: r.reason || "No reason given",
        staff: r.refunded_by || "Unknown",
        amount: r.amount,
      });
    });
    return rows;
  }, [voidsData]);

  // Top staff by discrepancy count (for quick insight)
  const topStaff = useMemo(() => {
    const counts: Record<string, { count: number; amount: number }> = {};
    allRows.forEach(r => {
      if (!counts[r.staff]) counts[r.staff] = { count: 0, amount: 0 };
      counts[r.staff].count++;
      counts[r.staff].amount += r.amount;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
  }, [allRows]);

  // Top reasons
  const topReasons = useMemo(() => {
    const counts: Record<string, number> = {};
    allRows.forEach(r => {
      const key = r.reason || "No reason";
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [allRows]);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const processed = useMemo(() => {
    let rows = allRows;
    if (typeFilter !== "all") rows = rows.filter(r => r.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.description.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        r.staff.toLowerCase().includes(q) ||
        r.order_number.includes(q)
      );
    }
    return [...rows].sort((a, b) => {
      const av = (a as any)[sortKey] ?? "";
      const bv = (b as any)[sortKey] ?? "";
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [allRows, typeFilter, search, sortKey, sortDir]);

  const totalVoids = allRows.filter(r => r.type === "void");
  const totalRefunds = allRows.filter(r => r.type === "refund");
  const totalVoidAmt = totalVoids.reduce((s, r) => s + r.amount, 0);
  const totalRefundAmt = totalRefunds.reduce((s, r) => s + r.amount, 0);
  // Count distinct affected orders (not raw event rows) to avoid >100% rates
  const affectedOrderIds = new Set(allRows.map(r => r.order_id));
  const totalOrders = financialKPIs?.summary.order_count ?? 0;
  const discrepancyRate = totalOrders > 0
    ? ((affectedOrderIds.size / totalOrders) * 100).toFixed(1)
    : "0.0";

  const kpiCards = [
    {
      label: "Total Discrepancies",
      value: isLoading ? null : isError ? "—" : allRows.length.toLocaleString(),
      sub: isError ? "Failed to load" : `${discrepancyRate}% of all orders`,
      icon: ShieldAlert,
      iconColor: "text-rose-500",
      iconBg: "bg-rose-50",
    },
    {
      label: "Void Events",
      value: isLoading ? null : isError ? "—" : totalVoids.length.toLocaleString(),
      sub: isError ? "Failed to load" : `-$${totalVoidAmt.toFixed(2)} impact`,
      icon: AlertTriangle,
      iconColor: "text-rose-500",
      iconBg: "bg-rose-50",
    },
    {
      label: "Refund Events",
      value: isLoading ? null : isError ? "—" : totalRefunds.length.toLocaleString(),
      sub: isError ? "Failed to load" : `-$${totalRefundAmt.toFixed(2)} returned`,
      icon: RefreshCcw,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
    },
    {
      label: "Total Financial Impact",
      value: isLoading ? null : isError ? "—" : `-$${(totalVoidAmt + totalRefundAmt).toFixed(2)}`,
      sub: isError ? "Failed to load" : "Revenue lost to discrepancies",
      icon: DollarSign,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-50",
    },
  ];

  const hasFilters = search || typeFilter !== "all";
  const maxStaffCount = topStaff[0]?.[1].count ?? 1;
  const maxReasonCount = topReasons[0]?.[1] ?? 1;

  return (
    <PageShell className="pb-8">
      <ReportPageHeader
        title="Discrepancy Report"
        description="Voids and refunds unified timeline"
        locationName={selectedLocation && !Array.isArray(selectedLocation) ? selectedLocation.name : null}
        actions={
          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={(from, to) => { if (from && to) setDateRange({ from, to }); }}
            preset={preset}
            onPresetChange={setPreset}
          />
        }
      />

      {/* KPI Cards */}
      <Panel padded>
        <StatRow columns={4}>
        {kpiCards.map((kpi) => (
          <StatTile
            key={kpi.label}
            label={kpi.label}
            value={kpi.value ?? ""}
            meta={kpi.sub}
            icon={<kpi.icon className={kpi.iconColor} />}
            isLoading={kpi.value === null}
          />
        ))}
        </StatRow>
      </Panel>

      {/* Insights row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Staff */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold">Top Staff by Discrepancies</CardTitle>
            <p className="text-xs text-muted-foreground">Most voids & refunds this period</p>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 bg-muted animate-pulse rounded-lg" />
              ))
            ) : isError ? (
              <p className="text-sm text-muted-foreground text-center py-4">Failed to load</p>
            ) : topStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            ) : topStaff.map(([name, stats]) => (
              <div key={name} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 text-muted-foreground">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium truncate">{name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rose-400"
                      style={{ width: `${(stats.count / maxStaffCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-10 text-right">{stats.count} events</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Reasons */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold">Top Void / Refund Reasons</CardTitle>
            <p className="text-xs text-muted-foreground">Most common reasons given</p>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 bg-muted animate-pulse rounded-lg" />
              ))
            ) : isError ? (
              <p className="text-sm text-muted-foreground text-center py-4">Failed to load</p>
            ) : topReasons.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            ) : topReasons.map(([reason, count]) => (
              <div key={reason} className="flex items-center justify-between gap-3">
                <span className="text-sm truncate min-w-0">{reason}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${(count / maxReasonCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col justify-between gap-3 px-5 pb-4 pt-5 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search description, reason, staff..."
                className="h-9 w-full pl-9 text-[0.8125rem] sm:w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="h-9 w-36 border-0 bg-muted/60 text-[0.8125rem] shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="void">Voids only</SelectItem>
                <SelectItem value="refund">Refunds only</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground gap-1.5"
                onClick={() => { setSearch(""); setTypeFilter("all"); }}>
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {isLoading ? "Loading…" : `${processed.length} events`}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!processed.length}
              onClick={() => exportToCsv(processed, exportColumns as any, `discrepancy-report-${dateRange.from.toISOString().slice(0, 10)}`)}
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>

        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/50">
                <TableHead className="pl-5 text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleSort("timestamp")}>
                  <div className="flex items-center">Time <SortIcon col="timestamp" active={sortKey} dir={sortDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleSort("type")}>
                  <div className="flex items-center">Type <SortIcon col="type" active={sortKey} dir={sortDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Order #</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Description</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Reason</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleSort("staff")}>
                  <div className="flex items-center">Staff <SortIcon col="staff" active={sortKey} dir={sortDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right pr-5" onClick={() => handleSort("amount")}>
                  <div className="flex items-center justify-end">Amount <SortIcon col="amount" active={sortKey} dir={sortDir} /></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/30">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j} className="py-3.5"><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">Failed to load discrepancy data</p>
                      <p className="text-xs">Try refreshing the page or selecting a different date range.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : processed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileWarning className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">
                        {hasFilters ? "No events match your filters" : "No discrepancies found for this period"}
                      </p>
                      {hasFilters && (
                        <button className="text-xs text-primary underline underline-offset-2"
                          onClick={() => { setSearch(""); setTypeFilter("all"); }}>
                          Clear filters
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                processed.map((row) => {
                  const cfg = TYPE_CONFIG[row.type];
                  const Icon = cfg.icon;
                  return (
                    <TableRow key={row.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <TableCell className="pl-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(row.timestamp), "MMM d, h:mm a")}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium", cfg.bg, cfg.color)}>
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <Link href={`/dashboard/orders/${row.order_id}`} className="font-mono text-xs text-primary hover:underline">
                          #{row.order_number}
                        </Link>
                      </TableCell>
                      <TableCell className="py-3.5 text-sm font-medium max-w-40 truncate" title={row.description}>
                        {row.description}
                      </TableCell>
                      <TableCell className="py-3.5 text-sm text-muted-foreground max-w-40 truncate" title={row.reason}>
                        {row.reason}
                      </TableCell>
                      <TableCell className="py-3.5 text-sm">{row.staff}</TableCell>
                      <TableCell className="py-3.5 text-right pr-5">
                        <span className={cn("text-sm font-bold", row.type === "void" ? "text-rose-500" : "text-amber-500")}>
                          -${row.amount.toFixed(2)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
