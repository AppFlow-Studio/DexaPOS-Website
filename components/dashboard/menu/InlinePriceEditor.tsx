"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AffectsTag } from "./AffectsTag";
import type { ScopeContext } from "@/lib/menu/cascade-labels";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { UpdateMenuItem } from "@/app/dashboard/actions/menu-items";
import { updateLocationMenuCategoryItemOverride } from "@/app/dashboard/actions/menu-items-rpc";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";
import { deriveCashPrice } from "@/lib/pricing";
import { useMerchantPricingStrategies } from "@/app/dashboard/hooks/useMerchantPricingStrategies";

interface InlinePriceEditorProps {
  itemId: string;
  scope: ScopeContext;
  /** The scope's location id (null for global / L3). */
  locationId: string | null;
  /** Menu id — required for L5 (menu+location) overrides. */
  menuId?: string | null;
  /** Category id — required for L5 (menu+location) overrides. */
  categoryId?: string | null;
  initialPrice: number | null;
  initialCashPrice?: number | null;
  /**
   * Cash price this scope inherits when the field is left blank. Shown in the
   * placeholder so an empty box reads as "inherits $X" rather than just "empty".
   */
  inheritedCashPrice?: number | null;
  onClose?: () => void;
  onSaved?: () => void;
  className?: string;
}

/**
 * Tiny 2-field inline editor (price + cash price) that writes to the
 * scope represented by `scope`. Used from PriceSourcePopover and the
 * Price Matrix cells.
 *
 * For now it routes everything through UpdateMenuItem, which already
 * correctly splits writes between menu_items (L1) and location_item_overrides
 * (L2). L3/L4/L5 writes from matrix cells flow through the same function
 * because UpdateMenuItem doesn't own L3/L4/L5 today — matrix cells for those
 * levels will later call dedicated upsert functions in a follow-up.
 * Keeping the mutation funnel in one place keeps the UI surface simple.
 */
export function InlinePriceEditor({
  itemId,
  scope,
  locationId,
  menuId,
  categoryId,
  initialPrice,
  initialCashPrice,
  inheritedCashPrice,
  onClose,
  onSaved,
  className,
}: InlinePriceEditorProps) {
  const clerkOrgId = useClerkOrgId();
  const queryClient = useQueryClient();
  const [price, setPrice] = React.useState<string>(
    initialPrice != null ? String(initialPrice) : "",
  );
  const [cashPrice, setCashPrice] = React.useState<string>(
    initialCashPrice != null ? String(initialCashPrice) : "",
  );

  // Once the user edits (or clears) the cash field, stop auto-deriving it from
  // card — mirrors PriceInputGroup so "leave blank to inherit" is preserved.
  const [cashTouched, setCashTouched] = React.useState(false);

  // Resolve this scope's location dual-pricing config so a dual location's cash
  // override tracks card at card ÷ (1 + pct/100). Global (no-location) scopes
  // have no single pct, so they don't auto-derive.
  const { data: stratResp } = useMerchantPricingStrategies(
    clerkOrgId,
    !!locationId,
  );
  const locStrategy = locationId
    ? stratResp?.data?.find((s) => s.id === locationId) ?? null
    : null;
  const autoDerive =
    locStrategy?.pricing_strategy === "dual" &&
    (locStrategy?.dual_pricing_percentage ?? 0) > 0;
  const dualPct = locStrategy?.dual_pricing_percentage ?? 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = parseFloat(price);
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new Error("Enter a valid price");
      }
      const parsedCash = cashPrice === "" ? undefined : parseFloat(cashPrice);
      if (parsedCash !== undefined && (Number.isNaN(parsedCash) || parsedCash < 0)) {
        throw new Error("Enter a valid cash price");
      }

      // L5: Location + Menu + Category — route through dedicated server action
      if (scope.level === 5 && locationId && menuId && categoryId) {
        const result = await updateLocationMenuCategoryItemOverride(
          locationId,
          menuId,
          categoryId,
          itemId,
          {
            customPrice: parsed,
            customCashPrice: parsedCash ?? null,
          },
        );
        if (!result.success) throw new Error(result.error || "Update failed");
        return result;
      }

      // L1/L2: Route through UpdateMenuItem
      const result = await UpdateMenuItem(
        itemId,
        { price: parsed, ...(parsedCash !== undefined ? { cash_price: parsedCash } : {}) },
        scope.level === 1 ? null : locationId,
      );
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success("Price updated");
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["item-price-matrix", itemId] });
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      // The menu detail page (/dashboard/menu/[menuId]) reads its rows from
      // these; without them an edited price only appeared after a manual reload.
      queryClient.invalidateQueries({ queryKey: ["menu-with-categories"] });
      queryClient.invalidateQueries({ queryKey: ["menu-basic"] });
      invalidateOrderOutSync(queryClient);
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      toast.error("Update failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  return (
    <form
      className={cn("space-y-3", className)}
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="inline-price" className="text-xs">
          Price
        </Label>
        <Input
          id="inline-price"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={price}
          onChange={(e) => {
            const next = e.target.value;
            setPrice(next);
            // Dual location: keep cash tracking card until the user takes over.
            if (autoDerive && !cashTouched) {
              const parsedCard = parseFloat(next);
              setCashPrice(
                Number.isFinite(parsedCard) && parsedCard > 0
                  ? String(deriveCashPrice(parsedCard, dualPct))
                  : "",
              );
            }
          }}
          className="h-8 text-sm"
          autoFocus
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inline-cash-price" className="text-xs">
          Cash price{" "}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="inline-cash-price"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={cashPrice}
          onChange={(e) => {
            setCashPrice(e.target.value);
            setCashTouched(true);
          }}
          className="h-8 text-sm"
          placeholder={
            inheritedCashPrice != null
              ? `Inherits $${inheritedCashPrice.toFixed(2)}`
              : "Leave blank for default"
          }
        />
        {autoDerive && (
          <p className="text-[10px] text-muted-foreground">
            Auto-set to card ÷ (1 + {dualPct}%) — edit to override.
          </p>
        )}
      </div>
      <div className="flex flex-col items-center gap-2 pt-1">
        <AffectsTag ctx={scope} variant="inline" />
        <div className="flex items-center gap-2">
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            className="h-7 text-xs"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

export default InlinePriceEditor;
