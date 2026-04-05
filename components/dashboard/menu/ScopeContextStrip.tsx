"use client";

import * as React from "react";
import { ChevronDown, Globe, Building2, MapPin } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useLocationStore,
  useIsAllLocations,
  useSelectedLocation,
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
  const { locations, setSelectedLocation } = useLocationStore();

  const rawScope = deriveScopeFromContext({
    isAllLocations,
    locationName: selectedLocation?.name,
    categoryName,
    menuName,
  });
  const vm = useRoleAwareScopeCopy(rawScope);

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-6 gap-0.5 px-1.5 text-[11px] font-medium",
                    colors.text,
                    "hover:bg-white/50 dark:hover:bg-black/20",
                  )}
                >
                  change <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel className="flex items-center gap-2 text-xs">
                  <MapPin className="h-3.5 w-3.5" />
                  Switch location
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {vm.strip.showAllLocationsOption && (
                  <DropdownMenuItem
                    onClick={() => setSelectedLocation("all")}
                    className={cn(
                      "cursor-pointer gap-2",
                      isAllLocations && "bg-accent",
                    )}
                  >
                    <Building2 className="h-4 w-4" />
                    All Locations
                  </DropdownMenuItem>
                )}
                {vm.strip.showAllLocationsOption && locations.length > 0 && (
                  <DropdownMenuSeparator />
                )}
                {locations.map((loc) => (
                  <DropdownMenuItem
                    key={loc.id}
                    onClick={() => setSelectedLocation(loc.id)}
                    className={cn(
                      "cursor-pointer gap-2",
                      selectedLocation?.id === loc.id && "bg-accent",
                    )}
                  >
                    <MapPin className="h-4 w-4" />
                    {loc.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
