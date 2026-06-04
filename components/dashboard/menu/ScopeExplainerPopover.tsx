"use client";

import * as React from "react";
import { Info, ArrowRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  scopeIcon,
  scopeColor,
  type CascadeLevel,
} from "@/lib/menu/cascade-labels";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { useRoleAwareScopeCopy } from "@/lib/menu/useRoleAwareScope";

interface ScopeExplainerPopoverProps {
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  /** Optional category name to highlight L3/L4 rungs with real labels */
  categoryName?: string | null;
  /** Optional menu name to highlight L5 with a real label */
  menuName?: string | null;
}

const LEVELS: CascadeLevel[] = [1, 2, 3, 4, 5];

function rungLabel(level: CascadeLevel, args: {
  locationName?: string | null;
  categoryName?: string | null;
  menuName?: string | null;
}): string {
  switch (level) {
    case 1:
      return "Global default";
    case 2:
      return args.locationName
        ? `${args.locationName} override`
        : "Location override";
    case 3:
      return args.categoryName
        ? `${args.categoryName} default`
        : "Category default";
    case 4:
      if (args.categoryName && args.locationName) {
        return `${args.categoryName} at ${args.locationName}`;
      }
      return "Category at location";
    case 5:
      if (args.menuName && args.locationName) {
        return `${args.menuName} menu at ${args.locationName}`;
      }
      return "Menu at location";
  }
}

/**
 * Small "ⓘ What does this mean?" popover that explains the 5-level price
 * cascade in merchant-facing language. Rendered inline — no route change.
 */
export function ScopeExplainerPopover({
  trigger,
  align = "end",
  categoryName,
  menuName,
}: ScopeExplainerPopoverProps) {
  const { selectedLocationId, locations } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const currentLocationName = React.useMemo(() => {
    if (isAllLocations) return "All Locations";
    return (
      locations.find((l) => l.id === selectedLocationId)?.name || "this location"
    );
  }, [isAllLocations, locations, selectedLocationId]);

  const rawActiveLevel: CascadeLevel = isAllLocations ? 1 : 2;
  const vm = useRoleAwareScopeCopy({ level: rawActiveLevel });
  const activeLevel = vm.effectiveScope.level;
  const grayed = new Set<CascadeLevel>(vm.ladder.grayedLevels);

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-label="How pricing works"
          >
            <Info className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">How pricing works</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(340px,calc(100vw-2rem))] p-0">
        <div className="border-b px-4 py-3">
          <h4 className="text-sm font-semibold leading-none">
            How pricing works in Dexa
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Each item has up to 5 prices. The most specific one wins.
          </p>
        </div>
        {vm.ladder.replaceWithMessage ? (
          <div className="px-4 py-4">
            <p className="text-xs text-muted-foreground">
              {vm.ladder.replaceWithMessage}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 px-3 py-3">
            {LEVELS.map((level) => {
              const Icon = scopeIcon(level);
              const colors = scopeColor(level);
              const isActive = level === activeLevel;
              const isGrayed = grayed.has(level);
              return (
                <div
                  key={level}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors",
                    isActive
                      ? cn(colors.bg, colors.border, colors.text)
                      : "border-transparent text-muted-foreground",
                    isGrayed && "opacity-50",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 leading-tight">
                    {rungLabel(level, {
                      locationName: currentLocationName,
                      categoryName,
                      menuName,
                    })}
                  </span>
                  {isGrayed && (
                    <span className="text-[10px] font-medium opacity-80">
                      view-only
                    </span>
                  )}
                  {!isGrayed && level === 1 && (
                    <span className="text-[10px] opacity-70">starts here</span>
                  )}
                  {!isGrayed && level === 5 && (
                    <span className="text-[10px] font-semibold">most wins</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="border-t bg-muted/30 px-4 py-2.5">
          <p className="text-[11px] text-muted-foreground">
            Today you're viewing:{" "}
            <span className="font-medium text-foreground">
              {currentLocationName}
            </span>
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <ArrowRight className="h-3 w-3" />
            Change the scope by switching locations in the strip above.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default ScopeExplainerPopover;
