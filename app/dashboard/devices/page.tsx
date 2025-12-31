"use client";

import { useDevices, Device } from "./hooks/useDevices";
import { DeviceCard } from "./components/DeviceCard"; // Will create next
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { AddDeviceDialog } from "./components/AddDeviceDialog";

export default function DevicesPage() {
  const { devices } = useDevices();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);

  const filteredDevices = devices.filter((device) =>
    device.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Device Management
          </h2>
          <p className="text-muted-foreground">
            Configure and monitor your POS terminals, kiosks, and printers
          </p>
        </div>
        <div>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Device
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-full sm:w-[300px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search devices..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredDevices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            onEdit={(dev) => {
              setEditingDevice(dev);
              setIsAddDialogOpen(true);
            }}
          />
        ))}
        {filteredDevices.length === 0 && (
          <div className="col-span-full flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            No devices found. Add one to get started.
          </div>
        )}
      </div>

      <AddDeviceDialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) setEditingDevice(null);
        }}
        deviceToEdit={editingDevice}
      />
    </div>
  );
}
