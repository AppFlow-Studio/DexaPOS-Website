"use client";

import { create } from "zustand";
import {
  getOnlineOrderingSettings,
  saveOnlineOrderingSettings,
} from "../actions";
import { toast } from "sonner";

export interface DaySchedule {
  enabled: boolean;
  from: string;
  to: string;
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

export interface OnlineOrderingSettings {
  id: string;
  locationId: string;

  // Identity
  enabled: boolean;
  storeName: string;
  storeSlug: string;
  description: string;
  phone: string;
  email: string;
  address: string;

  // Template & Branding
  templateId: "classic" | "bold" | "minimal";
  primaryColor: string;
  secondaryColor: string;
  accentColor: string | null;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;

  // Assets
  logoUrl: string | null;
  heroImageUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;

  // Hours
  operatingHours: WeeklySchedule;

  // Ordering
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  preparationLeadTime: number;
  futureOrderMaxDays: number;
  minimumOrderAmount: number;

  // Delivery
  baseDeliveryFee: number;
  freeDeliveryThreshold: number;
  deliveryRadiusMiles: number | null;

  // Tipping
  tippingEnabled: boolean;
  tipPresets: number[];

  // Payment
  ipospaysTpn: string;

  // SEO
  metaTitle: string;
  metaDescription: string;

  // Header
  headerStyle: "filled" | "transparent" | "outlined";
  headerTextColor: string | null;

  // Menu layout: cards | sidebyside | no-images
  menuLayout: "cards" | "sidebyside" | "no-images";

  // Analytics
  googleAnalyticsId: string;
  facebookPixelId: string;
}

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
    if (schedule[day]) {
      sanitized[day] = {
        enabled: schedule[day].enabled ?? false,
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

  enabled: false,
  storeName: locationName,
  storeSlug: locationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, ""),
  description: "",
  phone: "",
  email: "",
  address: "",

  templateId: "classic",
  primaryColor: "#2DD4BF",
  secondaryColor: "#10b981",
  accentColor: null,
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  fontFamily: "DM Sans",

  logoUrl: null,
  heroImageUrl: null,
  faviconUrl: null,
  ogImageUrl: null,

  operatingHours: createDefaultWeeklySchedule(),

  pickupEnabled: true,
  deliveryEnabled: false,
  preparationLeadTime: 20,
  futureOrderMaxDays: 0,
  minimumOrderAmount: 0,

  baseDeliveryFee: 0,
  freeDeliveryThreshold: 0,
  deliveryRadiusMiles: null,

  tippingEnabled: true,
  tipPresets: [15, 18, 20, 25],

  ipospaysTpn: "",

  headerStyle: "filled",
  headerTextColor: null,

  menuLayout: "cards",

  metaTitle: "",
  metaDescription: "",

  googleAnalyticsId: "",
  facebookPixelId: "",
});

interface OnlineOrderingStore {
  settings: OnlineOrderingSettings[];
  isLoading: boolean;
  isSaving: boolean;
  dirtyLocations: Set<string>;

  loadSettings: (locationId: string) => Promise<void>;
  updateSettings: (
    locationId: string,
    updates: Partial<OnlineOrderingSettings>
  ) => void;
  saveSettings: (locationId: string) => Promise<void>;
  discardChanges: (locationId: string) => Promise<void>;
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
          if (data.operatingHours) {
            data.operatingHours = sanitizeSchedule(data.operatingHours);
          }

          const mergedSettings = {
            ...createDefaultSettings(locationId, data.storeName || ""),
            ...data,
          };

          set((state) => {
            const filtered = state.settings.filter(
              (s) => s.locationId !== locationId
            );
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

    discardChanges: async (locationId: string) => {
      await get().loadSettings(locationId);
      toast.info("Changes discarded");
    },

    createSettings: async (locationId: string, locationName: string) => {
      const newSettings = createDefaultSettings(locationId, locationName);

      set((state) => ({
        settings: [...state.settings, newSettings],
      }));

      try {
        await saveOnlineOrderingSettings(locationId, newSettings);
      } catch (error) {
        console.error("Failed to create settings:", error);
        toast.error("Failed to initialize settings");
      }

      return newSettings;
    },

    isDirty: (locationId: string) => {
      return get().dirtyLocations.has(locationId);
    },
  })
);

export function formatTimeDisplay(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

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

export const dayOrder: (keyof WeeklySchedule)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
