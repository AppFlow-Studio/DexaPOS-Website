"use client";

import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";

export type DeviceType = "external_terminal" | "tablet" | "printer";
export type ConnectionType = "bluetooth" | "usb" | "wifi" | "wired" | "builtin";
export type PrinterType = "kitchen" | "receipt";
export type IssueType =
  | "offline"
  | "low_paper"
  | "firmware_update"
  | "connection_weak"
  | "error";
export type IssueSeverity = "critical" | "warning" | "info";

// Prep stations (mock data)
export const PREP_STATIONS = [
  { id: "kitchen", label: "Kitchen" },
  { id: "bar", label: "Bar" },
  { id: "grill", label: "Grill" },
  { id: "salad", label: "Salad Station" },
  { id: "dessert", label: "Dessert Station" },
  { id: "expo", label: "Expediter" },
] as const;

// Device issue interface
export interface DeviceIssue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  timestamp: string;
  dismissible: boolean;
}

// Activity log entry
export interface ActivityLog {
  id: string;
  action: string;
  details?: string;
  timestamp: string;
  type: "payment" | "print" | "connection" | "error" | "system";
}

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  status: "online" | "offline";
  lastSeen?: string;
  offlineSince?: string;
  connectedSince?: string; // For uptime calculation
  locationId?: string;
  serialNumber?: string;
  alerts: number;
  // Connection details
  ipAddress?: string;
  macAddress?: string;
  connectionType?: ConnectionType;
  signalStrength?: number; // 1-4 for wireless
  // Dejavoo specific (for external_terminal)
  dejavooAuthKey?: string;
  dejavooRegisterId?: string;
  // Device model info
  model?: string;
  manufacturer?: string;
  firmwareVersion?: string;
  appVersion?: string; // For tablets
  lastUpdated?: string;
  updateAvailable?: boolean;
  // Printer specific
  printerType?: PrinterType;
  prepStation?: string;
  alwaysPrint?: boolean;
  sendToExpediter?: boolean;
  // Issues
  issues?: DeviceIssue[];
  // Activity logs
  activityLogs?: ActivityLog[];
}

// Detected printers that haven't been assigned yet
export interface DetectedPrinter {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  connectionType: "bluetooth" | "network" | "usb";
  isAssigned: boolean;
}

interface DevicesState {
  devices: Device[];
  detectedPrinters: DetectedPrinter[];
  addDevice: (
    device: Omit<Device, "id" | "status" | "lastSeen" | "alerts">,
  ) => void;
  updateDevice: (id: string, updates: Partial<Device>) => void;
  removeDevice: (id: string) => void;
  removeMultipleDevices: (ids: string[]) => void;
  dismissIssue: (deviceId: string, issueId: string) => void;
  assignPrinter: (
    printerId: string,
    config: {
      name: string;
      printerType: PrinterType;
      prepStation?: string;
      alwaysPrint: boolean;
      sendToExpediter: boolean;
    },
  ) => void;
  simulateConnection: (id: string) => Promise<boolean>;
  simulatePairing: (
    tpn: string,
  ) => Promise<{ success: boolean; error?: string }>;
  checkForUpdates: (id: string) => Promise<boolean>;
  addActivityLog: (
    deviceId: string,
    log: Omit<ActivityLog, "id" | "timestamp">,
  ) => void;
  performAutomatedCheck: () => Promise<void>;
}

// Helper to format device type for display
export const getDeviceTypeLabel = (type: DeviceType): string => {
  switch (type) {
    case "external_terminal":
      return "External P8 Terminal";
    case "tablet":
      return "Dejavoo P18 Tablet";
    case "printer":
      return "Printer";
    default:
      return type;
  }
};

// Helper to get device type icon emoji
export const getDeviceTypeIcon = (type: DeviceType): string => {
  switch (type) {
    case "external_terminal":
      return "📱";
    case "tablet":
      return "💻";
    case "printer":
      return "🖨️";
    default:
      return "📱";
  }
};

// Helper to get connection type label
export const getConnectionTypeLabel = (type?: ConnectionType): string => {
  switch (type) {
    case "bluetooth":
      return "Bluetooth";
    case "usb":
      return "USB / Wired";
    case "wifi":
      return "Wi-Fi";
    case "wired":
      return "Ethernet";
    case "builtin":
      return "Built-in";
    default:
      return "Unknown";
  }
};

// Generate mock activity logs
const generateMockActivityLogs = (deviceType: DeviceType): ActivityLog[] => {
  const now = Date.now();
  const logs: ActivityLog[] = [];

  if (deviceType === "printer") {
    logs.push(
      {
        id: "log1",
        action: "Print job completed",
        details: "Order #1234",
        timestamp: new Date(now - 1800000).toISOString(),
        type: "print",
      },
      {
        id: "log2",
        action: "Print job completed",
        details: "Order #1233",
        timestamp: new Date(now - 3600000).toISOString(),
        type: "print",
      },
      {
        id: "log3",
        action: "Connection established",
        timestamp: new Date(now - 7200000).toISOString(),
        type: "connection",
      },
    );
  } else if (deviceType === "external_terminal") {
    logs.push(
      {
        id: "log1",
        action: "Payment processed",
        details: "$45.00 - Visa ****4242",
        timestamp: new Date(now - 900000).toISOString(),
        type: "payment",
      },
      {
        id: "log2",
        action: "Payment processed",
        details: "$23.50 - Mastercard ****1234",
        timestamp: new Date(now - 2700000).toISOString(),
        type: "payment",
      },
      {
        id: "log3",
        action: "Connection refreshed",
        timestamp: new Date(now - 5400000).toISOString(),
        type: "connection",
      },
    );
  } else {
    logs.push(
      {
        id: "log1",
        action: "Order sent to kitchen",
        details: "Table 5 - Order #1234",
        timestamp: new Date(now - 600000).toISOString(),
        type: "system",
      },
      {
        id: "log2",
        action: "Payment processed",
        details: "$78.00 - Card",
        timestamp: new Date(now - 1800000).toISOString(),
        type: "payment",
      },
      {
        id: "log3",
        action: "User logged in",
        details: "John Smith",
        timestamp: new Date(now - 14400000).toISOString(),
        type: "system",
      },
    );
  }

  return logs;
};

export const useDevices = create<DevicesState>()(
  persist(
    (set, get) => ({
      devices: [
        {
          id: "dev_1",
          name: "Front Counter Terminal",
          type: "external_terminal",
          status: "online",
          lastSeen: new Date().toISOString(),
          connectedSince: new Date(
            Date.now() - 3 * 24 * 60 * 60 * 1000 - 14 * 60 * 60 * 1000,
          ).toISOString(), // 3 days 14 hours ago
          serialNumber: "LS7222CE40847",
          alerts: 0,
          dejavooRegisterId: "TPN-12345",
          dejavooAuthKey: "auth_key_123",
          connectionType: "bluetooth",
          signalStrength: 4,
          model: "Dejavoo P8",
          manufacturer: "Dejavoo",
          firmwareVersion: "02.14B ESC/POS",
          lastUpdated: "2025-12-15T10:00:00Z",
          updateAvailable: false,
          issues: [],
          activityLogs: generateMockActivityLogs("external_terminal"),
        },
        {
          id: "dev_2",
          name: "terminal_pick up",
          type: "external_terminal",
          status: "online",
          lastSeen: new Date().toISOString(),
          connectedSince: new Date(
            Date.now() - 12 * 60 * 60 * 1000,
          ).toISOString(), // 12 hours ago
          serialNumber: "LS72227A40835",
          alerts: 1,
          dejavooRegisterId: "TPN-67890",
          connectionType: "usb",
          model: "Dejavoo P8",
          manufacturer: "Dejavoo",
          firmwareVersion: "02.12A ESC/POS",
          lastUpdated: "2025-11-20T10:00:00Z",
          updateAvailable: true,
          issues: [
            {
              id: "issue_1",
              type: "firmware_update",
              severity: "info",
              message: "Firmware update available (v02.14B)",
              timestamp: new Date(
                Date.now() - 24 * 60 * 60 * 1000,
              ).toISOString(),
              dismissible: true,
            },
          ],
          activityLogs: generateMockActivityLogs("external_terminal"),
        },
        {
          id: "dev_3",
          name: "Quick Order",
          type: "tablet",
          status: "offline",
          lastSeen: new Date(Date.now() - 3600000).toISOString(),
          offlineSince: new Date(Date.now() - 3600000).toISOString(),
          serialNumber: "TKE34932581",
          alerts: 1,
          model: "Dejavoo P18",
          manufacturer: "Dejavoo",
          connectionType: "wifi",
          signalStrength: 2,
          firmwareVersion: "1.0.5",
          appVersion: "2.3.1",
          lastUpdated: "2025-12-01T10:00:00Z",
          updateAvailable: false,
          issues: [
            {
              id: "issue_2",
              type: "offline",
              severity: "warning",
              message: "Device has been offline for 1 hour",
              timestamp: new Date(Date.now() - 3600000).toISOString(),
              dismissible: false,
            },
          ],
          activityLogs: generateMockActivityLogs("tablet"),
        },
        {
          id: "dev_4",
          name: "Kitchen - X855049243",
          type: "printer",
          status: "online",
          lastSeen: new Date().toISOString(),
          connectedSince: new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000,
          ).toISOString(), // 7 days ago
          serialNumber: "X855049243",
          alerts: 0,
          ipAddress: "192.168.1.50",
          macAddress: "00:1A:2B:3C:4D:5E",
          connectionType: "wired",
          model: "M30 - Epson Receipt Printer",
          manufacturer: "Epson",
          firmwareVersion: "02.14B ESC/POS",
          printerType: "kitchen",
          prepStation: "kitchen",
          alwaysPrint: true,
          sendToExpediter: true,
          issues: [],
          activityLogs: generateMockActivityLogs("printer"),
        },
        // Additional mock devices for pagination testing
        {
          id: "dev_5",
          name: "Bar Terminal",
          type: "external_terminal",
          status: "online",
          lastSeen: new Date().toISOString(),
          connectedSince: new Date(
            Date.now() - 5 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          serialNumber: "LS7222CE40901",
          alerts: 0,
          dejavooRegisterId: "TPN-11111",
          connectionType: "bluetooth",
          signalStrength: 3,
          model: "Dejavoo P8",
          manufacturer: "Dejavoo",
          firmwareVersion: "02.14B ESC/POS",
          issues: [],
          activityLogs: generateMockActivityLogs("external_terminal"),
        },
        {
          id: "dev_6",
          name: "Drive Thru Terminal",
          type: "external_terminal",
          status: "offline",
          lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          offlineSince: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          serialNumber: "LS7222CE40902",
          alerts: 1,
          dejavooRegisterId: "TPN-22222",
          connectionType: "usb",
          model: "Dejavoo P8",
          manufacturer: "Dejavoo",
          firmwareVersion: "02.12A ESC/POS",
          issues: [
            {
              id: "issue_3",
              type: "offline",
              severity: "warning",
              message: "Device has been offline for 2 hours",
              timestamp: new Date(
                Date.now() - 2 * 60 * 60 * 1000,
              ).toISOString(),
              dismissible: false,
            },
          ],
          activityLogs: generateMockActivityLogs("external_terminal"),
        },
        {
          id: "dev_7",
          name: "Patio Tablet",
          type: "tablet",
          status: "online",
          lastSeen: new Date().toISOString(),
          connectedSince: new Date(
            Date.now() - 8 * 60 * 60 * 1000,
          ).toISOString(),
          serialNumber: "TKE34932600",
          alerts: 0,
          model: "Dejavoo P18",
          manufacturer: "Dejavoo",
          connectionType: "wifi",
          signalStrength: 4,
          firmwareVersion: "1.0.5",
          appVersion: "2.3.1",
          issues: [],
          activityLogs: generateMockActivityLogs("tablet"),
        },
        {
          id: "dev_8",
          name: "Bar Printer",
          type: "printer",
          status: "online",
          lastSeen: new Date().toISOString(),
          connectedSince: new Date(
            Date.now() - 14 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          serialNumber: "EP9912856",
          alerts: 0,
          ipAddress: "192.168.1.51",
          connectionType: "wifi",
          signalStrength: 3,
          model: "Epson TM-T88VI",
          manufacturer: "Epson",
          firmwareVersion: "02.10 ESC/POS",
          printerType: "kitchen",
          prepStation: "bar",
          alwaysPrint: true,
          sendToExpediter: false,
          issues: [],
          activityLogs: generateMockActivityLogs("printer"),
        },
        {
          id: "dev_9",
          name: "Receipt Printer - Main",
          type: "printer",
          status: "online",
          lastSeen: new Date().toISOString(),
          connectedSince: new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          serialNumber: "SM8834799",
          alerts: 0,
          connectionType: "usb",
          model: "Star Micronics TSP143III",
          manufacturer: "Star Micronics",
          firmwareVersion: "3.2.1",
          printerType: "receipt",
          alwaysPrint: true,
          sendToExpediter: false,
          issues: [],
          activityLogs: generateMockActivityLogs("printer"),
        },
        {
          id: "dev_10",
          name: "Expediter Display",
          type: "tablet",
          status: "online",
          lastSeen: new Date().toISOString(),
          connectedSince: new Date(
            Date.now() - 2 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          serialNumber: "TKE34932700",
          alerts: 0,
          model: "Dejavoo P18",
          manufacturer: "Dejavoo",
          connectionType: "wifi",
          signalStrength: 4,
          firmwareVersion: "1.0.5",
          appVersion: "2.3.1",
          issues: [],
          activityLogs: generateMockActivityLogs("tablet"),
        },
        {
          id: "dev_11",
          name: "Backup Terminal",
          type: "external_terminal",
          status: "offline",
          lastSeen: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          offlineSince: new Date(
            Date.now() - 48 * 60 * 60 * 1000,
          ).toISOString(),
          serialNumber: "LS7222CE40999",
          alerts: 1,
          dejavooRegisterId: "TPN-99999",
          connectionType: "bluetooth",
          model: "Dejavoo P8",
          manufacturer: "Dejavoo",
          firmwareVersion: "02.10A ESC/POS",
          issues: [
            {
              id: "issue_4",
              type: "offline",
              severity: "critical",
              message: "Device has been offline for 2 days",
              timestamp: new Date(
                Date.now() - 48 * 60 * 60 * 1000,
              ).toISOString(),
              dismissible: false,
            },
          ],
          activityLogs: generateMockActivityLogs("external_terminal"),
        },
        {
          id: "dev_12",
          name: "Grill Printer",
          type: "printer",
          status: "online",
          lastSeen: new Date().toISOString(),
          connectedSince: new Date(
            Date.now() - 10 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          serialNumber: "EP9912900",
          alerts: 0,
          ipAddress: "192.168.1.52",
          connectionType: "wired",
          model: "Epson TM-T88VI",
          manufacturer: "Epson",
          firmwareVersion: "02.14B ESC/POS",
          printerType: "kitchen",
          prepStation: "grill",
          alwaysPrint: true,
          sendToExpediter: true,
          issues: [],
          activityLogs: generateMockActivityLogs("printer"),
        },
      ],
      detectedPrinters: [
        {
          id: "detected_1",
          name: "Bar Printer",
          model: "Star Micronics TSP143III",
          serialNumber: "SM8834721",
          connectionType: "bluetooth",
          isAssigned: false,
        },
        {
          id: "detected_2",
          name: "Receipt Printer",
          model: "Epson TM-T88VI",
          serialNumber: "EP9912834",
          connectionType: "network",
          isAssigned: false,
        },
      ],
      addDevice: (newDevice) => {
        const deviceId = uuidv4();
        const device = {
          ...newDevice,
          id: deviceId,
          status: "offline" as const,
          lastSeen: new Date().toISOString(),
          alerts: 0,
          issues: [],
          activityLogs: [],
        };

        set((state) => ({
          devices: [...state.devices, device],
        }));

        // Log audit event (fire and forget)
        LogAuditEvent({
          action: `Added Device: ${newDevice.name} (${getDeviceTypeLabel(newDevice.type)})`,
          actionCategory: "settings",
          resourceType: "device",
          resourceId: deviceId,
          resourceName: newDevice.name,
          metadata: {
            device_type: newDevice.type,
            device_model: newDevice.model,
            serial_number: newDevice.serialNumber,
            connection_type: newDevice.connectionType,
          },
        }).catch(console.error);
      },
      updateDevice: (id, updates) => {
        const state = get();
        const existingDevice = state.devices.find((d) => d.id === id);

        set((state) => ({
          devices: state.devices.map((dev) =>
            dev.id === id ? { ...dev, ...updates } : dev,
          ),
        }));

        // Log audit event if device found (fire and forget)
        if (existingDevice) {
          const changedFields = Object.keys(updates).filter(
            (key) => (existingDevice as any)[key] !== (updates as any)[key],
          );

          if (changedFields.length > 0) {
            const beforeLog: Record<string, unknown> = {};
            const afterLog: Record<string, unknown> = {};
            changedFields.forEach((key) => {
              beforeLog[key] = (existingDevice as any)[key];
              afterLog[key] = (updates as any)[key];
            });

            LogAuditEvent({
              action: `Updated Device: ${existingDevice.name}`,
              actionCategory: "settings",
              resourceType: "device",
              resourceId: id,
              resourceName: existingDevice.name,
              metadata: {
                device_type: existingDevice.type,
              },
              changes: { before: beforeLog, after: afterLog },
            }).catch(console.error);
          }
        }
      },
      removeDevice: (id) => {
        const state = get();
        const device = state.devices.find((d) => d.id === id);

        set((state) => ({
          devices: state.devices.filter((dev) => dev.id !== id),
        }));

        // Log audit event if device found (fire and forget)
        if (device) {
          LogAuditEvent({
            action: `Deleted Device: ${device.name} (${getDeviceTypeLabel(device.type)})`,
            actionCategory: "settings",
            resourceType: "device",
            resourceId: id,
            resourceName: device.name,
            metadata: {
              device_type: device.type,
              device_model: device.model,
              serial_number: device.serialNumber,
            },
          }).catch(console.error);
        }
      },
      removeMultipleDevices: (ids) => {
        const state = get();
        const devicesToRemove = state.devices.filter((d) => ids.includes(d.id));

        set((state) => ({
          devices: state.devices.filter((dev) => !ids.includes(dev.id)),
        }));

        // Log audit event for each deleted device (fire and forget)
        devicesToRemove.forEach((device) => {
          LogAuditEvent({
            action: `Deleted Device: ${device.name} (${getDeviceTypeLabel(device.type)})`,
            actionCategory: "settings",
            resourceType: "device",
            resourceId: device.id,
            resourceName: device.name,
            metadata: {
              device_type: device.type,
              device_model: device.model,
              serial_number: device.serialNumber,
              bulk_delete: true,
            },
          }).catch(console.error);
        });
      },
      dismissIssue: (deviceId, issueId) =>
        set((state) => ({
          devices: state.devices.map((dev) =>
            dev.id === deviceId
              ? {
                  ...dev,
                  issues: dev.issues?.filter((i) => i.id !== issueId) || [],
                  alerts: Math.max(0, dev.alerts - 1),
                }
              : dev,
          ),
        })),
      assignPrinter: (printerId, config) => {
        const state = get();
        const printer = state.detectedPrinters.find((p) => p.id === printerId);
        if (!printer) return;

        const deviceId = uuidv4();
        const newDevice = {
          id: deviceId,
          name: config.name,
          type: "printer" as DeviceType,
          status: "online" as const,
          lastSeen: new Date().toISOString(),
          connectedSince: new Date().toISOString(),
          serialNumber: printer.serialNumber,
          alerts: 0,
          model: printer.model,
          printerType: config.printerType,
          prepStation: config.prepStation,
          alwaysPrint: config.alwaysPrint,
          sendToExpediter: config.sendToExpediter,
          issues: [],
          activityLogs: [],
        };

        set((state) => ({
          devices: [...state.devices, newDevice],
          detectedPrinters: state.detectedPrinters.map((p) =>
            p.id === printerId ? { ...p, isAssigned: true } : p,
          ),
        }));

        // Log audit event (fire and forget)
        LogAuditEvent({
          action: `Assigned Printer: ${config.name} (${config.printerType})`,
          actionCategory: "settings",
          resourceType: "device",
          resourceId: deviceId,
          resourceName: config.name,
          metadata: {
            device_type: "printer",
            printer_type: config.printerType,
            prep_station: config.prepStation,
            device_model: printer.model,
            serial_number: printer.serialNumber,
            always_print: config.alwaysPrint,
            send_to_expediter: config.sendToExpediter,
          },
        }).catch(console.error);
      },
      simulateConnection: async (id) => {
        const device = get().devices.find((d) => d.id === id);
        if (!device) return false;

        set((state) => ({
          devices: state.devices.map((dev) =>
            dev.id === id ? { ...dev, status: "offline" } : dev,
          ),
        }));

        await new Promise((resolve) => setTimeout(resolve, 1500));

        const success = Math.random() > 0.05; // 95% success rate for simulation

        set((state) => ({
          devices: state.devices.map((dev) =>
            dev.id === id
              ? {
                  ...dev,
                  status: success ? "online" : "offline",
                  lastSeen: success ? new Date().toISOString() : dev.lastSeen,
                  ipAddress:
                    dev.ipAddress ||
                    (success
                      ? `192.168.1.${Math.floor(Math.random() * 254) + 1}`
                      : dev.ipAddress),
                  connectedSince: success
                    ? dev.connectedSince || new Date().toISOString()
                    : undefined,
                  offlineSince: success
                    ? undefined
                    : dev.offlineSince || new Date().toISOString(),
                }
              : dev,
          ),
        }));

        // Add activity log
        get().addActivityLog(id, {
          action: success ? "Connection successful" : "Connection failed",
          type: success ? "connection" : "error",
          details: success
            ? `Device verified at ${new Date().toLocaleTimeString()}`
            : "Device timed out during automated check",
        });

        return success;
      },
      addActivityLog: (deviceId, log) =>
        set((state) => ({
          devices: state.devices.map((dev) =>
            dev.id === deviceId
              ? {
                  ...dev,
                  activityLogs: [
                    {
                      ...log,
                      id: uuidv4(),
                      timestamp: new Date().toISOString(),
                    },
                    ...(dev.activityLogs || []),
                  ].slice(0, 50), // Keep last 50 logs
                }
              : dev,
          ),
        })),
      performAutomatedCheck: async () => {
        const { devices, simulateConnection } = get();
        // Only check terminals and tablets that are supposed to be online
        const devicesToCheck = devices.filter(
          (d) => d.type === "external_terminal" || d.type === "tablet",
        );

        for (const device of devicesToCheck) {
          // In a real app, this would be an actual API call
          // For the mock, we just run the simulation
          await simulateConnection(device.id);
        }
      },
      simulatePairing: async (tpn: string) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const random = Math.random();

        if (random < 0.1) {
          return {
            success: false,
            error: "Unable to connect. Please verify the TPN/Register ID.",
          };
        }
        if (random < 0.15) {
          return {
            success: false,
            error: "Device not found. Ensure Bluetooth is enabled.",
          };
        }

        return { success: true };
      },
      checkForUpdates: async (id: string) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Always return "up to date" for mock
        return false;
      },
    }),
    {
      name: "dexapos-devices-storage",
    },
  ),
);
