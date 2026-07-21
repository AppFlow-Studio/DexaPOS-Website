"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, RotateCcw, Grid3x3, ArrowRight, Loader2 } from "lucide-react";
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
  sourceLevel,
  locationId,
  editScope,
  canRemoveOverride = false,
  children,
  className,
}: PriceSourcePopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"view" | "edit">("view");
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

  // Resolve L2 override (if any) for the displayed locationId
  const l2Override = React.useMemo(() => {
    if (!matrix || !locationId) return null;
    return (
      matrix.levels.find(
        (r) => r.level === 2 && r.locationId === locationId,
      ) ?? null
    );
  }, [matrix, locationId]);

  const sourceLabel = (() => {
    switch (sourceLevel) {
      case 1:
        return "Global";
      case 2:
        return editScope.locationName
          ? `${editScope.locationName} override`
          : "Location override";
      case 3:
        return editScope.categoryName
          ? `${editScope.categoryName} category`
          : "Category default";
      case 4:
        return "Category at location";
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
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setMode("view");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded hover:bg-muted/50 px-1 -mx-1 transition-colors text-left",
            className,
          )}
          aria-label={`Price source: ${sourceLabel}`}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-0">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{formatPrice(currentPrice)}</p>
              <p
                className={cn(
                  "mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  sourceColors.bg,
                  sourceColors.border,
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
            <div className="px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                      editScope.locationName
                        ? `${editScope.locationName} override`
                        : "Location override"
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
            <div className="flex flex-col gap-1 border-t bg-muted/20 p-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 justify-start gap-2 text-xs"
                onClick={() => setMode("edit")}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit this override
              </Button>
              {canRemoveOverride && locationId && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 justify-start gap-2 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-800"
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
                className="h-7 justify-start gap-2 text-xs"
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
        "flex items-center justify-between rounded px-2 py-1 text-xs",
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
