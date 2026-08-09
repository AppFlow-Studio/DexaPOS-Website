"use client";

import * as React from "react";
import { toast } from "sonner";
import { CircleSlash, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGatedLocationId } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { isActivelySnoozed, snoozeLabel } from "@/lib/snooze";
import {
  useCategorySnooze,
  useSnoozeCategory,
  useRestoreCategory,
  type SnoozeDuration,
} from "@/lib/queries/use-snoozes";

/**
 * Self-contained "86 / Sold Out" control for a whole category, mirroring
 * ItemSnoozeControl. A category 86 is per-location and transient: it keeps the
 * category on the menu but marks all of its items Sold Out on online ordering &
 * delivery apps (auto-restoring at the chosen time) — it does NOT hide the
 * category (that's the separate "Active" toggle). Resolves a concrete location via
 * useGatedLocationId() and fetches its own snooze state + clerkOrgId.
 */

/** Current local time as a value for <input type="datetime-local"> (min bound). */
function nowLocalInput(): string {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function CategorySnoozeControl({
  categoryId,
  className,
}: {
  categoryId: string;
  className?: string;
}) {
  const gatedLocationId = useGatedLocationId();
  const { data: userInfo } = useUserInfo();
  const clerkOrgId: string | undefined =
    userInfo?.members?.[0]?.organizations?.id;

  const { data: snooze } = useCategorySnooze(categoryId, gatedLocationId);
  const snoozeCategory = useSnoozeCategory();
  const restoreCategory = useRestoreCategory();

  const [open, setOpen] = React.useState(false);
  const [customValue, setCustomValue] = React.useState("");

  const snoozedUntil = snooze?.snoozed_until ?? null;
  const active = isActivelySnoozed(snoozedUntil);
  const busy = snoozeCategory.isPending || restoreCategory.isPending;

  // Multi-location account viewing "All locations" — no concrete store to 86.
  if (!gatedLocationId) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-dashed p-3 text-xs text-muted-foreground",
          className,
        )}
      >
        Select a specific location (top bar) to mark this category out of stock.
      </div>
    );
  }

  if (!clerkOrgId) return null;

  const do86 = (duration: SnoozeDuration) => {
    snoozeCategory.mutate({
      clerkOrgId,
      categoryId,
      locationId: gatedLocationId,
      duration,
    });
    setOpen(false);
    setCustomValue("");
  };

  const restore = () =>
    restoreCategory.mutate({
      clerkOrgId,
      categoryId,
      locationId: gatedLocationId,
    });

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
          "flex items-center justify-between gap-3 rounded-2xl border-0 bg-amber-500/10 p-3 dark:bg-amber-400/10",
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
            ) : (
              <p className="truncate text-xs text-amber-700 dark:text-amber-300">
                Every item in this category is marked Sold Out.
              </p>
            )}
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
    <div className={cn("space-y-3 rounded-2xl border-0 bg-muted/50 p-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Category out of stock (86)</p>
          <p className="text-xs text-muted-foreground">
            Temporarily mark every item in this category Sold Out on online
            ordering &amp; delivery apps at this location. The category stays
            visible — it isn&apos;t hidden.
          </p>
        </div>
        <Button
          type="button"
          variant={open ? "secondary" : "outline"}
          size="sm"
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0"
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

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label
                htmlFor={`cat-snooze-until-${categoryId}`}
                className="text-xs font-medium text-muted-foreground"
              >
                Custom — out of stock until
              </label>
              <Input
                id={`cat-snooze-until-${categoryId}`}
                type="datetime-local"
                min={nowLocalInput()}
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="h-9"
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={busy || !customValue}
              onClick={applyCustom}
            >
              Set
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CategorySnoozeControl;
