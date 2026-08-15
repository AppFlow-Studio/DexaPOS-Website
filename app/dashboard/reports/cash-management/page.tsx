"use client";

import { useState, useMemo } from "react";
import { useCashFlowReport } from "../../hooks/useOrderAnalytics";
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
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from "@/components/dashboard/reports/MobileColumnsButton";
import { useIsMobile } from "@/hooks/use-mobile";

/** Time and the collected total identify the row; the rest are optional on mobile. */
const TABLE_COLUMNS: ReportColumn[] = [
  { id: "created_at", label: "Time", locked: true },
  { id: "order_number", label: "Order #" },
  { id: "staff_name", label: "Staff", defaultHidden: true },
  { id: "sale_amount", label: "Sale Amount", defaultHidden: true },
  { id: "tip_amount", label: "Tip", defaultHidden: true },
  { id: "total_amount", label: "Total Collected", locked: true },
];

type SortKey = "created_at" | "total_amount" | "tip_amount" | "staff_name";
type SortDir = "asc" | "desc";

function SortIcon({ col, active, dir }: { col: SortKey; active: SortKey; dir: SortDir }) {
  if (col !== active) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40 ml-1 shrink-0" />;
  return dir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-[#0C4FD1] dark:text-[#6CA0FF] ml-1 shrink-0" />
    : <ArrowDown className="h-3.5 w-3.5 text-[#0C4FD1] dark:text-[#6CA0FF] ml-1 shrink-0" />;
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
  const [hiddenCols, setHiddenCols] = useState(() =>
    initialHiddenColumns(TABLE_COLUMNS),
  );
  const isMobile = useIsMobile();

  /** Column hiding only applies at mobile widths; desktop always shows all. */
  const isColVisible = (id: string) => !isMobile || !hiddenCols.has(id);
  const visibleColCount = TABLE_COLUMNS.filter((c) => isColVisible(c.id)).length;

  const selectedLocation = useSelectedLocation();
  const queryDateRange = useReportingQueryRange(dateRange);
  const { data: cashTransactions, isLoading, isError } = useCashFlowReport(queryDateRange.from, queryDateRange.to);

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
      value: isLoading ? null : isError ? "—" : `$${totalCollected.toFixed(2)}`,
      sub: isError ? "Failed to load" : `${cashTransactions?.length ?? 0} transactions`,
      icon: Banknote,
    },
    {
      label: "Net Sales (Cash)",
      value: isLoading ? null : isError ? "—" : `$${totalSales.toFixed(2)}`,
      sub: isError ? "Failed to load" : "Excluding tips",
      icon: DollarSign,
    },
    {
      label: "Total Tips",
      value: isLoading ? null : isError ? "—" : `$${totalTips.toFixed(2)}`,
      sub: isError ? "Failed to load" : "Cash tips collected",
      icon: TrendingUp,
    },
    {
      label: "Avg per Transaction",
      value: isLoading ? null : isError ? "—" : `$${avgPerTx.toFixed(2)}`,
      sub: isError ? "Failed to load" : "Per cash order",
      icon: ShoppingCart,
    },
  ];

  const maxTotal = processed.reduce((m, r) => Math.max(m, r.total_amount), 0);
  const hasSearch = !!search.trim();

  return (
    <PageShell className="pb-8">
      <ReportPageHeader
        title="Cash Management"
        description="Cash drawer activity and cash payments"
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
        {kpis.map((kpi) => (
          <StatTile
            key={kpi.label}
            label={kpi.label}
            value={kpi.value ?? ""}
            meta={kpi.sub}
            icon={<kpi.icon />}
            isLoading={kpi.value === null}
          />
        ))}
        </StatRow>
      </Panel>

      {/* Transactions Table */}
      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex min-w-0 flex-col justify-between gap-3 px-5 pb-4 pt-5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search staff or order #..."
                className="h-9 w-full pl-9 text-[0.8125rem] sm:w-60"
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
          {/* Wraps instead of overflowing the card on a phone. */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {isLoading ? "Loading…" : `${processed.length} transaction${processed.length !== 1 ? "s" : ""}`}
            </span>
            <MobileColumnsButton
              columns={TABLE_COLUMNS}
              hidden={hiddenCols}
              onChange={setHiddenCols}
            />
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

        <CardContent className="p-0">
          <Table variant="data">
            <TableHeader className="[&_tr]:border-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none" onClick={() => handleSort("created_at")}>
                  <div className="flex items-center">Time <SortIcon col="created_at" active={sortKey} dir={sortDir} /></div>
                </TableHead>
                {isColVisible("order_number") && (
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Order #</TableHead>
                )}
                {isColVisible("staff_name") && (
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none" onClick={() => handleSort("staff_name")}>
                    <div className="flex items-center">Staff <SortIcon col="staff_name" active={sortKey} dir={sortDir} /></div>
                  </TableHead>
                )}
                {isColVisible("sale_amount") && (
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground text-right">Sale Amount</TableHead>
                )}
                {isColVisible("tip_amount") && (
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none text-right" onClick={() => handleSort("tip_amount")}>
                    <div className="flex items-center justify-end">Tip <SortIcon col="tip_amount" active={sortKey} dir={sortDir} /></div>
                  </TableHead>
                )}
                <TableHead className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none text-right pr-5" onClick={() => handleSort("total_amount")}>
                  <div className="flex items-center justify-end">Total Collected <SortIcon col="total_amount" active={sortKey} dir={sortDir} /></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-0">
                    {Array.from({ length: visibleColCount }).map((_, j) => (
                      <TableCell key={j} className="py-3.5"><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={visibleColCount} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Banknote className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">Failed to load cash transactions</p>
                      <p className="text-xs">Try refreshing the page or selecting a different date range.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : processed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColCount} className="h-40 text-center">
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
                    <TableRow key={index} className="border-0 bg-card/70 transition-colors hover:bg-muted/40">
                      <TableCell className="pl-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(item.created_at), "MMM d, h:mm a")}
                      </TableCell>
                      {isColVisible("order_number") && (
                        <TableCell className="py-3.5">
                          <Link href={`/dashboard/orders/${item.order_id}`} className="font-mono text-xs text-primary hover:underline">
                            #{item.order_number}
                          </Link>
                        </TableCell>
                      )}
                      {isColVisible("staff_name") && (
                        <TableCell className="py-3.5">
                          <div className="flex items-center gap-1.5">
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                              <User className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <span className="text-sm">{item.staff_name || "Unknown"}</span>
                          </div>
                        </TableCell>
                      )}
                      {isColVisible("sale_amount") && (
                        <TableCell className="py-3.5 text-right text-sm text-muted-foreground">
                          ${(item.total_amount - item.tip_amount).toFixed(2)}
                        </TableCell>
                      )}
                      {isColVisible("tip_amount") && (
                        <TableCell className="py-3.5 text-right">
                          {item.tip_amount > 0 ? (
                            <span className="text-xs font-medium text-muted-foreground">
                              +${item.tip_amount.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="py-3.5 pr-5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold text-foreground">
                            ${item.total_amount.toFixed(2)}
                          </span>
                          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-foreground/35" style={{ width: `${barPct}%` }} />
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
    </PageShell>
  );
}
