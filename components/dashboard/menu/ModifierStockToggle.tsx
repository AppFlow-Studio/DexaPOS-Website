"use client";

import * as React from "react";
import { CircleSlash, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useGatedLocationId } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { isActivelySnoozed, snoozeShortLabel } from "@/lib/snooze";
import {
  useActiveSnoozes,
  useSnoozeModifier,
  useRestoreModifier,
  type SnoozeDuration,
} from "@/lib/queries/use-snoozes";
import { SnoozeDurationButtons } from "@/components/dashboard/menu/SnoozeDurationButtons";

/**
 * Per-location "out of stock (86)" control for a single modifier option, used
 * inside the item-editor's modifier Options Preview.
 *
 * 86ing a modifier is a per-location transient snooze (orthogonal to the
 * modifier's Active/Inactive availability). Modifiers have no per-item OrderOut
 * suspension endpoint yet, so toggling here triggers a full-menu resync via the
 * server action. Now duration-aware (parity with items): pick 1h / 4h / end of
 * day / until manual. Uses an inline button row (not a Radix dropdown) because it
 * renders inside the item-editor Dialog.
 */
export function ModifierStockToggle({
  modifierGroupItemId,
  modifierGroupId,
  className,
}: {
  modifierGroupItemId: string;
  modifierGroupId?: string;
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

  const [open, setOpen] = React.useState(false);

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

  const do86 = (duration: SnoozeDuration) => {
    snoozeMod.mutate({
      clerkOrgId,
      modifierGroupItemId,
      locationId: gatedLocationId,
      duration,
      modifierGroupId,
    });
    setOpen(false);
  };

  const restore = () =>
    restoreMod.mutate({
      clerkOrgId,
      modifierGroupItemId,
      locationId: gatedLocationId,
    });

  if (isOutOfStock) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
          <CircleSlash className="h-3 w-3" />
          {snoozeShortLabel(snoozedUntil as string)}
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
            Mark out of stock
          </>
        )}
      </Button>
      {open && <SnoozeDurationButtons onPick={do86} disabled={busy} />}
    </div>
  );
}

export default ModifierStockToggle;
