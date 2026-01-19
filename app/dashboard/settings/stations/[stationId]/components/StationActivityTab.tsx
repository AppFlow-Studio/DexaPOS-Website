"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Station } from "@/app/dashboard/actions/stations";
import { useAuditLogs } from "@/app/dashboard/hooks/useAuditLogs";
import {
  AuditLog,
  AuditLogWithLocation,
  AuditCategory,
  AuditSeverity,
} from "@/types/audit-log";
import {
  Clock,
  ShoppingCart,
  CreditCard,
  Plug,
  AlertCircle,
  RefreshCw,
  UserCheck,
  Settings,
  MoreHorizontal,
} from "lucide-react";
import { format, formatDistanceToNow, subHours, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface StationActivityTabProps {
  station: Station;
  timeFilter: string;
}

function ActivityIcon({ category }: { category: AuditCategory }) {
  switch (category) {
    case "order":
      return <ShoppingCart className="h-4 w-4 text-blue-500" />;
    case "expense":
    case "purchase_order":
      return <CreditCard className="h-4 w-4 text-green-500" />;
    case "inventory":
    case "menu":
      return <RefreshCw className="h-4 w-4 text-cyan-500" />;
    case "staff":
    case "authentication":
      return <UserCheck className="h-4 w-4 text-indigo-500" />;
    case "settings":
      return <Settings className="h-4 w-4 text-orange-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  if (severity === "info") return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs capitalize",
        severity === "warning" && "border-yellow-500/50 text-yellow-600",
        severity === "critical" && "border-red-500/50 text-red-600",
      )}
    >
      {severity}
    </Badge>
  );
}

export function StationActivityTab({
  station,
  timeFilter,
}: StationActivityTabProps) {
  // Calculate date range based on filter
  const dateFrom = useMemo(() => {
    const now = new Date();
    switch (timeFilter) {
      case "1h":
        return subHours(now, 1).toISOString();
      case "24h":
        return subHours(now, 24).toISOString();
      case "7d":
        return subDays(now, 7).toISOString();
      case "30d":
        return subDays(now, 30).toISOString();
      default:
        return subHours(now, 24).toISOString();
    }
  }, [timeFilter]);

  const { data, isLoading } = useAuditLogs(
    {
      station_id: station.id,
      date_from: dateFrom,
    },
    20, // limit
  );

  const logs = data?.data || [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Activity Logs</CardTitle>
        <CardDescription>
          Recent activity and events for this station
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">
              No activity in this period
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-2">
              Try selecting a different time range to see more activity.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log: AuditLogWithLocation, index: number) => (
              <div
                key={log.id}
                className={cn(
                  "flex items-start gap-4 p-4 rounded-lg transition-colors hover:bg-muted/50",
                  index !== logs.length - 1 && "border-b",
                )}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted flex-shrink-0">
                  <ActivityIcon category={log.action_category} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{log.action}</p>
                    <SeverityBadge severity={log.severity} />
                  </div>
                  {log.resource_name && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {log.resource_name}
                    </p>
                  )}
                  {log.actor_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      By: {log.actor_name}
                    </p>
                  )}
                </div>
                <div className="text-sm text-muted-foreground text-right flex-shrink-0">
                  <p>{format(new Date(log.created_at), "h:mm a")}</p>
                  <p className="text-xs">
                    {formatDistanceToNow(new Date(log.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-sm text-muted-foreground">
              Showing {logs.length} recently logged event
              {logs.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
