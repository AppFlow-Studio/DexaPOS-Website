"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// Types
export interface DaySchedule {
  enabled: boolean;
  from: string; // "09:00"
  to: string; // "21:00"
  is24Hours: boolean;
}

export interface WeeklySchedule {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export interface TipConfig {
  calculationMethod: "subtotal" | "total"; // Pre-tax vs post-tax
  presetPercentages: number[]; // e.g., [10, 15, 20]
  smartTipEnabled: boolean;
  smartTipThreshold: number; // Order amount threshold
  smartTipAmounts: number[]; // Fixed amounts for small orders, e.g., [1, 2, 3]
  allowCustomTip: boolean;
}

export interface DeliveryZone {
  id: string;
  name: string;
  radiusMiles: number;
  fee: number;
  minimumOrder: number;
}

export interface OnlineOrderingSettings {
  id: string;
  locationId: string;

  // General Settings
  enabled: boolean;
  storeName: string;
  storeSlug: string;
  storeUrl: string;
  phone: string;
  email: string;
  address: string;

  // Visibility
  hideFromLocationPicker: boolean;
  dontMarkClosedOutsideHours: boolean;

  // Notifications
  sendEmailOnNewOrder: boolean;
  notificationEmail: string;

  // Automation
  autoAcceptOrders: boolean;
  autoClosePaidOrders: boolean;

  // Hours
  operatingHours: WeeklySchedule;
  useCustomDeliveryHours: boolean;
  deliveryHours: WeeklySchedule;

  // Branding
  logoUrl: string | null;
  heroImageUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;

  // Pickup & Delivery
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  preparationLeadTime: number; // minutes
  acceptFutureOrdersOnly: boolean;
  futureOrderMinDays: number;
  futureOrderMaxDays: number;
  minimumOrderAmount: number;

  // Payment
  acceptOnlinePayments: boolean;
  acceptCashOnDelivery: boolean;
  acceptCardOnDelivery: boolean;

  // Tipping
  tippingEnabled: boolean;
  tipConfig: TipConfig;

  // Delivery Zones
  baseDeliveryFee: number;
  freeDeliveryThreshold: number;
  deliveryZones: DeliveryZone[];

  // Third-party Integrations
  onfleetEnabled: boolean;
  onfleetApiKey: string;
  shipdayEnabled: boolean;
  shipdayApiKey: string;

  // Convenience Fee
  convenienceFeeEnabled: boolean;
  convenienceFeePercent: number;
  convenienceFeeFlat: number;
}

// Default schedule
const createDefaultDaySchedule = (enabled = false): DaySchedule => ({
  enabled,
  from: "09:00",
  to: "21:00",
  is24Hours: false,
});

const createDefaultWeeklySchedule = (): WeeklySchedule => ({
  monday: createDefaultDaySchedule(true),
  tuesday: createDefaultDaySchedule(true),
  wednesday: createDefaultDaySchedule(true),
  thursday: createDefaultDaySchedule(true),
  friday: createDefaultDaySchedule(true),
  saturday: createDefaultDaySchedule(true),
  sunday: createDefaultDaySchedule(false),
});

const createDefaultSettings = (
  locationId: string,
  locationName: string
): OnlineOrderingSettings => ({
  id: `oo_${locationId}`,
  locationId,

  // General
  enabled: false,
  storeName: locationName,
  storeSlug: locationName.toLowerCase().replace(/\s+/g, "-"),
  storeUrl: "",
  phone: "",
  email: "",
  address: "",

  // Visibility
  hideFromLocationPicker: false,
  dontMarkClosedOutsideHours: false,

  // Notifications
  sendEmailOnNewOrder: true,
  notificationEmail: "",

  // Automation
  autoAcceptOrders: false,
  autoClosePaidOrders: false,

  // Hours
  operatingHours: createDefaultWeeklySchedule(),
  useCustomDeliveryHours: false,
  deliveryHours: createDefaultWeeklySchedule(),

  // Branding
  logoUrl: null,
  heroImageUrl: null,
  faviconUrl: null,
  primaryColor: "#3b82f6",
  secondaryColor: "#10b981",

  // Pickup & Delivery
  pickupEnabled: true,
  deliveryEnabled: false,
  preparationLeadTime: 15,
  acceptFutureOrdersOnly: false,
  futureOrderMinDays: 1,
  futureOrderMaxDays: 7,
  minimumOrderAmount: 0,

  // Payment
  acceptOnlinePayments: true,
  acceptCashOnDelivery: false,
  acceptCardOnDelivery: false,

  // Tipping
  tippingEnabled: true,
  tipConfig: {
    calculationMethod: "subtotal",
    presetPercentages: [15, 18, 20],
    smartTipEnabled: false,
    smartTipThreshold: 10,
    smartTipAmounts: [1, 2, 3],
    allowCustomTip: true,
  },

  // Delivery
  baseDeliveryFee: 5,
  freeDeliveryThreshold: 0,
  deliveryZones: [],

  // Integrations
  onfleetEnabled: false,
  onfleetApiKey: "",
  shipdayEnabled: false,
  shipdayApiKey: "",

  // Convenience Fee
  convenienceFeeEnabled: false,
  convenienceFeePercent: 0,
  convenienceFeeFlat: 0,
});

// Mock data for demo
const mockSettings: OnlineOrderingSettings[] = [
  {
    ...createDefaultSettings(
      "8835e749-9bbf-4405-b4a4-7f28a56f990a",
      "Main Street Location"
    ),
    id: "oo_loc_1",
    enabled: true,
    storeName: "Dexa Café - Main Street",
    storeSlug: "dexa-cafe-main",
    phone: "(555) 123-4567",
    email: "orders@dexacafe.com",
    address: "123 Main Street, Downtown, NY 10001",
    logoUrl: null,
    heroImageUrl: null,
    primaryColor: "#f97316",
    secondaryColor: "#0ea5e9",
    pickupEnabled: true,
    deliveryEnabled: true,
    preparationLeadTime: 20,
    baseDeliveryFee: 4.99,
    freeDeliveryThreshold: 50,
    sendEmailOnNewOrder: true,
    notificationEmail: "manager@dexacafe.com",
    autoAcceptOrders: true,
  },
  {
    ...createDefaultSettings(
      "657a703d-37ef-423e-a72b-a8766f67941a",
      "Airport Terminal"
    ),
    id: "oo_loc_2",
    enabled: true,
    storeName: "Dexa Express - Airport",
    storeSlug: "dexa-express-airport",
    phone: "(555) 987-6543",
    email: "airport@dexacafe.com",
    address: "Terminal 3, Gate B12, JFK Airport",
    primaryColor: "#8b5cf6",
    secondaryColor: "#ec4899",
    pickupEnabled: true,
    deliveryEnabled: false,
    preparationLeadTime: 10,
    operatingHours: {
      ...createDefaultWeeklySchedule(),
      monday: { enabled: true, from: "05:00", to: "23:00", is24Hours: false },
      tuesday: { enabled: true, from: "05:00", to: "23:00", is24Hours: false },
      wednesday: {
        enabled: true,
        from: "05:00",
        to: "23:00",
        is24Hours: false,
      },
      thursday: { enabled: true, from: "05:00", to: "23:00", is24Hours: false },
      friday: { enabled: true, from: "05:00", to: "23:00", is24Hours: false },
      saturday: { enabled: true, from: "05:00", to: "23:00", is24Hours: false },
      sunday: { enabled: true, from: "05:00", to: "23:00", is24Hours: false },
    },
  },
];

interface OnlineOrderingStore {
  settings: OnlineOrderingSettings[];

  // Actions
  getSettingsForLocation: (
    locationId: string
  ) => OnlineOrderingSettings | undefined;
  updateSettings: (
    locationId: string,
    updates: Partial<OnlineOrderingSettings>
  ) => void;
  createSettings: (
    locationId: string,
    locationName: string
  ) => OnlineOrderingSettings;
  toggleEnabled: (locationId: string) => void;
  updateOperatingHours: (locationId: string, hours: WeeklySchedule) => void;
  updateDeliveryHours: (locationId: string, hours: WeeklySchedule) => void;
  updateBranding: (
    locationId: string,
    branding: {
      logoUrl?: string | null;
      heroImageUrl?: string | null;
      faviconUrl?: string | null;
      primaryColor?: string;
      secondaryColor?: string;
    }
  ) => void;
  addDeliveryZone: (locationId: string, zone: Omit<DeliveryZone, "id">) => void;
  removeDeliveryZone: (locationId: string, zoneId: string) => void;
  updateDeliveryZone: (
    locationId: string,
    zoneId: string,
    updates: Partial<DeliveryZone>
  ) => void;
}

export const useOnlineOrderingSettings = create<OnlineOrderingStore>()(
  persist(
    (set, get) => ({
      settings: mockSettings,

      getSettingsForLocation: (locationId: string) => {
        return get().settings.find((s) => s.locationId === locationId);
      },

      updateSettings: (
        locationId: string,
        updates: Partial<OnlineOrderingSettings>
      ) => {
        set((state) => ({
          settings: state.settings.map((s) =>
            s.locationId === locationId ? { ...s, ...updates } : s
          ),
        }));
      },

      createSettings: (locationId: string, locationName: string) => {
        const newSettings = createDefaultSettings(locationId, locationName);
        set((state) => ({
          settings: [...state.settings, newSettings],
        }));
        return newSettings;
      },

      toggleEnabled: (locationId: string) => {
        set((state) => ({
          settings: state.settings.map((s) =>
            s.locationId === locationId ? { ...s, enabled: !s.enabled } : s
          ),
        }));
      },

      updateOperatingHours: (locationId: string, hours: WeeklySchedule) => {
        set((state) => ({
          settings: state.settings.map((s) =>
            s.locationId === locationId ? { ...s, operatingHours: hours } : s
          ),
        }));
      },

      updateDeliveryHours: (locationId: string, hours: WeeklySchedule) => {
        set((state) => ({
          settings: state.settings.map((s) =>
            s.locationId === locationId ? { ...s, deliveryHours: hours } : s
          ),
        }));
      },

      updateBranding: (locationId: string, branding) => {
        set((state) => ({
          settings: state.settings.map((s) =>
            s.locationId === locationId ? { ...s, ...branding } : s
          ),
        }));
      },

      addDeliveryZone: (locationId: string, zone) => {
        const newZone: DeliveryZone = {
          ...zone,
          id: `zone_${Date.now()}`,
        };
        set((state) => ({
          settings: state.settings.map((s) =>
            s.locationId === locationId
              ? { ...s, deliveryZones: [...s.deliveryZones, newZone] }
              : s
          ),
        }));
      },

      removeDeliveryZone: (locationId: string, zoneId: string) => {
        set((state) => ({
          settings: state.settings.map((s) =>
            s.locationId === locationId
              ? {
                  ...s,
                  deliveryZones: s.deliveryZones.filter((z) => z.id !== zoneId),
                }
              : s
          ),
        }));
      },

      updateDeliveryZone: (locationId: string, zoneId: string, updates) => {
        set((state) => ({
          settings: state.settings.map((s) =>
            s.locationId === locationId
              ? {
                  ...s,
                  deliveryZones: s.deliveryZones.map((z) =>
                    z.id === zoneId ? { ...z, ...updates } : z
                  ),
                }
              : s
          ),
        }));
      },
    }),
    {
      name: "dexa-online-ordering-settings",
    }
  )
);

// Helper function to format hours for display
export function formatTimeDisplay(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

// Helper function to get day label
export function getDayLabel(day: keyof WeeklySchedule): string {
  const labels: Record<keyof WeeklySchedule, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  };
  return labels[day];
}

// Day order for iteration
export const dayOrder: (keyof WeeklySchedule)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
