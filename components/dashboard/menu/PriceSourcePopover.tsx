"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCcw, Grid3x3, ArrowRight, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  scopeColor,
  scopeIcon,
  type CascadeLevel,
  type ScopeContext,
} from "@/lib/menu/cascade-labels";
import { InlinePriceEditor } from "./InlinePriceEditor";
import { useItemPriceMatrix } from "@/app/dashboard/hooks/useLocationScoped";
import { ResetMenuItemToGlobal } from "@/app/dashboard/actions/menu-items";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";

interface PriceSourcePopoverProps {
  itemId: string;
  /** The price currently displayed next to this popover */
  currentPrice: number;
  /** Effective cash price, so the edit pane prefills instead of looking unset */
  currentCashPrice?: number | null;
  /** Scope that produced currentPrice (from effective_price_source) */
  sourceLevel: CascadeLevel;
  /** Optional location id of the displayed price (for removing an L2 override) */
  locationId?: string | null;
  /** Scope context for the edit action, derived from list row context */
  editScope: ScopeContext;
  /** Whether the current scope allows removing the override (L2+) */
  canRemoveOverride?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Controlled open state, for opening this from an external menu item. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Which pane to show when it opens — "edit" jumps straight to Adjust price. */
  initialMode?: "view" | "edit";
}

function formatPrice(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

/**
 * Hover/click popover attached to every price displayed in menu lists.
 * Shows the cascade ladder, source of the winning price, and 1-click
 * actions to edit, remove the override, or open the full Price Matrix.
 */
export function PriceSourcePopover({
  itemId,
  currentPrice,
  currentCashPrice,
  sourceLevel,
  locationId,
  editScope,
  canRemoveOverride = false,
  children,
  className,
  open: openProp,
  onOpenChange,
  initialMode = "view",
}: PriceSourcePopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  // Controlled when a parent passes `open`, otherwise self-managed.
  const open = openProp ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const [mode, setMode] = React.useState<"view" | "edit">(initialMode);

  // Reset to the caller's pane on each open. Keyed off the open transition only
  // — `initialMode` is deliberately not a dependency, because the caller sets it
  // in the same tick as `open`, and re-running here would fight the user if they
  // switch panes while it is open.
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpenRef.current) setMode(initialMode);
    wasOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const queryClient = useQueryClient();

  const matrixQuery = useItemPriceMatrix(open ? itemId : null);

  const sourceColors = scopeColor(sourceLevel);
  const SourceIcon = scopeIcon(sourceLevel);

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!locationId) throw new Error("Missing location for override removal");
      const res = await ResetMenuItemToGlobal(itemId, locationId);
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Override removed", {
        description: "Item now uses the global price at this location.",
      });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["item-price-matrix", itemId] });
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      invalidateOrderOutSync(queryClient);
      setOpen(false);
    },
    onError: (err) => {
      toast.error("Remove failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const matrix = matrixQuery.data;
  const globalPrice = matrix?.globalPrice ?? null;

  // Resolve the L2 rung (global category default) for the displayed context.
  // L2 is not location-scoped — it applies across every location.
  const l2Override = React.useMemo(() => {
    if (!matrix) return null;
    return (
      matrix.levels.find(
        (r) =>
          r.level === 2 &&
          (!editScope.categoryName || r.categoryName === editScope.categoryName),
      ) ?? null
    );
  }, [matrix, editScope.categoryName]);

  const sourceLabel = (() => {
    switch (sourceLevel) {
      case 1:
        return "Global";
      case 2:
        return editScope.categoryName
          ? `${editScope.categoryName} category`
          : "Category default";
      case 3:
        if (editScope.categoryName && editScope.locationName) {
          return `${editScope.categoryName} at ${editScope.locationName}`;
        }
        return "Category at location";
      case 4:
        if (editScope.menuName && editScope.categoryName) {
          return `${editScope.menuName} menu – ${editScope.categoryName}`;
        }
        return editScope.menuName
          ? `${editScope.menuName} menu`
          : "Menu category";
      case 5:
        if (editScope.menuName && editScope.locationName) {
          return `${editScope.menuName} menu at ${editScope.locationName}`;
        }
        if (editScope.menuName) return `${editScope.menuName} menu`;
        if (editScope.locationName) return `Menu at ${editScope.locationName}`;
        return "Menu at location";
    }
  })();

  return (
    <Popover
      // Modal when driven from an external menu: the dismiss layer then ignores
      // the click that is still in flight from that menu, instead of racing it.
      modal={openProp !== undefined}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setMode(initialMode);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "-mx-1 inline-flex items-center gap-1 rounded-full px-1 text-left transition-colors hover:bg-muted/50",
            className,
          )}
          aria-label={`Price source: ${sourceLabel}`}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="w-[268px] overflow-hidden rounded-2xl p-0"
        // Radix restores focus to the dropdown item that opened this popover,
        // which its dismiss layer then reads as a focus-out and closes on. The
        // popover manages its own focus, so suppress that restore.
        onOpenAutoFocus={(event) => {
          if (openProp !== undefined) event.preventDefault();
        }}
      >
        <div className="border-b border-border/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold tabular-nums">
                {formatPrice(currentPrice)}
              </p>
              <p
                className={cn(
                  "mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  sourceColors.bg,
                  sourceColors.text,
                )}
              >
                <SourceIcon className="h-2.5 w-2.5" />
                {sourceLabel}
              </p>
            </div>
          </div>
        </div>

        {mode === "view" ? (
          <>
            <div className="px-3 py-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cascade
              </p>
              {matrixQuery.isLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="space-y-1">
                  <CascadeRow
                    label="Global"
                    price={globalPrice}
                    isWinner={sourceLevel === 1}
                    level={1}
                  />
                  <CascadeRow
                    label={
                      l2Override?.categoryName ??
                      editScope.categoryName ??
                      "Category default"
                    }
                    price={l2Override?.price ?? null}
                    isWinner={sourceLevel === 2}
                    level={2}
                  />
                  {sourceLevel > 2 && (
                    <CascadeRow
                      label={sourceLabel}
                      price={currentPrice}
                      isWinner
                      level={sourceLevel}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1 border-t border-border/60 bg-muted/60 p-2">
              {canRemoveOverride && locationId && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 justify-start gap-2 rounded-full text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => removeMutation.mutate()}
                  disabled={removeMutation.isPending}
                >
                  {removeMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Remove override (revert to {formatPrice(globalPrice)})
                </Button>
              )}
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="h-7 justify-start gap-2 rounded-full text-xs"
              >
                <Link
                  href={`/dashboard/menu/items/${itemId}/pricing`}
                  onClick={() => setOpen(false)}
                >
                  <Grid3x3 className="h-3.5 w-3.5" />
                  Open full pricing matrix
                  <ArrowRight className="ml-auto h-3 w-3" />
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <div className="px-4 py-3">
            <InlinePriceEditor
              itemId={itemId}
              scope={editScope}
              locationId={locationId ?? null}
              initialPrice={currentPrice}
              initialCashPrice={currentCashPrice ?? null}
              onClose={() => setMode("view")}
              onSaved={() => setOpen(false)}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function CascadeRow({
  label,
  price,
  isWinner,
  level,
}: {
  label: string;
  price: number | null;
  isWinner: boolean;
  level: CascadeLevel;
}) {
  const colors = scopeColor(level);
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-full px-2.5 py-1 text-xs",
        isWinner
          ? cn(colors.bg, "font-semibold", colors.text)
          : "text-muted-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="tabular-nums">
        {price != null ? formatPrice(price) : "not set"}
        {isWinner && <span className="ml-1.5 text-[10px]">← wins</span>}
      </span>
    </div>
  );
}

export default PriceSourcePopover;
