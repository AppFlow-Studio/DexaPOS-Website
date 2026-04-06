"use client";

import * as React from "react";
import { Info, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { useRoleAwareScopeCopy } from "@/lib/menu/useRoleAwareScope";

interface DisabledFieldBannerProps {
  /** Human-readable location name at which we're currently editing */
  locationName?: string | null;
  /**
   * Fields that are disabled at this scope. Defaults to the usual trio.
   */
  fields?: string[];
  /**
   * Called when the user clicks "Open Global edit". If not provided the
   * banner will switch location to "all" via useLocationStore and the
   * consuming form is expected to re-fetch.
   */
  onOpenGlobal?: () => void;
  className?: string;
}

/**
 * Shown at the top of an item form when the user is editing at a
 * non-global scope (L2+). Explains why certain fields are disabled
 * and offers a 1-click route into the Global edit.
 */
export function DisabledFieldBanner({
  locationName,
  fields = ["name", "photo", "description"],
  onOpenGlobal,
  className,
}: DisabledFieldBannerProps) {
  const setSelectedLocation = useLocationStore(
    (s) => s.setSelectedLocation,
  );
  const isAllLocations = useIsAllLocations();

  // Derive raw scope from the current location context so the hook knows
  // whether we're sitting at L1 (all) or L2 (specific). The banner itself
  // is always L2-style (editing at a specific location), so we pass L2.
  const vm = useRoleAwareScopeCopy({
    level: isAllLocations ? 1 : 2,
    locationName,
  });

  const handleOpenGlobal = () => {
    if (onOpenGlobal) {
      onOpenGlobal();
      return;
    }
    setSelectedLocation("all");
  };

  const fieldList =
    fields.length <= 2
      ? fields.join(" or ")
      : `${fields.slice(0, -1).join(", ")}, or ${fields[fields.length - 1]}`;

  // Owner copy interpolates the field list; the hook's ready-made copy for
  // managers / members already names the locked fields in the plan copy.
  const ownerExplainer = `You're editing this item for ${
    locationName || "this location"
  } only. To change the ${fieldList}, edit the Global version.`;

  const body =
    vm.role.isOwner || (!vm.role.isManager && !vm.role.isMember)
      ? ownerExplainer
      : vm.banner.lockedFieldsExplainer;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      role="note"
    >
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-xs leading-snug">{body}</p>
      </div>
      {vm.banner.canOpenGlobal && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenGlobal}
          className="h-7 shrink-0 gap-1 border-amber-300 bg-white text-xs text-amber-800 hover:bg-amber-100"
          type="button"
        >
          <ExternalLink className="h-3 w-3" />
          Open Global edit
        </Button>
      )}
    </div>
  );
}

export default DisabledFieldBanner;
