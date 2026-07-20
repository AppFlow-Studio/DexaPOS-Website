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
  useSnoozeModifierGroup,
  useRestoreModifierGroup,
} from "@/lib/queries/use-snoozes";

/**
 * Group-level "out of stock (86)" toggle for a whole modifier group, used on the
 * modifier group header in the item editor.
 *
 * A group 86 is a fan-out: it snoozes every option in the group (one atomic RPC).
 * So "whole group out of stock" is derived as: every option id in the group is
 * currently snoozed. Toggling off snoozes the group until manual restore; on
 * restores all options. Uses a Switch (dialog-safe, no Radix popover).
 */
export function ModifierGroupStockToggle({
  modifierGroupId,
  optionIds,
  className,
}: {
  modifierGroupId: string;
  /** All modifier_group_item ids in this group — used to derive whole-group state. */
  optionIds: string[];
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
  const snoozeGroup = useSnoozeModifierGroup();
  const restoreGroup = useRestoreModifierGroup();

  // Whole group is out of stock when it has options and every one is snoozed.
  const snoozedOptionIds = new Set(
    (activeSnoozes?.modifiers ?? [])
      .filter((m) => isActivelySnoozed(m.snoozed_until))
      .map((m) => m.modifier_group_item_id),
  );
  const isOutOfStock =
    optionIds.length > 0 && optionIds.every((id) => snoozedOptionIds.has(id));
  const busy = snoozeGroup.isPending || restoreGroup.isPending;

  // Multi-location account on "All locations" — no concrete store to 86.
  if (!gatedLocationId) {
    return (
      <span className={cn("text-[11px] text-muted-foreground", className)}>
        Select a location to 86
      </span>
    );
  }

  if (!clerkOrgId || optionIds.length === 0) return null;

  const onToggle = (nextInStock: boolean) => {
    if (nextInStock) {
      restoreGroup.mutate({ clerkOrgId, modifierGroupId, locationId: gatedLocationId });
    } else {
      snoozeGroup.mutate({
        clerkOrgId,
        modifierGroupId,
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
            "text-[11px] font-medium whitespace-nowrap",
            isOutOfStock ? "text-amber-700" : "text-muted-foreground",
          )}
        >
          {isOutOfStock ? "Group out of stock" : "Group in stock"}
        </span>
      )}
      <Switch
        checked={!isOutOfStock}
        disabled={busy}
        onCheckedChange={(checked) => onToggle(checked)}
        aria-label="Toggle whole modifier group out of stock"
      />
    </div>
  );
}

export default ModifierGroupStockToggle;
