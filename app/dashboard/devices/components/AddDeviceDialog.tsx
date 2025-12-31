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
import { useState, useEffect } from "react";
import { useDevices, DeviceType } from "../hooks/useDevices";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface AddDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceToEdit?: any; // Using any to avoid circular dependency or import issues for now
}

export function AddDeviceDialog({
  open,
  onOpenChange,
  deviceToEdit,
}: AddDeviceDialogProps) {
  const { addDevice, updateDevice } = useDevices();
  const [isLoading, setIsLoading] = useState(false);

  // Local state form (keeping it simple without zod/react-hook-form for this wizard)
  // Local state form
  const [name, setName] = useState("");
  const [type, setType] = useState<DeviceType>("pos");
  const [dejavooAuthKey, setDejavooAuthKey] = useState("");
  const [dejavooRegisterId, setDejavooRegisterId] = useState("");
  const [ipAddress, setIpAddress] = useState("");

  // Sync state with deviceToEdit when dialog opens
  useEffect(() => {
    if (open) {
      if (deviceToEdit) {
        setName(deviceToEdit.name);
        setType(deviceToEdit.type);
        setDejavooAuthKey(deviceToEdit.dejavooAuthKey || "");
        setDejavooRegisterId(deviceToEdit.dejavooRegisterId || "");
        setIpAddress(deviceToEdit.ipAddress || "");
      } else {
        // Reset defaults
        setName("");
        setType("pos");
        setDejavooAuthKey("");
        setDejavooRegisterId("");
        setIpAddress("");
      }
    }
  }, [open, deviceToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Create Object
      const newDevice = {
        name,
        type,
        ...(type === "pos" || type === "kiosk"
          ? {
              dejavooAuthKey,
              dejavooRegisterId,
            }
          : {}),
        ...(type === "printer"
          ? {
              ipAddress,
            }
          : {}),
      };

      // Add to store
      if (deviceToEdit) {
        updateDevice(deviceToEdit.id, newDevice);
        toast.success("Device updated successfully");
      } else {
        addDevice(newDevice);
        toast.success(`${type.toUpperCase()} added successfully`);
      }
      handleClose();
    } catch (error) {
      toast.error("Failed to add device");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset form
    setName("");
    setType("pos");
    setDejavooAuthKey("");
    setDejavooRegisterId("");
    setIpAddress("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {deviceToEdit ? "Edit Device Configuration" : "Add New Device"}
          </DialogTitle>
          <DialogDescription>
            {deviceToEdit
              ? "Update the details for this device."
              : "Register a new hardware device to this location."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">
                Type
              </Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as DeviceType)}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select device type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pos">POS Terminal</SelectItem>
                  <SelectItem value="kiosk">Self-Service Kiosk</SelectItem>
                  <SelectItem value="printer">Printer</SelectItem>
                  <SelectItem value="cash_drawer">Cash Drawer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Front Counter"
                className="col-span-3"
                required
              />
            </div>

            {/* Conditional Fields based on Type */}
            {(type === "pos" || type === "kiosk") && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="regId" className="text-right">
                    Register ID
                  </Label>
                  <Input
                    id="regId"
                    value={dejavooRegisterId}
                    onChange={(e) => setDejavooRegisterId(e.target.value)}
                    placeholder="Dejavoo TPN"
                    className="col-span-3"
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="authKey" className="text-right">
                    Auth Key
                  </Label>
                  <Input
                    id="authKey"
                    value={dejavooAuthKey}
                    onChange={(e) => setDejavooAuthKey(e.target.value)}
                    placeholder="Dejavoo Auth Key"
                    className="col-span-3"
                    type="password"
                    required
                  />
                </div>
              </>
            )}

            {type === "printer" && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="ip" className="text-right">
                  IP Address
                </Label>
                <Input
                  id="ip"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="192.168.1.x"
                  className="col-span-3"
                  required
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deviceToEdit ? "Update Device" : "Save Device"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
