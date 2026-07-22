"use client";

import * as React from "react";
import { CircleSlash, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useSnoozeItem,
  useRestoreItem,
  type SnoozeDuration,
} from "@/lib/queries/use-snoozes";

/**
 * Compact per-row "86 / out of stock" control for the Menus page item list.
 *
 * The row already opens the full item editor (which has the rich ItemSnoozeControl);
 * this is the quick toggle so a manager can 86/restore without opening it. Unlike
 * ItemSnoozeControl (inline panel, lives inside the editor Dialog) this uses a
 * Radix dropdown — safe here because the row is not inside a modal.
 *
 * The parent derives `snoozedUntil` from the shared useActiveSnoozes fetch, so this
 * stays presentational + owns only the mutations.
 */
export function ItemStockToggle({
  menuItemId,
  clerkOrgId,
  locationId,
  isOutOfStock,
  itemName,
  image,
  className,
}: {
  menuItemId: string;
  clerkOrgId: string | null | undefined;
  /** Gated (concrete) location id, or null when viewing "All locations". */
  locationId: string | null;
  isOutOfStock: boolean;
  /** Row data threaded into the optimistic snooze entry so the 86'd list renders. */
  itemName?: string;
  image?: string | null;
  className?: string;
}) {
  const snoozeItem = useSnoozeItem();
  const restoreItem = useRestoreItem();
  const busy = snoozeItem.isPending || restoreItem.isPending;

  // No concrete store to 86 against (multi-location on "All"): show a disabled
  // hint rather than a dead button.
  if (!locationId) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span onClick={(e) => e.stopPropagation()}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled
                className={cn("h-8 w-8", className)}
              >
                <CircleSlash className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Select a specific location to mark items out of stock</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!clerkOrgId) return null;

  const do86 = (duration: SnoozeDuration) =>
    snoozeItem.mutate({ clerkOrgId, menuItemId, locationId, duration, itemName, image });

  const restore = () =>
    restoreItem.mutate({ clerkOrgId, menuItemId, locationId });

  return (
    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
      <DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  className={cn(
                    "h-8 w-8",
                    isOutOfStock &&
                      "text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100",
                    className,
                  )}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CircleSlash className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isOutOfStock ? "Out of stock" : "Mark out of stock (86)"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenuContent align="end" className="w-56">
          {isOutOfStock ? (
            <>
              <DropdownMenuItem onClick={restore} className="text-green-700">
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore (back in stock)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Change duration
              </DropdownMenuLabel>
            </>
          ) : (
            <DropdownMenuLabel>Mark out of stock</DropdownMenuLabel>
          )}
          <DropdownMenuItem onClick={() => do86({ kind: "hours", hours: 1 })}>
            For 1 hour
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => do86({ kind: "hours", hours: 4 })}>
            For 4 hours
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => do86({ kind: "end_of_day" })}>
            Until end of day
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => do86({ kind: "until_manual" })}>
            Until I turn it back on
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default ItemStockToggle;
