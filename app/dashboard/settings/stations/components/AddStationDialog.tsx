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
import { useState, useEffect } from "react";
import {
  useCreateStation,
  useUpdateStation,
  useNextStationNumber,
  Station,
  StationType,
  SyncRole,
  ViewScope,
  getStationTypeIcon,
} from "../hooks/useStations";
import { Loader2 } from "lucide-react";
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
        "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center w-full",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/50 hover:bg-muted/50"
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

  const [activeTab, setActiveTab] = useState("basic");

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

  // Get next station number
  const { data: nextNumber } = useNextStationNumber(locationId, stationType);

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

  // Set default capabilities based on station type
  useEffect(() => {
    if (!stationToEdit) {
      switch (stationType) {
        case "register":
          setCanCreateOrders(true);
          setCanProcessPayments(true);
          setCanVoidOrders(false);
          setCanApplyDiscounts(true);
          setCanUpdateKitchenStatus(false);
          setViewScope("own");
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

  const resetForm = () => {
    setStationName("");
    setStationCode("");
    setStationType("register");
    setStationNumber(nextNumber || 1);
    setDeviceName("");
    setHardwareModel("");
    setSyncRole("follower");
    setViewScope("own");
    setCanCreateOrders(true);
    setCanProcessPayments(false);
    setCanVoidOrders(false);
    setCanApplyDiscounts(true);
    setCanUpdateKitchenStatus(false);
    setActiveTab("basic");
  };

  const handleSave = async () => {
    if (!stationName.trim()) return;

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
    };

    try {
      if (stationToEdit) {
        await updateMutation.mutateAsync({
          stationId: stationToEdit.id,
          input: stationData,
        });
      } else {
        await createMutation.mutateAsync({
          clerkOrgId,
          input: stationData,
        });
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

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const canSave = stationName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {stationToEdit ? "Edit Station" : "Add New Station"}
          </DialogTitle>
          <DialogDescription>
            {stationToEdit
              ? "Update the station configuration."
              : "Create a new station for your POS system."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="device">Device</TabsTrigger>
            <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 py-4">
            {/* Station Type Selection */}
            <div className="grid gap-2">
              <Label>Station Type</Label>
              <div className="grid grid-cols-4 gap-2">
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

              <div className="grid gap-2">
                <Label htmlFor="syncRole">Sync Role</Label>
                <Select value={syncRole} onValueChange={(v) => setSyncRole(v as SyncRole)}>
                  <SelectTrigger id="syncRole">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leader">Leader</SelectItem>
                    <SelectItem value="follower">Follower</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Leader stations sync data to other stations
                </p>
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

              <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Device ID, IP address, and other network details will be
                  automatically populated when the POS app connects.
                </p>
              </div>
            </div>
          </TabsContent>

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

              <div className="border-t pt-4">
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

        <DialogFooter className="gap-2">
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
