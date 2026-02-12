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
import { Separator } from "@/components/ui/separator";
import { useState, useEffect } from "react";
import {
  StationWithHeartbeat,
  useUpdateDevice,
  getStationTypeLabel,
  getNetworkTypeLabel,
  formatLastSeen,
} from "../hooks/useDevices";
import type { StationType, ViewScope } from "../hooks/useDevices";
import { Loader2 } from "lucide-react";

interface EditDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: StationWithHeartbeat | null;
}

export function EditDeviceDialog({
  open,
  onOpenChange,
  device,
}: EditDeviceDialogProps) {
  const updateMutation = useUpdateDevice();

  const [stationName, setStationName] = useState("");
  const [stationCode, setStationCode] = useState("");
  const [stationType, setStationType] = useState<StationType>("register");
  const [viewScope, setViewScope] = useState<ViewScope>("own");
  const [canCreateOrders, setCanCreateOrders] = useState(true);
  const [canProcessPayments, setCanProcessPayments] = useState(false);
  const [canVoidOrders, setCanVoidOrders] = useState(false);
  const [canApplyDiscounts, setCanApplyDiscounts] = useState(true);
  const [canUpdateKitchenStatus, setCanUpdateKitchenStatus] = useState(false);

  // Populate form when device changes
  useEffect(() => {
    if (device && open) {
      setStationName(device.station_name);
      setStationCode(device.station_code || "");
      setStationType(device.station_type);
      setViewScope(device.view_scope);
      setCanCreateOrders(device.can_create_orders);
      setCanProcessPayments(device.can_process_payments);
      setCanVoidOrders(device.can_void_orders);
      setCanApplyDiscounts(device.can_apply_discounts);
      setCanUpdateKitchenStatus(device.can_update_kitchen_status);
    }
  }, [device, open]);

  const handleSave = async () => {
    if (!device || !stationName.trim()) return;

    try {
      await updateMutation.mutateAsync({
        stationId: device.id,
        input: {
          station_name: stationName.trim(),
          station_code: stationCode.trim() || null,
          station_type: stationType,
          view_scope: viewScope,
          can_create_orders: canCreateOrders,
          can_process_payments: canProcessPayments,
          can_void_orders: canVoidOrders,
          can_apply_discounts: canApplyDiscounts,
          can_update_kitchen_status: canUpdateKitchenStatus,
        },
      });
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  if (!device) return null;

  const deviceModel =
    device.device_manufacturer && device.device_model
      ? `${device.device_manufacturer} ${device.device_model}`
      : device.hardware_model || "Unknown";
  const appVersion =
    device.latest_heartbeat?.app_version || device.app_version;
  const networkType =
    device.latest_heartbeat?.network_type || device.network_type;
  const lastSeen = formatLastSeen(
    device.latest_heartbeat?.heartbeat_at,
    device.last_heartbeat_at
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Device</DialogTitle>
          <DialogDescription>
            Update station configuration for {device.station_name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Read-Only Hardware Info */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <p className="font-medium text-xs uppercase text-muted-foreground tracking-wide">
              Hardware Info
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground">Device:</span>{" "}
                {deviceModel}
              </div>
              <div>
                <span className="text-muted-foreground">OS:</span>{" "}
                {device.os_version ? `Android ${device.os_version}` : "—"}
              </div>
              <div>
                <span className="text-muted-foreground">App:</span>{" "}
                {appVersion ? `v${appVersion}` : "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Network:</span>{" "}
                {getNetworkTypeLabel(networkType)}
                {device.network_ssid ? ` (${device.network_ssid})` : ""}
              </div>
              <div>
                <span className="text-muted-foreground">IP:</span>{" "}
                {device.local_ip_address || device.ip_address || "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Last seen:</span>{" "}
                {lastSeen}
              </div>
            </div>
          </div>

          <Separator />

          {/* Editable Fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-stationName">Station Name *</Label>
              <Input
                id="edit-stationName"
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                placeholder="e.g., Front Counter"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-stationCode">Station Code</Label>
              <Input
                id="edit-stationCode"
                value={stationCode}
                onChange={(e) => setStationCode(e.target.value.toUpperCase())}
                placeholder="e.g., REG1"
                maxLength={10}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-stationType">Station Type</Label>
              <Select
                value={stationType}
                onValueChange={(v) => setStationType(v as StationType)}
              >
                <SelectTrigger id="edit-stationType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="register">Register</SelectItem>
                  <SelectItem value="checkout">Checkout</SelectItem>
                  <SelectItem value="kds">Kitchen Display</SelectItem>
                  <SelectItem value="self_service">Self-Service Kiosk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-viewScope">View Scope</Label>
              <Select
                value={viewScope}
                onValueChange={(v) => setViewScope(v as ViewScope)}
              >
                <SelectTrigger id="edit-viewScope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">Own Orders Only</SelectItem>
                  <SelectItem value="location">All Location Orders</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Capabilities Toggles */}
          <div className="space-y-3">
            <p className="font-medium text-xs uppercase text-muted-foreground tracking-wide">
              Capabilities
            </p>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-canCreateOrders" className="cursor-pointer">
                Create Orders
              </Label>
              <Switch
                id="edit-canCreateOrders"
                checked={canCreateOrders}
                onCheckedChange={setCanCreateOrders}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-canProcessPayments" className="cursor-pointer">
                Process Payments
              </Label>
              <Switch
                id="edit-canProcessPayments"
                checked={canProcessPayments}
                onCheckedChange={setCanProcessPayments}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-canVoidOrders" className="cursor-pointer">
                Void Orders
              </Label>
              <Switch
                id="edit-canVoidOrders"
                checked={canVoidOrders}
                onCheckedChange={setCanVoidOrders}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-canApplyDiscounts" className="cursor-pointer">
                Apply Discounts
              </Label>
              <Switch
                id="edit-canApplyDiscounts"
                checked={canApplyDiscounts}
                onCheckedChange={setCanApplyDiscounts}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-canUpdateKitchenStatus" className="cursor-pointer">
                Update Kitchen Status
              </Label>
              <Switch
                id="edit-canUpdateKitchenStatus"
                checked={canUpdateKitchenStatus}
                onCheckedChange={setCanUpdateKitchenStatus}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !stationName.trim()}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
