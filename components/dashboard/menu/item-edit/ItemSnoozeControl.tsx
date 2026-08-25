"use client";

import * as React from "react";
import { toast } from "sonner";
import { CircleSlash, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DateTimePopover } from "@/components/dashboard/menu/DateTimePopover";
import { useGatedLocationId } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { isActivelySnoozed, snoozeLabel } from "@/lib/snooze";
import {
  useItemSnooze,
  useSnoozeItem,
  useRestoreItem,
  type SnoozeDuration,
} from "@/lib/queries/use-snoozes";

/**
 * Self-contained "86 / out of stock" control for a menu item.
 *
 * 86ing is per-location and transient (a snooze), orthogonal to the deliberate
 * "Available for sale" toggle. Resolves a concrete location via
 * useGatedLocationId() so single-location accounts work against their one store
 * and multi-location accounts on "All" are prompted to pick a store. Fetches its
 * own snooze state + clerkOrgId so it drops into any editor with a menuItemId.
 *
 * Uses an inline panel (not a Radix dropdown) because this renders inside the
 * item-editor Dialog, where a nested modal popover fights the Dialog focus scope.
 *
 * isActivelySnoozed/snoozeLabel live in @/lib/snooze so the menus-page row and
 * modifier toggle share the exact same semantics.
 */

/** Current local time in the value format expected by the date/time picker. */
function nowLocalInput(): string {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function ItemSnoozeControl({
  menuItemId,
  className,
  onOutOfStockChange,
}: {
  menuItemId: string;
  className?: string;
  /** Fired on success so the editor's availability toggle can follow the 86 state. */
  onOutOfStockChange?: (outOfStock: boolean) => void;
}) {
  const gatedLocationId = useGatedLocationId();
  const { data: userInfo } = useUserInfo();
  const clerkOrgId: string | undefined =
    userInfo?.members?.[0]?.organizations?.id;

  const { data: snooze } = useItemSnooze(menuItemId, gatedLocationId);
  const snoozeItem = useSnoozeItem();
  const restoreItem = useRestoreItem();

  const [open, setOpen] = React.useState(false);
  const [customValue, setCustomValue] = React.useState("");

  const snoozedUntil = snooze?.snoozed_until ?? null;
  const active = isActivelySnoozed(snoozedUntil);
  const busy = snoozeItem.isPending || restoreItem.isPending;

  // Multi-location account viewing "All locations" — no concrete store to 86.
  if (!gatedLocationId) {
    return (
      <div
        className={cn(
          "rounded-2xl border-0 bg-muted/60 p-3 text-xs text-muted-foreground shadow-none",
          className,
        )}
      >
        Select a specific location (top bar) to mark this item out of stock.
      </div>
    );
  }

  if (!clerkOrgId) return null;

  const do86 = (duration: SnoozeDuration) => {
    snoozeItem.mutate(
      { clerkOrgId, menuItemId, locationId: gatedLocationId, duration },
      { onSuccess: (res) => res?.success && onOutOfStockChange?.(true) },
    );
    setOpen(false);
    setCustomValue("");
  };

  const restore = () =>
    restoreItem.mutate(
      { clerkOrgId, menuItemId, locationId: gatedLocationId },
      { onSuccess: (res) => res?.success && onOutOfStockChange?.(false) },
    );

  const applyCustom = () => {
    if (!customValue) return;
    const d = new Date(customValue);
    if (!Number.isFinite(d.getTime())) {
      toast.error("Please pick a valid date and time");
      return;
    }
    if (d.getTime() <= Date.now()) {
      toast.error("Pick a time in the future");
      return;
    }
    do86({ kind: "until", iso: d.toISOString() });
  };

  if (active && snoozedUntil) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border-0 bg-amber-50 p-3 shadow-none dark:bg-amber-900/20",
          className,
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <CircleSlash className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-amber-800 dark:text-amber-200">
              {snoozeLabel(snoozedUntil)}
            </p>
            {snooze?.snooze_reason ? (
              <p className="truncate text-xs text-amber-700 dark:text-amber-300">
                {snooze.snooze_reason}
              </p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={restore}
          disabled={busy}
          className="shrink-0"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restore
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-4 rounded-3xl border-0 bg-muted/50 p-4 shadow-none sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">Pause sales temporarily</p>
          <p className="max-w-md text-sm leading-5 text-muted-foreground">
            Hide this item from POS, online orders, and delivery apps at this
            location. Choose when it becomes available again.
          </p>
        </div>
        <Button
          type="button"
          variant={open ? "secondary" : "outline"}
          size="sm"
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
          className="h-10 w-full shrink-0 rounded-full px-5 sm:h-9 sm:w-auto"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <CircleSlash className="mr-1.5 h-3.5 w-3.5" />
              Mark out of stock
            </>
          )}
        </Button>
      </div>

      {open ? (
        <div className="space-y-3 border-t pt-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => do86({ kind: "hours", hours: 1 })}
            >
              For 1 hour
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => do86({ kind: "hours", hours: 4 })}
            >
              For 4 hours
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => do86({ kind: "end_of_day" })}
            >
              Until end of day
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => do86({ kind: "until_manual" })}
            >
              Until I turn it back on
            </Button>
          </div>

          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-[12rem] space-y-1">
              <label
                htmlFor={`snooze-until-${menuItemId}`}
                className="text-xs font-medium text-muted-foreground"
              >
                Custom — out of stock until
              </label>
              <DateTimePopover
                id={`snooze-until-${menuItemId}`}
                min={nowLocalInput()}
                value={customValue}
                onChange={setCustomValue}
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={busy || !customValue}
              onClick={applyCustom}
              className="shrink-0"
            >
              Set
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ItemSnoozeControl;
