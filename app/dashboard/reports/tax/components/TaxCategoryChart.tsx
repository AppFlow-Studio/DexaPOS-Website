"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import {
  ReportPanel as Card,
  ReportPanelContent as CardContent,
  ReportPanelHeader as CardHeader,
  ReportPanelTitle as CardTitle,
} from "@/components/dashboard/reports/ReportPanel";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaxCategoryRow } from "@/app/dashboard/reports/tax/types";

interface TaxCategoryChartProps {
  data: TaxCategoryRow[] | undefined;
  isLoading: boolean;
}

const COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
];

type SortKey = "categoryName" | "taxableSales" | "taxCollected" | "effectiveRate";
type SortDir = "asc" | "desc";

function SortIcon({ col, active, dir }: { col: SortKey; active: SortKey; dir: SortDir }) {
  if (col !== active) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 ml-1" />;
  return dir === "asc"
    ? <ArrowUp className="h-3 w-3 text-primary ml-1" />
    : <ArrowDown className="h-3 w-3 text-primary ml-1" />;
}

export function TaxCategoryChart({ data, isLoading }: TaxCategoryChartProps) {
  const [sortKey, setSortKey] = useState<SortKey>("taxCollected");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Stable name→color map built once from the original data order (sorted by
  // taxCollected desc from the server). Used by both the chart and the table so
  // colors stay consistent regardless of how the user sorts the table rows.
  const colorByCategory = useMemo(() => {
    const map: Record<string, string> = {};
    (data ?? []).forEach((row, i) => {
      map[row.categoryName] = COLORS[i % COLORS.length];
    });
    return map;
  }, [data]);

  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    (data ?? []).forEach((row) => {
      cfg[row.categoryName] = {
        label: row.categoryName,
        color: colorByCategory[row.categoryName] ?? COLORS[0],
      };
    });
    return cfg;
  }, [data, colorByCategory]);

  const chartData = useMemo(
    () =>
      (data ?? []).slice(0, 10).map((row) => ({
        // Truncated label for the X-axis; fullName used for color lookup
        category:
          row.categoryName.length > 14
            ? row.categoryName.slice(0, 13) + "…"
            : row.categoryName,
        fullName: row.categoryName,
        taxCollected: row.taxCollected,
      })),
    [data]
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data, sortKey, sortDir]);

  const maxTax = Math.max(...(data ?? []).map((r) => r.taxCollected), 0);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="h-4 w-40 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="h-64 bg-muted animate-pulse rounded-xl" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <Card>
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="text-sm font-semibold">Tax by Category</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48">
          <p className="text-sm text-muted-foreground">No category data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bar Chart */}
      <Card>
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="text-sm font-semibold">
            Tax Collected by Category
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Top {chartData.length} categories
          </p>
        </CardHeader>
        <CardContent className="px-3 pb-5">
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 12, left: 8, bottom: 48 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                strokeOpacity={0.08}
              />
              <XAxis
                dataKey="category"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                angle={-30}
                textAnchor="end"
                interval={0}
                height={56}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={
                  <ChartTooltipContent
                    formatter={(value) => [
                      `$${Number(value).toFixed(2)}`,
                      "Tax Collected",
                    ]}
                  />
                }
              />
              <Bar dataKey="taxCollected" radius={[6, 6, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.fullName}
                    fill={colorByCategory[entry.fullName] ?? COLORS[0]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Sortable detail table */}
      <Card className="overflow-hidden">
        <CardHeader className="px-5 pb-3 pt-5">
          <CardTitle className="text-sm font-semibold">Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/50">
                <TableHead
                  className="pl-5 text-xs font-semibold text-muted-foreground cursor-pointer select-none"
                  onClick={() => handleSort("categoryName")}
                >
                  <div className="flex items-center">
                    Category
                    <SortIcon col="categoryName" active={sortKey} dir={sortDir} />
                  </div>
                </TableHead>
                <TableHead
                  className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right"
                  onClick={() => handleSort("taxableSales")}
                >
                  <div className="flex items-center justify-end">
                    Taxable Sales
                    <SortIcon col="taxableSales" active={sortKey} dir={sortDir} />
                  </div>
                </TableHead>
                <TableHead
                  className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right"
                  onClick={() => handleSort("taxCollected")}
                >
                  <div className="flex items-center justify-end">
                    Tax Collected
                    <SortIcon col="taxCollected" active={sortKey} dir={sortDir} />
                  </div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  Exempt Items
                </TableHead>
                <TableHead
                  className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right pr-5"
                  onClick={() => handleSort("effectiveRate")}
                >
                  <div className="flex items-center justify-end">
                    Eff. Rate
                    <SortIcon col="effectiveRate" active={sortKey} dir={sortDir} />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                // Use the stable name-keyed map so the dot color always matches
                // the bar in the chart above, even after the user re-sorts rows.
                const color = colorByCategory[row.categoryName] ?? COLORS[0];
                const barPct = maxTax > 0 ? (row.taxCollected / maxTax) * 100 : 0;
                return (
                  <TableRow
                    key={row.categoryName}
                    className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="pl-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm font-medium">{row.categoryName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 text-right text-sm">
                      ${row.taxableSales.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm font-semibold text-foreground">
                          ${row.taxCollected.toFixed(2)}
                        </span>
                        <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${barPct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 text-right text-sm text-muted-foreground">
                      {row.taxExemptCount > 0 ? row.taxExemptCount : "—"}
                    </TableCell>
                    <TableCell className="py-3.5 text-right pr-5">
                      <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {row.effectiveRate.toFixed(2)}%
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
