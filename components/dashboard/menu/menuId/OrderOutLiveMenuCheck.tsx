"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  CircleSlash,
  CheckCircle2,
  Loader2,
  ServerCrash,
  Search,
  AlertTriangle,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getOrderOutLiveMenu,
  type OrderOutUnavailableItem,
} from "@/app/dashboard/actions/orderout";

/**
 * On-demand "are my sold-out / unavailable items actually hidden on the delivery
 * apps?" check. Reconciles the merchant's own menu against the menu OrderOut is
 * serving, so it reports the TRUE unavailable count (not just what survived into
 * OrderOut's trimmed payload) and flags any item still orderable there. Polls
 * every 15s while open so a manager can watch a 86 propagate. Read-only.
 */
export function OrderOutLiveMenuCheck({
  clerkOrgId,
  locationId,
  className,
}: {
  clerkOrgId: string;
  locationId: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const enabled = open && !!clerkOrgId && !!locationId && locationId !== "all";
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["orderout-live-menu", clerkOrgId, locationId],
    queryFn: () => getOrderOutLiveMenu(clerkOrgId, locationId),
    enabled,
    refetchInterval: open ? 15_000 : false,
    staleTime: 10_000,
  });

  const result = data;
  const menu = result?.success ? result.data : null;

  // Drift (still orderable) first — that's the actionable problem — then the rest.
  const sortedUnavailable = React.useMemo(() => {
    if (!menu) return [];
    return [...menu.unavailableItems].sort((a, b) => {
      const rank = (r: OrderOutUnavailableItem) => (r.reflected ? 1 : 0);
      return rank(a) - rank(b);
    });
  }, [menu]);

  return (
    <div className={cn("rounded-2xl border-0 bg-muted/50 p-4", className)}>
      {/* Wraps: a `shrink-0` button on a non-wrapping row crushes this text
          column to one word per line on a phone. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-medium">Verify delivery-app sync</p>
          <p className="text-xs text-muted-foreground">
            Compare your sold-out &amp; unavailable items against the menu OrderOut
            is actually serving.
          </p>
        </div>
        {open ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="shrink-0"
          >
            {isFetching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            className="shrink-0"
          >
            <Search className="mr-1.5 h-3.5 w-3.5" />
            Check live OrderOut menu
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-3 border-t pt-3">
          {isFetching && !menu ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Fetching live menu…
            </div>
          ) : result && !result.success ? (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <ServerCrash className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{result.error}</span>
            </div>
          ) : menu ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{menu.menuItemCount} items on menu</Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    menu.unavailableCount > 0 &&
                      "border-amber-300 bg-amber-50 text-amber-700",
                  )}
                >
                  {menu.unavailableCount} sold out / unavailable
                </Badge>
                {menu.driftCount > 0 && (
                  <Badge
                    variant="outline"
                    className="border-red-300 bg-red-50 text-red-700"
                  >
                    {menu.driftCount} still orderable
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  OrderOut serving {menu.ooItemCount} · menu {menu.ooMenuId} ·
                  fetched {new Date(menu.fetchedAt).toLocaleTimeString()}
                </span>
              </div>

              {/* Headline verdict */}
              {menu.driftCount > 0 ? (
                <div className="flex items-start gap-2 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {menu.driftCount} sold-out{" "}
                    {menu.driftCount === 1 ? "item is" : "items are"} still orderable
                    on OrderOut. Publish your menu to hide{" "}
                    {menu.driftCount === 1 ? "it" : "them"} on the delivery apps.
                  </span>
                </div>
              ) : menu.unavailableCount === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  No items are sold out or unavailable right now.
                </div>
              ) : (
                <div className="flex items-start gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    All {menu.unavailableCount} sold-out / unavailable{" "}
                    {menu.unavailableCount === 1 ? "item is" : "items are"} correctly
                    hidden on OrderOut.
                  </span>
                </div>
              )}

              {/* Per-item breakdown */}
              {menu.unavailableItems.length > 0 && (
                <ul className="max-h-64 space-y-1 overflow-auto">
                  {sortedUnavailable.map((i) => (
                    <UnavailableRow key={i.menuItemId} item={i} />
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** One sold-out / unavailable item + how OrderOut currently reflects it. */
function UnavailableRow({ item }: { item: OrderOutUnavailableItem }) {
  const drift = !item.reflected; // still orderable on OrderOut
  const reasonLabel = item.reason === "sold_out" ? "Sold out" : "Turned off";

  const status =
    item.reflection === "suspended"
      ? { label: "Sold out on OrderOut", className: "text-amber-600", Icon: CircleSlash }
      : item.reflection === "hidden"
        ? { label: "Hidden on OrderOut", className: "text-emerald-600", Icon: EyeOff }
        : { label: "Still orderable", className: "text-red-600", Icon: AlertTriangle };

  return (
    <li
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs",
        drift ? "bg-red-50 text-red-800" : "bg-muted/60 text-foreground",
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium">{item.name || item.menuItemId}</span>
        <span className="shrink-0 text-muted-foreground">· {reasonLabel}</span>
      </span>
      <span className={cn("inline-flex shrink-0 items-center gap-1", status.className)}>
        <status.Icon className="h-3 w-3" />
        {status.label}
      </span>
    </li>
  );
}

export default OrderOutLiveMenuCheck;
