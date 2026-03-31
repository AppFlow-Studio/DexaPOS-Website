"use client";

import { useState, useMemo } from "react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import Papa from "papaparse";
import {
  DollarSign,
  AlertTriangle,
  ShoppingBag,
  Clock,
  ChevronDown,
  ChevronRight,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type {
  CashDrawerSession,
  CashDrawerOperation,
  VarianceTrendPoint,
} from "../../actions/cash-drawer-analytics";

// ─── Constants ────────────────────────────────────────────────────────────────

const VARIANCE_WARNING = 5;
const VARIANCE_ALERT = 20;
const NO_SALE_THRESHOLD = 5;

// Distinct colors for up to 8 drawers in the trend chart
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
  const abs = Math.abs(v);
  if (abs <= VARIANCE_WARNING) return "text-green-600 dark:text-green-400 font-medium";
  if (abs <= VARIANCE_ALERT) return "text-yellow-600 dark:text-yellow-400 font-medium";
  return "text-red-600 dark:text-red-400 font-medium";
}

function deltaPercent(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

function DeltaBadge({ current, prev, inverse = false }: { current: number; prev: number; inverse?: boolean }) {
  const pct = deltaPercent(current, prev);
  if (pct === null) return <span className="text-xs text-muted-foreground">No prior data</span>;

  const positive = inverse ? pct < 0 : pct > 0;
  const neutral = Math.abs(pct) < 0.5;

  if (neutral)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> No change
      </span>
    );

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        positive ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
      }`}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}{pct.toFixed(1)}% vs prev period
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  switch (status?.toLowerCase()) {
    case "open":
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0">Open</Badge>;
    case "closed":
      return <Badge variant="secondary">Closed</Badge>;
    case "reconciled":
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-0">Reconciled</Badge>;
    default:
      return <Badge variant="outline">{status ?? "Unknown"}</Badge>;
  }
}

function OperationTypeBadge({ type }: { type: string }) {
  const cfg: Record<string, string> = {
    cash_sale: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    no_sale: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    cash_in: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    cash_out: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    open: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    close: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  const cls = cfg[type] ?? "bg-slate-100 text-slate-700";
  const label = type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge className={`${cls} border-0 capitalize`}>{label}</Badge>;
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({
  stats,
  isLoading,
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
}) {
  const cards = [
    {
      title: "Total Cash Sales",
      value: fmt$(stats?.totalCashSales),
      icon: <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />,
      delta: stats ? (
        <DeltaBadge current={stats.totalCashSales} prev={stats.prevPeriodTotalCashSales} />
      ) : null,
      accent: "border-l-4 border-l-green-500",
    },
    {
      title: "Total Variance",
      value: fmtVariance(stats?.totalVariance),
      icon:
        (stats?.totalVariance ?? 0) < -VARIANCE_ALERT ? (
          <AlertTriangle className="h-4 w-4 text-red-500" />
        ) : (stats?.totalVariance ?? 0) === 0 ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
        ),
      delta: stats ? (
        <DeltaBadge current={Math.abs(stats.totalVariance)} prev={Math.abs(stats.prevPeriodTotalVariance)} inverse />
      ) : null,
      valueClass: varianceClass(stats?.totalVariance),
      accent: "border-l-4 border-l-yellow-400",
    },
    {
      title: "No Sale Events",
      value: stats?.noSaleCount?.toString() ?? "—",
      icon: <ShoppingBag className="h-4 w-4 text-amber-500" />,
      delta: stats ? (
        <DeltaBadge current={stats.noSaleCount} prev={stats.prevPeriodNoSaleCount} inverse />
      ) : null,
      accent: "border-l-4 border-l-amber-400",
    },
    {
      title: "Sessions",
      value: stats?.sessionsCount?.toString() ?? "—",
      icon: <Clock className="h-4 w-4 text-muted-foreground" />,
      delta: stats ? (
        <DeltaBadge current={stats.sessionsCount} prev={stats.prevPeriodSessionsCount} />
      ) : null,
      accent: "border-l-4 border-l-slate-300 dark:border-l-slate-600",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className={card.accent}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            {card.icon}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <>
                <Skeleton className="h-7 w-28 mb-1" />
                <Skeleton className="h-4 w-36" />
              </>
            ) : (
              <>
                <div className={`text-2xl font-bold tracking-tight ${card.valueClass ?? ""}`}>
                  {card.value}
                </div>
                <div className="mt-1">{card.delta}</div>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────

type SortKey = keyof Pick<
  CashDrawerSession,
  | "business_date"
  | "drawer_name"
  | "opened_by_name"
  | "opening_amount"
  | "closing_amount"
  | "expected_cash"
  | "variance"
  | "status"
>;

function SessionsTab({
  dateFrom,
  dateTo,
}: {
  dateFrom: Date;
  dateTo: Date;
}) {
  const { data: sessions = [], isLoading } = useCashDrawerSessions(dateFrom, dateTo);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("business_date");
  const [sortAsc, setSortAsc] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="ml-1 text-muted-foreground/40">↕</span>;
    return <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>;
  }

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

  const skeletonRows = Array.from({ length: 6 });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          {["all", "open", "closed", "reconciled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8" />
              {(
                [
                  ["business_date", "Date"],
                  ["drawer_name", "Drawer"],
                  ["opened_by_name", "Opened By"],
                  ["opening_amount", "Opening $"],
                  ["closing_amount", "Closing $"],
                  ["expected_cash", "Expected $"],
                  ["variance", "Variance $"],
                  ["status", "Status"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <TableHead
                  key={key}
                  className="cursor-pointer select-none whitespace-nowrap hover:text-foreground"
                  onClick={() => handleSort(key)}
                >
                  {label}
                  <SortIcon k={key} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? skeletonRows.map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : filtered.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center h-24 text-muted-foreground">
                    No sessions found for the selected filters
                  </TableCell>
                </TableRow>
              )
              : filtered.map((session) => (
                <>
                  <TableRow
                    key={session.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() =>
                      setExpandedId(expandedId === session.id ? null : session.id)
                    }
                  >
                    <TableCell>
                      {expandedId === session.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {format(new Date(session.business_date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{session.drawer_name}</TableCell>
                    <TableCell>{session.opened_by_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {fmt$(session.opening_amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {fmt$(session.closing_amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {fmt$(session.expected_cash)}
                    </TableCell>
                    <TableCell>
                      <span className={varianceClass(session.variance)}>
                        {fmtVariance(session.variance)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={session.status} />
                    </TableCell>
                  </TableRow>
                  {expandedId === session.id && (
                    <TableRow key={`${session.id}-expanded`} className="bg-muted/20">
                      <TableCell colSpan={9} className="p-0">
                        <ExpandedOperations sessionId={session.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
          </TableBody>
        </Table>
      </div>
      {!isLoading && filtered.length > 0 && (
        <p className="text-sm text-muted-foreground">{filtered.length} session{filtered.length !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}

function ExpandedOperations({ sessionId }: { sessionId: string }) {
  const { data: ops = [], isLoading } = useCashDrawerOperations(sessionId);

  if (isLoading) {
    return (
      <div className="px-8 py-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  }

  if (ops.length === 0) {
    return (
      <div className="px-8 py-4 text-sm text-muted-foreground">No operations recorded</div>
    );
  }

  return (
    <div className="px-6 py-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Session Operations
      </p>
      <Table>
        <TableHeader>
          <TableRow className="border-none">
            <TableHead className="text-xs h-7">Time</TableHead>
            <TableHead className="text-xs h-7">Type</TableHead>
            <TableHead className="text-xs h-7">Amount</TableHead>
            <TableHead className="text-xs h-7">Balance After</TableHead>
            <TableHead className="text-xs h-7">Employee</TableHead>
            <TableHead className="text-xs h-7">Reason</TableHead>
            <TableHead className="text-xs h-7">Approved By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ops.map((op) => (
            <TableRow key={op.id} className="border-none hover:bg-transparent">
              <TableCell className="text-xs py-1.5">
                {format(new Date(op.performed_at), "h:mm a")}
              </TableCell>
              <TableCell className="py-1.5">
                <OperationTypeBadge type={op.operation_type} />
              </TableCell>
              <TableCell className="text-xs py-1.5 font-medium">{fmt$(op.amount)}</TableCell>
              <TableCell className="text-xs py-1.5 text-muted-foreground">
                {fmt$(op.balance_after)}
              </TableCell>
              <TableCell className="text-xs py-1.5">{op.performed_by_name}</TableCell>
              <TableCell className="text-xs py-1.5 text-muted-foreground">
                {op.reason ?? "—"}
              </TableCell>
              <TableCell className="text-xs py-1.5 text-muted-foreground">
                {op.approved_by_name ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── No Sale Audit Tab ────────────────────────────────────────────────────────

function NoSaleTab({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { data: ops = [], isLoading } = useNoSaleOperations(dateFrom, dateTo);

  // Aggregate per employee
  const byEmployee = useMemo(() => {
    const map = new Map<string, number>();
    ops.forEach((op) => {
      map.set(op.performed_by_name, (map.get(op.performed_by_name) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [ops]);

  // Daily trend last 7 days
  const weeklyTrend = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      const count = ops.filter((op) => op.performed_at.startsWith(d)).length;
      days.push({ date: format(subDays(new Date(), i), "MMM d"), count });
    }
    return days;
  }, [ops]);

  function exportCSV() {
    const rows = ops.map((op) => ({
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
            <CardTitle className="text-sm font-medium">No Sales by Employee</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : byEmployee.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, byEmployee.length * 40)}>
                <BarChart
                  data={byEmployee}
                  layout="vertical"
                  margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [v, "No Sales"]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {byEmployee.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={
                          entry.count > NO_SALE_THRESHOLD
                            ? "#ef4444"
                            : "#f59e0b"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {!isLoading && byEmployee.some((e) => e.count > NO_SALE_THRESHOLD) && (
              <p className="mt-2 text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Employees exceeding threshold of {NO_SALE_THRESHOLD} per period are flagged in red
              </p>
            )}
          </CardContent>
        </Card>

        {/* Weekly trend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Weekly Trend (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weeklyTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [v, "No Sales"]}
                  />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit table */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Audit Log</h3>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>
      <div className="rounded-lg border overflow-hidden">
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
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : ops.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                    No No Sale events for this period
                  </TableCell>
                </TableRow>
              )
              : ops.map((op) => (
                  <TableRow key={op.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {format(new Date(op.performed_at), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          byEmployee.find((e) => e.name === op.performed_by_name)?.count ?? 0 >
                          NO_SALE_THRESHOLD
                            ? "text-red-600 dark:text-red-400 font-medium"
                            : ""
                        }
                      >
                        {op.performed_by_name}
                        {(byEmployee.find((e) => e.name === op.performed_by_name)?.count ?? 0) >
                          NO_SALE_THRESHOLD && (
                          <AlertTriangle className="inline ml-1 h-3 w-3 text-red-500" />
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
      {!isLoading && ops.length > 0 && (
        <p className="text-sm text-muted-foreground">{ops.length} event{ops.length !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}

// ─── Variance Trends Tab ──────────────────────────────────────────────────────

function VarianceTrendsTab({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { data: trend = [], isLoading } = useVarianceTrend(dateFrom, dateTo);

  // Unique drawers
  const drawerKeys = useMemo(() => {
    const set = new Set(trend.map((t) => t.drawer_name));
    return Array.from(set);
  }, [trend]);

  // Transform to wide format for Recharts multi-line
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

  // Summary stats per drawer
  const drawerStats = useMemo(() => {
    return drawerKeys.map((drawer) => {
      const points = trend.filter((t) => t.drawer_name === drawer && t.variance != null);
      if (points.length === 0)
        return { drawer, avg: 0, worst: null, best: null, total: 0 };
      const variances = points.map((p) => p.variance!);
      const avg = variances.reduce((s, v) => s + v, 0) / variances.length;
      const worst = points.reduce((a, b) =>
        Math.abs(b.variance!) > Math.abs(a.variance!) ? b : a
      );
      const best = points.reduce((a, b) =>
        Math.abs(b.variance!) < Math.abs(a.variance!) ? b : a
      );
      const total = variances.reduce((s, v) => s + v, 0);
      return { drawer, avg, worst, best, total };
    });
  }, [trend, drawerKeys]);

  return (
    <div className="space-y-6">
      {/* Line chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Daily Variance Trend</CardTitle>
          <p className="text-xs text-muted-foreground">
            Yellow band = ±${VARIANCE_WARNING} warning · Red band = ±${VARIANCE_ALERT} alert
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-muted-foreground">
              No session data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={288}>
              <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
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
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number, name: string) => [
                    `${v > 0 ? "+" : ""}$${v?.toFixed(2) ?? "—"}`,
                    name,
                  ]}
                  labelFormatter={(label) => {
                    try { return format(new Date(label), "EEEE, MMM d"); } catch { return label; }
                  }}
                />
                {drawerKeys.length > 1 && <Legend />}

                {/* Threshold bands */}
                <ReferenceArea
                  y1={-VARIANCE_WARNING}
                  y2={VARIANCE_WARNING}
                  fill="#22c55e"
                  fillOpacity={0.06}
                />
                <ReferenceArea
                  y1={VARIANCE_WARNING}
                  y2={VARIANCE_ALERT}
                  fill="#f59e0b"
                  fillOpacity={0.08}
                />
                <ReferenceArea
                  y1={-VARIANCE_ALERT}
                  y2={-VARIANCE_WARNING}
                  fill="#f59e0b"
                  fillOpacity={0.08}
                />
                <ReferenceArea
                  y1={VARIANCE_ALERT}
                  y2={999}
                  fill="#ef4444"
                  fillOpacity={0.08}
                />
                <ReferenceArea
                  y1={-999}
                  y2={-VARIANCE_ALERT}
                  fill="#ef4444"
                  fillOpacity={0.08}
                />

                {/* Zero line */}
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />

                {/* Per-drawer lines */}
                {drawerKeys.map((drawer, idx) => (
                  <Line
                    key={drawer}
                    type="monotone"
                    dataKey={drawer}
                    stroke={DRAWER_COLORS[idx % DRAWER_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Per-drawer summary table */}
      {!isLoading && drawerStats.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Drawer Summary</CardTitle>
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
                    <TableCell>
                      <span className={varianceClass(ds.avg)}>
                        {fmtVariance(ds.avg)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {ds.best
                        ? `${format(new Date(ds.best.business_date), "MMM d")} (${fmtVariance(ds.best.variance)})`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {ds.worst
                        ? `${format(new Date(ds.worst.business_date), "MMM d")} (${fmtVariance(ds.worst.variance)})`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={varianceClass(ds.total)}>
                        {fmtVariance(ds.total)}
                      </span>
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

  const { data: stats, isLoading: statsLoading } = useCashDrawerSummaryStats(
    dateRange.from,
    dateRange.to
  );

  function handleDateRangeChange(from: Date | null, to: Date | null) {
    if (from && to) setDateRange({ from, to });
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cash Drawer Reports</h2>
          <p className="text-muted-foreground">
            Session history, variance trends, and No Sale audit logs
          </p>
        </div>
        <DateRangePicker
          dateFrom={dateRange.from}
          dateTo={dateRange.to}
          onDateRangeChange={handleDateRangeChange}
          preset={preset}
          onPresetChange={setPreset}
        />
      </div>

      {/* Summary cards */}
      <SummaryCards stats={stats} isLoading={statsLoading} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="no-sale">No Sale Audit</TabsTrigger>
          <TabsTrigger value="variance">Variance Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-6">
          <SessionsTab dateFrom={dateRange.from} dateTo={dateRange.to} />
        </TabsContent>

        <TabsContent value="no-sale" className="mt-6">
          <NoSaleTab dateFrom={dateRange.from} dateTo={dateRange.to} />
        </TabsContent>

        <TabsContent value="variance" className="mt-6">
          <VarianceTrendsTab dateFrom={dateRange.from} dateTo={dateRange.to} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
