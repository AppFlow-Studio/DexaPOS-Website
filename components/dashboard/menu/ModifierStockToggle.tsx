"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useGatedLocationId } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { isActivelySnoozed } from "@/lib/snooze";
import {
  useActiveSnoozes,
  useSnoozeModifier,
  useRestoreModifier,
} from "@/lib/queries/use-snoozes";

/**
 * Compact per-location "out of stock (86)" toggle for a single modifier option,
 * used inside the item-editor's modifier Options Preview.
 *
 * 86ing a modifier is a per-location transient snooze (orthogonal to the
 * modifier's Active/Inactive availability). Modifiers have no per-item OrderOut
 * suspension endpoint yet, so toggling here triggers a full-menu resync via the
 * server action. Uses a Switch (not a Radix dropdown) because it renders inside
 * the item-editor Dialog.
 *
 * A plain on/off toggle → "until I turn it back on" ('infinity'). Restore clears it.
 */
export function ModifierStockToggle({
  modifierGroupItemId,
  className,
}: {
  modifierGroupItemId: string;
  className?: string;
}) {
  const gatedLocationId = useGatedLocationId();
  const { data: userInfo } = useUserInfo();
  const clerkOrgId: string | undefined =
    userInfo?.members?.[0]?.organizations?.id;

  const { data: activeSnoozes } = useActiveSnoozes(
    clerkOrgId,
    gatedLocationId ?? "all",
  );
  const snoozeMod = useSnoozeModifier();
  const restoreMod = useRestoreModifier();

  const snoozedUntil =
    activeSnoozes?.modifiers.find(
      (m) => m.modifier_group_item_id === modifierGroupItemId,
    )?.snoozed_until ?? null;
  const isOutOfStock = isActivelySnoozed(snoozedUntil);
  const busy = snoozeMod.isPending || restoreMod.isPending;

  // Multi-location account on "All locations" — no concrete store to 86.
  if (!gatedLocationId) {
    return (
      <span className={cn("text-[11px] text-muted-foreground", className)}>
        Select a location to 86
      </span>
    );
  }

  if (!clerkOrgId) return null;

  const onToggle = (nextInStock: boolean) => {
    if (nextInStock) {
      restoreMod.mutate({
        clerkOrgId,
        modifierGroupItemId,
        locationId: gatedLocationId,
      });
    } else {
      snoozeMod.mutate({
        clerkOrgId,
        modifierGroupItemId,
        locationId: gatedLocationId,
        snoozedUntil: "infinity",
      });
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <span
          className={cn(
            "text-[11px] font-medium",
            isOutOfStock ? "text-amber-700" : "text-muted-foreground",
          )}
        >
          {isOutOfStock ? "Out of stock" : "In stock"}
        </span>
      )}
      <Switch
        checked={!isOutOfStock}
        disabled={busy}
        onCheckedChange={(checked) => onToggle(checked)}
        aria-label="Toggle modifier out of stock"
      />
    </div>
  );
}

export default ModifierStockToggle;
