"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect, useRef } from "react";
import {
  useCreateStation,
  useUpdateStation,
  useUpdateKdsDisplay,
  useNextStationNumber,
  useKdsDisplay,
  useKdsRoutingRules,
  useSetKdsRoutingRules,
  Station,
  StationType,
  SyncRole,
  ViewScope,
  KdsDisplayMode,
  KdsRoutingMode,
  getStationTypeIcon,
} from "../hooks/useStations";
import { usePrepStations } from "@/app/dashboard/hooks/usePrepStations";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { Loader2, Info, ChefHat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface AddStationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationToEdit?: Station | null;
  locationId: string;
  clerkOrgId: string;
}

function StationTypeCard({
  type,
  label,
  sublabel,
  icon,
  selected,
  onClick,
}: {
  type: StationType;
  label: string;
  sublabel: string;
  icon: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Selection is a ring on a muted tile, not a `--primary` border —
        // `--primary` is violet, not the brand blue (C5).
        "flex w-full min-w-0 flex-col items-center gap-2 rounded-2xl border-0 p-4 text-center shadow-none transition-colors",
        selected ? "bg-muted ring-1 ring-border" : "bg-muted/45 hover:bg-muted"
      )}
    >
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      </div>
    </button>
  );
}

export function AddStationDialog({
  open,
  onOpenChange,
  stationToEdit,
  locationId,
  clerkOrgId,
}: AddStationDialogProps) {
  const createMutation = useCreateStation();
  const updateMutation = useUpdateStation();
  const updateKdsMutation = useUpdateKdsDisplay();

  const [activeTab, setActiveTab] = useState("basic");
  const tabRailRef = useRef<HTMLDivElement>(null);

  // Basic Info
  const [stationName, setStationName] = useState("");
  const [stationCode, setStationCode] = useState("");
  const [stationType, setStationType] = useState<StationType>("register");
  const [stationNumber, setStationNumber] = useState<number | undefined>(undefined);

  // Device Info
  const [deviceName, setDeviceName] = useState("");
  const [hardwareModel, setHardwareModel] = useState("");

  // Sync Configuration
  const [syncRole, setSyncRole] = useState<SyncRole>("follower");
  const [viewScope, setViewScope] = useState<ViewScope>("own");

  // Capabilities
  const [canCreateOrders, setCanCreateOrders] = useState(true);
  const [canProcessPayments, setCanProcessPayments] = useState(false);
  const [canVoidOrders, setCanVoidOrders] = useState(false);
  const [canApplyDiscounts, setCanApplyDiscounts] = useState(true);
  const [canUpdateKitchenStatus, setCanUpdateKitchenStatus] = useState(false);

  // KDS Display Settings
  const [kdsDisplayName, setKdsDisplayName] = useState("");
  const [kdsDisplayColor, setKdsDisplayColor] = useState("#3B82F6");
  const [kdsDisplayMode, setKdsDisplayMode] = useState<KdsDisplayMode>("ticket");
  const [kdsColumns, setKdsColumns] = useState(4);
  const [kdsFontScale, setKdsFontScale] = useState(1.0);
  const [kdsRoutingMode, setKdsRoutingMode] = useState<KdsRoutingMode>("all");
  const [kdsShowAllItems, setKdsShowAllItems] = useState(false);

  // KDS Behavior Settings
  const [kdsWarningMinutes, setKdsWarningMinutes] = useState(5);
  const [kdsAlertMinutes, setKdsAlertMinutes] = useState(10);
  const [kdsAutoBumpMinutes, setKdsAutoBumpMinutes] = useState<number | null>(null);
  const [kdsSoundOnNewOrder, setKdsSoundOnNewOrder] = useState(true);
  const [kdsSoundOnRush, setKdsSoundOnRush] = useState(true);
  const [kdsShowOrderSource, setKdsShowOrderSource] = useState(true);
  const [kdsShowServerName, setKdsShowServerName] = useState(true);
  const [kdsShowOrderNotes, setKdsShowOrderNotes] = useState(true);
  const [kdsShowAllergyFlags, setKdsShowAllergyFlags] = useState(true);
  const [kdsShowOnlineOrders, setKdsShowOnlineOrders] = useState(true);
  const [kdsOnlineOrderPriority, setKdsOnlineOrderPriority] = useState(true);
  const [kdsShowReadyByCountdown, setKdsShowReadyByCountdown] = useState(true);

  // Get next station number
  const { data: nextNumber } = useNextStationNumber(locationId, stationType);

  // Load KDS display config in edit mode
  const { data: existingKdsDisplay } = useKdsDisplay(
    stationToEdit?.station_type === "kds" ? stationToEdit?.id : undefined
  );

  // KDS routing rules
  const { data: existingRoutingRules } = useKdsRoutingRules(existingKdsDisplay?.id);
  const setRoutingRulesMutation = useSetKdsRoutingRules();
  const [selectedPrepStationNames, setSelectedPrepStationNames] = useState<string[]>([]);

  // Prep stations for the location
  const { data: prepStations } = usePrepStations(locationId);
  const activePrepStations = prepStations?.filter((ps) => ps.is_active) || [];

  const isKds = stationType === "kds";

  // Tab safety: redirect away from KDS tabs if type changes away from KDS
  useEffect(() => {
    if (!isKds && (activeTab === "kds-display" || activeTab === "kds-behavior")) {
      setActiveTab("basic");
    }
  }, [isKds, activeTab]);

  useEffect(() => {
    const activeTrigger = tabRailRef.current?.querySelector<HTMLElement>(
      '[data-state="active"]',
    );
    activeTrigger?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeTab, isKds]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (stationToEdit) {
        setStationName(stationToEdit.station_name);
        setStationCode(stationToEdit.station_code || "");
        setStationType(stationToEdit.station_type);
        setStationNumber(stationToEdit.station_number || undefined);
        setDeviceName(stationToEdit.device_name || "");
        setHardwareModel(stationToEdit.hardware_model || "");
        setSyncRole(stationToEdit.sync_role);
        setViewScope(stationToEdit.view_scope);
        setCanCreateOrders(stationToEdit.can_create_orders);
        setCanProcessPayments(stationToEdit.can_process_payments);
        setCanVoidOrders(stationToEdit.can_void_orders);
        setCanApplyDiscounts(stationToEdit.can_apply_discounts);
        setCanUpdateKitchenStatus(stationToEdit.can_update_kitchen_status);
        setActiveTab("basic");
      } else {
        resetForm();
      }
    }
  }, [open, stationToEdit]);

  // Populate selected prep stations from existing routing rules
  useEffect(() => {
    if (existingRoutingRules && stationToEdit) {
      const prepNames = existingRoutingRules
        .filter((r) => r.rule_type === "prep_station")
        .map((r) => r.rule_value);
      setSelectedPrepStationNames(prepNames);
    }
  }, [existingRoutingRules, stationToEdit]);

  // Populate KDS fields from existing display config in edit mode
  useEffect(() => {
    if (existingKdsDisplay && stationToEdit) {
      setKdsDisplayName(existingKdsDisplay.display_name);
      setKdsDisplayColor(existingKdsDisplay.display_color || "#3B82F6");
      setKdsDisplayMode((existingKdsDisplay.display_mode as KdsDisplayMode) || "ticket");
      setKdsColumns(existingKdsDisplay.columns ?? 4);
      setKdsFontScale(existingKdsDisplay.font_scale ?? 1.0);
      setKdsRoutingMode((existingKdsDisplay.routing_mode as KdsRoutingMode) || "all");
      setKdsShowAllItems(existingKdsDisplay.show_all_items ?? false);
      setKdsWarningMinutes(existingKdsDisplay.warning_minutes ?? 5);
      setKdsAlertMinutes(existingKdsDisplay.alert_minutes ?? 10);
      setKdsAutoBumpMinutes(existingKdsDisplay.auto_bump_minutes ?? null);
      setKdsSoundOnNewOrder(existingKdsDisplay.sound_on_new_order ?? true);
      setKdsSoundOnRush(existingKdsDisplay.sound_on_rush ?? true);
      setKdsShowOrderSource(existingKdsDisplay.show_order_source ?? true);
      setKdsShowServerName(existingKdsDisplay.show_server_name ?? true);
      setKdsShowOrderNotes(existingKdsDisplay.show_order_notes ?? true);
      setKdsShowAllergyFlags(existingKdsDisplay.show_allergy_flags ?? true);
      setKdsShowOnlineOrders(existingKdsDisplay.show_online_orders ?? true);
      setKdsOnlineOrderPriority(existingKdsDisplay.online_order_priority ?? true);
      setKdsShowReadyByCountdown(existingKdsDisplay.show_ready_by_countdown ?? true);
    }
  }, [existingKdsDisplay, stationToEdit]);

  // Set default capabilities based on station type
  useEffect(() => {
    if (!stationToEdit) {
      switch (stationType) {
        case "register":
          setCanCreateOrders(true);
          setCanProcessPayments(true);
          setCanVoidOrders(true);
          setCanApplyDiscounts(true);
          setCanUpdateKitchenStatus(true);
          setViewScope("location");
          break;
        case "checkout":
          setCanCreateOrders(false);
          setCanProcessPayments(true);
          setCanVoidOrders(false);
          setCanApplyDiscounts(true);
          setCanUpdateKitchenStatus(false);
          setViewScope("own");
          break;
        case "kds":
          setCanCreateOrders(false);
          setCanProcessPayments(false);
          setCanVoidOrders(false);
          setCanApplyDiscounts(false);
          setCanUpdateKitchenStatus(true);
          setViewScope("location");
          break;
        case "self_service":
          setCanCreateOrders(true);
          setCanProcessPayments(true);
          setCanVoidOrders(false);
          setCanApplyDiscounts(false);
          setCanUpdateKitchenStatus(false);
          setViewScope("own");
          break;
      }
      // Auto-generate station number from query
      if (nextNumber) {
        setStationNumber(nextNumber);
      }
    }
  }, [stationType, stationToEdit, nextNumber]);

  const resetKdsFields = () => {
    setKdsDisplayName("");
    setKdsDisplayColor("#3B82F6");
    setKdsDisplayMode("ticket");
    setKdsColumns(4);
    setKdsFontScale(1.0);
    setKdsRoutingMode("all");
    setKdsShowAllItems(false);
    setKdsWarningMinutes(5);
    setKdsAlertMinutes(10);
    setKdsAutoBumpMinutes(null);
    setKdsSoundOnNewOrder(true);
    setKdsSoundOnRush(true);
    setKdsShowOrderSource(true);
    setKdsShowServerName(true);
    setKdsShowOrderNotes(true);
    setKdsShowAllergyFlags(true);
    setKdsShowOnlineOrders(true);
    setKdsOnlineOrderPriority(true);
    setKdsShowReadyByCountdown(true);
    setSelectedPrepStationNames([]);
  };

  const resetForm = () => {
    setStationName("");
    setStationCode("");
    setStationType("register");
    setStationNumber(nextNumber || 1);
    setDeviceName("");
    setHardwareModel("");
    setSyncRole("follower");
    setViewScope("location");
    setCanCreateOrders(true);
    setCanProcessPayments(true);
    setCanVoidOrders(true);
    setCanApplyDiscounts(true);
    setCanUpdateKitchenStatus(true);
    resetKdsFields();
    setActiveTab("basic");
  };

  const handleSave = async () => {
    if (!stationName.trim()) return;

    const kdsConfig = isKds
      ? {
          display_name: kdsDisplayName.trim() || stationName.trim(),
          display_color: kdsDisplayColor,
          display_mode: kdsDisplayMode,
          columns: kdsColumns,
          font_scale: kdsFontScale,
          routing_mode: kdsRoutingMode,
          show_all_items: kdsShowAllItems,
          warning_minutes: kdsWarningMinutes,
          alert_minutes: kdsAlertMinutes,
          auto_bump_minutes: kdsAutoBumpMinutes,
          sound_on_new_order: kdsSoundOnNewOrder,
          sound_on_rush: kdsSoundOnRush,
          show_order_source: kdsShowOrderSource,
          show_server_name: kdsShowServerName,
          show_order_notes: kdsShowOrderNotes,
          show_allergy_flags: kdsShowAllergyFlags,
          show_online_orders: kdsShowOnlineOrders,
          online_order_priority: kdsOnlineOrderPriority,
          show_ready_by_countdown: kdsShowReadyByCountdown,
        }
      : undefined;

    const stationData = {
      location_id: locationId,
      station_name: stationName.trim(),
      station_code: stationCode.trim() || undefined,
      station_type: stationType,
      station_number: stationNumber,
      device_name: deviceName.trim() || undefined,
      hardware_model: hardwareModel.trim() || undefined,
      sync_role: syncRole,
      view_scope: viewScope,
      can_create_orders: canCreateOrders,
      can_process_payments: canProcessPayments,
      can_void_orders: canVoidOrders,
      can_apply_discounts: canApplyDiscounts,
      can_update_kitchen_status: canUpdateKitchenStatus,
      kds_config: kdsConfig,
    };

    try {
      if (stationToEdit) {
        await updateMutation.mutateAsync({
          stationId: stationToEdit.id,
          input: stationData,
        });
        // Update KDS display config separately if editing a KDS station
        if (isKds && existingKdsDisplay && kdsConfig) {
          await updateKdsMutation.mutateAsync({
            kdsDisplayId: existingKdsDisplay.id,
            input: kdsConfig,
          });
          // Save routing rules for prep_station mode
          if (kdsRoutingMode === "prep_station") {
            await setRoutingRulesMutation.mutateAsync({
              kdsDisplayId: existingKdsDisplay.id,
              rules: selectedPrepStationNames.map((name) => ({
                rule_type: "prep_station",
                rule_value: name,
              })),
            });
          }
        }
      } else {
        const created = await createMutation.mutateAsync({
          clerkOrgId,
          input: stationData,
        });
        // After creating a KDS station, fetch its display and save routing rules
        if (isKds && created && kdsRoutingMode === "prep_station" && selectedPrepStationNames.length > 0) {
          // The KDS display was created in the createStation action
          // We need to fetch it to get the display ID
          const { getKdsDisplayByStationId } = await import("@/app/dashboard/actions/stations");
          const displayResult = await getKdsDisplayByStationId(created.id);
          if (displayResult.success && displayResult.data) {
            await setRoutingRulesMutation.mutateAsync({
              kdsDisplayId: displayResult.data.id,
              rules: selectedPrepStationNames.map((name) => ({
                rule_type: "prep_station",
                rule_value: name,
              })),
            });
          }
        }
      }
      handleClose();
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetForm, 200);
  };

  const isLoading = createMutation.isPending || updateMutation.isPending || updateKdsMutation.isPending || setRoutingRulesMutation.isPending;
  const canSave = stationName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Editor — full screen below `sm` (§13.1). The dialog clips; the body
          below is the only scroller, so header and footer need no rules to
          separate themselves from scrolling content (§5.5). */}
      <DialogContent className={cn(
        "flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0",
        "sm:h-auto sm:max-h-[90vh] sm:w-[calc(100%-1rem)] sm:rounded-3xl sm:max-w-[760px]"
      )}>
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-0 bg-muted/60 text-foreground">
              <span className="text-2xl">{getStationTypeIcon(stationType)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl">
                {stationToEdit ? "Edit Station" : "Add New Station"}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {stationToEdit
                  ? "Update the station configuration, device identity, and permissions."
                  : "Create a new station for your POS devices, kiosks, or kitchen displays."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* The scroller is bare and the padding lives on the inner wrapper, so
            the scrollbar tracks the panel edge instead of floating 24px inside
            it — same split as `ReceiptModal`. */}
        <div className="thin-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="min-w-0 px-6 py-5">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* §4.5 pill rail — a scroller, not a fixed grid, so five tabs stay
              reachable at 320px. Classes are literal (C7). */}
          <div ref={tabRailRef} className="thin-scrollbar w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-1">
            <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
              <TabsTrigger value="basic" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border">
                Basic Info
              </TabsTrigger>
              <TabsTrigger value="device" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border">
                Device
              </TabsTrigger>
              {isKds && (
                <TabsTrigger value="kds-display" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border">
                  Display
                </TabsTrigger>
              )}
              {isKds && (
                <TabsTrigger value="kds-behavior" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border">
                  Behavior
                </TabsTrigger>
              )}
              <TabsTrigger value="capabilities" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border">
                Capabilities
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="basic" className="space-y-4 py-4">
            {/* Station Type Selection */}
            <div className="grid gap-2">
              <Label>Station Type</Label>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                <StationTypeCard
                  type="register"
                  label="Register"
                  sublabel="Full POS"
                  icon={getStationTypeIcon("register")}
                  selected={stationType === "register"}
                  onClick={() => setStationType("register")}
                />
                <StationTypeCard
                  type="checkout"
                  label="Checkout"
                  sublabel="Payment only"
                  icon={getStationTypeIcon("checkout")}
                  selected={stationType === "checkout"}
                  onClick={() => setStationType("checkout")}
                />
                <StationTypeCard
                  type="kds"
                  label="KDS"
                  sublabel="Kitchen display"
                  icon={getStationTypeIcon("kds")}
                  selected={stationType === "kds"}
                  onClick={() => setStationType("kds")}
                />
                <StationTypeCard
                  type="self_service"
                  label="Kiosk"
                  sublabel="Self-service"
                  icon={getStationTypeIcon("self_service")}
                  selected={stationType === "self_service"}
                  onClick={() => setStationType("self_service")}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="stationName">Station Name *</Label>
                <Input
                  id="stationName"
                  value={stationName}
                  onChange={(e) => setStationName(e.target.value)}
                  placeholder="e.g., Front Counter"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="stationCode">Station Code</Label>
                <Input
                  id="stationCode"
                  value={stationCode}
                  onChange={(e) => setStationCode(e.target.value.toUpperCase())}
                  placeholder="e.g., REG1"
                  maxLength={10}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="stationNumber">Station Number</Label>
                <Input
                  id="stationNumber"
                  type="number"
                  min={1}
                  value={stationNumber || ""}
                  onChange={(e) =>
                    setStationNumber(
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                  placeholder="Auto-assigned"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="device" className="space-y-4 py-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="deviceName">Device Name</Label>
                <Input
                  id="deviceName"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g., Front Counter iPad"
                />
                <p className="text-xs text-muted-foreground">
                  A friendly name for the physical device
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="hardwareModel">Hardware Model</Label>
                <Input
                  id="hardwareModel"
                  value={hardwareModel}
                  onChange={(e) => setHardwareModel(e.target.value)}
                  placeholder="e.g., iPad Pro 11"
                />
              </div>

              <div className="min-w-0 rounded-2xl border-0 bg-muted/60 p-6 text-center shadow-none">
                <p className="text-sm text-muted-foreground">
                  Device ID, IP address, and other network details will be
                  automatically populated when the POS app connects.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* KDS Display Tab */}
          {isKds && (
            <TabsContent value="kds-display" className="space-y-4 py-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="kdsDisplayName">Display Name</Label>
                  <Input
                    id="kdsDisplayName"
                    value={kdsDisplayName}
                    onChange={(e) => setKdsDisplayName(e.target.value)}
                    placeholder={stationName || "e.g., Grill Station"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Defaults to station name if left empty
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label>Display Color</Label>
                  <ColorSwatchPicker value={kdsDisplayColor} onChange={setKdsDisplayColor} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="kdsDisplayMode">Display Mode</Label>
                    <Select
                      value={kdsDisplayMode}
                      onValueChange={(v) => setKdsDisplayMode(v as KdsDisplayMode)}
                    >
                      <SelectTrigger id="kdsDisplayMode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ticket">Ticket View</SelectItem>
                        <SelectItem value="list">List View</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {kdsDisplayMode === "ticket" && (
                    <div className="grid gap-2">
                      <Label htmlFor="kdsColumns">Columns</Label>
                      <Select
                        value={String(kdsColumns)}
                        onValueChange={(v) => setKdsColumns(Number(v))}
                      >
                        <SelectTrigger id="kdsColumns">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 Columns</SelectItem>
                          <SelectItem value="3">3 Columns</SelectItem>
                          <SelectItem value="4">4 Columns</SelectItem>
                          <SelectItem value="5">5 Columns</SelectItem>
                          <SelectItem value="6">6 Columns</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="kdsFontScale">Font Scale</Label>
                  <Select
                    value={String(kdsFontScale)}
                    onValueChange={(v) => setKdsFontScale(Number(v))}
                  >
                    <SelectTrigger id="kdsFontScale">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.8">0.8x - Compact</SelectItem>
                      <SelectItem value="1">1.0x - Normal</SelectItem>
                      <SelectItem value="1.25">1.25x - Large</SelectItem>
                      <SelectItem value="1.5">1.5x - Extra Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="kdsRoutingMode">Routing Mode</Label>
                  <Select
                    value={kdsRoutingMode}
                    onValueChange={(v) => setKdsRoutingMode(v as KdsRoutingMode)}
                  >
                    <SelectTrigger id="kdsRoutingMode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Items</SelectItem>
                      <SelectItem value="category">By Category</SelectItem>
                      <SelectItem value="prep_station">By Prep Station</SelectItem>
                      <SelectItem value="order_type">By Order Type</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Prep Station Selection - shown when routing mode is prep_station */}
                {kdsRoutingMode === "prep_station" && (
                  <div className="grid gap-2">
                    <Label>Assigned Prep Stations</Label>
                    {activePrepStations.length === 0 ? (
                      <div className="flex min-w-0 items-start gap-2 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
                        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">
                          No prep stations found for this location. Create prep stations in Settings &gt; Prep Stations first.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activePrepStations.map((ps) => {
                          const isSelected = selectedPrepStationNames.includes(ps.name);
                          return (
                            <label
                              key={ps.id}
                              className={cn(
                                "flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl border-0 p-3 shadow-none transition-colors",
                                isSelected
                                  ? "bg-muted ring-1 ring-border"
                                  : "bg-muted/45 hover:bg-muted"
                              )}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedPrepStationNames((prev) => [...prev, ps.name]);
                                  } else {
                                    setSelectedPrepStationNames((prev) =>
                                      prev.filter((n) => n !== ps.name)
                                    );
                                  }
                                }}
                              />
                              <div
                                className="h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: ps.color || "#6B7280" }}
                              />
                              <span className="text-sm font-medium">{ps.name}</span>
                            </label>
                          );
                        })}
                        <p className="text-xs text-muted-foreground">
                          Select which prep stations this KDS display should show items for.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="kdsShowAllItems" className="cursor-pointer">
                      Show All Items
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Display all order items even if not routed here
                    </p>
                  </div>
                  <Switch
                    id="kdsShowAllItems"
                    checked={kdsShowAllItems}
                    onCheckedChange={setKdsShowAllItems}
                  />
                </div>

                {kdsRoutingMode !== "prep_station" && (
                  <div className="flex min-w-0 items-start gap-2 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Routing rules for specific categories can be configured on the station detail page after creation.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          )}

          {/* KDS Behavior Tab */}
          {isKds && (
            <TabsContent value="kds-behavior" className="space-y-4 py-4">
              <div className="grid gap-4">
                {/* Timing & Alerts */}
                <div>
                  <p className="text-sm font-medium mb-3">Timing & Alerts</p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="grid gap-2">
                      <Label htmlFor="kdsWarningMinutes">Warning (min)</Label>
                      <Input
                        id="kdsWarningMinutes"
                        type="number"
                        min={1}
                        max={60}
                        value={kdsWarningMinutes}
                        onChange={(e) => setKdsWarningMinutes(Number(e.target.value) || 5)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="kdsAlertMinutes">Alert (min)</Label>
                      <Input
                        id="kdsAlertMinutes"
                        type="number"
                        min={1}
                        max={120}
                        value={kdsAlertMinutes}
                        onChange={(e) => setKdsAlertMinutes(Number(e.target.value) || 10)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="kdsAutoBumpMinutes">Auto-Bump (min)</Label>
                      <Input
                        id="kdsAutoBumpMinutes"
                        type="number"
                        min={0}
                        max={120}
                        value={kdsAutoBumpMinutes ?? ""}
                        onChange={(e) =>
                          setKdsAutoBumpMinutes(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        placeholder="Off"
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty to disable
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sounds */}
                <div>
                  <p className="text-sm font-medium mb-3">Sounds</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="kdsSoundOnNewOrder" className="cursor-pointer">
                        Sound on New Order
                      </Label>
                      <Switch
                        id="kdsSoundOnNewOrder"
                        checked={kdsSoundOnNewOrder}
                        onCheckedChange={setKdsSoundOnNewOrder}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="kdsSoundOnRush" className="cursor-pointer">
                        Sound on Rush
                      </Label>
                      <Switch
                        id="kdsSoundOnRush"
                        checked={kdsSoundOnRush}
                        onCheckedChange={setKdsSoundOnRush}
                      />
                    </div>
                  </div>
                </div>

                {/* Display Info */}
                <div>
                  <p className="text-sm font-medium mb-3">Display Information</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="kdsShowOrderSource" className="cursor-pointer">
                        Show Order Source
                      </Label>
                      <Switch
                        id="kdsShowOrderSource"
                        checked={kdsShowOrderSource}
                        onCheckedChange={setKdsShowOrderSource}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="kdsShowServerName" className="cursor-pointer">
                        Show Server Name
                      </Label>
                      <Switch
                        id="kdsShowServerName"
                        checked={kdsShowServerName}
                        onCheckedChange={setKdsShowServerName}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="kdsShowOrderNotes" className="cursor-pointer">
                        Show Order Notes
                      </Label>
                      <Switch
                        id="kdsShowOrderNotes"
                        checked={kdsShowOrderNotes}
                        onCheckedChange={setKdsShowOrderNotes}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="kdsShowAllergyFlags" className="cursor-pointer">
                        Show Allergy Flags
                      </Label>
                      <Switch
                        id="kdsShowAllergyFlags"
                        checked={kdsShowAllergyFlags}
                        onCheckedChange={setKdsShowAllergyFlags}
                      />
                    </div>
                  </div>
                </div>

                {/* Online Orders */}
                <div>
                  <p className="text-sm font-medium mb-3">Online Orders</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="kdsShowOnlineOrders" className="cursor-pointer">
                        Show Online Orders
                      </Label>
                      <Switch
                        id="kdsShowOnlineOrders"
                        checked={kdsShowOnlineOrders}
                        onCheckedChange={setKdsShowOnlineOrders}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="kdsOnlineOrderPriority" className="cursor-pointer">
                        Online Order Priority
                      </Label>
                      <Switch
                        id="kdsOnlineOrderPriority"
                        checked={kdsOnlineOrderPriority}
                        onCheckedChange={setKdsOnlineOrderPriority}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="kdsShowReadyByCountdown" className="cursor-pointer">
                        Show Ready-by Countdown
                      </Label>
                      <Switch
                        id="kdsShowReadyByCountdown"
                        checked={kdsShowReadyByCountdown}
                        onCheckedChange={setKdsShowReadyByCountdown}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}

          <TabsContent value="capabilities" className="space-y-4 py-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="canCreateOrders" className="cursor-pointer">
                    Create Orders
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Can create and modify orders
                  </p>
                </div>
                <Switch
                  id="canCreateOrders"
                  checked={canCreateOrders}
                  onCheckedChange={setCanCreateOrders}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="canProcessPayments" className="cursor-pointer">
                    Process Payments
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Can accept and process payments
                  </p>
                </div>
                <Switch
                  id="canProcessPayments"
                  checked={canProcessPayments}
                  onCheckedChange={setCanProcessPayments}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="canVoidOrders" className="cursor-pointer">
                    Void Orders
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Can void or cancel orders
                  </p>
                </div>
                <Switch
                  id="canVoidOrders"
                  checked={canVoidOrders}
                  onCheckedChange={setCanVoidOrders}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="canApplyDiscounts" className="cursor-pointer">
                    Apply Discounts
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Can apply discounts to orders
                  </p>
                </div>
                <Switch
                  id="canApplyDiscounts"
                  checked={canApplyDiscounts}
                  onCheckedChange={setCanApplyDiscounts}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="canUpdateKitchenStatus" className="cursor-pointer">
                    Update Kitchen Status
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Can mark items as ready or done
                  </p>
                </div>
                <Switch
                  id="canUpdateKitchenStatus"
                  checked={canUpdateKitchenStatus}
                  onCheckedChange={setCanUpdateKitchenStatus}
                />
              </div>

              {/* Separated by spacing, not a rule (§5.5). */}
              <div className="mt-6">
                <div className="grid gap-2">
                  <Label htmlFor="viewScope">View Scope</Label>
                  <Select
                    value={viewScope}
                    onValueChange={(v) => setViewScope(v as ViewScope)}
                  >
                    <SelectTrigger id="viewScope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="own">Own Orders Only</SelectItem>
                      <SelectItem value="location">All Location Orders</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    KDS typically needs &quot;All Location Orders&quot; to see all tickets
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 px-6 py-4">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !canSave}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {stationToEdit ? "Updating..." : "Creating..."}
              </>
            ) : stationToEdit ? (
              "Update Station"
            ) : (
              "Create Station"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
