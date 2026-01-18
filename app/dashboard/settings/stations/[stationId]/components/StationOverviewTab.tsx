"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Station } from "@/app/dashboard/actions/stations";
import {
  getStationTypeLabel,
  getSyncRoleLabel,
  getViewScopeLabel,
} from "../../hooks/useStations";
import { useStationDevices } from "../../hooks/useStationDevices";
import { useStationTerminal } from "../../hooks/usePaymentTerminals";
import {
  Monitor,
  CreditCard,
  Printer,
  DollarSign,
  Users,
  ShoppingCart,
  Percent,
  ChefHat,
  Clock,
  Wifi,
  WifiOff,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface StationOverviewTabProps {
  station: Station;
  timeFilter: string;
}

function CapabilityCard({
  icon: Icon,
  label,
  enabled,
}: {
  icon: React.ElementType;
  label: string;
  enabled: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
        enabled
          ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
          : "bg-muted/50 border-muted"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg",
          enabled ? "bg-green-500/20" : "bg-muted"
        )}
      >
        <Icon
          className={cn("h-5 w-5", enabled ? "text-green-600" : "text-muted-foreground")}
        />
      </div>
      <div className="flex-1">
        <p className={cn("font-medium", !enabled && "text-muted-foreground")}>
          {label}
        </p>
      </div>
      {enabled ? (
        <CheckCircle className="h-5 w-5 text-green-500" />
      ) : (
        <XCircle className="h-5 w-5 text-muted-foreground" />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {subtext && (
              <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StationOverviewTab({ station, timeFilter }: StationOverviewTabProps) {
  const { data: devices } = useStationDevices(station.id);
  const { data: terminal } = useStationTerminal(station.id);

  const deviceCount = devices?.length || 0;
  const hasTerminal = !!terminal;
  const isOnline = station.is_active && station.is_online;

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Printer}
          label="Devices Connected"
          value={deviceCount}
          subtext={hasTerminal ? "Including payment terminal" : undefined}
        />
        <StatCard
          icon={isOnline ? Wifi : WifiOff}
          label="Status"
          value={isOnline ? "Online" : "Offline"}
          subtext={
            station.last_heartbeat_at
              ? `Last seen ${formatDistanceToNow(new Date(station.last_heartbeat_at), {
                  addSuffix: true,
                })}`
              : "Never connected"
          }
        />
        <StatCard
          icon={Clock}
          label="Last Sync"
          value={
            station.last_sync_at
              ? format(new Date(station.last_sync_at), "h:mm a")
              : "Never"
          }
          subtext={
            station.last_sync_at
              ? format(new Date(station.last_sync_at), "MMM d, yyyy")
              : undefined
          }
        />
        <StatCard
          icon={Monitor}
          label="Station Type"
          value={getStationTypeLabel(station.station_type)}
          subtext={`${getSyncRoleLabel(station.sync_role)} role`}
        />
      </div>

      {/* Station Details & Capabilities */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Station Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Station Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Station Number</p>
                <p className="font-medium">{station.station_number || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Station Code</p>
                <p className="font-mono">{station.station_code || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sync Role</p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={station.sync_role === "leader" ? "default" : "secondary"}
                  >
                    {getSyncRoleLabel(station.sync_role)}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">View Scope</p>
                <p className="font-medium">{getViewScopeLabel(station.view_scope)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Device Name</p>
                <p className="font-medium">{station.device_name || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hardware Model</p>
                <p className="font-medium">{station.hardware_model || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Capabilities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Capabilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CapabilityCard
              icon={ShoppingCart}
              label="Create Orders"
              enabled={station.can_create_orders}
            />
            <CapabilityCard
              icon={CreditCard}
              label="Process Payments"
              enabled={station.can_process_payments}
            />
            <CapabilityCard
              icon={DollarSign}
              label="Void Orders"
              enabled={station.can_void_orders}
            />
            <CapabilityCard
              icon={Percent}
              label="Apply Discounts"
              enabled={station.can_apply_discounts}
            />
            <CapabilityCard
              icon={ChefHat}
              label="Update Kitchen Status"
              enabled={station.can_update_kitchen_status}
            />
          </CardContent>
        </Card>
      </div>

      {/* Device Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connected Devices</CardTitle>
        </CardHeader>
        <CardContent>
          {deviceCount === 0 && !hasTerminal ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Printer className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No devices connected</p>
              <p className="text-sm text-muted-foreground">
                Go to the Devices tab to add printers and other peripherals.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {terminal && (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                    <CreditCard className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">{terminal.terminal_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Payment Terminal
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-auto",
                      terminal.is_connected
                        ? "border-green-500/50 text-green-600"
                        : "border-gray-400/50 text-gray-500"
                    )}
                  >
                    {terminal.is_connected ? "Online" : "Offline"}
                  </Badge>
                </div>
              )}
              {devices?.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Printer className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{device.device_name}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {device.device_type.replace(/_/g, " ")}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-auto",
                      device.is_connected
                        ? "border-green-500/50 text-green-600"
                        : "border-gray-400/50 text-gray-500"
                    )}
                  >
                    {device.is_connected ? "Online" : "Offline"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
