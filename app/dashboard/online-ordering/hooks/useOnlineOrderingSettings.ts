"use client";

import { create } from "zustand";
import {
  getOnlineOrderingSettings,
  saveOnlineOrderingSettings,
} from "../actions";
import { toast } from "sonner";

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
  id: string; // This might be site ID or generated
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

const sanitizeSchedule = (schedule: any): WeeklySchedule => {
  if (!schedule) return createDefaultWeeklySchedule();

  const defaultSchedule = createDefaultWeeklySchedule();
  const sanitized: any = {};

  for (const day of dayOrder) {
    // If the day exists in the incoming schedule, merge it with defaults
    // Otherwise use default
    if (schedule[day]) {
      sanitized[day] = {
        enabled: schedule[day].enabled ?? false, // Default to disabled if missing
        from: schedule[day].from || "09:00",
        to: schedule[day].to || "21:00",
        is24Hours: schedule[day].is24Hours ?? false,
      };
    } else {
      sanitized[day] = defaultSchedule[day];
    }
  }

  return sanitized as WeeklySchedule;
};

const createDefaultSettings = (
  locationId: string,
  locationName: string
): OnlineOrderingSettings => ({
  id: `temp_${locationId}`,
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

interface OnlineOrderingStore {
  settings: OnlineOrderingSettings[];
  isLoading: boolean;
  isSaving: boolean;
  dirtyLocations: Set<string>;

  // Actions
  loadSettings: (locationId: string) => Promise<void>;
  updateSettings: (
    locationId: string,
    updates: Partial<OnlineOrderingSettings>
  ) => void; // Now synchronous, local only
  saveSettings: (locationId: string) => Promise<void>; // Network call
  discardChanges: (locationId: string) => Promise<void>; // Reload from DB
  createSettings: (
    locationId: string,
    locationName: string
  ) => Promise<OnlineOrderingSettings>;
  isDirty: (locationId: string) => boolean;
}

export const useOnlineOrderingSettings = create<OnlineOrderingStore>(
  (set, get) => ({
    settings: [],
    isLoading: false,
    isSaving: false,
    dirtyLocations: new Set<string>(),

    loadSettings: async (locationId: string) => {
      set({ isLoading: true });
      try {
        const data = await getOnlineOrderingSettings(locationId);
        if (data) {
          // Sanitize operating hours if present
          if (data.operatingHours) {
            data.operatingHours = sanitizeSchedule(data.operatingHours);
          }
          if (data.deliveryHours) {
            data.deliveryHours = sanitizeSchedule(data.deliveryHours);
          }

          // Merge with default to ensure full shape
          const mergedSettings = {
            ...createDefaultSettings(locationId, data.storeName || ""),
            ...data,
          };

          set((state) => {
            // Remove existing if present to replace
            const filtered = state.settings.filter(
              (s) => s.locationId !== locationId
            );
            // Clear dirty flag since we just loaded fresh data
            const newDirty = new Set(state.dirtyLocations);
            newDirty.delete(locationId);
            return {
              settings: [...filtered, mergedSettings],
              dirtyLocations: newDirty,
            };
          });
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
        toast.error("Failed to load online ordering settings");
      } finally {
        set({ isLoading: false });
      }
    },

    // Local-only update (no network call)
    updateSettings: (
      locationId: string,
      updates: Partial<OnlineOrderingSettings>
    ) => {
      set((state) => {
        const newDirty = new Set(state.dirtyLocations);
        newDirty.add(locationId);
        return {
          settings: state.settings.map((s) =>
            s.locationId === locationId ? { ...s, ...updates } : s
          ),
          dirtyLocations: newDirty,
        };
      });
    },

    // Save to database
    saveSettings: async (locationId: string) => {
      const currentSettings = get().settings.find(
        (s) => s.locationId === locationId
      );
      if (!currentSettings) {
        toast.error("No settings to save");
        return;
      }

      set({ isSaving: true });
      try {
        await saveOnlineOrderingSettings(locationId, currentSettings);
        // Clear dirty flag on success
        set((state) => {
          const newDirty = new Set(state.dirtyLocations);
          newDirty.delete(locationId);
          return { dirtyLocations: newDirty };
        });
        toast.success("Settings saved");
      } catch (error) {
        console.error("Failed to save settings:", error);
        toast.error("Failed to save settings");
      } finally {
        set({ isSaving: false });
      }
    },

    // Discard changes by reloading from DB
    discardChanges: async (locationId: string) => {
      await get().loadSettings(locationId);
      toast.info("Changes discarded");
    },

    createSettings: async (locationId: string, locationName: string) => {
      const newSettings = createDefaultSettings(locationId, locationName);

      // Add to local state first
      set((state) => ({
        settings: [...state.settings, newSettings],
      }));

      // Start persisting (this will create the site entry)
      try {
        await saveOnlineOrderingSettings(locationId, newSettings);
      } catch (error) {
        console.error("Failed to create settings:", error);
        toast.error("Failed to initialize settings");
      }

      return newSettings;
    },

    // Check if location has unsaved changes
    isDirty: (locationId: string) => {
      return get().dirtyLocations.has(locationId);
    },
  })
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
