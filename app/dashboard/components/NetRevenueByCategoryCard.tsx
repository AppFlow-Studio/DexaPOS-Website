"use client";

import { useState, useMemo, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { OverviewLinkButton } from "./OverviewSection";
import type {
  RevenueByCategoryReport,
  RevenueCategoryNode,
  CategoryItem,
} from "@/app/dashboard/actions/order-analytics";

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_COLORS = [
  { bg: "bg-indigo-100 dark:bg-indigo-950/40", border: "border-indigo-200 dark:border-indigo-800", text: "text-indigo-700 dark:text-indigo-300", fill: "#6366f1", light: "#eef2ff" },
  { bg: "bg-sky-100 dark:bg-sky-950/40", border: "border-sky-200 dark:border-sky-800", text: "text-sky-700 dark:text-sky-300", fill: "#0ea5e9", light: "#f0f9ff" },
  { bg: "bg-amber-100 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-300", fill: "#f59e0b", light: "#fffbeb" },
  { bg: "bg-emerald-100 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-300", fill: "#10b981", light: "#ecfdf5" },
  { bg: "bg-rose-100 dark:bg-rose-950/40", border: "border-rose-200 dark:border-rose-800", text: "text-rose-700 dark:text-rose-300", fill: "#f43f5e", light: "#fff1f2" },
  { bg: "bg-violet-100 dark:bg-violet-950/40", border: "border-violet-200 dark:border-violet-800", text: "text-violet-700 dark:text-violet-300", fill: "#8b5cf6", light: "#f5f3ff" },
  { bg: "bg-teal-100 dark:bg-teal-950/40", border: "border-teal-200 dark:border-teal-800", text: "text-teal-700 dark:text-teal-300", fill: "#14b8a6", light: "#f0fdfa" },
  { bg: "bg-orange-100 dark:bg-orange-950/40", border: "border-orange-200 dark:border-orange-800", text: "text-orange-700 dark:text-orange-300", fill: "#f97316", light: "#fff7ed" },
];

function getColorForIndex(index: number) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

// ============================================================================
// Helpers
// ============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

// ============================================================================
// Treemap Layout Algorithm — Squarified
// ============================================================================

interface TreemapRect {
  x: number;
  y: number;
  width: number;
  height: number;
  category: RevenueCategoryNode;
  colorIndex: number;
}

function squarify(
  categories: RevenueCategoryNode[],
  containerWidth: number,
  containerHeight: number
): TreemapRect[] {
  if (categories.length === 0) return [];

  const totalValue = categories.reduce((sum, c) => sum + Math.max(c.net_revenue, 0), 0);
  if (totalValue <= 0) return [];

  // Normalize values to area fractions
  const items = categories.map((cat, i) => ({
    category: cat,
    area: (Math.max(cat.net_revenue, 0) / totalValue) * containerWidth * containerHeight,
    colorIndex: i,
  }));

  const rects: TreemapRect[] = [];
  let x = 0;
  let y = 0;
  let w = containerWidth;
  let h = containerHeight;

  let remaining = [...items];

  while (remaining.length > 0) {
    const isHorizontal = w >= h;
    const sideLength = isHorizontal ? h : w;

    // Find the best row using squarified algorithm
    let row: typeof remaining = [];
    let rowArea = 0;

    for (let i = 0; i < remaining.length; i++) {
      const testRow = [...row, remaining[i]];
      const testArea = rowArea + remaining[i].area;

      if (row.length === 0 || worstAspectRatio(testRow, testArea, sideLength) <= worstAspectRatio(row, rowArea, sideLength)) {
        row = testRow;
        rowArea = testArea;
      } else {
        break;
      }
    }

    // Layout the row
    const rowLength = sideLength > 0 ? rowArea / sideLength : 0;

    let offset = 0;
    row.forEach((item) => {
      const itemLength = rowArea > 0 ? (item.area / rowArea) * sideLength : 0;

      if (isHorizontal) {
        rects.push({
          x: x,
          y: y + offset,
          width: rowLength,
          height: itemLength,
          category: item.category,
          colorIndex: item.colorIndex,
        });
      } else {
        rects.push({
          x: x + offset,
          y: y,
          width: itemLength,
          height: rowLength,
          category: item.category,
          colorIndex: item.colorIndex,
        });
      }

      offset += itemLength;
    });

    // Update remaining area
    if (isHorizontal) {
      x += rowLength;
      w -= rowLength;
    } else {
      y += rowLength;
      h -= rowLength;
    }

    remaining = remaining.slice(row.length);
  }

  return rects;
}

function worstAspectRatio(
  row: Array<{ area: number }>,
  totalArea: number,
  sideLength: number
): number {
  if (row.length === 0 || sideLength <= 0 || totalArea <= 0) return Infinity;

  const rowLength = totalArea / sideLength;
  if (rowLength <= 0) return Infinity;

  let worst = 0;
  row.forEach((item) => {
    const itemSide = item.area / rowLength;
    if (itemSide <= 0 || rowLength <= 0) return;
    const ratio = Math.max(rowLength / itemSide, itemSide / rowLength);
    worst = Math.max(worst, ratio);
  });

  return worst;
}

// ============================================================================
// Treemap Cell Component
// ============================================================================

function TreemapCell({
  rect,
  onClick,
  isSelected,
}: {
  rect: TreemapRect;
  onClick: (category: RevenueCategoryNode) => void;
  isSelected: boolean;
}) {
  const color = getColorForIndex(rect.colorIndex);
  const showLabel = rect.width > 60 && rect.height > 40;
  const showRevenue = rect.width > 80 && rect.height > 55;

  return (
    <div
      className={cn(
        "absolute transition-all duration-200 cursor-pointer border-2 rounded-lg overflow-hidden group",
        color.bg,
        isSelected ? "border-primary ring-2 ring-primary/20 z-10" : color.border,
        "hover:brightness-95 dark:hover:brightness-110"
      )}
      style={{
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${Math.max(rect.width - 4, 0)}px`,
        height: `${Math.max(rect.height - 4, 0)}px`,
      }}
      onClick={() => onClick(rect.category)}
      title={`${rect.category.category_name}: ${formatCurrency(rect.category.net_revenue)}`}
    >
      {showLabel && (
        <div className="p-2 h-full flex flex-col justify-between">
          <div>
            <p
              className={cn(
                "font-semibold text-xs leading-tight truncate",
                color.text
              )}
            >
              {rect.category.category_name}
            </p>
            {rect.width > 100 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                ({formatPercent(rect.category.percent_revenue)})
              </p>
            )}
          </div>
          {showRevenue && (
            <p className={cn("font-bold text-sm", color.text)}>
              {formatCurrency(rect.category.net_revenue)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Category Detail Row (for the table)
// ============================================================================

function CategoryTableRow({
  category,
  colorIndex,
  isExpanded,
  onToggle,
}: {
  category: RevenueCategoryNode;
  colorIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const color = getColorForIndex(colorIndex);
  const hasItems = category.items.length > 0;

  return (
    <>
      {/* Category Row */}
      <tr
        className={cn(
          "border-b transition-colors cursor-pointer hover:bg-muted/30",
          isExpanded && "bg-muted/20"
        )}
        onClick={onToggle}
      >
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            {hasItems ? (
              isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )
            ) : (
              <div className="w-3.5" />
            )}
            <div
              className={cn("w-2.5 h-2.5 rounded-sm shrink-0")}
              style={{ backgroundColor: color.fill }}
            />
            <span className="font-semibold text-sm">
              {category.category_name}
            </span>
          </div>
        </td>
        <td className="py-2.5 px-3 text-right text-sm text-muted-foreground">
          {formatPercent(category.percent_count)}
        </td>
        <td className="py-2.5 px-3 text-right text-sm font-medium tabular-nums">
          {formatNumber(category.quantity)}
        </td>
        <td className="py-2.5 px-3 text-right text-sm font-bold tabular-nums">
          {formatCurrency(category.net_revenue)}
        </td>
      </tr>

      {/* Expanded Items */}
      {isExpanded &&
        category.items.map((item) => (
          <ItemRows key={item.item_name} item={item} />
        ))}
    </>
  );
}

function ItemRows({ item }: { item: CategoryItem }) {
  const [showModifiers, setShowModifiers] = useState(false);
  const hasModifiers = item.modifiers.length > 0;

  return (
    <>
      <tr
        className={cn(
          "border-b border-dashed transition-colors hover:bg-muted/20",
          hasModifiers && "cursor-pointer"
        )}
        onClick={() => hasModifiers && setShowModifiers(!showModifiers)}
      >
        <td className="py-2 px-3">
          <div className="flex items-center gap-2 pl-8">
            {hasModifiers ? (
              showModifiers ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              )
            ) : (
              <div className="w-3" />
            )}
            <span className="text-sm text-muted-foreground">
              {item.item_name}
            </span>
          </div>
        </td>
        <td className="py-2 px-3 text-right text-xs text-muted-foreground/80">
          {formatPercent(item.percent_count)}
        </td>
        <td className="py-2 px-3 text-right text-xs text-muted-foreground tabular-nums">
          {formatNumber(item.quantity)}
        </td>
        <td className="py-2 px-3 text-right text-sm tabular-nums">
          {formatCurrency(item.net_revenue)}
        </td>
      </tr>

      {/* Modifier rows */}
      {showModifiers &&
        item.modifiers.map((mod, i) => (
          <tr
            key={`${mod.modifier_name}-${i}`}
            className="border-b border-dotted"
          >
            <td className="py-1.5 px-3">
              <div className="flex items-center gap-2 pl-14">
                <span className="text-xs text-muted-foreground/60 italic">
                  + {mod.modifier_name}
                </span>
              </div>
            </td>
            <td className="py-1.5 px-3 text-right text-xs text-muted-foreground/50">
              —
            </td>
            <td className="py-1.5 px-3 text-right text-xs text-muted-foreground/60 tabular-nums">
              {formatNumber(mod.quantity)}
            </td>
            <td className="py-1.5 px-3 text-right text-xs text-muted-foreground tabular-nums">
              {formatCurrency(mod.revenue)}
            </td>
          </tr>
        ))}
    </>
  );
}

// ============================================================================
// Legend
// ============================================================================

function TreemapLegend({
  categories,
}: {
  categories: RevenueCategoryNode[];
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {categories.map((cat, i) => {
        const color = getColorForIndex(i);
        return (
          <div key={cat.category_name} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: color.fill }}
            />
            <span className="text-xs text-muted-foreground">
              {cat.category_name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function TreemapSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-3 w-72 mt-2" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-48 mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-75 w-full rounded-lg" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface NetRevenueByCategoryCardProps {
  report: RevenueByCategoryReport | null | undefined;
  isLoading?: boolean;
}

export function NetRevenueByCategoryCard({
  report,
  isLoading,
}: NetRevenueByCategoryCardProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  // Treemap dimensions
  const TREEMAP_WIDTH = 460;
  const TREEMAP_HEIGHT = 300;

  const treemapRects = useMemo(() => {
    if (!report?.categories) return [];
    return squarify(report.categories, TREEMAP_WIDTH, TREEMAP_HEIGHT);
  }, [report?.categories]);

  const toggleCategory = useCallback((categoryName: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  }, []);

  const handleTreemapClick = useCallback(
    (category: RevenueCategoryNode) => {
      setSelectedCategory((prev) =>
        prev === category.category_name ? null : category.category_name
      );
      // Also expand in table
      setExpandedCategories((prev) => {
        const next = new Set(prev);
        if (next.has(category.category_name)) {
          next.delete(category.category_name);
        } else {
          next.add(category.category_name);
        }
        return next;
      });
    },
    []
  );

  const handleExportCSV = useCallback(() => {
    if (!report?.categories) return;

    const rows: string[] = [
      "Category,Item,Modifier,% Count,Quantity,% Revenue,Net Revenue",
    ];

    report.categories.forEach((cat) => {
      rows.push(
        `"${cat.category_name}","","",${cat.percent_count.toFixed(1)}%,${cat.quantity},${cat.percent_revenue.toFixed(1)}%,${cat.net_revenue.toFixed(2)}`
      );
      cat.items.forEach((item) => {
        rows.push(
          `"","${item.item_name}","",${item.percent_count.toFixed(1)}%,${item.quantity},${item.percent_revenue.toFixed(1)}%,${item.net_revenue.toFixed(2)}`
        );
        item.modifiers.forEach((mod) => {
          rows.push(
            `"","","${mod.modifier_name}",—,${mod.quantity},—,${mod.revenue.toFixed(2)}`
          );
        });
      });
    });

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue-by-category.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  if (isLoading) return <TreemapSkeleton />;
  if (!report || report.categories.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-[1.0625rem]! font-semibold text-[#0C4FD1]! dark:text-[#6CA0FF]! flex items-center gap-2">
              <BarChart3 className="h-[1.125rem] w-[1.125rem] shrink-0" />
              Net Revenue by Category
            </CardTitle>
            <CardDescription>
              Visual sales breakdown by product groups
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={handleExportCSV}
              title="Export CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Legend */}
        <TreemapLegend categories={report.categories} />

        {/* Tree Map + Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Treemap Visual */}
          <div className="relative w-full" style={{ aspectRatio: `${TREEMAP_WIDTH}/${TREEMAP_HEIGHT}` }}>
            <div
              className="absolute inset-0 rounded-lg overflow-hidden border bg-muted/20"
              style={{ width: "100%", height: "100%" }}
            >
              {/* Scale treemap to fit container */}
              <div
                className="relative w-full h-full origin-top-left"
                style={{
                  width: `${TREEMAP_WIDTH}px`,
                  height: `${TREEMAP_HEIGHT}px`,
                  transform: `scale(var(--treemap-scale, 1))`,
                }}
                ref={(el) => {
                  if (el && el.parentElement) {
                    const parent = el.parentElement;
                    const scaleX = parent.clientWidth / TREEMAP_WIDTH;
                    const scaleY = parent.clientHeight / TREEMAP_HEIGHT;
                    const scale = Math.min(scaleX, scaleY);
                    el.style.setProperty("--treemap-scale", String(scale));
                    el.style.transform = `scale(${scale})`;
                  }
                }}
              >
                {treemapRects.map((rect, i) => (
                  <TreemapCell
                    key={rect.category.category_name}
                    rect={rect}
                    onClick={handleTreemapClick}
                    isSelected={
                      selectedCategory === rect.category.category_name
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-auto max-h-85 rounded-lg border">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b">
                  <th className="py-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Category
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    % Count
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Qty
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.categories.map((cat, i) => (
                  <CategoryTableRow
                    key={cat.category_name}
                    category={cat}
                    colorIndex={i}
                    isExpanded={expandedCategories.has(cat.category_name)}
                    onToggle={() => toggleCategory(cat.category_name)}
                  />
                ))}

                {/* Totals Row */}
                <tr className="border-t-2 bg-muted/30 font-semibold">
                  <td className="py-2.5 px-3 text-sm">Total</td>
                  <td className="py-2.5 px-3 text-right text-sm">100%</td>
                  <td className="py-2.5 px-3 text-right text-sm tabular-nums">
                    {formatNumber(report.total_quantity)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-sm font-bold tabular-nums">
                    {formatCurrency(report.total_net_revenue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-2 gap-2">
          <p className="text-xs text-muted-foreground italic">
            Interactive tree map: Click a category to view items and modifiers
            breakdown.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">
              Showing all {report.categories.length} categories
            </span>
            <OverviewLinkButton href="/dashboard/orders/analytics">
              View full audit report
            </OverviewLinkButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
