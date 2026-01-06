"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Site, SiteThemeConfig } from "@/types/site";
import {
  OnlineOrderingSettings,
  WeeklySchedule,
  dayOrder,
} from "./hooks/useOnlineOrderingSettings";
import { revalidatePath } from "next/cache";

// Helper to map DB Site to Frontend Settings partial
function mapSiteToSettings(site: Site): Partial<OnlineOrderingSettings> {
  return {
    enabled: site.is_active ?? false,
    storeName: site.title ?? "",
    storeSlug: site.subdomain ?? "",
    logoUrl: site.logo_url,
    // Extract theme config
    primaryColor: site.theme_config?.primaryColor ?? "#3b82f6",
    secondaryColor: site.theme_config?.secondaryColor ?? "#10b981",
    heroImageUrl: site.theme_config?.heroImageUrl,
    faviconUrl: site.theme_config?.faviconUrl,
  };
}

// Fetch all settings for a location by combining Location + Site data
export async function getOnlineOrderingSettings(
  locationId: string
): Promise<Partial<OnlineOrderingSettings> | null> {
  const supabase = createServerSupabaseClient();

  // 1. Fetch Location Data (Hours, Contact)
  const { data: location, error: locError } = await supabase
    .from("locations")
    .select(
      "name, phone, email, address_line1, city, state, postal_code, business_hours"
    )
    .eq("id", locationId)
    .single();

  if (locError) {
    console.error("Error fetching location:", locError);
    return null;
  }

  // 2. Fetch Site Data (Branding, Enabled)
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
    operatingHours: location.business_hours as WeeklySchedule, // Assuming matching shape
  };

  // Merge Site data if it exists
  if (site) {
    const siteSettings = mapSiteToSettings(site);
    Object.assign(settings, siteSettings);
  }

  return settings;
}

// Upsert settings (Split between Sites and Locations tables)
export async function saveOnlineOrderingSettings(
  locationId: string,
  settings: Partial<OnlineOrderingSettings>
) {
  const supabase = createServerSupabaseClient();

  // 1. Update Location Details (Hours, Contact)
  // We only update fields that map to location
  const locationUpdates: any = {};
  if (settings.phone !== undefined) locationUpdates.phone = settings.phone;
  if (settings.email !== undefined) locationUpdates.email = settings.email;
  if (settings.operatingHours !== undefined)
    locationUpdates.business_hours = settings.operatingHours;

  if (Object.keys(locationUpdates).length > 0) {
    const { error: locError } = await supabase
      .from("locations")
      .update(locationUpdates)
      .eq("id", locationId);

    if (locError)
      throw new Error(`Location update failed: ${locError.message}`);
  }

  // 2. Upsert Site Details (Branding, Config)
  // First, check if site exists to get ID and current config
  const { data: existingSite } = await supabase
    .from("sites")
    .select("id, theme_config, title, subdomain, logo_url, is_active")
    .eq("location_id", locationId)
    .single();

  const currentTheme: any = existingSite?.theme_config || {};

  const themeConfig: SiteThemeConfig = {
    primaryColor:
      settings.primaryColor ?? currentTheme.primaryColor ?? "#3b82f6",
    secondaryColor:
      settings.secondaryColor ?? currentTheme.secondaryColor ?? "#10b981",
    heroImageUrl: settings.heroImageUrl ?? currentTheme.heroImageUrl,
    faviconUrl: settings.faviconUrl ?? currentTheme.faviconUrl,
  };

  // Build siteData dynamically, only including defined values
  // and falling back to existing values to prevent constraint violations
  const siteData: Record<string, any> = {
    location_id: locationId,
    theme_config: themeConfig,
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

  if (settings.enabled !== undefined) siteData.is_active = settings.enabled;
  else if (existingSite?.is_active !== undefined)
    siteData.is_active = existingSite.is_active;

  if (existingSite) {
    const { error: siteUpdateError } = await supabase
      .from("sites")
      .update(siteData)
      .eq("id", existingSite.id);

    if (siteUpdateError)
      throw new Error(`Site update failed: ${siteUpdateError.message}`);
  } else {
    // Need merchant_id to create
    const { data: location } = await supabase
      .from("locations")
      .select("merchant_id")
      .eq("id", locationId)
      .single();
    if (!location) throw new Error("Location not found");

    const { error: siteInsertError } = await supabase.from("sites").insert({
      ...siteData,
      merchant_id: location.merchant_id,
    });

    if (siteInsertError)
      throw new Error(`Site creation failed: ${siteInsertError.message}`);
  }

  revalidatePath(`/dashboard/online-ordering`);
  return { success: true };
}
