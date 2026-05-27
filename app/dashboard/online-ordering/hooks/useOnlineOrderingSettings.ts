"use client";

import { create } from "zustand";
import {
  getOnlineOrderingSettings,
  requestOnlineOrderingSetup,
  saveOnlineOrderingSettings,
} from "../actions";
import { toast } from "sonner";

export type OnlineStoreSetupStatus =
  | "not_requested"
  | "pending_review"
  | "approved"
  | "rejected"
  | "setup_completed";

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
  setupRequestStatus: OnlineStoreSetupStatus;
  setupRequestedAt: string | null;
  setupRequestedBy: string | null;
  setupReviewedAt: string | null;
  setupReviewedBy: string | null;
  setupApprovedAt: string | null;
  setupCompletedAt: string | null;
  setupRejectionReason: string | null;

  // Identity
  enabled: boolean;
  storeName: string;
  storeSlug: string;
  description: string;
  phone: string;
  email: string;
  address: string;

  // Template & Branding
  templateId: "classic" | "hero" | "market" | "boutique";
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
  deliveryPricingEnabled: boolean;
  autoAcceptOrders: boolean;
  preparationLeadTime: number;
  futureOrderMaxDays: number;
  minimumOrderAmount: number;
  acceptsDineIn: boolean;
  qrFulfillmentMode: "runner" | "counter";
  qrGeofenceEnabled: boolean;
  qrServiceFeePct: number;
  qrKillSwitch: boolean;

  // Delivery
  baseDeliveryFee: number;
  freeDeliveryThreshold: number;
  deliveryRadiusMiles: number | null;

  // Tipping
  tippingEnabled: boolean;
  tipPresets: number[];

  // SEO
  metaTitle: string;
  metaDescription: string;

  // Header
  headerStyle: "filled" | "transparent" | "outlined";
  headerTextColor: string | null;
  borderColor: string | null;
  cardColor: string | null;

  // Menu layout: cards | sidebyside | no-images
  menuLayout: "cards" | "sidebyside" | "no-images";

  // Analytics
  googleAnalyticsId: string;
  facebookPixelId: string;

  // Customer notification preferences (transactional)
  notificationPrefs: {
    email_on_order_placed: boolean;
    sms_on_order_placed: boolean;
    email_on_status: string[];
    sms_on_status: string[];
    admin_test_email?: string | null;
    admin_test_phone?: string | null;
  };
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
  setupRequestStatus: "not_requested",
  setupRequestedAt: null,
  setupRequestedBy: null,
  setupReviewedAt: null,
  setupReviewedBy: null,
  setupApprovedAt: null,
  setupCompletedAt: null,
  setupRejectionReason: null,

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
  primaryColor: "#0C4FD1",
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
  deliveryPricingEnabled: true,
  autoAcceptOrders: false,
  preparationLeadTime: 20,
  futureOrderMaxDays: 0,
  minimumOrderAmount: 0,
  acceptsDineIn: false,
  qrFulfillmentMode: "runner",
  qrGeofenceEnabled: false,
  qrServiceFeePct: 0,
  qrKillSwitch: false,

  baseDeliveryFee: 0,
  freeDeliveryThreshold: 0,
  deliveryRadiusMiles: null,

  tippingEnabled: true,
  tipPresets: [15, 18, 20, 25],

  headerStyle: "filled",
  headerTextColor: null,
  borderColor: null,
  cardColor: null,

  menuLayout: "cards",

  metaTitle: "",
  metaDescription: "",

  googleAnalyticsId: "",
  facebookPixelId: "",

  notificationPrefs: {
    email_on_order_placed: true,
    sms_on_order_placed: true,
    email_on_status: ["ready", "cancelled"],
    sms_on_status: ["accepted", "ready", "cancelled"],
    admin_test_email: null,
    admin_test_phone: null,
  },
});

export type OnlineStoreSetupRequestResult =
  | { success: true; status: "pending_review" }
  | {
      success: false;
      error: string;
      missing?: Record<string, boolean>;
      values?: Record<string, string>;
    };

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
  requestSetup: (locationId: string) => Promise<OnlineStoreSetupRequestResult>;
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
        // Merchant dashboard is intentionally restricted: no payment/tip changes.
        // It can maintain non-payment storefront settings only after HQ completes setup.
        await saveOnlineOrderingSettings(locationId, {
          enabled: currentSettings.enabled,
          storeName: currentSettings.storeName,
          description: currentSettings.description,
          phone: currentSettings.phone,
          email: currentSettings.email,

          // Branding
          templateId: currentSettings.templateId,
          primaryColor: currentSettings.primaryColor,
          secondaryColor: currentSettings.secondaryColor,
          accentColor: currentSettings.accentColor,
          backgroundColor: currentSettings.backgroundColor,
          textColor: currentSettings.textColor,
          fontFamily: currentSettings.fontFamily,
          menuLayout: currentSettings.menuLayout,
          logoUrl: currentSettings.logoUrl,
          heroImageUrl: currentSettings.heroImageUrl,
          faviconUrl: currentSettings.faviconUrl,
          ogImageUrl: currentSettings.ogImageUrl,

          // Ordering
          operatingHours: currentSettings.operatingHours,
          pickupEnabled: currentSettings.pickupEnabled,
          deliveryEnabled: currentSettings.deliveryEnabled,
          deliveryPricingEnabled: currentSettings.deliveryPricingEnabled,
          autoAcceptOrders: currentSettings.autoAcceptOrders,
          preparationLeadTime: currentSettings.preparationLeadTime,
          futureOrderMaxDays: currentSettings.futureOrderMaxDays,
          minimumOrderAmount: currentSettings.minimumOrderAmount,
          acceptsDineIn: currentSettings.acceptsDineIn,
          qrFulfillmentMode: currentSettings.qrFulfillmentMode,
          qrGeofenceEnabled: currentSettings.qrGeofenceEnabled,
          qrServiceFeePct: currentSettings.qrServiceFeePct,
          qrKillSwitch: currentSettings.qrKillSwitch,
          baseDeliveryFee: currentSettings.baseDeliveryFee,
          freeDeliveryThreshold: currentSettings.freeDeliveryThreshold,
          deliveryRadiusMiles: currentSettings.deliveryRadiusMiles,
        });
        await get().loadSettings(locationId);
        toast.success("Settings saved");
      } catch (error) {
        console.error("Failed to save settings:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to save settings"
        );
      } finally {
        set({ isSaving: false });
      }
    },

    discardChanges: async (locationId: string) => {
      await get().loadSettings(locationId);
      toast.info("Changes discarded");
    },
    requestSetup: async (locationId: string) => {
      try {
        const result = await requestOnlineOrderingSetup(locationId);
        if (result?.success) {
          await get().loadSettings(locationId);
          toast.success("Setup request submitted to HQ");
          return result;
        }
        // Let the page decide how to render the missing-fields UI.
        return result;
      } catch (error) {
        console.error("Failed to request setup:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to request setup"
        );
        return { success: false, error: error instanceof Error ? error.message : "Failed to request setup" } as any;
      }
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
