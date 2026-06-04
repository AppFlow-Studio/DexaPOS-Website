"use client";

import { useState, useMemo } from "react";
import { useVoidsReport } from "../../hooks/useOrderAnalytics";
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
  RefreshCcw,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  DollarSign,
  User,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSelectedLocation } from "@/stores/location-store";
import type { VoidItem, RefundItem } from "@/app/dashboard/actions/order-analytics";
import { useReportingQueryRange } from "@/app/dashboard/hooks/useReportingDateRange";

type VoidSort = "voided_at" | "amount" | "item_name" | "voided_by";
type RefundSort = "refunded_at" | "amount" | "refunded_by";
type SortDir = "asc" | "desc";

function SortIcon<T extends string>({ col, active, dir }: { col: T; active: T; dir: SortDir }) {
  if (col !== active) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40 ml-1 shrink-0" />;
  return dir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />
    : <ArrowDown className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />;
}

export default function VoidsReportPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_30_days");
  const [search, setSearch] = useState("");
  const [voidSort, setVoidSort] = useState<VoidSort>("voided_at");
  const [voidDir, setVoidDir] = useState<SortDir>("desc");
  const [refundSort, setRefundSort] = useState<RefundSort>("refunded_at");
  const [refundDir, setRefundDir] = useState<SortDir>("desc");

  const selectedLocation = useSelectedLocation();
  const queryDateRange = useReportingQueryRange(dateRange);
  const { data, isLoading } = useVoidsReport(queryDateRange.from, queryDateRange.to);

  const totalVoidAmount = data?.voids.reduce((s, r) => s + r.amount, 0) ?? 0;
  const totalRefundAmount = data?.refunds.reduce((s, r) => s + r.amount, 0) ?? 0;
  const netImpact = totalVoidAmount + totalRefundAmount;

  function sortItems<T extends Record<string, any>>(arr: T[], key: string, dir: SortDir) {
    return [...arr].sort((a, b) => {
      const av = a[key] ?? "";
      const bv = b[key] ?? "";
      if (typeof av === "string" && typeof bv === "string")
        return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }

  function handleVoidSort(key: VoidSort) {
    if (key === voidSort) setVoidDir(d => d === "asc" ? "desc" : "asc");
    else { setVoidSort(key); setVoidDir("desc"); }
  }

  function handleRefundSort(key: RefundSort) {
    if (key === refundSort) setRefundDir(d => d === "asc" ? "desc" : "asc");
    else { setRefundSort(key); setRefundDir("desc"); }
  }

  const filteredVoids = useMemo(() => {
    let rows = data?.voids ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.item_name?.toLowerCase().includes(q) ||
        r.voided_by?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q) ||
        r.order_number?.includes(q)
      );
    }
    return sortItems(rows, voidSort, voidDir);
  }, [data?.voids, search, voidSort, voidDir]);

  const filteredRefunds = useMemo(() => {
    let rows = data?.refunds ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.refunded_by?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q) ||
        r.order_number?.includes(q)
      );
    }
    return sortItems(rows, refundSort, refundDir);
  }, [data?.refunds, search, refundSort, refundDir]);

  const kpis = [
    {
      label: "Voided Items",
      value: isLoading ? null : (data?.voids.length ?? 0).toLocaleString(),
      sub: isLoading ? null : `-$${totalVoidAmount.toFixed(2)} lost`,
      icon: AlertTriangle,
      iconColor: "text-rose-500",
      iconBg: "bg-rose-50",
    },
    {
      label: "Total Void Amount",
      value: isLoading ? null : `$${totalVoidAmount.toFixed(2)}`,
      sub: "Cancelled item value",
      icon: TrendingDown,
      iconColor: "text-rose-500",
      iconBg: "bg-rose-50",
    },
    {
      label: "Refunded Orders",
      value: isLoading ? null : (data?.refunds.length ?? 0).toLocaleString(),
      sub: isLoading ? null : `-$${totalRefundAmount.toFixed(2)} returned`,
      icon: RefreshCcw,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
    },
    {
      label: "Total Net Impact",
      value: isLoading ? null : `-$${netImpact.toFixed(2)}`,
      sub: "Voids + refunds combined",
      icon: DollarSign,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-50",
    },
  ];

  const hasSearch = !!search.trim();

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voids & Refunds</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedLocation && !Array.isArray(selectedLocation)
              ? selectedLocation.name
              : "All Locations"}{" "}
            · Cancelled items and refunded orders
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
                ? <div className="h-7 w-24 bg-muted animate-pulse rounded mt-1.5" />
                : <p className="text-2xl font-bold mt-1">{kpi.value}</p>
              }
              <p className="text-[11px] text-muted-foreground mt-1">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search item, staff, reason, order #..."
            className="pl-9 h-9 text-sm rounded-lg bg-muted/40 border-0 focus-visible:ring-1"
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

      {/* ── Voids Table ── */}
      <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/50">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              Voided Items Log
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${filteredVoids.length} item${filteredVoids.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/50">
                <TableHead className="pl-5 text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleVoidSort("voided_at")}>
                  <div className="flex items-center">Time <SortIcon col="voided_at" active={voidSort} dir={voidDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleVoidSort("item_name")}>
                  <div className="flex items-center">Item <SortIcon col="item_name" active={voidSort} dir={voidDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Order #</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Reason</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleVoidSort("voided_by")}>
                  <div className="flex items-center">Staff <SortIcon col="voided_by" active={voidSort} dir={voidDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right pr-5" onClick={() => handleVoidSort("amount")}>
                  <div className="flex items-center justify-end">Amount <SortIcon col="amount" active={voidSort} dir={voidDir} /></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/30">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j} className="py-3.5"><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredVoids.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-7 w-7 opacity-30" />
                      <p className="text-sm font-medium">
                        {hasSearch ? "No items match your search" : "No voided items for this period"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredVoids.map((item, i) => (
                  <TableRow key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                    <TableCell className="pl-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(item.voided_at), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted text-[11px] font-semibold">
                          {item.quantity}×
                        </span>
                        <span className="text-sm font-medium">{item.item_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <Link href={`/dashboard/orders/${item.order_id}`} className="font-mono text-xs text-primary hover:underline">
                        #{item.order_number}
                      </Link>
                    </TableCell>
                    <TableCell className="py-3.5 max-w-48 truncate text-sm text-muted-foreground" title={item.reason}>
                      {item.reason || "—"}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <span className="text-sm">{item.voided_by || "Unknown"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 text-right pr-5">
                      <span className="text-sm font-bold text-rose-500">-${item.amount.toFixed(2)}</span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Refunds Table ── */}
      <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/50">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Refunds Log
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${filteredRefunds.length} refund${filteredRefunds.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/50">
                <TableHead className="pl-5 text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleRefundSort("refunded_at")}>
                  <div className="flex items-center">Time <SortIcon col="refunded_at" active={refundSort} dir={refundDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Order #</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Reason</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleRefundSort("refunded_by")}>
                  <div className="flex items-center">Processed By <SortIcon col="refunded_by" active={refundSort} dir={refundDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right pr-5" onClick={() => handleRefundSort("amount")}>
                  <div className="flex items-center justify-end">Amount <SortIcon col="amount" active={refundSort} dir={refundDir} /></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/30">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j} className="py-3.5"><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredRefunds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <RefreshCcw className="h-7 w-7 opacity-30" />
                      <p className="text-sm font-medium">
                        {hasSearch ? "No refunds match your search" : "No refunds for this period"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRefunds.map((item, i) => (
                  <TableRow key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                    <TableCell className="pl-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(item.refunded_at), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <Link href={`/dashboard/orders/${item.order_id}`} className="font-mono text-xs text-primary hover:underline">
                        #{item.order_number}
                      </Link>
                    </TableCell>
                    <TableCell className="py-3.5 max-w-48 truncate text-sm text-muted-foreground" title={item.reason}>
                      {item.reason || "—"}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <span className="text-sm">{item.refunded_by || "Unknown"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 text-right pr-5">
                      <span className="text-sm font-bold text-amber-500">-${item.amount.toFixed(2)}</span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
