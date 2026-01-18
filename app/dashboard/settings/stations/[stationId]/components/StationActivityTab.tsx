"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Station } from "@/app/dashboard/actions/stations";
import {
  Clock,
  ShoppingCart,
  CreditCard,
  Printer,
  Plug,
  AlertCircle,
  RefreshCw,
  UserCheck,
  Settings,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface StationActivityTabProps {
  station: Station;
  timeFilter: string;
}

// Mock activity log type
type ActivityLogType =
  | "order_created"
  | "payment_processed"
  | "device_connected"
  | "device_disconnected"
  | "sync_completed"
  | "user_login"
  | "settings_changed"
  | "error";

interface ActivityLog {
  id: string;
  type: ActivityLogType;
  action: string;
  details?: string;
  timestamp: string;
  severity: "info" | "success" | "warning" | "error";
}

function ActivityIcon({ type }: { type: ActivityLogType }) {
  switch (type) {
    case "order_created":
      return <ShoppingCart className="h-4 w-4 text-blue-500" />;
    case "payment_processed":
      return <CreditCard className="h-4 w-4 text-green-500" />;
    case "device_connected":
    case "device_disconnected":
      return <Plug className="h-4 w-4 text-purple-500" />;
    case "sync_completed":
      return <RefreshCw className="h-4 w-4 text-cyan-500" />;
    case "user_login":
      return <UserCheck className="h-4 w-4 text-indigo-500" />;
    case "settings_changed":
      return <Settings className="h-4 w-4 text-orange-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs",
        severity === "success" && "border-green-500/50 text-green-600",
        severity === "warning" && "border-yellow-500/50 text-yellow-600",
        severity === "error" && "border-red-500/50 text-red-600",
        severity === "info" && "border-blue-500/50 text-blue-600"
      )}
    >
      {severity}
    </Badge>
  );
}

// Generate mock activity logs for demo
function generateMockLogs(station: Station, timeFilter: string): ActivityLog[] {
  const now = Date.now();
  const filterMs = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  }[timeFilter] || 24 * 60 * 60 * 1000;

  const isOnline = station.is_active && station.is_online;

  const logs: ActivityLog[] = [];

  // Add some sample activity logs
  if (isOnline) {
    logs.push({
      id: "1",
      type: "sync_completed",
      action: "Menu sync completed",
      details: "42 items synchronized",
      timestamp: new Date(now - 5 * 60 * 1000).toISOString(),
      severity: "success",
    });

    if (station.can_create_orders) {
      logs.push({
        id: "2",
        type: "order_created",
        action: "Order #1234 created",
        details: "3 items, $45.99",
        timestamp: new Date(now - 15 * 60 * 1000).toISOString(),
        severity: "info",
      });
    }

    if (station.can_process_payments) {
      logs.push({
        id: "3",
        type: "payment_processed",
        action: "Payment processed",
        details: "Visa ending in 4242 - $45.99",
        timestamp: new Date(now - 14 * 60 * 1000).toISOString(),
        severity: "success",
      });
    }

    logs.push({
      id: "4",
      type: "device_connected",
      action: "Receipt printer connected",
      details: "Epson TM-T88VI",
      timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      severity: "info",
    });

    logs.push({
      id: "5",
      type: "user_login",
      action: "Staff login",
      details: "John D. clocked in",
      timestamp: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      severity: "info",
    });
  }

  // Add some older logs
  logs.push({
    id: "6",
    type: "sync_completed",
    action: "Full sync completed",
    details: "Menu, settings, and staff data",
    timestamp: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
    severity: "success",
  });

  if (!isOnline && station.last_heartbeat_at) {
    logs.push({
      id: "7",
      type: "device_disconnected",
      action: "Station went offline",
      details: "Connection lost",
      timestamp: station.last_heartbeat_at,
      severity: "warning",
    });
  }

  // Filter by time range
  return logs.filter((log) => now - new Date(log.timestamp).getTime() <= filterMs);
}

export function StationActivityTab({ station, timeFilter }: StationActivityTabProps) {
  const logs = useMemo(
    () => generateMockLogs(station, timeFilter),
    [station, timeFilter]
  );

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
            <h3 className="text-lg font-semibold">No activity in this period</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-2">
              Try selecting a different time range to see more activity.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div
                key={log.id}
                className={cn(
                  "flex items-start gap-4 p-4 rounded-lg transition-colors hover:bg-muted/50",
                  index !== logs.length - 1 && "border-b"
                )}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted flex-shrink-0">
                  <ActivityIcon type={log.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{log.action}</p>
                    <SeverityBadge severity={log.severity} />
                  </div>
                  {log.details && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {log.details}
                    </p>
                  )}
                </div>
                <div className="text-sm text-muted-foreground text-right flex-shrink-0">
                  <p>{format(new Date(log.timestamp), "h:mm a")}</p>
                  <p className="text-xs">
                    {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-sm text-muted-foreground">
              Showing {logs.length} event{logs.length !== 1 ? "s" : ""} from the last{" "}
              {timeFilter === "1h" && "hour"}
              {timeFilter === "24h" && "24 hours"}
              {timeFilter === "7d" && "7 days"}
              {timeFilter === "30d" && "30 days"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
