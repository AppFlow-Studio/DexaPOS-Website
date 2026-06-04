"use client";

import * as React from "react";
import { Loader2, Globe, MapPin, Pencil, RotateCcw, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useItemPriceMatrix } from "@/app/dashboard/hooks/useLocationScoped";
import { useLocationStore } from "@/stores/location-store";
import { InlinePriceEditor } from "./InlinePriceEditor";
import { scopeColor, type CascadeLevel } from "@/lib/menu/cascade-labels";
import { resetItemToLevel } from "@/app/dashboard/actions/menu-items-rpc";
import type { PriceMatrixRow } from "@/app/dashboard/actions/menu-items";

interface PriceMatrixGridProps {
  itemId: string;
  className?: string;
}

interface RowDef {
  level: CascadeLevel;
  rowLabel: string;
  rowHint: string;
}

interface L5Context {
  menuId: string;
  menuName: string;
  categoryId: string;
  categoryName: string;
}

const ROW_DEFS: RowDef[] = [
  {
    level: 1,
    rowLabel: "Global",
    rowHint: "Base price (applies by default)",
  },
  {
    level: 2,
    rowLabel: "Location only",
    rowHint: "Per-location override",
  },
  {
    level: 3,
    rowLabel: "Category (global)",
    rowHint: "Per-category default, all locations",
  },
  {
    level: 4,
    rowLabel: "Category at location",
    rowHint: "Per-category at one location",
  },
  {
    level: 5,
    rowLabel: "Menu at location",
    rowHint: "Per-menu at one location",
  },
];

function formatPrice(n: number | null | undefined): string {
  if (n == null) return "";
  return `$${n.toFixed(2)}`;
}

export function PriceMatrixGrid({ itemId, className }: PriceMatrixGridProps) {
  const { data: matrix, isLoading } = useItemPriceMatrix(itemId);
  const { locations } = useLocationStore();

  const cellMap = React.useMemo(() => {
    const map = new Map<string, PriceMatrixRow>();
    if (!matrix) return map;
    for (const row of matrix.levels) {
      // Key by level + locationId (or "global" for global rows) + categoryName + menuName
      const key = `${row.level}|${row.locationId ?? "global"}|${row.categoryName ?? ""}|${row.menuName ?? ""}`;
      // For rows that may have multiple entries per (level, location), we show
      // the first one. Users can open the kebab to pick specific category/menu contexts.
      if (!map.has(key)) map.set(key, row);
    }
    return map;
  }, [matrix]);

  // Extract unique L5 override contexts (menu + category combos)
  const l5Contexts = React.useMemo(() => {
    if (!matrix) return [];
    const seen = new Map<string, L5Context>();
    for (const row of matrix.levels) {
      if (row.level !== 5 || !row.menuId || !row.categoryId) continue;
      const key = `${row.menuId}|${row.categoryId}`;
      if (!seen.has(key)) {
        seen.set(key, {
          menuId: row.menuId,
          menuName: row.menuName ?? "Unknown Menu",
          categoryId: row.categoryId,
          categoryName: row.categoryName ?? "Unknown Category",
        });
      }
    }
    return Array.from(seen.values());
  }, [matrix]);

  if (isLoading || !matrix) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading pricing matrix…
      </div>
    );
  }

  return (
    <div className={cn("space-y-4 w-full min-w-0", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight truncate">{matrix.itemName}</h1>
        <p className="text-sm text-muted-foreground">
          Pricing Matrix — global default + every override for every location
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="sticky left-0 z-10 w-[220px] border-r bg-muted/50 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Scope
              </th>
              <th className="min-w-[100px] border-r px-3 py-2 text-center text-xs font-semibold text-muted-foreground">
                <div className="flex items-center justify-center gap-1">
                  <Globe className="h-3 w-3" />
                  All
                </div>
              </th>
              {locations.map((loc) => (
                <th
                  key={loc.id}
                  className="min-w-[100px] border-r px-3 py-2 text-center text-xs font-semibold text-muted-foreground"
                >
                  <div className="flex items-center justify-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate max-w-[90px]" title={loc.name}>
                      {loc.name}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROW_DEFS.map((rowDef) => {
              const colors = scopeColor(rowDef.level);

              // L5: render dynamic sub-rows from actual data
              if (rowDef.level === 5) {
                if (l5Contexts.length === 0) {
                  // No L5 overrides exist — show a placeholder row
                  return (
                    <tr key="l5-empty" className="border-t">
                      <td className="sticky left-0 z-10 border-r bg-background px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn("text-xs font-semibold", colors.text)}>
                            <BookOpen className="mr-1 inline h-3 w-3" />
                            {rowDef.rowLabel}
                          </span>
                          <span className="text-[10px] text-muted-foreground leading-tight">
                            No menu-level overrides set
                          </span>
                        </div>
                      </td>
                      <td className="border-r px-3 py-2 text-center text-xs text-muted-foreground/60">
                        —
                      </td>
                      {locations.map((loc) => (
                        <td key={loc.id} className="border-r px-3 py-2 text-center text-xs text-muted-foreground/60">
                          —
                        </td>
                      ))}
                    </tr>
                  );
                }

                return l5Contexts.map((ctx) => (
                  <tr key={`l5-${ctx.menuId}-${ctx.categoryId}`} className="border-t">
                    <td className="sticky left-0 z-10 border-r bg-background px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className={cn("text-xs font-semibold", colors.text)}>
                          <BookOpen className="mr-1 inline h-3 w-3" />
                          {ctx.menuName}
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-tight">
                          {ctx.categoryName} category
                        </span>
                      </div>
                    </td>
                    {/* "All" column — N/A for L5 */}
                    <td className="border-r px-3 py-2 text-center text-xs text-muted-foreground/60">
                      —
                    </td>
                    {locations.map((loc) => (
                      <L5MatrixCell
                        key={loc.id}
                        itemId={itemId}
                        locationId={loc.id}
                        locationName={loc.name}
                        menuId={ctx.menuId}
                        menuName={ctx.menuName}
                        categoryId={ctx.categoryId}
                        categoryName={ctx.categoryName}
                        row={
                          cellMap.get(
                            `5|${loc.id}|${ctx.categoryName}|${ctx.menuName}`,
                          ) ?? null
                        }
                      />
                    ))}
                  </tr>
                ));
              }

              return (
                <tr key={rowDef.level} className="border-t">
                  <td className="sticky left-0 z-10 border-r bg-background px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          colors.text,
                        )}
                      >
                        {rowDef.rowLabel}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        {rowDef.rowHint}
                      </span>
                    </div>
                  </td>
                  {/* "All" column */}
                  <MatrixCell
                    itemId={itemId}
                    level={rowDef.level}
                    locationId={null}
                    row={
                      cellMap.get(
                        `${rowDef.level}|global||`,
                      ) ?? null
                    }
                    globalBasePrice={matrix.globalPrice}
                  />
                  {locations.map((loc) => (
                    <MatrixCell
                      key={loc.id}
                      itemId={itemId}
                      level={rowDef.level}
                      locationId={loc.id}
                      locationName={loc.name}
                      row={
                        cellMap.get(
                          `${rowDef.level}|${loc.id}||`,
                        ) ?? null
                      }
                      globalBasePrice={matrix.globalPrice}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/30">
            <tr className="border-t">
              <td className="sticky left-0 z-10 border-r bg-muted/30 px-3 py-2 text-xs font-semibold">
                Effective (what customers pay)
              </td>
              <EffectiveCell
                globalPrice={matrix.globalPrice}
                overrides={matrix.levels}
                locationId={null}
              />
              {locations.map((loc) => (
                <EffectiveCell
                  key={loc.id}
                  globalPrice={matrix.globalPrice}
                  overrides={matrix.levels}
                  locationId={loc.id}
                />
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="rounded-md border bg-muted/20 p-3 text-[11px] text-muted-foreground">
        <span className="mr-3">
          <span className="font-mono">↓</span> inherits from above
        </span>
        <span className="mr-3">
          <Pencil className="inline h-3 w-3" /> override exists — click to edit
        </span>
        <span>— not applicable</span>
      </div>
    </div>
  );
}

function MatrixCell({
  itemId,
  level,
  locationId,
  locationName,
  row,
  globalBasePrice,
}: {
  itemId: string;
  level: CascadeLevel;
  locationId: string | null;
  locationName?: string;
  row: PriceMatrixRow | null;
  globalBasePrice: number;
}) {
  const [open, setOpen] = React.useState(false);

  // Non-applicable combos
  const isNA =
    (level === 1 && locationId !== null) ||
    (level === 2 && locationId === null) ||
    (level === 3 && locationId !== null) ||
    (level === 4 && locationId === null) ||
    (level === 5 && locationId === null);

  if (isNA) {
    return (
      <td className="border-r px-3 py-2 text-center text-xs text-muted-foreground/60">
        —
      </td>
    );
  }

  // L1 Global column shows the base price directly (no inline edit here for now)
  if (level === 1 && locationId === null) {
    return (
      <td className="border-r px-3 py-2 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-sm font-semibold tabular-nums">
            {formatPrice(globalBasePrice)}
          </span>
          <span className="text-[9px] text-muted-foreground">(base)</span>
        </div>
      </td>
    );
  }

  const hasOverride = row && row.price != null;

  // Only L1 (global) + L2 (location override) are fully editable inline today.
  // L3/L4/L5 still require opening the form (click routes there via item link).
  const supportsInlineEdit = level === 1 || level === 2;

  return (
    <td className="border-r px-1 py-1 text-center">
      {hasOverride ? (
        supportsInlineEdit ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex w-full flex-col items-center gap-0.5 rounded px-2 py-1 text-sm font-semibold tabular-nums hover:bg-muted"
              >
                {formatPrice(row!.price)}
                <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                  <Pencil className="h-2 w-2" /> override
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="center" className="w-[260px] p-3">
              <InlinePriceEditor
                itemId={itemId}
                scope={{
                  level,
                  locationName: locationName ?? null,
                }}
                locationId={locationId}
                initialPrice={row!.price ?? null}
                initialCashPrice={row!.cashPrice ?? null}
                onClose={() => setOpen(false)}
              />
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex w-full flex-col items-center gap-0.5 px-2 py-1 text-sm font-semibold tabular-nums">
            {formatPrice(row!.price)}
            <span className="text-[9px] text-muted-foreground">L{level}</span>
          </div>
        )
      ) : (
        <span className="inline-block text-xs text-muted-foreground/50">↓</span>
      )}
    </td>
  );
}

/**
 * L5-specific cell with inline editing + reset support.
 * Shows the price from a location_menu_item_overrides row (Location + Menu + Category).
 */
function L5MatrixCell({
  itemId,
  locationId,
  locationName,
  menuId,
  menuName,
  categoryId,
  categoryName,
  row,
}: {
  itemId: string;
  locationId: string;
  locationName: string;
  menuId: string;
  menuName: string;
  categoryId: string;
  categoryName: string;
  row: PriceMatrixRow | null;
}) {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const resetMutation = useMutation({
    mutationFn: async () => {
      const result = await resetItemToLevel(itemId, 4, {
        categoryId,
        menuId,
        locationId,
      });
      if (!result.success) throw new Error(result.error || "Reset failed");
      return result;
    },
    onSuccess: () => {
      toast.success("Override removed", {
        description: `Reverted to category-level pricing for ${menuName} at ${locationName}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["item-price-matrix", itemId] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      setOpen(false);
    },
    onError: (err) => {
      toast.error("Reset failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const hasOverride = row && row.price != null;

  return (
    <td className="border-r px-1 py-1 text-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full flex-col items-center gap-0.5 rounded px-2 py-1 text-sm tabular-nums hover:bg-muted",
              hasOverride ? "font-semibold" : "text-muted-foreground/50",
            )}
          >
            {hasOverride ? (
              <>
                {formatPrice(row!.price)}
                <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                  <Pencil className="h-2 w-2" /> override
                </span>
              </>
            ) : (
              <span className="text-xs">↓ set</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-[280px] p-3">
          <div className="mb-2 rounded border bg-rose-50 px-2 py-1.5">
            <p className="text-[10px] font-semibold text-rose-700">
              {menuName} menu at {locationName}
            </p>
            <p className="text-[10px] text-rose-600">
              {categoryName} category
            </p>
          </div>
          <InlinePriceEditor
            itemId={itemId}
            scope={{
              level: 5,
              locationName,
              menuName,
              categoryName,
            }}
            locationId={locationId}
            menuId={menuId}
            categoryId={categoryId}
            initialPrice={row?.price ?? null}
            initialCashPrice={row?.cashPrice ?? null}
            onClose={() => setOpen(false)}
          />
          {hasOverride && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2 h-7 w-full justify-start gap-2 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Remove override (revert to L4)
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </td>
  );
}

/**
 * Computes what a customer actually pays at a given location given the full
 * set of override rows. "Most specific wins" — L5 > L4 > L3 > L2 > L1.
 * The matrix row effective-summary is intentionally simplified: it doesn't
 * resolve per-category/per-menu cascades (the merchant sees those in the grid)
 * — it returns the single most-specific override that is not scoped to a
 * specific category/menu combo.
 */
function EffectiveCell({
  globalPrice,
  overrides,
  locationId,
}: {
  globalPrice: number;
  overrides: PriceMatrixRow[];
  locationId: string | null;
}) {
  if (locationId === null) {
    return (
      <td className="border-r bg-muted/10 px-3 py-2 text-center text-sm font-semibold tabular-nums">
        {formatPrice(globalPrice)}
      </td>
    );
  }

  // Prefer L2 override (location-only) as the "what customers see by default"
  const l2 = overrides.find(
    (o) => o.level === 2 && o.locationId === locationId,
  );
  const effective = l2?.price ?? globalPrice;
  const source = l2 ? "override" : "global";

  return (
    <td className="border-r bg-muted/10 px-3 py-2 text-center">
      <div className="flex flex-col items-center">
        <span className="text-sm font-semibold tabular-nums">
          {formatPrice(effective)}
        </span>
        <span className="text-[9px] text-muted-foreground">{source}</span>
      </div>
    </td>
  );
}

export default PriceMatrixGrid;
