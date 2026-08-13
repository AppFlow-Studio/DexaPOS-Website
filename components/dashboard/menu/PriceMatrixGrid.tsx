"use client";

import * as React from "react";
import { Loader2, Globe, MapPin, Pencil, RotateCcw, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useItemPriceMatrix } from "@/app/dashboard/hooks/useLocationScoped";
import { useLocationStore } from "@/stores/location-store";
import { InlinePriceEditor } from "./InlinePriceEditor";
import { scopeColor, type CascadeLevel } from "@/lib/menu/cascade-labels";
import {
  resolveEffectivePrice,
  listPricedMenus,
  type ResolvedPrice,
} from "@/lib/menu/resolve-effective-price";
import { resetItemToLevel } from "@/app/dashboard/actions/menu-items-rpc";
import type { PriceMatrixRow } from "@/app/dashboard/actions/menu-items";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";

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

/**
 * The 5 pricing levels, least → most specific. Mirrors the DB cascade in
 * get_menu_with_categories (lmio > ci_menu > lcio > ci > mi) and the wording
 * in lib/menu/cascade-labels.ts.
 */
const ROW_DEFS: RowDef[] = [
  {
    level: 1,
    rowLabel: "Item",
    rowHint: "Base price (applies by default)",
  },
  {
    level: 2,
    rowLabel: "Global category",
    rowHint: "Per-category default, all locations",
  },
  {
    level: 3,
    rowLabel: "Local category",
    rowHint: "Per-category at one location",
  },
  {
    level: 4,
    rowLabel: "Global menu",
    rowHint: "Per-menu default, all locations",
  },
  {
    level: 5,
    rowLabel: "Local menu",
    rowHint: "Per-menu at one location",
  },
];

/**
 * Merchant-facing name for each rung, matching the Scope column's row labels so
 * a price in the effective row or a reset button points at a row they can see.
 * (Deliberately not scopeShortName(), whose "Branch …" wording predates these
 * rows and would name a rung that isn't on screen.)
 */
const SOURCE_LABEL: Record<CascadeLevel, string> = {
  1: "item",
  2: "global category",
  3: "local category",
  4: "global menu",
  5: "local menu",
};

function formatPrice(n: number | null | undefined): string {
  if (n == null) return "";
  return `$${n.toFixed(2)}`;
}

/**
 * First override row for a (level, location) cell. L2/L3 rows carry a category
 * and an item can sit in several, so the grid shows the first — the per-menu
 * detail lives in the L4/L5 sub-rows below.
 */
function findRow(
  rows: PriceMatrixRow[],
  level: CascadeLevel,
  locationId: string | null,
): PriceMatrixRow | null {
  return (
    rows.find(
      (row) => row.level === level && (row.locationId ?? null) === locationId,
    ) ?? null
  );
}

export function PriceMatrixGrid({ itemId, className }: PriceMatrixGridProps) {
  const { data: matrix, isLoading } = useItemPriceMatrix(itemId);
  const { locations } = useLocationStore();

  // Menu + category combos that carry a local-menu (L5) override. Each becomes
  // one L5 sub-row, since a price can differ per location within each menu.
  // L4 is not included: it renders as a single non-location-scoped row above.
  const menuContexts = React.useMemo(() => {
    if (!matrix) return [];
    const seen = new Map<string, L5Context>();
    for (const row of matrix.levels) {
      if (row.level !== 5) continue;
      if (!row.menuId || !row.categoryId) continue;
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

  // Menus that carry a price at any level. Each gets its own effective row,
  // because what a customer pays depends on the menu they order from.
  const pricedMenus = React.useMemo(
    () => (matrix ? listPricedMenus(matrix.levels) : []),
    [matrix],
  );

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
          Pricing Matrix — item base, then category and menu prices, globally
          and per location. The most specific price wins.
        </p>
      </div>

      <div className="overflow-x-auto overflow-y-hidden rounded-3xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-30 bg-muted">
            <tr>
              <th className="sticky left-0 z-40 w-[220px] border-r bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
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

              // L4 (global menu): a single row. The price is not location-scoped,
              // so it lives in the "All" column and every location inherits it.
              // An item can carry one global-menu price per (menu, category); the
              // priced one wins, and the sub-label names which menu it came from.
              if (rowDef.level === 4) {
                const l4Row =
                  matrix.levels.find(
                    (row) => row.level === 4 && row.price != null,
                  ) ?? null;

                return (
                  <tr key={rowDef.level} className="border-t">
                    <td className="sticky left-0 z-10 border-r bg-background px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className={cn("text-xs font-semibold", colors.text)}>
                          <BookOpen className="mr-1 inline h-3 w-3" />
                          {rowDef.rowLabel}
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-tight">
                          {l4Row
                            ? `${l4Row.menuName ?? "Menu"}${l4Row.categoryName ? ` — ${l4Row.categoryName}` : ""}, all locations`
                            : rowDef.rowHint}
                        </span>
                      </div>
                    </td>
                    {/* Global menu price lives in the "All" column */}
                    <td className="border-r px-3 py-2 text-center">
                      {l4Row?.price != null ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-sm font-semibold tabular-nums">
                            {formatPrice(l4Row.price)}
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            {SOURCE_LABEL[4]}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-block text-xs text-muted-foreground/50">
                          ↓
                        </span>
                      )}
                    </td>
                    {locations.map((loc) => (
                      <td
                        key={loc.id}
                        className="border-r px-3 py-2 text-center text-xs text-muted-foreground/50"
                      >
                        ↓
                      </td>
                    ))}
                  </tr>
                );
              }

              // L5: render dynamic sub-rows from actual data
              if (rowDef.level === 5) {
                if (menuContexts.length === 0) {
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

                return menuContexts.map((ctx) => (
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
                        fallback={resolveEffectivePrice({
                          globalPrice: matrix.globalPrice,
                          // Exclude this cell's own L5 row: the button offers
                          // the price this cell would fall back to.
                          rows: matrix.levels.filter((row) => row.level !== 5),
                          locationId: loc.id,
                          categoryId: ctx.categoryId,
                          menuId: ctx.menuId,
                        })}
                        // Cash follows the same cascade, on cash values only.
                        inheritedCashPrice={
                          matrix.globalCashPrice == null
                            ? null
                            : resolveEffectivePrice({
                                globalPrice: matrix.globalCashPrice,
                                rows: matrix.levels
                                  .filter((row) => row.level !== 5)
                                  .map((row) => ({
                                    ...row,
                                    price: row.cashPrice,
                                  })),
                                locationId: loc.id,
                                categoryId: ctx.categoryId,
                                menuId: ctx.menuId,
                              }).price
                        }
                        row={
                          matrix.levels.find(
                            (row) =>
                              row.level === 5 &&
                              row.locationId === loc.id &&
                              row.menuId === ctx.menuId &&
                              row.categoryId === ctx.categoryId,
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
                    row={findRow(matrix.levels, rowDef.level, null)}
                    globalBasePrice={matrix.globalPrice}
                  />
                  {locations.map((loc) => (
                    <MatrixCell
                      key={loc.id}
                      itemId={itemId}
                      level={rowDef.level}
                      locationId={loc.id}
                      locationName={loc.name}
                      row={findRow(matrix.levels, rowDef.level, loc.id)}
                      globalBasePrice={matrix.globalPrice}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
          {/*
            Effective price is only defined inside a menu: the POS resolves it
            via get_menu_with_categories, which joins the local-menu override on
            `menu_id = m.id`. A location with prices in several menus therefore
            charges several prices at once, so we render one row per menu rather
            than collapsing them into a single arbitrary number.
          */}
          <tfoot className="sticky bottom-0 z-30 bg-muted">
            {pricedMenus.length === 0 ? (
              <tr className="border-t">
                <td className="sticky left-0 z-40 border-r bg-muted px-3 py-2 text-xs font-semibold">
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
            ) : (
              pricedMenus.map((menu) => (
                <tr key={menu.menuId} className="border-t">
                  <td className="sticky left-0 z-40 border-r bg-muted px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold">Effective</span>
                      <span className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground">
                        <BookOpen className="h-3 w-3 shrink-0" />
                        <span className="min-w-0 break-words">
                          on {menu.menuName}
                        </span>
                      </span>
                    </div>
                  </td>
                  <EffectiveCell
                    globalPrice={matrix.globalPrice}
                    overrides={matrix.levels}
                    locationId={null}
                    menuId={menu.menuId}
                  />
                  {locations.map((loc) => (
                    <EffectiveCell
                      key={loc.id}
                      globalPrice={matrix.globalPrice}
                      overrides={matrix.levels}
                      locationId={loc.id}
                      menuId={menu.menuId}
                    />
                  ))}
                </tr>
              ))
            )}
          </tfoot>
        </table>
      </div>

      {/* Legend: stacks vertically on mobile, spreads onto one row from sm up. */}
      <div className="flex flex-col gap-2 rounded-2xl border bg-muted/20 p-3 text-[11px] text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
        <span className="flex items-center gap-1.5">
          <span className="font-mono">↓</span> inherits from above
        </span>
        <span className="flex items-center gap-1.5">
          <Pencil className="h-3 w-3 shrink-0" /> override exists: click to edit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono">—</span> not applicable
        </span>
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

  // Non-applicable combos. L1/L2/L4 are global (they have no per-location
  // value); L3/L5 are location-scoped (they have no "All" value).
  const isNA =
    (level === 1 && locationId !== null) ||
    (level === 2 && locationId !== null) ||
    (level === 3 && locationId === null) ||
    (level === 4 && locationId !== null) ||
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

  // Only L1 has a correct inline write path here: InlinePriceEditor's non-L5
  // branch routes to UpdateMenuItem, which writes menu_items /
  // location_item_overrides — NOT the category tables backing L2/L3/L4. Making
  // those rows editable would silently write the price to the wrong table, so
  // they stay read-only until dedicated upserts exist. (L5 has its own action
  // and is handled by L5MatrixCell.)
  const supportsInlineEdit = level === 1;

  return (
    <td className="border-r px-1 py-1 text-center">
      {hasOverride ? (
        supportsInlineEdit ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="flex w-full flex-col items-center gap-0.5 rounded px-2 py-1 text-sm font-semibold tabular-nums hover:bg-muted"
              >
                {formatPrice(row!.price)}
                <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                  <Pencil className="h-2 w-2" /> override
                </span>
              </button>
            </DialogTrigger>
            <DialogContent
              showCloseButton={false}
              className="w-[340px] max-w-[calc(100%-2rem)] gap-0 rounded-3xl p-4 max-sm:bottom-auto max-sm:left-1/2 max-sm:right-auto max-sm:top-1/2 max-sm:h-auto max-sm:w-[260px] max-sm:max-w-[calc(100%-2rem)] max-sm:-translate-x-1/2 max-sm:-translate-y-1/2 max-sm:rounded-3xl max-sm:p-3"
            >
              <DialogTitle className="sr-only">Edit price</DialogTitle>
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
            </DialogContent>
          </Dialog>
        ) : (
          <div className="flex w-full flex-col items-center gap-0.5 px-2 py-1 text-sm font-semibold tabular-nums">
            {formatPrice(row!.price)}
            <span className="text-[9px] text-muted-foreground">
              {SOURCE_LABEL[level]}
            </span>
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
  fallback,
  inheritedCashPrice,
  row,
}: {
  itemId: string;
  locationId: string;
  locationName: string;
  menuId: string;
  menuName: string;
  categoryId: string;
  categoryName: string;
  /** Price this cell reverts to, and which level supplies it. */
  fallback: ResolvedPrice;
  /** Cash price inherited when this cell's cash field is left blank. */
  inheritedCashPrice: number | null;
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
        description: `${menuName} at ${locationName} now uses the ${
          SOURCE_LABEL[fallback.level]
        } price (${formatPrice(fallback.price)}).`,
      });
      queryClient.invalidateQueries({ queryKey: ["item-price-matrix", itemId] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      invalidateOrderOutSync(queryClient);
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
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
        </DialogTrigger>
        <DialogContent
          showCloseButton={false}
          className="w-[360px] max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-3xl p-4 [&>*]:min-w-0 max-sm:bottom-auto max-sm:left-1/2 max-sm:right-auto max-sm:top-1/2 max-sm:h-auto max-sm:w-[280px] max-sm:max-w-[calc(100%-2rem)] max-sm:-translate-x-1/2 max-sm:-translate-y-1/2 max-sm:rounded-3xl max-sm:p-3"
        >
          <DialogTitle className="sr-only">Edit menu price override</DialogTitle>
          {/* Names here are merchant-supplied and can be long; break them
              rather than letting them widen the fixed-width dialog. */}
          <div className="mb-3 min-w-0 rounded-2xl bg-rose-50 px-3 py-2 max-sm:mb-2">
            <p className="break-words text-xs font-semibold text-rose-700 max-sm:text-[10px]">
              {menuName} menu at {locationName}
            </p>
            <p className="break-words text-xs text-rose-600 max-sm:text-[10px]">
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
            inheritedCashPrice={inheritedCashPrice}
            onClose={() => setOpen(false)}
          />
          {hasOverride && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2 h-auto w-full justify-center gap-2 whitespace-normal py-1.5 text-center text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              )}
              Return to {SOURCE_LABEL[fallback.level]} price (
              {formatPrice(fallback.price)})
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </td>
  );
}

/**
 * Computes what a customer actually pays at a given location, walking the full
 * cascade: L5 > L4 > L3 > L2 > L1 ("most specific wins"). Resolution lives in
 * lib/menu/resolve-effective-price.ts so it stays in lockstep with the DB and
 * is unit-tested independently of this grid.
 */
function EffectiveCell({
  globalPrice,
  overrides,
  locationId,
  menuId,
}: {
  globalPrice: number;
  overrides: PriceMatrixRow[];
  locationId: string | null;
  /** Resolve within this menu — how the POS prices an order. */
  menuId?: string | null;
}) {
  const { price, level } = resolveEffectivePrice({
    globalPrice,
    rows: overrides,
    locationId,
    menuId,
  });

  return (
    <td className="border-r bg-muted px-3 py-2 text-center">
      <div className="flex flex-col items-center">
        <span className="text-sm font-semibold tabular-nums">
          {formatPrice(price)}
        </span>
        <span className="text-[9px] text-muted-foreground">
          {SOURCE_LABEL[level]}
        </span>
      </div>
    </td>
  );
}

export default PriceMatrixGrid;
