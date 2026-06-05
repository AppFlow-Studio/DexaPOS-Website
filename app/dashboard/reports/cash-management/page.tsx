"use client";

import { useState, useMemo } from "react";
import { useCashFlowReport } from "../../hooks/useOrderAnalytics";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { subDays, format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  Banknote,
  TrendingUp,
  User,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ShoppingCart,
  Download,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSelectedLocation } from "@/stores/location-store";
import { exportToCsv } from "@/utils/export";
import { format as dateFnsFormat } from "date-fns";
import { useReportingQueryRange } from "@/app/dashboard/hooks/useReportingDateRange";

type SortKey = "created_at" | "total_amount" | "tip_amount" | "staff_name";
type SortDir = "asc" | "desc";

function SortIcon({ col, active, dir }: { col: SortKey; active: SortKey; dir: SortDir }) {
  if (col !== active) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40 ml-1 shrink-0" />;
  return dir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />
    : <ArrowDown className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />;
}

const exportColumns = [
  { key: "created_at", header: "Time", format: (v: string) => dateFnsFormat(new Date(v), "MM/dd/yyyy HH:mm") },
  { key: "order_number", header: "Order #" },
  { key: "staff_name", header: "Staff" },
  { key: "amount_collected", header: "Sale Amount", format: (v: number) => `$${v.toFixed(2)}` },
  { key: "tip_amount", header: "Tip", format: (v: number) => v > 0 ? `$${v.toFixed(2)}` : "—" },
  { key: "total_amount", header: "Total Collected", format: (v: number) => `$${v.toFixed(2)}` },
];

export default function CashManagementPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_30_days");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const selectedLocation = useSelectedLocation();
  const queryDateRange = useReportingQueryRange(dateRange);
  const { data: cashTransactions, isLoading } = useCashFlowReport(queryDateRange.from, queryDateRange.to);

  const totalCollected = cashTransactions?.reduce((s, r) => s + r.total_amount, 0) ?? 0;
  const totalTips = cashTransactions?.reduce((s, r) => s + r.tip_amount, 0) ?? 0;
  const totalSales = totalCollected - totalTips;
  const avgPerTx = cashTransactions?.length ? totalCollected / cashTransactions.length : 0;

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const processed = useMemo(() => {
    let rows = cashTransactions ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.staff_name?.toLowerCase().includes(q) ||
        r.order_number?.includes(q)
      );
    }
    return [...rows].sort((a, b) => {
      const av = (a as any)[sortKey] ?? "";
      const bv = (b as any)[sortKey] ?? "";
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [cashTransactions, search, sortKey, sortDir]);

  const kpis = [
    {
      label: "Total Cash Collected",
      value: isLoading ? null : `$${totalCollected.toFixed(2)}`,
      sub: `${cashTransactions?.length ?? 0} transactions`,
      icon: Banknote,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
    },
    {
      label: "Net Sales (Cash)",
      value: isLoading ? null : `$${totalSales.toFixed(2)}`,
      sub: "Excluding tips",
      icon: DollarSign,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-50",
    },
    {
      label: "Total Tips",
      value: isLoading ? null : `$${totalTips.toFixed(2)}`,
      sub: "Cash tips collected",
      icon: TrendingUp,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
    },
    {
      label: "Avg per Transaction",
      value: isLoading ? null : `$${avgPerTx.toFixed(2)}`,
      sub: "Per cash order",
      icon: ShoppingCart,
      iconColor: "text-purple-500",
      iconBg: "bg-purple-50",
    },
  ];

  const maxTotal = processed.reduce((m, r) => Math.max(m, r.total_amount), 0);
  const hasSearch = !!search.trim();

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cash Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedLocation && !Array.isArray(selectedLocation)
              ? selectedLocation.name
              : "All Locations"}{" "}
            · Cash drawer activity and cash payments
          </p>
        </div>
        <DateRangePicker
          dateFrom={dateRange.from}
          dateTo={dateRange.to}
          onDateRangeChange={(from, to) => { if (from && to) setDateRange({ from, to }); }}
          preset={preset}
          onPresetChange={setPreset}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2 rounded-xl", kpi.iconBg)}>
                  <kpi.icon className={cn("h-4 w-4", kpi.iconColor)} />
                </div>
              </div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
              {kpi.value === null
                ? <div className="h-7 w-28 bg-muted animate-pulse rounded mt-1.5" />
                : <p className="text-2xl font-bold mt-1">{kpi.value}</p>
              }
              <p className="text-[11px] text-muted-foreground mt-1">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transactions Table */}
      <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between px-5 pt-5 pb-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search staff or order #..."
                className="pl-9 h-9 w-full sm:w-60 text-sm rounded-lg bg-muted/40 border-0 focus-visible:ring-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {hasSearch && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground gap-1.5" onClick={() => setSearch("")}>
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {isLoading ? "Loading…" : `${processed.length} transaction${processed.length !== 1 ? "s" : ""}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!cashTransactions?.length}
              onClick={() => exportToCsv(cashTransactions ?? [], exportColumns as any, `cash-flow-${dateRange.from.toISOString().slice(0, 10)}`)}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </div>
        </div>

        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/50">
                <TableHead className="pl-5 text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleSort("created_at")}>
                  <div className="flex items-center">Time <SortIcon col="created_at" active={sortKey} dir={sortDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Order #</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleSort("staff_name")}>
                  <div className="flex items-center">Staff <SortIcon col="staff_name" active={sortKey} dir={sortDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">Sale Amount</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right" onClick={() => handleSort("tip_amount")}>
                  <div className="flex items-center justify-end">Tip <SortIcon col="tip_amount" active={sortKey} dir={sortDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right pr-5" onClick={() => handleSort("total_amount")}>
                  <div className="flex items-center justify-end">Total Collected <SortIcon col="total_amount" active={sortKey} dir={sortDir} /></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/30">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j} className="py-3.5"><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : processed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Banknote className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">
                        {hasSearch ? "No transactions match your search" : "No cash transactions for this period"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                processed.map((item, index) => {
                  const barPct = maxTotal > 0 ? (item.total_amount / maxTotal) * 100 : 0;
                  return (
                    <TableRow key={index} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <TableCell className="pl-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(item.created_at), "MMM d, h:mm a")}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <Link href={`/dashboard/orders/${item.order_id}`} className="font-mono text-xs text-primary hover:underline">
                          #{item.order_number}
                        </Link>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-1.5">
                          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <span className="text-sm">{item.staff_name || "Unknown"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-right text-sm text-muted-foreground">
                        ${(item.total_amount - item.tip_amount).toFixed(2)}
                      </TableCell>
                      <TableCell className="py-3.5 text-right">
                        {item.tip_amount > 0 ? (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                            +${item.tip_amount.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3.5 pr-5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-bold text-emerald-600">
                            ${item.total_amount.toFixed(2)}
                          </span>
                          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${barPct}%` }} />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
