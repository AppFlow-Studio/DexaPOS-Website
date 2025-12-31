"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

export type DeviceType = "pos" | "kiosk" | "printer" | "cash_drawer";

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  status: "online" | "offline" | "error";
  lastSeen?: string;
  locationId?: string; // Optional for now, assuming current location context
  // Connection details
  ipAddress?: string;
  macAddress?: string;
  // Dejavoo specific
  dejavooAuthKey?: string;
  dejavooRegisterId?: string;
  // Printer/Drawer specific
  connectedPrinterId?: string;
  kickCommand?: string;
}

interface DevicesState {
  devices: Device[];
  addDevice: (device: Omit<Device, "id" | "status" | "lastSeen">) => void;
  updateDevice: (id: string, updates: Partial<Device>) => void;
  removeDevice: (id: string) => void;
  simulateConnection: (id: string) => Promise<boolean>;
}

export const useDevices = create<DevicesState>()(
  persist(
    (set, get) => ({
      devices: [
        {
          id: "dev_1",
          name: "Front Counter POS",
          type: "pos",
          status: "online",
          lastSeen: new Date().toISOString(),
          dejavooRegisterId: "TPN-12345",
        },
        {
          id: "dev_2",
          name: "Kitchen Printer",
          type: "printer",
          status: "online",
          lastSeen: new Date().toISOString(),
          ipAddress: "192.168.1.50",
        },
      ],
      addDevice: (newDevice) =>
        set((state) => ({
          devices: [
            ...state.devices,
            {
              ...newDevice,
              id: uuidv4(),
              status: "offline", // Default to offline until tested
              lastSeen: new Date().toISOString(),
            },
          ],
        })),
      updateDevice: (id, updates) =>
        set((state) => ({
          devices: state.devices.map((dev) =>
            dev.id === id ? { ...dev, ...updates } : dev
          ),
        })),
      removeDevice: (id) =>
        set((state) => ({
          devices: state.devices.filter((dev) => dev.id !== id),
        })),
      simulateConnection: async (id) => {
        // Mock connection test
        set((state) => ({
          devices: state.devices.map(
            (dev) => (dev.id === id ? { ...dev, status: "error" } : dev) // Briefly show checking? Logic handled in UI loading state usually
          ),
        }));

        await new Promise((resolve) => setTimeout(resolve, 1500));

        const success = Math.random() > 0.1; // 90% success rate

        set((state) => ({
          devices: state.devices.map((dev) =>
            dev.id === id
              ? {
                  ...dev,
                  status: success ? "online" : "error",
                  lastSeen: success ? new Date().toISOString() : dev.lastSeen,
                }
              : dev
          ),
        }));

        return success;
      },
    }),
    {
      name: "dexavos-devices-storage",
    }
  )
);
