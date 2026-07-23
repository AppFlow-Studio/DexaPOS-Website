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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getOrderOutLiveMenu } from "@/app/dashboard/actions/orderout";

/**
 * On-demand "is my 86 actually live on the delivery apps?" check. Hits the
 * OrderOut get-menu endpoint and shows each item's suspension state. Polls every
 * 15s while open so a manager can watch a 86 propagate. Read-only.
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

  return (
    <div className={cn("rounded-lg border p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Verify delivery-app sync</p>
          <p className="text-xs text-muted-foreground">
            Fetch the menu OrderOut is actually serving and confirm 86’d items show
            as sold out.
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
                <Badge variant="outline">{menu.itemCount} items live</Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    menu.suspendedCount > 0 &&
                      "border-amber-300 bg-amber-50 text-amber-700",
                  )}
                >
                  {menu.suspendedCount} sold out
                </Badge>
                <span className="text-muted-foreground">
                  menu {menu.ooMenuId} · fetched{" "}
                  {new Date(menu.fetchedAt).toLocaleTimeString()}
                </span>
              </div>

              {menu.suspendedCount > 0 ? (
                <ul className="max-h-64 space-y-1 overflow-auto">
                  {menu.items
                    .filter((i) => i.suspended)
                    .map((i) => (
                      <li
                        key={i.id}
                        className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800"
                      >
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <CircleSlash className="h-3 w-3 shrink-0" />
                          <span className="truncate">{i.name || i.id}</span>
                        </span>
                        <span className="shrink-0 text-amber-600">
                          {i.suspendUntil
                            ? `until ${new Date(i.suspendUntil * 1000).toLocaleString()}`
                            : "sold out"}
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Nothing is marked sold out on OrderOut right now.
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default OrderOutLiveMenuCheck;
