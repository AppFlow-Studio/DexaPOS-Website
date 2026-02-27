"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Station } from "@/app/dashboard/actions/stations";
import {
  getStationTypeLabel,
  getSyncRoleLabel,
  getViewScopeLabel,
  useKdsDisplay,
  useKdsRoutingRules,
  useSetKdsRoutingRules,
} from "../../hooks/useStations";
import { usePrepStations } from "@/app/dashboard/hooks/usePrepStations";
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
  Plus,
  X,
  Router,
  Smartphone,
  Battery,
  HardDrive,
  MemoryStick,
  Nfc,
  TabletSmartphone,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

function HardwareFeatureChip({
  icon: Icon,
  label,
  available,
}: {
  icon: React.ElementType;
  label: string;
  available: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm",
        available
          ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
          : "bg-muted/50 border-muted"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          available ? "text-green-600" : "text-muted-foreground"
        )}
      />
      <span
        className={cn(
          "font-medium",
          available ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      {available ? (
        <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-auto shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
      )}
    </div>
  );
}

function ResourceBar({
  icon: Icon,
  label,
  value,
  max,
  unit,
}: {
  icon: React.ElementType;
  label: string;
  value: number | null;
  max: number;
  unit: string;
}) {
  if (value === null) return null;

  const percentage = Math.min((value / max) * 100, 100);
  const barColor =
    percentage > 50
      ? "bg-green-500"
      : percentage > 20
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </div>
        <span className="font-medium">
          {value}
          {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function StationOverviewTab({ station, timeFilter }: StationOverviewTabProps) {
  const { data: devices } = useStationDevices(station.id);
  const { data: terminal } = useStationTerminal(station.id);

  // KDS-specific data
  const isKds = station.station_type === "kds";
  const { data: kdsDisplay } = useKdsDisplay(isKds ? station.id : undefined);
  const { data: routingRules } = useKdsRoutingRules(kdsDisplay?.id);
  const setRoutingRulesMutation = useSetKdsRoutingRules();
  const { data: prepStations } = usePrepStations(isKds ? station.location_id : undefined);
  const activePrepStations = prepStations?.filter((ps) => ps.is_active) || [];
  const [addingPrepStation, setAddingPrepStation] = useState(false);

  const prepStationRules = routingRules?.filter((r) => r.rule_type === "prep_station") || [];
  const assignedPrepNames = prepStationRules.map((r) => r.rule_value);
  const availablePrepStations = activePrepStations.filter(
    (ps) => !assignedPrepNames.includes(ps.name)
  );

  const handleAddPrepStation = async (name: string) => {
    if (!kdsDisplay?.id) return;
    const newRules = [
      ...prepStationRules.map((r) => ({ rule_type: r.rule_type, rule_value: r.rule_value })),
      { rule_type: "prep_station", rule_value: name },
    ];
    await setRoutingRulesMutation.mutateAsync({
      kdsDisplayId: kdsDisplay.id,
      rules: newRules,
    });
    setAddingPrepStation(false);
  };

  const handleRemovePrepStation = async (name: string) => {
    if (!kdsDisplay?.id) return;
    const newRules = prepStationRules
      .filter((r) => r.rule_value !== name)
      .map((r) => ({ rule_type: r.rule_type, rule_value: r.rule_value }));
    await setRoutingRulesMutation.mutateAsync({
      kdsDisplayId: kdsDisplay.id,
      rules: newRules,
    });
  };

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

      {/* Logged-in Device & Hardware */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Logged-in Device & Hardware
          </CardTitle>
        </CardHeader>
        <CardContent>
          {station.device_id ? (
            <div className="space-y-0">
              {/* Device Identity */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Device Name</p>
                  <p className="font-medium">{station.device_name || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Manufacturer</p>
                  <p className="font-medium">{station.device_manufacturer || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Device Model</p>
                  <p className="font-medium">{station.device_model || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Hardware Model</p>
                  <p className="font-medium">{station.hardware_model || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">OS Version</p>
                  <p className="font-medium">{station.os_version || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">App Version</p>
                  <p className="font-medium">{station.app_version || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Android SDK</p>
                  <p className="font-medium">
                    {station.android_sdk_version != null
                      ? `API ${station.android_sdk_version}`
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Hardware Features */}
              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  Hardware Features
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <HardwareFeatureChip
                    icon={Nfc}
                    label="NFC"
                    available={station.has_nfc}
                  />
                  <HardwareFeatureChip
                    icon={Printer}
                    label="Built-in Printer"
                    available={station.has_builtin_printer}
                  />
                  <HardwareFeatureChip
                    icon={Monitor}
                    label="Built-in CFD"
                    available={station.has_builtin_cfd}
                  />
                  <HardwareFeatureChip
                    icon={TabletSmartphone}
                    label="Cash Drawer Port"
                    available={station.has_cash_drawer_port}
                  />
                </div>
              </div>

              {/* System Resources */}
              {(station.battery_level != null ||
                station.ram_free_mb != null ||
                station.storage_free_mb != null) && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-3">
                    System Resources
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <ResourceBar
                      icon={Battery}
                      label="Battery"
                      value={station.battery_level}
                      max={100}
                      unit="%"
                    />
                    <ResourceBar
                      icon={MemoryStick}
                      label="Free RAM"
                      value={station.ram_free_mb}
                      max={4096}
                      unit=" MB"
                    />
                    <ResourceBar
                      icon={HardDrive}
                      label="Free Storage"
                      value={station.storage_free_mb}
                      max={32768}
                      unit=" MB"
                    />
                  </div>
                </div>
              )}

              {/* Display & Network */}
              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  Display & Network
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Screen Resolution</p>
                    <p className="font-medium">
                      {station.screen_width != null && station.screen_height != null
                        ? `${station.screen_width} x ${station.screen_height}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Screen Density</p>
                    <p className="font-medium">
                      {station.screen_density != null
                        ? `${station.screen_density} dpi`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Network Type</p>
                    <p className="font-medium capitalize">
                      {station.network_type || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Wi-Fi SSID</p>
                    <p className="font-medium">{station.network_ssid || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Local IP</p>
                    <p className="font-mono text-sm">
                      {station.local_ip_address || station.ip_address || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">MAC Address</p>
                    <p className="font-mono text-sm">{station.mac_address || "—"}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Smartphone className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No device registered</p>
              <p className="text-sm text-muted-foreground mb-3">
                This station has not been linked to a physical device yet.
              </p>
              <Badge variant="secondary">Awaiting device registration</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Station Configuration & Capabilities */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Station Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Station Configuration</CardTitle>
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

      {/* KDS Routing - only for KDS stations */}
      {isKds && kdsDisplay && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Router className="h-5 w-5" />
                KDS Routing
              </CardTitle>
              <Badge variant="outline">
                {kdsDisplay.routing_mode === "all"
                  ? "All Items"
                  : kdsDisplay.routing_mode === "prep_station"
                    ? "By Prep Station"
                    : kdsDisplay.routing_mode === "category"
                      ? "By Category"
                      : "By Order Type"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {kdsDisplay.routing_mode === "all" && (
              <p className="text-sm text-muted-foreground">
                This display receives all items sent to the kitchen.
              </p>
            )}

            {kdsDisplay.routing_mode === "prep_station" && (
              <div className="space-y-3">
                {prepStationRules.length === 0 && !addingPrepStation ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <ChefHat className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">No prep stations assigned</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Assign prep stations to route items to this display.
                    </p>
                    {availablePrepStations.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddingPrepStation(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Prep Station
                      </Button>
                    )}
                    {activePrepStations.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        No prep stations exist for this location. Create them in Settings &gt; Prep Stations.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {prepStationRules.map((rule) => {
                        const ps = activePrepStations.find((p) => p.name === rule.rule_value);
                        return (
                          <div
                            key={rule.id}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                          >
                            <div
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: ps?.color || "#6B7280" }}
                            />
                            <span className="text-sm font-medium flex-1">{rule.rule_value}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={setRoutingRulesMutation.isPending}
                              onClick={() => handleRemovePrepStation(rule.rule_value)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>

                    {addingPrepStation ? (
                      <div className="flex items-center gap-2">
                        <Select onValueChange={(v) => handleAddPrepStation(v)}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select a prep station..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availablePrepStations.map((ps) => (
                              <SelectItem key={ps.id} value={ps.name}>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: ps.color || "#6B7280" }}
                                  />
                                  {ps.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAddingPrepStation(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      availablePrepStations.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAddingPrepStation(true)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Prep Station
                        </Button>
                      )
                    )}
                  </>
                )}
              </div>
            )}

            {kdsDisplay.routing_mode === "category" && (
              <p className="text-sm text-muted-foreground">
                This display receives items from specific categories. Configure category routing rules in the display settings.
              </p>
            )}

            {kdsDisplay.routing_mode === "order_type" && (
              <p className="text-sm text-muted-foreground">
                This display receives items from specific order types. Configure order type routing rules in the display settings.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
