"use client";

import { useState } from "react";
import {
  StationPanel,
  StationPanelContent,
  StationPanelDescription,
  StationPanelHeader,
  StationPanelTitle,
} from "./StationPanel";
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
  useUpdateKdsDisplay,
  KdsRoutingMode,
} from "../../hooks/useStations";
import { usePrepStations } from "@/app/dashboard/hooks/usePrepStations";
import { useLocationScopedCategories } from "@/app/dashboard/hooks/useLocationScoped";
import { useStationDevices } from "../../hooks/useStationDevices";
import { useStationTerminal } from "../../hooks/usePaymentTerminals";
import {
  useStationPrinters,
  useDeletePrinter,
  getPrinterRoleLabel,
  PrinterRole,
  type Printer as PrinterType,
} from "../../hooks/usePrinters";
import {
  useDeleteStationDevice,
  getDeviceTypeIcon,
  type StationDevice,
} from "../../hooks/useStationDevices";
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
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  // No ring on the enabled row: a border around some rows and not others reads
  // as a second set of boxes inside the panel. Enabled vs disabled is carried
  // by the fill weight, the label colour, and the trailing glyph.
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-2xl border-0 p-3 shadow-none transition-colors",
        enabled ? "bg-muted" : "bg-muted/45"
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <p className={cn("font-medium", !enabled && "text-muted-foreground")}>
          {label}
        </p>
      </div>
      {enabled ? (
        <CheckCircle className="h-5 w-5 text-muted-foreground" />
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
    <StationPanel>
      <StationPanelContent className="pt-6">
        {/* The icon is a quiet marker, not the subject — the figure carries the
            emphasis (§3.2), so the badge stays well under the value's size. */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[1.5rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
              {value}
            </p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {subtext && (
              <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{subtext}</p>
            )}
          </div>
        </div>
      </StationPanelContent>
    </StationPanel>
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
        // No ring on the available chip — same reason as CapabilityCard: the
        // fill weight and the trailing glyph already carry the state.
        "flex min-w-0 items-center gap-2 rounded-full border-0 px-3 py-2 text-sm shadow-none",
        available ? "bg-muted" : "bg-muted/45"
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span
        className={cn(
          "font-medium",
          available ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      {available ? (
        <CheckCircle className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
  // The number beside the bar already states the level, so the fill stays
  // neutral (§4.6b) — green/amber/red here was a third encoding of the same
  // value. Only a genuinely critical level keeps a hue, as a real alert.
  const barColor = percentage > 20 ? "bg-foreground/70" : "bg-destructive";

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
  const { data: printers } = useStationPrinters(station.id);
  const deletePrinterMutation = useDeletePrinter();
  const deleteDeviceMutation = useDeleteStationDevice();

  const [printerToDelete, setPrinterToDelete] = useState<PrinterType | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<StationDevice | null>(null);

  const handleDeletePrinter = async () => {
    if (!printerToDelete) return;
    try {
      await deletePrinterMutation.mutateAsync(printerToDelete.id);
      setPrinterToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteDevice = async () => {
    if (!deviceToDelete) return;
    try {
      await deleteDeviceMutation.mutateAsync(deviceToDelete.id);
      setDeviceToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  // KDS-specific data
  const isKds = station.station_type === "kds";
  const { data: kdsDisplay } = useKdsDisplay(isKds ? station.id : undefined);
  const { data: routingRules } = useKdsRoutingRules(kdsDisplay?.id);
  const setRoutingRulesMutation = useSetKdsRoutingRules();
  const updateKdsDisplayMutation = useUpdateKdsDisplay();
  const { data: prepStations } = usePrepStations(isKds ? station.location_id : undefined);
  const { data: categories } = useLocationScopedCategories();
  const activePrepStations = prepStations?.filter((ps) => ps.is_active) || [];
  const [addingPrepStation, setAddingPrepStation] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingOrderType, setAddingOrderType] = useState(false);

  const ORDER_TYPE_OPTIONS: { value: string; label: string }[] = [
    { value: "dine_in", label: "Dine In" },
    { value: "takeout", label: "Takeout" },
    { value: "delivery", label: "Delivery" },
    { value: "online", label: "Online" },
    { value: "catering", label: "Catering" },
  ];

  const prepStationRules = routingRules?.filter((r) => r.rule_type === "prep_station") || [];
  const categoryRules = routingRules?.filter((r) => r.rule_type === "category") || [];
  const orderTypeRules = routingRules?.filter((r) => r.rule_type === "order_type") || [];

  const assignedPrepNames = prepStationRules.map((r) => r.rule_value);
  const availablePrepStations = activePrepStations.filter(
    (ps) => !assignedPrepNames.includes(ps.name)
  );

  const assignedCategoryNames = categoryRules.map((r) => r.rule_value);
  const availableCategories = (categories || []).filter(
    (c) => !assignedCategoryNames.includes(c.name)
  );

  const assignedOrderTypes = orderTypeRules.map((r) => r.rule_value);
  const availableOrderTypes = ORDER_TYPE_OPTIONS.filter(
    (ot) => !assignedOrderTypes.includes(ot.value)
  );

  const handleAddRule = async (rule_type: string, rule_value: string) => {
    if (!kdsDisplay?.id) return;
    const existing = (routingRules || []).map((r) => ({
      rule_type: r.rule_type,
      rule_value: r.rule_value,
    }));
    await setRoutingRulesMutation.mutateAsync({
      kdsDisplayId: kdsDisplay.id,
      rules: [...existing, { rule_type, rule_value }],
    });
  };

  const handleRemoveRule = async (rule_type: string, rule_value: string) => {
    if (!kdsDisplay?.id) return;
    const newRules = (routingRules || [])
      .filter((r) => !(r.rule_type === rule_type && r.rule_value === rule_value))
      .map((r) => ({ rule_type: r.rule_type, rule_value: r.rule_value }));
    await setRoutingRulesMutation.mutateAsync({
      kdsDisplayId: kdsDisplay.id,
      rules: newRules,
    });
  };

  const handleAddPrepStation = async (name: string) => {
    await handleAddRule("prep_station", name);
    setAddingPrepStation(false);
  };
  const handleRemovePrepStation = (name: string) =>
    handleRemoveRule("prep_station", name);

  const handleAddCategory = async (name: string) => {
    await handleAddRule("category", name);
    setAddingCategory(false);
  };
  const handleRemoveCategory = (name: string) =>
    handleRemoveRule("category", name);

  const handleAddOrderType = async (value: string) => {
    await handleAddRule("order_type", value);
    setAddingOrderType(false);
  };
  const handleRemoveOrderType = (value: string) =>
    handleRemoveRule("order_type", value);

  const handleChangeRoutingMode = async (mode: KdsRoutingMode) => {
    if (!kdsDisplay?.id || mode === kdsDisplay.routing_mode) return;
    // Server clears existing routing rules when routing_mode changes.
    await updateKdsDisplayMutation.mutateAsync({
      kdsDisplayId: kdsDisplay.id,
      input: { routing_mode: mode },
    });
  };

  const deviceCount = devices?.length || 0;
  const printerCount = printers?.length || 0;
  const totalDeviceCount = deviceCount + printerCount;
  const hasTerminal = !!terminal;
  const isOnline = station.is_active && station.is_online;

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Printer}
          label="Devices Connected"
          value={totalDeviceCount}
          subtext={
            hasTerminal
              ? `Including payment terminal${printerCount > 0 ? ` & ${printerCount} printer${printerCount > 1 ? "s" : ""}` : ""}`
              : printerCount > 0
                ? `Including ${printerCount} printer${printerCount > 1 ? "s" : ""}`
                : undefined
          }
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
      <StationPanel>
        <StationPanelHeader>
          <StationPanelTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Logged-in Device & Hardware
          </StationPanelTitle>
        </StationPanelHeader>
        <StationPanelContent>
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
              <div className="mt-6">
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
                <div className="mt-6">
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
              <div className="mt-6">
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
        </StationPanelContent>
      </StationPanel>

      {/* Station Configuration & Capabilities */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Station Configuration */}
        <StationPanel>
          <StationPanelHeader>
            <StationPanelTitle className="text-lg">Station Configuration</StationPanelTitle>
          </StationPanelHeader>
          <StationPanelContent className="space-y-4">
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
          </StationPanelContent>
        </StationPanel>

        {/* Capabilities */}
        <StationPanel>
          <StationPanelHeader>
            <StationPanelTitle className="text-lg">Capabilities</StationPanelTitle>
          </StationPanelHeader>
          <StationPanelContent className="space-y-3">
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
          </StationPanelContent>
        </StationPanel>
      </div>

      {/* KDS Routing - only for KDS stations */}
      {isKds && kdsDisplay && (
        <StationPanel>
          <StationPanelHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <StationPanelTitle className="text-lg flex items-center gap-2">
                <Router className="h-5 w-5" />
                KDS Routing
              </StationPanelTitle>
              <Select
                value={kdsDisplay.routing_mode}
                onValueChange={(v) => handleChangeRoutingMode(v as KdsRoutingMode)}
                disabled={
                  updateKdsDisplayMutation.isPending ||
                  setRoutingRulesMutation.isPending
                }
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  <SelectItem value="prep_station">By Prep Station</SelectItem>
                  <SelectItem value="category">By Category</SelectItem>
                  <SelectItem value="order_type">By Order Type</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </StationPanelHeader>
          <StationPanelContent>
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
                            className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/45 p-3 shadow-none"
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
              <div className="space-y-3">
                {categoryRules.length === 0 && !addingCategory ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <ChefHat className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">No categories assigned</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Assign menu categories to route items to this display.
                    </p>
                    {availableCategories.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddingCategory(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Category
                      </Button>
                    )}
                    {(categories?.length || 0) === 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        No categories exist yet. Create them in Menu Management.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {categoryRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/45 p-3 shadow-none"
                        >
                          <ChefHat className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium flex-1">
                            {rule.rule_value}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={setRoutingRulesMutation.isPending}
                            onClick={() => handleRemoveCategory(rule.rule_value)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {addingCategory ? (
                      <div className="flex items-center gap-2">
                        <Select onValueChange={(v) => handleAddCategory(v)}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select a category..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableCategories.map((c) => (
                              <SelectItem key={c.id} value={c.name}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAddingCategory(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      availableCategories.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAddingCategory(true)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Category
                        </Button>
                      )
                    )}
                  </>
                )}
              </div>
            )}

            {kdsDisplay.routing_mode === "order_type" && (
              <div className="space-y-3">
                {orderTypeRules.length === 0 && !addingOrderType ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <ShoppingCart className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">No order types assigned</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Assign order types to route items to this display.
                    </p>
                    {availableOrderTypes.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddingOrderType(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Order Type
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {orderTypeRules.map((rule) => {
                        const label =
                          ORDER_TYPE_OPTIONS.find(
                            (ot) => ot.value === rule.rule_value
                          )?.label || rule.rule_value;
                        return (
                          <div
                            key={rule.id}
                            className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/45 p-3 shadow-none"
                          >
                            <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium flex-1">
                              {label}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={setRoutingRulesMutation.isPending}
                              onClick={() => handleRemoveOrderType(rule.rule_value)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>

                    {addingOrderType ? (
                      <div className="flex items-center gap-2">
                        <Select onValueChange={(v) => handleAddOrderType(v)}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select an order type..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableOrderTypes.map((ot) => (
                              <SelectItem key={ot.value} value={ot.value}>
                                {ot.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAddingOrderType(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      availableOrderTypes.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAddingOrderType(true)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Order Type
                        </Button>
                      )
                    )}
                  </>
                )}
              </div>
            )}
          </StationPanelContent>
        </StationPanel>
      )}

      {/* Device Summary */}
      <StationPanel>
        <StationPanelHeader>
          <StationPanelTitle className="text-lg">Connected Devices</StationPanelTitle>
        </StationPanelHeader>
        <StationPanelContent>
          {deviceCount === 0 && printerCount === 0 && !hasTerminal ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Printer className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No devices connected</p>
              <p className="text-sm text-muted-foreground">
                Go to the Devices or Printers tab to add peripherals.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {terminal && (
                <div className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/45 p-3 shadow-none">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
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
                        ? ""
                        : ""
                    )}
                  >
                    {terminal.is_connected ? "Online" : "Offline"}
                  </Badge>
                </div>
              )}
              {devices?.map((device) => (
                <div
                  key={device.id}
                  className="group flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/45 p-3 shadow-none"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-sm">
                    {getDeviceTypeIcon(device.device_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{device.device_name}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {device.device_type.replace(/_/g, " ")}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0",
                      device.is_connected
                        ? ""
                        : ""
                    )}
                  >
                    {device.is_connected ? "Online" : "Offline"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeviceToDelete(device)}
                    title="Remove device"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {printers?.map((printer) => (
                <div
                  key={printer.id}
                  className="group flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/45 p-3 shadow-none"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60">
                    <Printer className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{printer.printer_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {getPrinterRoleLabel(printer.printer_role as PrinterRole)} Printer
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0",
                      printer.is_connected
                        ? ""
                        : ""
                    )}
                  >
                    {printer.is_connected ? "Online" : "Offline"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setPrinterToDelete(printer)}
                    title="Remove printer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </StationPanelContent>
      </StationPanel>

      {/* Remove Printer Confirmation */}
      <AlertDialog
        open={!!printerToDelete}
        onOpenChange={(open) => !open && setPrinterToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Remove Printer</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-3">
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {printerToDelete?.printer_name}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {printerToDelete && (
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
              <Printer className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">{printerToDelete.printer_name}</p>
                <p className="text-sm text-muted-foreground">
                  {getPrinterRoleLabel(printerToDelete.printer_role as PrinterRole)} Printer
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePrinter}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePrinterMutation.isPending}
            >
              {deletePrinterMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Printer"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Device Confirmation */}
      <AlertDialog
        open={!!deviceToDelete}
        onOpenChange={(open) => !open && setDeviceToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Remove Device</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-3">
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {deviceToDelete?.device_name}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deviceToDelete && (
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
              <span className="text-2xl">
                {getDeviceTypeIcon(deviceToDelete.device_type)}
              </span>
              <div>
                <p className="font-medium">{deviceToDelete.device_name}</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {deviceToDelete.device_type.replace(/_/g, " ")}
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDevice}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteDeviceMutation.isPending}
            >
              {deleteDeviceMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Device"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
