"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GetAuditLogs } from "@/app/dashboard/actions/audit-logs";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  AuditCategory,
  AuditLogWithLocation,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "@/types/audit-log";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Clock,
  Package,
  ShoppingCart,
  DollarSign,
  Info,
  ChevronRight,
  User,
  MapPin,
  TrendingUp,
  TrendingDown,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// Action icons mapping
const ACTION_ICONS: Record<string, React.ElementType> = {
  "inventory.stock_updated": Package,
  "inventory.item_created": Package,
  "purchase_order.created": ShoppingCart,
  "expense.logged": DollarSign,
  "staff.clock_in": Clock,
  "staff.clock_out": Clock,
  "staff.pin_reset": RotateCcw,
  "order.created": Receipt,
};

interface StaffActivityLogProps {
  staffProfileId?: string | null;
  userId?: string | null; // For checking actor_user_id
}

export function StaffActivityLog({
  staffProfileId,
  userId,
}: StaffActivityLogProps) {
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;

  const { data: logsResponse, isLoading } = useQuery({
    queryKey: ["staff-audit-logs", clerkOrgId, staffProfileId, userId],
    queryFn: async () => {
      if (!clerkOrgId || (!staffProfileId && !userId)) return null;

      return GetAuditLogs(
        clerkOrgId,
        {
          staff_profile_id: staffProfileId || undefined,
          actor_user_id: userId || undefined,
        },
        20 // Limit to recent 20
      );
    },
    enabled: !!clerkOrgId && (!!staffProfileId || !!userId),
  });

  const logs = logsResponse?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
        <Clock className="h-8 w-8 mb-2 opacity-50" />
        <p>No activity recorded yet.</p>
        <p className="text-xs mt-1">
          Actions performed by this staff member will appear here.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full max-h-[600px] pr-4">
      <div className="space-y-3 p-1">
        {logs.map((log) => (
          <ActivityLogItem key={log.id} log={log} />
        ))}
      </div>
    </ScrollArea>
  );
}

function ActivityLogItem({ log }: { log: AuditLogWithLocation }) {
  const [expanded, setExpanded] = useState(false);

  const ActionIcon =
    ACTION_ICONS[log.action] ||
    (log.action_category === "order" ? Receipt : Info);

  const isOrder = log.action === "order.created";
  const orderAmount = log.metadata?.total_amount as number | undefined;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all hover:bg-muted/50 cursor-pointer text-sm",
        expanded && "bg-muted/30"
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "p-2 rounded-lg shrink-0",
            CATEGORY_COLORS[log.action_category as AuditCategory] ||
              "bg-gray-100"
          )}
        >
          <ActionIcon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="font-medium truncate">
              {formatActionLabel(log.action)}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
              {formatDistanceToNow(new Date(log.created_at), {
                addSuffix: true,
              })}
            </span>
          </div>

          <div className="text-muted-foreground text-xs flex items-center gap-2">
            {log.location?.name && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {log.location.name}
              </span>
            )}
            {isOrder && orderAmount !== undefined && (
              <Badge
                variant="outline"
                className="h-5 px-1.5 text-[10px] gap-1 border-muted-foreground/30"
              >
                <DollarSign className="h-2.5 w-2.5" />
                {orderAmount.toFixed(2)}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Details - Expanded */}
      {expanded && (
        <div className="mt-3 pt-2 border-t text-xs text-muted-foreground space-y-1">
          {log.changes?.reason && (
            <p>
              Reason:{" "}
              <span className="text-foreground">{log.changes.reason}</span>
            </p>
          )}
          {(log.changes as any)?.duration_minutes && (
            <p>
              Duration:{" "}
              <span className="text-foreground">
                {Math.round(
                  Number((log.changes as any).duration_minutes) * 10
                ) / 10}{" "}
                hours
              </span>
            </p>
          )}
          {log.resource_name && !isOrder && (
            <p>
              Resource:{" "}
              <span className="text-foreground">{log.resource_name}</span>
            </p>
          )}
          {isOrder && (
            <p>
              Order #:{" "}
              <span className="text-foreground">{log.resource_name}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatActionLabel(action: string): string {
  const map: Record<string, string> = {
    "staff.clock_in": "Clocked In",
    "staff.clock_out": "Clocked Out",
    "staff.pin_reset": "PIN Reset",
    "order.created": "Created Order",
  };
  if (map[action]) return map[action];

  return action
    .split(".")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
