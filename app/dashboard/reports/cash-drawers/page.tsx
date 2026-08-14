"use client";

import React, { useState, useMemo } from "react";
import { useReportingQueryRange } from "@/app/dashboard/hooks/useReportingDateRange";
import { format, subDays, startOfDay, endOfDay, formatDistanceToNow } from "date-fns";
import Papa from "papaparse";
import {
  DollarSign,
  AlertTriangle,
  AlertOctagon,
  Clock,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  InboxIcon,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

import { ReportPanel as Card, ReportPanelContent as CardContent, ReportPanelHeader as CardHeader, ReportPanelTitle as CardTitle } from "@/components/dashboard/reports/ReportPanel";
import { PageHeader, PageShell, Panel, StatRow, StatTile } from "@/components/dashboard/shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import {
  useCashDrawerSessions,
  useCashDrawerOperations,
  useNoSaleOperations,
  useCashDrawerSummaryStats,
  useVarianceTrend,
} from "../../hooks/useCashDrawerAnalytics";
import type { CashDrawerSession } from "../../actions/cash-drawer-analytics";

// ─── Constants ────────────────────────────────────────────────────────────────

const VARIANCE_WARNING = 5;
const VARIANCE_ALERT = 20;
const NO_SALE_THRESHOLD = 5;
const ITEMS_PER_PAGE = 15;

const DRAWER_COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706",
  "#7c3aed", "#0891b2", "#be185d", "#65a30d",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `$${Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtVariance(v: number | null | undefined): string {
  if (v == null) return "—";
  const prefix = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${prefix}$${Math.abs(v).toFixed(2)}`;
}

function varianceClass(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  return "font-medium text-foreground";
}

// ─── Delta Badge ──────────────────────────────────────────────────────────────
// inverse=true: decreasing is good (variance, no-sale count)
// Shows consistent sign + color: green=improvement, red=regression

function DeltaBadge({
  current,
  prev,
  inverse = false,
}: {
  current: number;
  prev: number;
  inverse?: boolean;
}) {
  if (prev === 0) return <span className="text-xs text-muted-foreground">No prior data</span>;

  const pct = ((current - prev) / Math.abs(prev)) * 100;
  const absPct = Math.abs(pct);
  const isDecrease = pct < 0;
  const isGood = inverse ? isDecrease : !isDecrease;
  const neutral = absPct < 0.5;

  if (neutral)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> No change vs prev period
      </span>
    );

  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground"
      title={isGood ? "Improved from the previous period" : "Declined from the previous period"}
    >
      {isDecrease ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
      {isDecrease ? "-" : "+"}{absPct.toFixed(1)}% vs prev period
    </span>
  );
}

// ─── Sort Icon ────────────────────────────────────────────────────────────────
// Defined outside any component to prevent re-creation on every render

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <ArrowUpDown className="inline ml-1 h-3 w-3 text-muted-foreground/40" />;
  return asc
    ? <ArrowUp className="inline ml-1 h-3 w-3" />
    : <ArrowDown className="inline ml-1 h-3 w-3" />;
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="rounded-full bg-muted p-4">
        <InboxIcon className="h-8 w-8 text-muted-foreground/50" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ─── Last Refreshed ───────────────────────────────────────────────────────────

function LastRefreshed({
  updatedAt,
  onRefresh,
  isLoading,
}: {
  updatedAt: number;
  onRefresh: () => void;
  isLoading: boolean;
}) {
  const label = updatedAt
    ? `Updated ${formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}`
    : "Not yet loaded";
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onRefresh}
        disabled={isLoading}
        title="Refresh"
      >
        <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  switch (status?.toLowerCase()) {
    case "open":
      return <Badge variant="secondary">Open</Badge>;
    case "closed":
      return <Badge variant="secondary">Closed</Badge>;
    case "reconciled":
      return <Badge variant="secondary">Reconciled</Badge>;
    default:
      return <Badge variant="outline">{status ?? "Unknown"}</Badge>;
  }
}

function OperationTypeBadge({ type }: { type: string }) {
  const label = type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge variant="secondary" className="capitalize text-muted-foreground">{label}</Badge>;
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({
  stats,
  isLoading,
  updatedAt,
  onRefresh,
}: {
  stats: {
    totalCashSales: number;
    totalVariance: number;
    noSaleCount: number;
    sessionsCount: number;
    prevPeriodTotalCashSales: number;
    prevPeriodTotalVariance: number;
    prevPeriodNoSaleCount: number;
    prevPeriodSessionsCount: number;
  } | undefined;
  isLoading: boolean;
  updatedAt: number;
  onRefresh: () => void;
}) {
  const cards = [
    {
      title: "Total Cash Sales",
      value: fmt$(stats?.totalCashSales),
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
      delta: stats ? (
        <DeltaBadge current={stats.totalCashSales} prev={stats.prevPeriodTotalCashSales} />
      ) : null,
    },
    {
      title: "Total Variance",
      value: fmtVariance(stats?.totalVariance),
      icon:
        Math.abs(stats?.totalVariance ?? 0) > VARIANCE_ALERT ? (
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        ) : (stats?.totalVariance ?? 0) === 0 ? (
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        ),
      delta: stats ? (
        <DeltaBadge
          current={Math.abs(stats.totalVariance)}
          prev={Math.abs(stats.prevPeriodTotalVariance)}
          inverse
        />
      ) : null,
      valueClass: varianceClass(stats?.totalVariance),
    },
    {
      title: "No Sale Events",
      value: stats?.noSaleCount?.toString() ?? "—",
      icon: <AlertOctagon className="h-4 w-4 text-muted-foreground" />,
      delta: stats ? (
        <DeltaBadge current={stats.noSaleCount} prev={stats.prevPeriodNoSaleCount} inverse />
      ) : null,
      subtitle:
        stats && stats.noSaleCount > NO_SALE_THRESHOLD
          ? `⚠ Above threshold (${NO_SALE_THRESHOLD})`
          : undefined,
    },
    {
      title: "Sessions",
      value: stats?.sessionsCount?.toString() ?? "—",
      icon: <Clock className="h-4 w-4 text-muted-foreground" />,
      delta: stats ? (
        <DeltaBadge current={stats.sessionsCount} prev={stats.prevPeriodSessionsCount} />
      ) : null,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <LastRefreshed updatedAt={updatedAt} onRefresh={onRefresh} isLoading={isLoading} />
      </div>
      <Panel padded>
        <StatRow columns={4}>
        {cards.map((card) => (
          <StatTile
            key={card.title}
            label={card.title}
            value={<span className={card.valueClass}>{card.value}</span>}
            meta={card.subtitle || card.delta}
            icon={card.icon}
            isLoading={isLoading}
          />
        ))}
        </StatRow>
      </Panel>
    </div>
  );
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────

type SortKey = keyof Pick<
  CashDrawerSession,
  | "business_date"
  | "drawer_name"
  | "opened_by_name"
  | "closed_by_name"
  | "opening_amount"
  | "closing_amount"
  | "expected_cash"
  | "variance"
  | "status"
>;

const SESSION_COLUMNS: [SortKey, string][] = [
  ["business_date", "Date"],
  ["drawer_name", "Drawer"],
  ["opened_by_name", "Opened By"],
  ["closed_by_name", "Closed By"],
  ["opening_amount", "Opening $"],
  ["closing_amount", "Closing $"],
  ["expected_cash", "Expected $"],
  ["variance", "Variance $"],
  ["status", "Status"],
];

function SessionsTab({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { data: sessions = [], isLoading, refetch, dataUpdatedAt } = useCashDrawerSessions(dateFrom, dateTo);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("business_date");
  const [sortAsc, setSortAsc] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let rows = sessions;
    if (statusFilter !== "all") rows = rows.filter((s) => s.status === statusFilter);
    return [...rows].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [sessions, sortKey, sortAsc, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Reset to page 1 when filter/sort changes
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
    setPage(1);
  };

  const handleStatusFilter = (v: string) => { setStatusFilter(v); setPage(1); };

  function exportCSV() {
    const rows = filtered.map((s) => ({
      Date: s.business_date,
      Drawer: s.drawer_name,
      "Opened By": s.opened_by_name,
      "Closed By": s.closed_by_name ?? "",
      "Opening ($)": s.opening_amount.toFixed(2),
      "Closing ($)": s.closing_amount?.toFixed(2) ?? "",
      "Expected ($)": s.expected_cash?.toFixed(2) ?? "",
      "Variance ($)": s.variance?.toFixed(2) ?? "",
      Status: s.status ?? "",
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cash-drawer-sessions-${format(dateFrom, "yyyy-MM-dd")}-${format(dateTo, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printTable() {
    window.print();
  }

  const skeletonRows = Array.from({ length: 8 });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Status:</span>
          {(["all", "open", "closed", "reconciled"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              className="rounded-full h-7 px-3 text-xs"
              onClick={() => handleStatusFilter(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <LastRefreshed
            updatedAt={dataUpdatedAt}
            onRefresh={refetch}
            isLoading={isLoading}
          />
          <Button variant="outline" size="sm" onClick={printTable} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="-mx-2 overflow-x-auto px-2">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {/* Expand toggle col */}
              <TableHead className="w-8" />
              {SESSION_COLUMNS.map(([key, label]) => (
                <TableHead
                  key={key}
                  className="cursor-pointer select-none whitespace-nowrap hover:text-foreground"
                  onClick={() => handleSort(key)}
                >
                  {label}
                  <SortIcon active={sortKey === key} asc={sortAsc} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? skeletonRows.map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  </TableRow>
                ))
              : paginated.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      title="No sessions found"
                      description="Try adjusting the date range or status filter"
                    />
                  </TableCell>
                </TableRow>
              )
              : paginated.map((session) => (
                  <React.Fragment key={session.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() =>
                        setExpandedId(expandedId === session.id ? null : session.id)
                      }
                      aria-expanded={expandedId === session.id}
                    >
                      <TableCell>
                        {expandedId === session.id ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {format(new Date(session.business_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>{session.drawer_name}</TableCell>
                      <TableCell>{session.opened_by_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {session.closed_by_name ?? <span className="text-muted-foreground/50 italic text-xs">Still open</span>}
                      </TableCell>
                      <TableCell className="tabular-nums">{fmt$(session.opening_amount)}</TableCell>
                      <TableCell className="tabular-nums">{fmt$(session.closing_amount)}</TableCell>
                      <TableCell className="tabular-nums">{fmt$(session.expected_cash)}</TableCell>
                      <TableCell className="tabular-nums">
                        <span className={varianceClass(session.variance)}>
                          {fmtVariance(session.variance)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={session.status} />
                      </TableCell>
                    </TableRow>
                    {expandedId === session.id && (
                      <TableRow className="bg-muted/10 hover:bg-muted/10">
                        <TableCell colSpan={10} className="p-0">
                          <ExpandedOperations sessionId={session.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* Footer: count + pagination */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {filtered.length} session{filtered.length !== 1 ? "s" : ""}
            {statusFilter !== "all" && ` · filtered by "${statusFilter}"`}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExpandedOperations({ sessionId }: { sessionId: string }) {
  const { data: ops = [], isLoading } = useCashDrawerOperations(sessionId);

  if (isLoading) {
    return (
      <div className="ml-8 mr-4 my-3 space-y-2 border-l-2 border-muted pl-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i === 0 ? "w-3/4" : i === 1 ? "w-1/2" : "w-2/3"}`} />
        ))}
      </div>
    );
  }

  if (ops.length === 0) {
    return (
      <div className="ml-8 my-3 border-l-2 border-muted pl-4 text-xs text-muted-foreground italic">
        No operations recorded for this session
      </div>
    );
  }

  return (
    <div className="ml-2 mr-2 my-2 border-l-4 border-primary/20 bg-muted/20 rounded-r-lg">
      <div className="px-4 pt-3 pb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Session Operations · {ops.length} event{ops.length !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-muted/50">
              <TableHead className="text-xs h-7 pl-4">Time</TableHead>
              <TableHead className="text-xs h-7">Type</TableHead>
              <TableHead className="text-xs h-7">Amount</TableHead>
              <TableHead className="text-xs h-7">Balance After</TableHead>
              <TableHead className="text-xs h-7">Employee</TableHead>
              <TableHead className="text-xs h-7">Reason</TableHead>
              <TableHead className="text-xs h-7 pr-4">Approved By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ops.map((op) => (
              <TableRow key={op.id} className="border-muted/30 hover:bg-muted/30">
                <TableCell className="text-xs py-2 pl-4 text-muted-foreground whitespace-nowrap">
                  {format(new Date(op.performed_at), "h:mm a")}
                </TableCell>
                <TableCell className="py-2">
                  <OperationTypeBadge type={op.operation_type} />
                </TableCell>
                <TableCell className="text-xs py-2 font-medium tabular-nums">{fmt$(op.amount)}</TableCell>
                <TableCell className="text-xs py-2 tabular-nums text-muted-foreground">
                  {fmt$(op.balance_after)}
                </TableCell>
                <TableCell className="text-xs py-2">{op.performed_by_name}</TableCell>
                <TableCell className="text-xs py-2 text-muted-foreground">{op.reason ?? "—"}</TableCell>
                <TableCell className="text-xs py-2 text-muted-foreground pr-4">{op.approved_by_name ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── No Sale Audit Tab ────────────────────────────────────────────────────────

function NoSaleTab({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { data: ops = [], isLoading, refetch, dataUpdatedAt } = useNoSaleOperations(dateFrom, dateTo);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [drawerFilter, setDrawerFilter] = useState("all");

  const employees = useMemo(() => {
    const set = new Set(ops.map((op) => op.performed_by_name));
    return Array.from(set).sort();
  }, [ops]);

  const drawers = useMemo(() => {
    const set = new Set(ops.map((op) => op.drawer_name ?? ""));
    return Array.from(set).filter(Boolean).sort();
  }, [ops]);

  const filteredOps = useMemo(() => {
    return ops.filter((op) => {
      if (employeeFilter !== "all" && op.performed_by_name !== employeeFilter) return false;
      if (drawerFilter !== "all" && op.drawer_name !== drawerFilter) return false;
      return true;
    });
  }, [ops, employeeFilter, drawerFilter]);

  // Aggregate per employee for chart (use full ops, not filtered — shows true comparison)
  const byEmployee = useMemo(() => {
    const map = new Map<string, number>();
    ops.forEach((op) => {
      map.set(op.performed_by_name, (map.get(op.performed_by_name) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [ops]);

  // Weekly trend anchored to dateTo (not today) — FIX
  const weeklyTrend = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = format(subDays(dateTo, i), "yyyy-MM-dd");
      const count = ops.filter((op) => op.performed_at.startsWith(d)).length;
      days.push({ date: format(subDays(dateTo, i), "MMM d"), count });
    }
    return days;
  }, [ops, dateTo]);

  const flaggedEmployees = new Set(byEmployee.filter((e) => e.count > NO_SALE_THRESHOLD).map((e) => e.name));

  function exportCSV() {
    const rows = filteredOps.map((op) => ({
      "Date/Time": format(new Date(op.performed_at), "MMM d, yyyy h:mm a"),
      Employee: op.performed_by_name,
      Drawer: op.drawer_name ?? "",
      Reason: op.reason ?? "",
      "Approved By": op.approved_by_name ?? "",
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `no-sale-audit-${format(dateFrom, "yyyy-MM-dd")}-${format(dateTo, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const skeletonRows = Array.from({ length: 5 });

  return (
    <div className="space-y-6">
      {/* Analytics widgets */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Employee bar chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">No Sales by Employee</CardTitle>
            {flaggedEmployees.size > 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
                {flaggedEmployees.size} employee{flaggedEmployees.size !== 1 ? "s" : ""} above threshold ({NO_SALE_THRESHOLD})
              </p>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className={`h-6 ${i === 0 ? "w-full" : i === 1 ? "w-4/5" : i === 2 ? "w-3/5" : "w-2/5"}`} />
                ))}
              </div>
            ) : byEmployee.length === 0 ? (
              <EmptyState title="No events" description="No No Sale events in this period" />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, byEmployee.length * 44)}>
                <BarChart
                  data={byEmployee}
                  layout="vertical"
                  margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [v, "No Sale events"]}
                  />
                  <ReferenceLine x={NO_SALE_THRESHOLD} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={26}>
                    {byEmployee.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.count > NO_SALE_THRESHOLD ? "#ef4444" : "#f59e0b"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Weekly trend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">7-Day Trend</CardTitle>
            <p className="text-xs text-muted-foreground">
              {format(subDays(dateTo, 6), "MMM d")} — {format(dateTo, "MMM d, yyyy")}
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={168}>
                <BarChart data={weeklyTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [v, "No Sale events"]}
                  />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit table */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">No Sale Audit Log</h3>
            {filteredOps.length !== ops.length && (
              <Badge variant="secondary" className="text-xs">{filteredOps.length} of {ops.length}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Employee filter */}
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="h-8 text-xs w-40">
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Drawer filter */}
            <Select value={drawerFilter} onValueChange={setDrawerFilter}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="All drawers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All drawers</SelectItem>
                {drawers.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <LastRefreshed updatedAt={dataUpdatedAt} onRefresh={refetch} isLoading={isLoading} />
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="-mx-2 overflow-x-auto px-2">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Date / Time</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Drawer</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Approved By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? skeletonRows.map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))
                : filteredOps.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState
                        title="No events found"
                        description={
                          ops.length > 0
                            ? "Try clearing the employee or drawer filter"
                            : "No drawer openings without sale in this period"
                        }
                      />
                    </TableCell>
                  </TableRow>
                )
                : filteredOps.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {format(new Date(op.performed_at), "MMM d, h:mm a")}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            flaggedEmployees.has(op.performed_by_name)
                              ? "inline-flex items-center gap-1 font-medium text-foreground"
                              : ""
                          }
                        >
                          {op.performed_by_name}
                          {flaggedEmployees.has(op.performed_by_name) && (
                            <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{op.drawer_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{op.reason ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{op.approved_by_name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
        {!isLoading && filteredOps.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {filteredOps.length} event{filteredOps.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Variance Trends Tab ──────────────────────────────────────────────────────

function VarianceTrendsTab({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { data: trend = [], isLoading, refetch, dataUpdatedAt } = useVarianceTrend(dateFrom, dateTo);

  const drawerKeys = useMemo(() => {
    const set = new Set(trend.map((t) => t.drawer_name));
    return Array.from(set);
  }, [trend]);

  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | null>>();
    trend.forEach((t) => {
      if (!byDate.has(t.business_date)) byDate.set(t.business_date, { date: t.business_date });
      byDate.get(t.business_date)![t.drawer_name] = t.variance;
    });
    return Array.from(byDate.values()).sort((a, b) =>
      String(a.date) < String(b.date) ? -1 : 1
    );
  }, [trend]);

  // Compute actual data range for ReferenceArea bounds — FIX: no magic numbers
  const dataAbsMax = useMemo(() => {
    const allVariances = trend.map((t) => Math.abs(t.variance ?? 0));
    return Math.max(...allVariances, VARIANCE_ALERT + 10);
  }, [trend]);

  const drawerStats = useMemo(() => {
    return drawerKeys.map((drawer) => {
      const points = trend.filter((t) => t.drawer_name === drawer && t.variance != null);
      if (points.length === 0) return { drawer, avg: 0, worst: null as typeof points[0] | null, best: null as typeof points[0] | null, total: 0 };
      const variances = points.map((p) => p.variance!);
      const avg = variances.reduce((s, v) => s + v, 0) / variances.length;
      const worst = points.reduce((a, b) => Math.abs(b.variance!) > Math.abs(a.variance!) ? b : a);
      const best = points.reduce((a, b) => Math.abs(b.variance!) < Math.abs(a.variance!) ? b : a);
      const total = variances.reduce((s, v) => s + v, 0);
      return { drawer, avg, worst, best, total };
    });
  }, [trend, drawerKeys]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Daily Variance Trend</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                ±${VARIANCE_WARNING} balanced · ±${VARIANCE_ALERT} warning · beyond alert
              </p>
            </div>
            <LastRefreshed updatedAt={dataUpdatedAt} onRefresh={refetch} isLoading={isLoading} />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : chartData.length === 0 ? (
            <EmptyState
              title="No variance data"
              description="No closed sessions found for the selected date range"
            />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 8, right: 24, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => {
                    try { return format(new Date(v), "MMM d"); } catch { return v; }
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number, name: string) => [
                    `${v > 0 ? "+" : ""}$${Number(v).toFixed(2)}`,
                    name,
                  ]}
                  labelFormatter={(label) => {
                    try { return format(new Date(label), "EEEE, MMM d yyyy"); } catch { return label; }
                  }}
                />
                {drawerKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}

                {/* Threshold bands using actual data range */}
                <ReferenceArea y1={-VARIANCE_WARNING} y2={VARIANCE_WARNING} fill="#22c55e" fillOpacity={0.07} />
                <ReferenceArea y1={VARIANCE_WARNING} y2={VARIANCE_ALERT} fill="#f59e0b" fillOpacity={0.09} />
                <ReferenceArea y1={-VARIANCE_ALERT} y2={-VARIANCE_WARNING} fill="#f59e0b" fillOpacity={0.09} />
                <ReferenceArea y1={VARIANCE_ALERT} y2={dataAbsMax} fill="#ef4444" fillOpacity={0.09} />
                <ReferenceArea y1={-dataAbsMax} y2={-VARIANCE_ALERT} fill="#ef4444" fillOpacity={0.09} />

                {/* Zero line */}
                <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />

                {drawerKeys.map((drawer, idx) => (
                  <Line
                    key={drawer}
                    type="monotone"
                    dataKey={drawer}
                    stroke={DRAWER_COLORS[idx % DRAWER_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 0, fill: DRAWER_COLORS[idx % DRAWER_COLORS.length] }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {!isLoading && drawerStats.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Drawer Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Drawer</TableHead>
                  <TableHead>Avg Variance</TableHead>
                  <TableHead>Best Day</TableHead>
                  <TableHead>Worst Day</TableHead>
                  <TableHead>Period Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drawerStats.map((ds) => (
                  <TableRow key={ds.drawer}>
                    <TableCell className="font-medium">{ds.drawer}</TableCell>
                    <TableCell className="tabular-nums">
                      <span className={varianceClass(ds.avg)}>{fmtVariance(ds.avg)}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ds.best ? (
                        <span>
                          {format(new Date(ds.best.business_date), "MMM d")}{" "}
                          <span className={varianceClass(ds.best.variance)}>
                            {fmtVariance(ds.best.variance)}
                          </span>
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ds.worst ? (
                        <span>
                          {format(new Date(ds.worst.business_date), "MMM d")}{" "}
                          <span className={varianceClass(ds.worst.variance)}>
                            {fmtVariance(ds.worst.variance)}
                          </span>
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <span className={varianceClass(ds.total)}>{fmtVariance(ds.total)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CashDrawerReportsPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  });
  const [preset, setPreset] = useState<DatePreset>("today");
  const [activeTab, setActiveTab] = useState("sessions");
  const queryDateRange = useReportingQueryRange(dateRange);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats, dataUpdatedAt } =
    useCashDrawerSummaryStats(queryDateRange.from, queryDateRange.to);

  function handleDateRangeChange(from: Date | null, to: Date | null) {
    if (from && to) setDateRange({ from, to });
  }

  return (
    <PageShell>
      <PageHeader
        title="Cash Drawer Reports"
        subtitle="Session history, variance trends, and No Sale audit logs"
        backHref="/dashboard/reports"
        backLabel="Back to Reports"
        actions={
          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={handleDateRangeChange}
            preset={preset}
            onPresetChange={setPreset}
          />
        }
      />

      {/* Summary cards */}
      <SummaryCards
        stats={stats}
        isLoading={statsLoading}
        updatedAt={dataUpdatedAt}
        onRefresh={refetchStats}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            <TabsTrigger className="rounded-full px-4 py-2" value="sessions">Sessions</TabsTrigger>
            <TabsTrigger className="rounded-full px-4 py-2" value="no-sale">No Sale Audit</TabsTrigger>
            <TabsTrigger className="rounded-full px-4 py-2" value="variance">Variance Trends</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sessions" className="mt-6">
          <SessionsTab dateFrom={queryDateRange.from} dateTo={queryDateRange.to} />
        </TabsContent>
        <TabsContent value="no-sale" className="mt-6">
          <NoSaleTab dateFrom={queryDateRange.from} dateTo={queryDateRange.to} />
        </TabsContent>
        <TabsContent value="variance" className="mt-6">
          <VarianceTrendsTab dateFrom={queryDateRange.from} dateTo={queryDateRange.to} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
