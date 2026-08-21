"use client";

import * as React from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  scopeIcon,
  scopeColor,
  scopeShortName,
  type CascadeLevel,
  type ScopeContext,
} from "@/lib/menu/cascade-labels";
import { useItemPriceMatrix } from "@/app/dashboard/hooks/useLocationScoped";

interface CascadeLadderProps {
  itemId: string;
  /** Current editing scope — used to decide which rung is active */
  context: ScopeContext;
  /** The currently selected location (if any) — used to pick the matching L2/L4/L5 rows */
  locationId?: string | null;
  /** If true renders the compact 4-rung form (no labels) */
  compact?: boolean;
  className?: string;
}

interface Rung {
  level: CascadeLevel;
  label: string;
  price: number | null;
}

function formatPrice(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

/**
 * 1-line horizontal cascade visualization replacing the old vertical
 * PriceBreakdown inside the item form. Renders every cascade level for
 * a single item, with arrows between rungs and the winning rung glowing.
 *
 * Losing levels with no override are muted and show "—".
 */
export function CascadeLadder({
  itemId,
  context,
  locationId,
  compact = false,
  className,
}: CascadeLadderProps) {
  const { data: matrix, isLoading } = useItemPriceMatrix(itemId);

  // Build the rungs for the 5 levels relative to (locationId, categoryName, menuName)
  const rungs: Rung[] = React.useMemo(() => {
    if (!matrix) return [];

    // L1
    const l1: Rung = {
      level: 1,
      label: "Global",
      price: matrix.globalPrice,
    };
    // L2 — global category (category_items, no menu/location scope)
    const l2Row = context.categoryName
      ? matrix.levels.find(
          (r) => r.level === 2 && r.categoryName === context.categoryName,
        ) ?? null
      : matrix.levels.find((r) => r.level === 2) ?? null;
    const l2: Rung = {
      level: 2,
      label: l2Row?.categoryName ?? context.categoryName ?? "Category",
      price: l2Row?.price ?? null,
    };
    // L3 — local category (location_category_item_overrides)
    const l3Row =
      locationId != null
        ? matrix.levels.find(
            (r) =>
              r.level === 3 &&
              r.locationId === locationId &&
              (!context.categoryName ||
                r.categoryName === context.categoryName),
          ) ?? null
        : null;
    const l3: Rung = {
      level: 3,
      label: context.locationName
        ? `Cat @ ${context.locationName}`
        : "Cat @ Loc",
      price: l3Row?.price ?? null,
    };
    // L4 — global menu (category_items scoped to a menu, all locations)
    const l4Row = matrix.levels.find(
      (r) =>
        r.level === 4 &&
        (!context.menuName || r.menuName === context.menuName) &&
        (!context.categoryName || r.categoryName === context.categoryName),
    ) ?? null;
    const l4: Rung = {
      level: 4,
      label: context.menuName ? `${context.menuName} menu` : "Menu",
      price: l4Row?.price ?? null,
    };
    // L5 — location_menu_item_overrides
    const l5Row =
      locationId != null
        ? matrix.levels.find(
            (r) =>
              r.level === 5 &&
              r.locationId === locationId &&
              (!context.menuName || r.menuName === context.menuName) &&
              (!context.categoryName ||
                r.categoryName === context.categoryName),
          ) ?? null
        : null;
    const l5: Rung = {
      level: 5,
      label: context.menuName ? `${context.menuName} @ Loc` : "Menu @ Loc",
      price: l5Row?.price ?? null,
    };

    return [l1, l2, l3, l4, l5];
  }, [matrix, locationId, context.locationName, context.categoryName, context.menuName]);

  // Resolve the winning level (highest-numbered rung with a price) — this matches
  // "most specific wins" in the cascade.
  const winningLevel = React.useMemo<CascadeLevel>(() => {
    for (let i = rungs.length - 1; i >= 0; i--) {
      if (rungs[i].price != null) {
        return rungs[i].level;
      }
    }
    return 1;
  }, [rungs]);

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin" /> Loading cascade…
      </div>
    );
  }

  if (rungs.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 flex-wrap",
        className,
      )}
      role="group"
      aria-label="Price cascade"
    >
      {rungs.map((rung, idx) => {
        const isWinner = rung.level === winningLevel;
        const Icon = scopeIcon(rung.level);
        const colors = scopeColor(rung.level);
        const isSet = rung.price != null;
        return (
          <React.Fragment key={rung.level}>
            <div
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 min-w-[64px] transition-all",
                isWinner
                  ? cn(colors.bg, colors.border, colors.text, "shadow-sm ring-2 ring-offset-1", colors.border)
                  : "border-dashed border-muted-foreground/20 text-muted-foreground",
                !isSet && !isWinner && "opacity-60",
              )}
              title={`${scopeShortName(rung.level)}${rung.label !== scopeShortName(rung.level) ? ` — ${rung.label}` : ""}`}
            >
              <Icon className="h-3 w-3" />
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  !isSet && "line-through",
                )}
              >
                {formatPrice(rung.price)}
              </span>
              {!compact && (
                <span className="text-[9px] leading-tight text-center max-w-[80px] truncate">
                  {rung.label}
                </span>
              )}
            </div>
            {idx < rungs.length - 1 && (
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default CascadeLadder;
