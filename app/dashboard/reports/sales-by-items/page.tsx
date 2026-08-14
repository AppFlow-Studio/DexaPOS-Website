"use client";

import { useState, useMemo } from "react";
import { useSalesByItemReport } from "../../hooks/useOrderAnalytics";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { subDays } from "date-fns";
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
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ShoppingCart,
  DollarSign,
  Package,
  TrendingUp,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSelectedLocation } from "@/stores/location-store";
import { SalesByItemReportItem } from "@/app/dashboard/actions/order-analytics";
import { useReportingQueryRange } from "@/app/dashboard/hooks/useReportingDateRange";
import { ReportExportButtons } from "../components/ReportExportButtons";
import type { ExportColumn } from "@/utils/export";

type SortKey = keyof Pick<
  SalesByItemReportItem,
  "item_name" | "category" | "quantity_sold" | "gross_sales" | "net_sales"
>;
type SortDir = "asc" | "desc";

const exportColumns: ExportColumn<SalesByItemReportItem>[] = [
  { key: "item_name", header: "Item Name" },
  { key: "category", header: "Category", format: (v: string | null) => v || "—" },
  { key: "quantity_sold", header: "Qty Sold", format: (v: number) => v.toLocaleString() },
  { key: "gross_sales", header: "Gross Sales", format: (v: number) => `$${v.toFixed(2)}` },
  { key: "net_sales", header: "Net Sales", format: (v: number) => `$${v.toFixed(2)}` },
];

function SortIcon({
  column,
  active,
  dir,
}: {
  column: SortKey;
  active: SortKey;
  dir: SortDir;
}) {
  if (column !== active)
    return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40 ml-1" />;
  return dir === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5 text-primary ml-1" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 text-primary ml-1" />
  );
}

export default function SalesByItemsPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_30_days");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("net_sales");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const selectedLocation = useSelectedLocation();
  const queryDateRange = useReportingQueryRange(dateRange);
  const { data: items, isLoading, isError } = useSalesByItemReport(
    queryDateRange.from,
    queryDateRange.to
  );

  // Derived: unique categories
  const categories = useMemo(() => {
    if (!items) return [];
    const cats = [...new Set(items.map((i) => i.category).filter(Boolean))].sort();
    return cats;
  }, [items]);

  // Filter + sort
  const processed = useMemo(() => {
    let rows = items ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.item_name.toLowerCase().includes(q) ||
          r.category?.toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== "all") {
      rows = rows.filter((r) => r.category === categoryFilter);
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return rows;
  }, [items, search, categoryFilter, sortKey, sortDir]);

  // Summary KPIs
  const summary = useMemo(() => {
    const src = items ?? [];
    return {
      totalItems: src.length,
      totalQty: src.reduce((s, r) => s + r.quantity_sold, 0),
      totalGross: src.reduce((s, r) => s + r.gross_sales, 0),
      totalNet: src.reduce((s, r) => s + r.net_sales, 0),
    };
  }, [items]);

  const maxNet = processed.reduce((m, r) => Math.max(m, r.net_sales), 0);
  const maxQty = processed.reduce((m, r) => Math.max(m, r.quantity_sold), 0);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const hasFilters = search || categoryFilter !== "all";

  const kpis = [
    {
      label: "Unique Items",
      value: isLoading ? null : isError ? "—" : summary.totalItems.toLocaleString(),
      icon: Package,
    },
    {
      label: "Total Qty Sold",
      value: isLoading ? null : isError ? "—" : summary.totalQty.toLocaleString(),
      icon: ShoppingCart,
    },
    {
      label: "Gross Sales",
      value: isLoading ? null : isError ? "—" : `$${summary.totalGross.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
    },
    {
      label: "Net Sales",
      value: isLoading ? null : isError ? "—" : `$${summary.totalNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
    },
  ];

  return (
    <PageShell className="pb-8">
      <ReportPageHeader
        title="Sales by Items"
        description="Menu item performance breakdown"
        locationName={selectedLocation && !Array.isArray(selectedLocation) ? selectedLocation.name : null}
        actions={
          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={(from, to) => {
              if (from && to) setDateRange({ from, to });
            }}
            preset={preset}
            onPresetChange={setPreset}
          />
        }
      />

      {/* ── KPI Cards ── */}
      <Panel padded>
        <StatRow columns={4}>
        {kpis.map((kpi) => (
          <StatTile
            key={kpi.label}
            label={kpi.label}
            value={kpi.value ?? ""}
            icon={<kpi.icon />}
            isLoading={kpi.value === null}
          />
        ))}
        </StatRow>
      </Panel>

      {/* ── Table Card ── */}
      <Card className="overflow-hidden">
        {/* Filters toolbar */}
        <div className="flex flex-col justify-between gap-3 px-5 pb-4 pt-5 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search items or categories..."
                className="h-9 w-full pl-9 text-[0.8125rem] sm:w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Category filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-full border-0 bg-muted/60 text-[0.8125rem] shadow-none sm:w-44">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort by (mobile fallback) */}
            <Select
              value={`${sortKey}:${sortDir}`}
              onValueChange={(v) => {
                const [k, d] = v.split(":") as [SortKey, SortDir];
                setSortKey(k);
                setSortDir(d);
              }}
            >
              <SelectTrigger className="h-9 w-full border-0 bg-muted/60 text-[0.8125rem] shadow-none sm:w-48">
                <SelectValue placeholder="Sort by…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="net_sales:desc">Net Sales ↓</SelectItem>
                <SelectItem value="net_sales:asc">Net Sales ↑</SelectItem>
                <SelectItem value="gross_sales:desc">Gross Sales ↓</SelectItem>
                <SelectItem value="gross_sales:asc">Gross Sales ↑</SelectItem>
                <SelectItem value="quantity_sold:desc">Qty Sold ↓</SelectItem>
                <SelectItem value="quantity_sold:asc">Qty Sold ↑</SelectItem>
                <SelectItem value="item_name:asc">Name A–Z</SelectItem>
                <SelectItem value="item_name:desc">Name Z–A</SelectItem>
                <SelectItem value="category:asc">Category A–Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground gap-1.5"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("all");
                }}
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {isLoading
                ? "Loading…"
                : `${processed.length} item${processed.length !== 1 ? "s" : ""}`}
            </span>
            <ReportExportButtons
              data={processed}
              columns={exportColumns}
              filenameBase="sales-by-items"
              pdfTitle="Sales by Items"
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
              locationName={
                selectedLocation && !Array.isArray(selectedLocation)
                  ? selectedLocation.name
                  : "All Locations"
              }
              summaryCards={[
                { label: "Total Qty Sold", value: summary.totalQty.toLocaleString() },
                {
                  label: "Gross Sales",
                  value: `$${summary.totalGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                },
                {
                  label: "Net Sales",
                  value: `$${summary.totalNet.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                },
              ]}
              disabled={isLoading || isError}
            />
          </div>
        </div>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/50">
                <TableHead className="w-10 pl-5 text-center text-xs font-semibold text-muted-foreground">
                  #
                </TableHead>
                <TableHead
                  className="text-xs font-semibold text-muted-foreground cursor-pointer select-none"
                  onClick={() => handleSort("item_name")}
                >
                  <div className="flex items-center">
                    Item Name
                    <SortIcon column="item_name" active={sortKey} dir={sortDir} />
                  </div>
                </TableHead>
                <TableHead
                  className="text-xs font-semibold text-muted-foreground cursor-pointer select-none"
                  onClick={() => handleSort("category")}
                >
                  <div className="flex items-center">
                    Category
                    <SortIcon column="category" active={sortKey} dir={sortDir} />
                  </div>
                </TableHead>
                <TableHead
                  className="text-xs font-semibold text-muted-foreground cursor-pointer select-none"
                  onClick={() => handleSort("quantity_sold")}
                >
                  <div className="flex items-center justify-end">
                    Qty Sold
                    <SortIcon column="quantity_sold" active={sortKey} dir={sortDir} />
                  </div>
                </TableHead>
                <TableHead
                  className="text-xs font-semibold text-muted-foreground cursor-pointer select-none"
                  onClick={() => handleSort("gross_sales")}
                >
                  <div className="flex items-center justify-end">
                    Gross Sales
                    <SortIcon column="gross_sales" active={sortKey} dir={sortDir} />
                  </div>
                </TableHead>
                <TableHead
                  className="text-xs font-semibold text-muted-foreground cursor-pointer select-none pr-5"
                  onClick={() => handleSort("net_sales")}
                >
                  <div className="flex items-center justify-end">
                    Net Sales
                    <SortIcon column="net_sales" active={sortKey} dir={sortDir} />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Package className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">Failed to load sales data</p>
                      <p className="text-xs">Try refreshing the page or selecting a different date range.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/30">
                    <TableCell className="pl-5 py-3.5">
                      <div className="h-4 w-5 bg-muted animate-pulse rounded mx-auto" />
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="h-4 w-44 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" />
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" />
                    </TableCell>
                    <TableCell className="py-3.5 pr-5">
                      <div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : processed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Package className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">
                        {items && items.length > 0
                          ? "No items match your filters"
                          : "No sales data for this period"}
                      </p>
                      {hasFilters && (
                        <button
                          className="text-xs text-primary underline underline-offset-2"
                          onClick={() => {
                            setSearch("");
                            setCategoryFilter("all");
                          }}
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                processed.map((item, index) => {
                  const qtyPct = maxQty > 0 ? (item.quantity_sold / maxQty) * 100 : 0;
                  const netPct = maxNet > 0 ? (item.net_sales / maxNet) * 100 : 0;
                  return (
                    <TableRow
                      key={index}
                      className="border-b border-border/30 hover:bg-muted/30 transition-colors group"
                    >
                      {/* Rank */}
                      <TableCell className="pl-5 py-3.5 text-center">
                        <span className="text-xs font-bold text-muted-foreground/50">
                          {index + 1}
                        </span>
                      </TableCell>

                      {/* Item name */}
                      <TableCell className="py-3.5 font-medium text-sm max-w-50">
                        <span className="truncate block">{item.item_name}</span>
                      </TableCell>

                      {/* Category badge */}
                      <TableCell className="py-3.5">
                        {item.category ? (
                          <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {item.category}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">
                            —
                          </span>
                        )}
                      </TableCell>

                      {/* Qty sold with bar */}
                      <TableCell className="py-3.5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold font-mono">
                            {item.quantity_sold.toLocaleString()}
                          </span>
                          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-foreground/35"
                              style={{ width: `${qtyPct}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>

                      {/* Gross sales */}
                      <TableCell className="py-3.5 text-right">
                        <span className="text-sm font-mono text-muted-foreground">
                          $
                          {item.gross_sales.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </TableCell>

                      {/* Net sales with bar */}
                      <TableCell className="py-3.5 pr-5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-bold font-mono">
                            $
                            {item.net_sales.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-foreground/35"
                              style={{ width: `${netPct}%` }}
                            />
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
