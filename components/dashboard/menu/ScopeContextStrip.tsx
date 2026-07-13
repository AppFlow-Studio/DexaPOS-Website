"use client";

import * as React from "react";
import { Globe, MapPin, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useIsAllLocations,
  useSelectedLocation,
  useIsSingleLocation,
} from "@/stores/location-store";
import { scopeColor, deriveScopeFromContext } from "@/lib/menu/cascade-labels";
import { useRoleAwareScopeCopy } from "@/lib/menu/useRoleAwareScope";
import { ScopeExplainerPopover } from "./ScopeExplainerPopover";

interface ScopeContextStripProps {
  /**
   * Optional contextual names that flow into the explainer popover so the
   * cascade illustration shows real category/menu names instead of placeholders.
   */
  categoryName?: string | null;
  menuName?: string | null;
  className?: string;
}

/**
 * Top-of-page strip that makes the current location scope + its
 * blast-radius visible on every /dashboard/menu/** page.
 *
 * - All Locations: emerald strip ("Edits here affect the Global default...")
 * - Specific Location: blue strip ("Edits here affect Downtown only...")
 *
 * Includes a "change" dropdown (mirrors the top-bar picker, but lives inline
 * on the page so merchants never have to hunt for it) and a "How pricing
 * works" popover.
 */
export function ScopeContextStrip({
  categoryName,
  menuName,
  className,
}: ScopeContextStripProps) {
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();
  const isSingleLocation = useIsSingleLocation();

  // Hooks must run unconditionally on every render. `isSingleLocation` flips
  // false→true once the persisted location store rehydrates, so any hook placed
  // AFTER the single-location early return below would change the hook count
  // between renders → React error #300. Compute scope + role-aware copy here,
  // before the early return. (deriveScopeFromContext is a plain function.)
  const rawScope = deriveScopeFromContext({
    isAllLocations,
    locationName: selectedLocation?.name,
    categoryName,
    menuName,
  });
  const vm = useRoleAwareScopeCopy(rawScope);

  // Single-location accounts manage one menu (the core). No multi-location
  // framing: a neutral "Menu" strip, no globe, and no pricing-cascade explainer
  // (there are no overrides to explain).
  if (isSingleLocation) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2.5",
          className,
        )}
        role="region"
        aria-label="Editing scope"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/60 dark:bg-black/20">
          <Store className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold">Menu</span>
          <p className="text-[11px] leading-tight text-muted-foreground">
            Edits update your menu
          </p>
        </div>
      </div>
    );
  }

  const colors = scopeColor(vm.effectiveScope.level);
  const Icon = vm.effectiveScope.level === 1 ? Globe : MapPin;

  const locationName = vm.strip.primaryLabel;
  const secondary = vm.strip.secondaryLabel;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        colors.bg,
        colors.border,
        colors.text,
        className,
      )}
      role="region"
      aria-label="Editing scope"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            "bg-white/60 dark:bg-black/20",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">
              {locationName}
            </span>
          </div>
          <p className="text-[11px] leading-tight opacity-80 truncate">
            {secondary}
          </p>
        </div>
      </div>

      <div className="shrink-0 self-end sm:self-center">
        <ScopeExplainerPopover
          categoryName={categoryName}
          menuName={menuName}
        />
      </div>
    </div>
  );
}

export default ScopeContextStrip;
