"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Site, SiteThemeConfig } from "@/types/site";
import {
  OnlineOrderingSettings,
  WeeklySchedule,
} from "./hooks/useOnlineOrderingSettings";
import { revalidatePath } from "next/cache";
import { LogAuditEvent } from "../actions/audit-logs";

const dayOrder = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// Helper to map DB Site to Frontend Settings partial
function mapSiteToSettings(site: Site): Partial<OnlineOrderingSettings> {
  return {
    enabled: site.is_active ?? false,
    storeName: site.title ?? "",
    storeSlug: site.subdomain ?? "",
    logoUrl: site.logo_url,
    bannerText: site.banner_text,
    // Extract theme config
    primaryColor: site.theme_config?.primaryColor ?? "#3b82f6",
    secondaryColor: site.theme_config?.secondaryColor ?? "#10b981",
    heroImageUrl: site.theme_config?.heroImageUrl,
    faviconUrl: site.theme_config?.faviconUrl,
  };
}

// Fetch all settings for a location by combining Location + Site data
export async function getOnlineOrderingSettings(
  locationId: string,
): Promise<Partial<OnlineOrderingSettings> | null> {
  const supabase = createServerSupabaseClient();

  // 1. Fetch Location Data (Hours, Contact)
  const { data: location, error: locError } = await supabase
    .from("locations")
    .select(
      "name, phone, email, address_line1, city, state, postal_code, business_hours",
    )
    .eq("id", locationId)
    .single();

  if (locError) {
    console.error("Error fetching location:", locError);
    return null;
  }

  // 2. Fetch Site Data (Branding, Enabled)
  // 2. Fetch Site Data (Branding, Config)
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("*")
    .eq("location_id", locationId)
    .single();

  // It's possible a site doesn't exist yet, which is fine.
  if (siteError && siteError.code !== "PGRST116") {
    console.error("Error fetching site:", siteError);
  }

  // 3. Construct the settings object
  const settings: Partial<OnlineOrderingSettings> = {
    locationId,
    // Location-derived fields
    storeName: location.name, // Default to location name, but Site title overrides if present
    phone: location.phone ?? "",
    email: location.email ?? "",
    address: `${location.address_line1}, ${location.city}, ${location.state} ${location.postal_code}`,
    operatingHours: location.business_hours as WeeklySchedule, // Default fallback
  };

  // Merge Site data if it exists
  if (site) {
    const siteSettings = mapSiteToSettings(site);

    // Merge online_ordering_config fields if present
    if (site.online_ordering_config) {
      const config: any = site.online_ordering_config;

      // Prioritize config hours if they exist and are valid
      if (config.operatingHours) {
        settings.operatingHours = config.operatingHours;
      }

      // Merge other config fields
      Object.assign(settings, {
        useCustomDeliveryHours: config.useCustomDeliveryHours,
        deliveryHours: config.deliveryHours,
        pickupEnabled: config.pickupEnabled,
        deliveryEnabled: config.deliveryEnabled,
        preparationLeadTime: config.preparationLeadTime,
        acceptFutureOrdersOnly: config.acceptFutureOrdersOnly,
        futureOrderMinDays: config.futureOrderMinDays,
        futureOrderMaxDays: config.futureOrderMaxDays,
        minimumOrderAmount: config.minimumOrderAmount,
        tippingEnabled: config.tippingEnabled,
        tipConfig: config.tipConfig,
        baseDeliveryFee: config.baseDeliveryFee,
        freeDeliveryThreshold: config.freeDeliveryThreshold,
        deliveryZones: config.deliveryZones,
        acceptOnlinePayments: config.acceptOnlinePayments,
        acceptCashOnDelivery: config.acceptCashOnDelivery,
        acceptCardOnDelivery: config.acceptCardOnDelivery,
        sendEmailOnNewOrder: config.sendEmailOnNewOrder,
        notificationEmail: config.notificationEmail,
        autoAcceptOrders: config.autoAcceptOrders,
        autoClosePaidOrders: config.autoClosePaidOrders,
      });
    }

    Object.assign(settings, siteSettings);
  }

  return settings;
}

// Upsert settings (Split between Sites and Locations tables)
export async function saveOnlineOrderingSettings(
  locationId: string,
  settings: Partial<OnlineOrderingSettings>,
) {
  const supabase = createServerSupabaseClient();

  // 1. Fetch Current State for Audit Diffing
  const { data: currentLocation, error: locFetchError } = await supabase
    .from("locations")
    .select("merchant_id, name, phone, email, business_hours")
    .eq("id", locationId)
    .single();

  if (locFetchError || !currentLocation) {
    throw new Error("Location not found");
  }

  const { data: existingSite } = await supabase
    .from("sites")
    .select("*")
    .eq("location_id", locationId)
    .single();

  const merchantId = currentLocation.merchant_id;
  const auditChanges: { before: any; after: any } = { before: {}, after: {} };
  let hasChanges = false;

  // 2. Prepare Location Updates
  const locationUpdates: any = {};
  if (settings.phone !== undefined) locationUpdates.phone = settings.phone;
  if (settings.email !== undefined) locationUpdates.email = settings.email;
  if (settings.operatingHours !== undefined)
    locationUpdates.business_hours = settings.operatingHours;

  // detailed diff for location
  // detailed diff for location
  Object.keys(locationUpdates).forEach((key) => {
    const newVal = locationUpdates[key];
    const oldVal = currentLocation[key as keyof typeof currentLocation];

    if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
      if (key === "business_hours") {
        // Flatten business hours diff to avoid huge logs
        dayOrder.forEach((day) => {
          // business_hours is stored as JSONB but follows WeeklySchedule structure
          const newDay = (newVal as any)?.[day];
          const oldDay = (oldVal as any)?.[day];
          if (JSON.stringify(newDay) !== JSON.stringify(oldDay)) {
            auditChanges.before[`business_hours_${day}`] = oldDay;
            auditChanges.after[`business_hours_${day}`] = newDay;
            hasChanges = true;
          }
        });
      } else {
        auditChanges.before[key] = oldVal;
        auditChanges.after[key] = newVal;
        hasChanges = true;
      }
    }
  });

  if (Object.keys(locationUpdates).length > 0) {
    const { error: locError } = await supabase
      .from("locations")
      .update(locationUpdates)
      .eq("id", locationId);

    if (locError)
      throw new Error(`Location update failed: ${locError.message}`);
  }

  // 3. Prepare Site Updates
  const currentTheme: any = existingSite?.theme_config || {};
  const currentOnlineConfig: any = existingSite?.online_ordering_config || {};

  const themeConfig: SiteThemeConfig = {
    primaryColor:
      settings.primaryColor ?? currentTheme.primaryColor ?? "#3b82f6",
    secondaryColor:
      settings.secondaryColor ?? currentTheme.secondaryColor ?? "#10b981",
    heroImageUrl: settings.heroImageUrl ?? currentTheme.heroImageUrl,
    faviconUrl: settings.faviconUrl ?? currentTheme.faviconUrl,
    headerStyle: settings.headerStyle ?? currentTheme.headerStyle, // Save headerStyle
  };

  // Construct OnlineOrderingConfig
  const onlineOrderingConfig: any = {
    ...currentOnlineConfig,
    // Hours
    operatingHours:
      settings.operatingHours ?? currentOnlineConfig.operatingHours,
    useCustomDeliveryHours:
      settings.useCustomDeliveryHours ??
      currentOnlineConfig.useCustomDeliveryHours,
    deliveryHours: settings.deliveryHours ?? currentOnlineConfig.deliveryHours,

    // Pickup & Delivery
    pickupEnabled: settings.pickupEnabled ?? currentOnlineConfig.pickupEnabled,
    deliveryEnabled:
      settings.deliveryEnabled ?? currentOnlineConfig.deliveryEnabled,
    preparationLeadTime:
      settings.preparationLeadTime ?? currentOnlineConfig.preparationLeadTime,
    acceptFutureOrdersOnly:
      settings.acceptFutureOrdersOnly ??
      currentOnlineConfig.acceptFutureOrdersOnly,
    futureOrderMinDays:
      settings.futureOrderMinDays ?? currentOnlineConfig.futureOrderMinDays,
    futureOrderMaxDays:
      settings.futureOrderMaxDays ?? currentOnlineConfig.futureOrderMaxDays,
    minimumOrderAmount:
      settings.minimumOrderAmount ?? currentOnlineConfig.minimumOrderAmount,

    // Tipping
    tippingEnabled:
      settings.tippingEnabled ?? currentOnlineConfig.tippingEnabled,
    tipConfig: settings.tipConfig ?? currentOnlineConfig.tipConfig,

    // Delivery Settings
    baseDeliveryFee:
      settings.baseDeliveryFee ?? currentOnlineConfig.baseDeliveryFee,
    freeDeliveryThreshold:
      settings.freeDeliveryThreshold ??
      currentOnlineConfig.freeDeliveryThreshold,
    deliveryZones: settings.deliveryZones ?? currentOnlineConfig.deliveryZones,

    // Payment
    acceptOnlinePayments:
      settings.acceptOnlinePayments ?? currentOnlineConfig.acceptOnlinePayments,
    acceptCashOnDelivery:
      settings.acceptCashOnDelivery ?? currentOnlineConfig.acceptCashOnDelivery,
    acceptCardOnDelivery:
      settings.acceptCardOnDelivery ?? currentOnlineConfig.acceptCardOnDelivery,

    // Notifications & Automation
    sendEmailOnNewOrder:
      settings.sendEmailOnNewOrder ?? currentOnlineConfig.sendEmailOnNewOrder,
    notificationEmail:
      settings.notificationEmail ?? currentOnlineConfig.notificationEmail,
    autoAcceptOrders:
      settings.autoAcceptOrders ?? currentOnlineConfig.autoAcceptOrders,
    autoClosePaidOrders:
      settings.autoClosePaidOrders ?? currentOnlineConfig.autoClosePaidOrders,
  };

  // Build siteData dynamically
  const siteData: Record<string, any> = {
    location_id: locationId,
    theme_config: themeConfig,
    online_ordering_config: onlineOrderingConfig,
  };

  // Only include fields if they have actual values
  if (settings.storeName !== undefined) siteData.title = settings.storeName;
  else if (existingSite?.title) siteData.title = existingSite.title;

  if (settings.storeSlug !== undefined && settings.storeSlug !== "") {
    siteData.subdomain = settings.storeSlug;
  } else if (existingSite?.subdomain) {
    siteData.subdomain = existingSite.subdomain;
  }

  if (settings.logoUrl !== undefined) siteData.logo_url = settings.logoUrl;

  if (settings.bannerText !== undefined)
    siteData.banner_text = settings.bannerText;

  if (settings.enabled !== undefined) siteData.is_active = settings.enabled;
  else if (existingSite?.is_active !== undefined)
    siteData.is_active = existingSite.is_active;

  // 4. Update Site and Calculate Site Diffs
  if (existingSite) {
    // Compare Theme Config
    // Compare Theme Config
    Object.keys(themeConfig).forEach((key) => {
      const k = key as keyof SiteThemeConfig;
      const newVal = themeConfig[k];
      const oldVal = currentTheme[k];

      if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
        auditChanges.before[k] = oldVal;
        auditChanges.after[k] = newVal;
        hasChanges = true;
      }
    });

    // Compare Online Ordering Config
    if (
      JSON.stringify(onlineOrderingConfig) !==
      JSON.stringify(currentOnlineConfig)
    ) {
      // Find changed keys within config for cleaner logs if possible,
      // but for now logging the whole object ensures we capture deep changes
      // Let's try to isolate changed keys
      const configDiffBefore: any = {};
      const configDiffAfter: any = {};
      let configChanged = false;

      Object.keys(onlineOrderingConfig).forEach((key) => {
        const newVal = onlineOrderingConfig[key];
        const oldVal = currentOnlineConfig[key];

        if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
          // Flatten hours diffs
          if (key === "operatingHours" || key === "deliveryHours") {
            dayOrder.forEach((day) => {
              const newDay = newVal[day];
              const oldDay = oldVal[day];
              if (JSON.stringify(newDay) !== JSON.stringify(oldDay)) {
                const logKey = `${key === "operatingHours" ? "operating_hours" : "delivery_hours"}_${day}`;
                configDiffBefore[logKey] = oldDay;
                configDiffAfter[logKey] = newDay;
                configChanged = true;
              }
            });
          } else {
            configDiffBefore[key] = oldVal;
            configDiffAfter[key] = newVal;
            configChanged = true;
          }
        }
      });

      if (configChanged) {
        auditChanges.before = {
          ...auditChanges.before,
          ...configDiffBefore,
        };
        auditChanges.after = {
          ...auditChanges.after,
          ...configDiffAfter,
        };
        hasChanges = true;
      }
    }

    // Compare Root Fields
    ["title", "subdomain", "logo_url", "banner_text", "is_active"].forEach(
      (key) => {
        const newVal = siteData[key];
        const oldVal = existingSite[key as keyof typeof existingSite];
        // Only check if newVal is defined (it might be undefined if not in siteData construction)
        // Actually siteData has them if they were set.
        // But careful about undefined vs null.
        if (
          newVal !== undefined &&
          JSON.stringify(newVal) !== JSON.stringify(oldVal)
        ) {
          auditChanges.before[key] = oldVal;
          auditChanges.after[key] = newVal;
          hasChanges = true;
        }
      },
    );

    const { error: siteUpdateError } = await supabase
      .from("sites")
      .update(siteData)
      .eq("id", existingSite.id);

    if (siteUpdateError)
      throw new Error(`Site update failed: ${siteUpdateError.message}`);
  } else {
    // Create New Site
    const { error: siteInsertError } = await supabase.from("sites").insert({
      ...siteData,
      merchant_id: merchantId,
    });

    if (siteInsertError)
      throw new Error(`Site creation failed: ${siteInsertError.message}`);

    hasChanges = true;
    auditChanges.after = {
      ...auditChanges.after,
      ...siteData,
      ...locationUpdates,
    };
  }

  // 5. Log Audit Event
  if (hasChanges) {
    await LogAuditEvent({
      merchantId: merchantId,
      action: existingSite
        ? `Updated Online Ordering Settings`
        : `Created Online Ordering Settings`,
      actionCategory: "settings",
      resourceType: "online_ordering",
      resourceId: locationId,
      resourceName: settings.storeName || currentLocation.name,
      locationId: locationId,
      changes: auditChanges,
    });
  }

  revalidatePath(`/dashboard/online-ordering`);
  return { success: true };
}
