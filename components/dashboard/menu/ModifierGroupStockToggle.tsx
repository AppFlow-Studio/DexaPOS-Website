"use client";

import * as React from "react";
import { CircleSlash, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useGatedLocationId } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { isActivelySnoozed } from "@/lib/snooze";
import {
  useActiveSnoozes,
  useSnoozeModifierGroup,
  useRestoreModifierGroup,
  type SnoozeDuration,
} from "@/lib/queries/use-snoozes";
import { SnoozeDurationButtons } from "@/components/dashboard/menu/SnoozeDurationButtons";

/**
 * Group-level "out of stock (86)" control for a whole modifier group, used on the
 * modifier group header in the item editor.
 *
 * A group 86 is a fan-out: it snoozes every option in the group (one atomic RPC).
 * So "whole group out of stock" is derived as: every option id in the group is
 * currently snoozed. Now duration-aware (parity with items). Uses an inline button
 * row (dialog-safe, no Radix popover).
 */
export function ModifierGroupStockToggle({
  modifierGroupId,
  optionIds,
  className,
}: {
  modifierGroupId: string;
  /** All modifier_group_item ids in this group — derives whole-group state + fan-out. */
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

  const [open, setOpen] = React.useState(false);

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

  const do86 = (duration: SnoozeDuration) => {
    snoozeGroup.mutate({
      clerkOrgId,
      modifierGroupId,
      locationId: gatedLocationId,
      duration,
      optionIds,
    });
    setOpen(false);
  };

  const restore = () =>
    restoreGroup.mutate({
      clerkOrgId,
      modifierGroupId,
      locationId: gatedLocationId,
      optionIds,
    });

  if (isOutOfStock) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
          <CircleSlash className="h-3 w-3" />
          Group out of stock
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          disabled={busy}
          onClick={restore}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Restore
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-end gap-1.5", className)}>
      <Button
        type="button"
        variant={open ? "secondary" : "outline"}
        size="sm"
        className="h-7"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <>
            <CircleSlash className="mr-1 h-3.5 w-3.5" />
            86 whole group
          </>
        )}
      </Button>
      {open && <SnoozeDurationButtons onPick={do86} disabled={busy} />}
    </div>
  );
}

export default ModifierGroupStockToggle;
