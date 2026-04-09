"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  OnlineOrderingSettings,
  WeeklySchedule,
} from "./hooks/useOnlineOrderingSettings";
import { revalidatePath } from "next/cache";
import { LogAuditEvent } from "../actions/audit-logs";

// ─── Dejavoo Management API ───────────────────────────────────────────────────
// These env vars must be set in your deployment environment.
// Domain whitelist is delegated to Supabase Edge Function `dejavoo-whitelist-domain`
// The management API credentials are read from Supabase function secrets.
//   Sandbox  → https://externalapi.ipospays.tech
//   Production → https://externalapi.ipospays.com
// ──────────────────────────────────────────────────────────────────────────────

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "dexaposai.com";

/**
 * Registers/updates the allowed domain for an FTD-enabled TPN.
 * This must be called whenever a merchant saves a new/updated TPN so the
 * FreedomToDesign script is allowed to load on their storefront origin.
 *
 * Delegates to Supabase function: `dejavoo-whitelist-domain`
 */
export async function whitelistDejavooDomain(
  tpn: string,
  storeSlug: string
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  if (!tpn || !storeSlug) {
    return { success: false, error: "TPN and store slug are required" };
  }

  const isDev = ROOT_DOMAIN.includes("localhost");
  const storeDomain = isDev
    ? `http://${storeSlug}.localhost:3000`
    : `https://${storeSlug}.${ROOT_DOMAIN}`;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.functions.invoke(
    "dejavoo-whitelist-domain",
    {
      body: { tpn, storeSlug, storeDomain },
    }
  );

  if (error) {
    console.error("[DEJAVOO_WHITELIST] Edge invoke error:", error);
    return {
      success: false,
      error: `Domain whitelist invoke error: ${error.message}`,
    };
  }

  const result = (data || {}) as {
    success?: boolean;
    skipped?: boolean;
    error?: string;
  };
  return {
    success: Boolean(result.success),
    skipped: result.skipped,
    error: result.error,
  };
}

function mapConfigToSettings(
  config: any,
  location: any
): Partial<OnlineOrderingSettings> {
  return {
    id: config.id,
    locationId: config.location_id,
    enabled: config.is_active ?? false,
    storeName: config.store_name ?? location.name,
    storeSlug: config.slug ?? "",
    description: config.description ?? "",
    phone: config.phone ?? location.phone ?? "",
    email: config.email ?? location.email ?? "",
    address: location
      ? `${location.address_line1 ?? ""}, ${location.city ?? ""}, ${location.state ?? ""} ${location.postal_code ?? ""}`
      : "",

    templateId: config.template_id ?? "classic",
    primaryColor: config.primary_color ?? "#2DD4BF",
    secondaryColor: config.secondary_color ?? "#10b981",
    accentColor: config.accent_color ?? null,
    backgroundColor: config.background_color ?? "#FFFFFF",
    textColor: config.text_color ?? "#111827",
    fontFamily: config.font_family ?? "DM Sans",

    logoUrl: config.logo_url,
    heroImageUrl: config.hero_image_url,
    faviconUrl: config.favicon_url,
    ogImageUrl: config.og_image_url,

    operatingHours: config.operating_hours as WeeklySchedule,

    pickupEnabled: config.accepts_pickup ?? true,
    deliveryEnabled: config.accepts_delivery ?? false,
    minimumOrderAmount: config.min_order_cents
      ? config.min_order_cents / 100
      : 0,
    preparationLeadTime: config.estimated_prep_minutes ?? 20,
    futureOrderMaxDays: config.max_future_order_days ?? 0,

    baseDeliveryFee: config.delivery_fee_cents
      ? config.delivery_fee_cents / 100
      : 0,
    freeDeliveryThreshold: config.free_delivery_threshold_cents
      ? config.free_delivery_threshold_cents / 100
      : 0,
    deliveryRadiusMiles: config.delivery_radius_miles
      ? Number(config.delivery_radius_miles)
      : null,

    tippingEnabled: config.tip_enabled ?? true,
    tipPresets: Array.isArray(config.tip_presets)
      ? config.tip_presets
      : [15, 18, 20, 25],

    ipospaysTpn: config.ipospays_tpn ?? "",

    headerStyle: config.header_style ?? "filled",
    headerTextColor: config.header_text_color ?? null,
    borderColor: config.border_color ?? null,
    cardColor: config.card_color ?? null,

    menuLayout: config.menu_layout ?? "cards",

    metaTitle: config.meta_title ?? "",
    metaDescription: config.meta_description ?? "",
    googleAnalyticsId: config.google_analytics_id ?? "",
    facebookPixelId: config.facebook_pixel_id ?? "",
  };
}

export async function getOnlineOrderingSettings(
  locationId: string
): Promise<Partial<OnlineOrderingSettings> | null> {
  const supabase = createServerSupabaseClient();

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

  const { data: config, error: configError } = await supabase
    .from("online_store_config")
    .select("*")
    .eq("location_id", locationId)
    .single();

  if (configError && configError.code !== "PGRST116") {
    console.error("Error fetching store config:", configError);
  }

  if (config) {
    return mapConfigToSettings(config, location);
  }

  return {
    locationId,
    storeName: location.name,
    phone: location.phone ?? "",
    email: location.email ?? "",
    address: `${location.address_line1}, ${location.city}, ${location.state} ${location.postal_code}`,
    operatingHours: location.business_hours as WeeklySchedule,
  };
}

export async function saveOnlineOrderingSettings(
  locationId: string,
  settings: Partial<OnlineOrderingSettings>
) {
  const supabase = createServerSupabaseClient();

  const { data: currentLocation, error: locFetchError } = await supabase
    .from("locations")
    .select("merchant_id, name, phone, email, business_hours")
    .eq("id", locationId)
    .single();

  if (locFetchError || !currentLocation) {
    throw new Error("Location not found");
  }

  const merchantId = currentLocation.merchant_id;

  const locationUpdates: Record<string, unknown> = {};
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

  const { data: existingConfig } = await supabase
    .from("online_store_config")
    .select("*")
    .eq("location_id", locationId)
    .single();

  const auditChanges: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  } = { before: {}, after: {} };
  let hasChanges = false;

  const configData: Record<string, unknown> = {
    location_id: locationId,
    merchant_id: merchantId,
  };

  // Identity
  if (settings.storeName !== undefined)
    configData.store_name = settings.storeName;
  if (settings.storeSlug !== undefined && settings.storeSlug !== "") {
    // Check slug uniqueness across all merchants (excluding this location's own config)
    const { data: slugConflict } = await supabase
      .from("online_store_config")
      .select("id, location_id")
      .eq("slug", settings.storeSlug)
      .neq("location_id", locationId)
      .maybeSingle();
    if (slugConflict) {
      throw new Error(
        `The URL slug "${settings.storeSlug}" is already taken. Please choose a different one.`
      );
    }
    configData.slug = settings.storeSlug;
  }
  if (settings.enabled !== undefined) configData.is_active = settings.enabled;
  if (settings.description !== undefined)
    configData.description = settings.description;
  if (settings.phone !== undefined) configData.phone = settings.phone;
  if (settings.email !== undefined) configData.email = settings.email;

  // Template & Branding
  if (settings.templateId !== undefined)
    configData.template_id = settings.templateId;
  if (settings.primaryColor !== undefined)
    configData.primary_color = settings.primaryColor;
  if (settings.secondaryColor !== undefined)
    configData.secondary_color = settings.secondaryColor;
  if (settings.accentColor !== undefined)
    configData.accent_color = settings.accentColor;
  if (settings.backgroundColor !== undefined)
    configData.background_color = settings.backgroundColor;
  if (settings.textColor !== undefined)
    configData.text_color = settings.textColor;
  if (settings.fontFamily !== undefined)
    configData.font_family = settings.fontFamily;

  // Assets
  if (settings.logoUrl !== undefined) configData.logo_url = settings.logoUrl;
  if (settings.heroImageUrl !== undefined)
    configData.hero_image_url = settings.heroImageUrl;
  if (settings.faviconUrl !== undefined)
    configData.favicon_url = settings.faviconUrl;
  if (settings.ogImageUrl !== undefined)
    configData.og_image_url = settings.ogImageUrl;

  // Hours
  if (settings.operatingHours !== undefined)
    configData.operating_hours = settings.operatingHours;

  // Ordering
  if (settings.pickupEnabled !== undefined)
    configData.accepts_pickup = settings.pickupEnabled;
  if (settings.deliveryEnabled !== undefined)
    configData.accepts_delivery = settings.deliveryEnabled;
  if (settings.minimumOrderAmount !== undefined)
    configData.min_order_cents = Math.round(settings.minimumOrderAmount * 100);
  if (settings.preparationLeadTime !== undefined)
    configData.estimated_prep_minutes = settings.preparationLeadTime;
  if (settings.futureOrderMaxDays !== undefined)
    configData.max_future_order_days = settings.futureOrderMaxDays;

  // Delivery
  if (settings.baseDeliveryFee !== undefined)
    configData.delivery_fee_cents = Math.round(
      settings.baseDeliveryFee * 100
    );
  if (settings.freeDeliveryThreshold !== undefined)
    configData.free_delivery_threshold_cents =
      settings.freeDeliveryThreshold > 0
        ? Math.round(settings.freeDeliveryThreshold * 100)
        : null;
  if (settings.deliveryRadiusMiles !== undefined)
    configData.delivery_radius_miles = settings.deliveryRadiusMiles;

  // Tipping
  if (settings.tippingEnabled !== undefined)
    configData.tip_enabled = settings.tippingEnabled;
  if (settings.tipPresets !== undefined) {
    if (settings.tipPresets.length > 6) {
      throw new Error("Tip presets cannot exceed 6 options.");
    }
    const invalid = settings.tipPresets.find((p) => p < 0 || p > 100 || !Number.isInteger(p));
    if (invalid !== undefined) {
      throw new Error("Each tip preset must be a whole number between 0 and 100.");
    }
    configData.tip_presets = settings.tipPresets;
  }

  // Payment/domain whitelist triggers
  const previousSlug = existingConfig?.slug ?? null;
  const nextSlugCandidate =
    settings.storeSlug !== undefined && settings.storeSlug !== ""
      ? settings.storeSlug
      : previousSlug;
  const slugIsChanging =
    nextSlugCandidate !== null && nextSlugCandidate !== previousSlug;

  // Payment — track whether TPN is actually changing so we can whitelist below
  const tpnIsChanging =
    settings.ipospaysTpn !== undefined &&
    (settings.ipospaysTpn || null) !==
      (existingConfig?.ipospays_tpn ?? null);
  if (settings.ipospaysTpn !== undefined)
    configData.ipospays_tpn = settings.ipospaysTpn || null;

  // Header
  if (settings.headerStyle !== undefined)
    configData.header_style = settings.headerStyle;
  if (settings.headerTextColor !== undefined)
    configData.header_text_color = settings.headerTextColor || null;
  if (settings.borderColor !== undefined)
    configData.border_color = settings.borderColor;
  if (settings.cardColor !== undefined)
    configData.card_color = settings.cardColor;

  // Menu layout
  if (settings.menuLayout !== undefined)
    configData.menu_layout = settings.menuLayout;

  // SEO
  if (settings.metaTitle !== undefined)
    configData.meta_title = settings.metaTitle || null;
  if (settings.metaDescription !== undefined)
    configData.meta_description = settings.metaDescription || null;

  // Analytics
  if (settings.googleAnalyticsId !== undefined)
    configData.google_analytics_id = settings.googleAnalyticsId || null;
  if (settings.facebookPixelId !== undefined)
    configData.facebook_pixel_id = settings.facebookPixelId || null;

  if (existingConfig) {
    const compareKeys = Object.keys(configData).filter(
      (k) => k !== "location_id" && k !== "merchant_id"
    );
    for (const key of compareKeys) {
      const newVal = configData[key];
      const oldVal = existingConfig[key as keyof typeof existingConfig];
      if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
        auditChanges.before[key] = oldVal;
        auditChanges.after[key] = newVal;
        hasChanges = true;
      }
    }

    const { error: updateError } = await supabase
      .from("online_store_config")
      .update(configData)
      .eq("id", existingConfig.id);

    if (updateError)
      throw new Error(`Store config update failed: ${updateError.message}`);
  } else {
    if (!configData.store_name) configData.store_name = currentLocation.name;
    if (!configData.slug)
      configData.slug = currentLocation.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const { data: newConfig, error: insertError } = await supabase
      .from("online_store_config")
      .insert(configData)
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505" && insertError.message.includes("slug")) {
        throw new Error(
          `The URL slug "${configData.slug}" is already taken. Please choose a different one.`
        );
      }
      throw new Error(`Store config creation failed: ${insertError.message}`);
    }

    hasChanges = true;
    auditChanges.after = configData;
  }

  if (hasChanges) {
    await LogAuditEvent({
      merchantId,
      action: existingConfig
        ? "Updated Online Store Config"
        : "Created Online Store Config",
      actionCategory: "settings",
      resourceType: "online_store",
      resourceId: locationId,
      resourceName: (settings.storeName || currentLocation.name) as string,
      locationId,
      changes: auditChanges,
    });
  }

  // If TPN changed or slug/domain changed, whitelist this store's domain with Dejavoo
  const finalTpn = (configData.ipospays_tpn as string | null) ?? null;
  const finalSlug = (configData.slug as string | undefined) ?? existingConfig?.slug ?? "";
  const shouldWhitelist = (tpnIsChanging || slugIsChanging) && finalTpn && finalSlug;
  if (shouldWhitelist) {
    const whitelistResult = await whitelistDejavooDomain(finalTpn, finalSlug);
    if (!whitelistResult.success && !whitelistResult.skipped) {
      console.error("[SAVE_SETTINGS] Domain whitelist failed:", whitelistResult.error);
      // Non-blocking — the TPN was saved successfully; whitelist failure is logged but
      // doesn't roll back the save. The admin can retry by re-saving the same TPN.
    }
  }

  revalidatePath("/dashboard/online-ordering");
  return {
    success: true,
    ...(shouldWhitelist
      ? { domainWhitelisted: true }
      : {}),
  };
}

/**
 * Manually re-triggers the Dejavoo domain whitelist for a location's TPN.
 * Useful if the initial whitelist failed or if the domain changed.
 */
export async function retriggerDomainWhitelist(
  locationId: string
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  const supabase = createServerSupabaseClient();

  const { data: config, error } = await supabase
    .from("online_store_config")
    .select("ipospays_tpn, slug")
    .eq("location_id", locationId)
    .single();

  if (error || !config) {
    return { success: false, error: "Store config not found" };
  }

  if (!config.ipospays_tpn) {
    return { success: false, error: "No TPN configured for this store" };
  }

  if (!config.slug) {
    return { success: false, error: "No URL slug configured for this store" };
  }

  return whitelistDejavooDomain(config.ipospays_tpn, config.slug);
}


