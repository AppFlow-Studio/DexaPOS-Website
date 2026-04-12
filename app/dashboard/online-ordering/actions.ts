"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  OnlineOrderingSettings,
  WeeklySchedule,
} from "./hooks/useOnlineOrderingSettings";
import { revalidatePath } from "next/cache";
import { LogAuditEvent } from "../actions/audit-logs";
import {
  canMerchantMaintainCompletedStore,
  getDefaultStoreSlug,
  normalizeOnlineStoreRequestStatus,
} from "@/lib/online-store/setup-flow";

// ─── Dejavoo Management API ───────────────────────────────────────────────────
// These env vars must be set in your deployment environment.
// Domain whitelist is delegated to Supabase Edge Function `dejavoo-whitelist-domain`
// The management API credentials are read from Supabase function secrets.
//   Sandbox  → https://externalapi.ipospays.tech
//   Production → https://externalapi.ipospays.com
// ──────────────────────────────────────────────────────────────────────────────

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "dexaposai.com";

interface PaymentDeviceSummary {
  id: string;
  device_label: string | null;
  tpn: string;
  use_for_online_ordering: boolean;
  is_active: boolean;
  ftd_key_configured: boolean;
}

async function getLocationPaymentDevices(locationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_location_payment_devices", {
    p_location_id: locationId,
  });

  if (error) {
    console.error("[ONLINE_ORDERING] Failed to load payment devices:", error);
    return [] as PaymentDeviceSummary[];
  }

  return ((data as PaymentDeviceSummary[] | null) ?? []).filter(Boolean);
}

async function getSelectedLocationPaymentDevice(locationId: string) {
  const devices = await getLocationPaymentDevices(locationId);
  return (
    devices.find(
      (device) => device.use_for_online_ordering && device.is_active
    ) ??
    devices.find((device) => device.is_active) ??
    null
  );
}

async function buildRequestedStoreSlug(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  locationName: string,
  locationId: string
) {
  const baseSlug = getDefaultStoreSlug(locationName) || "store";
  const candidates = [baseSlug, `${baseSlug}-${locationId.slice(0, 8)}`];

  for (const candidate of candidates) {
    const { data: existing } = await supabase
      .from("online_store_config")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (!existing) {
      return candidate;
    }
  }

  return `${baseSlug}-${Date.now().toString().slice(-6)}`;
}

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
  location: any,
  selectedDevice: PaymentDeviceSummary | null
): Partial<OnlineOrderingSettings> {
  const setupRequestStatus = normalizeOnlineStoreRequestStatus(
    config.setup_request_status
  );

  return {
    id: config.id,
    locationId: config.location_id,
    setupRequestStatus,
    setupRequestedAt: config.setup_requested_at ?? null,
    setupRequestedBy: config.setup_requested_by ?? null,
    setupReviewedAt: config.setup_reviewed_at ?? null,
    setupReviewedBy: config.setup_reviewed_by ?? null,
    setupApprovedAt: config.setup_approved_at ?? null,
    setupCompletedAt: config.setup_completed_at ?? null,
    setupRejectionReason: config.setup_rejection_reason ?? null,
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

    ipospaysDeviceId: selectedDevice?.id ?? null,
    ipospaysDeviceLabel: selectedDevice?.device_label ?? null,
    ipospaysTpn: selectedDevice?.tpn ?? config.ipospays_tpn ?? "",
    ipospaysFtdEcomKey: "",
    ipospaysFtdEcomKeyConfigured: selectedDevice?.ftd_key_configured ?? false,

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
    const selectedDevice = await getSelectedLocationPaymentDevice(locationId);
    return mapConfigToSettings(config, location, selectedDevice);
  }

  return {
    locationId,
    setupRequestStatus: "not_requested",
    setupRequestedAt: null,
    setupRequestedBy: null,
    setupReviewedAt: null,
    setupReviewedBy: null,
    setupApprovedAt: null,
    setupCompletedAt: null,
    setupRejectionReason: null,
    storeName: location.name,
    phone: location.phone ?? "",
    email: location.email ?? "",
    address: `${location.address_line1}, ${location.city}, ${location.state} ${location.postal_code}`,
    operatingHours: location.business_hours as WeeklySchedule,
  };
}

export async function requestOnlineOrderingSetup(locationId: string) {
  const supabase = createServerSupabaseClient();
  const { userId } = await auth();

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id, merchant_id, name")
    .eq("id", locationId)
    .single();

  if (locationError || !location) {
    throw new Error("Location not found");
  }

  const { data: existingConfig } = await supabase
    .from("online_store_config")
    .select(
      "id, slug, setup_request_status, setup_rejection_reason, setup_reviewed_at, setup_reviewed_by"
    )
    .eq("location_id", locationId)
    .maybeSingle();

  const now = new Date().toISOString();
  const setupRequestStatus = normalizeOnlineStoreRequestStatus(
    existingConfig?.setup_request_status
  );

  if (setupRequestStatus === "pending_review") {
    return { success: true, status: "pending_review" as const };
  }

  if (
    setupRequestStatus === "approved" ||
    setupRequestStatus === "setup_completed"
  ) {
    throw new Error(
      "This branch already has an approved online-store setup request."
    );
  }

  if (existingConfig) {
    const { error: updateError } = await supabase
      .from("online_store_config")
      .update({
        setup_request_status: "pending_review",
        setup_requested_at: now,
        setup_requested_by: userId ?? null,
        setup_reviewed_at: null,
        setup_reviewed_by: null,
        setup_rejection_reason: null,
        setup_approved_at: null,
      })
      .eq("id", existingConfig.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  } else {
    const slug = await buildRequestedStoreSlug(
      supabase,
      location.name,
      location.id
    );

    const { error: insertError } = await supabase
      .from("online_store_config")
      .insert({
        merchant_id: location.merchant_id,
        location_id: location.id,
        store_name: location.name,
        slug,
        is_active: false,
        accepts_pickup: true,
        accepts_delivery: false,
        estimated_prep_minutes: 20,
        min_order_cents: 0,
        tip_enabled: true,
        tip_presets: [15, 18, 20, 25],
        setup_request_status: "pending_review",
        setup_requested_at: now,
        setup_requested_by: userId ?? null,
      });

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  await LogAuditEvent({
    merchantId: location.merchant_id,
    action: "Submitted Online Store Setup Request",
    actionCategory: "settings",
    resourceType: "online_store",
    resourceId: location.id,
    resourceName: location.name,
    locationId: location.id,
    changes: {
      after: {
        setup_request_status: "pending_review",
        setup_requested_at: now,
      },
    },
  });

  revalidatePath("/dashboard/online-ordering");
  return { success: true, status: "pending_review" as const };
}

export async function saveOnlineOrderingSettings(
  locationId: string,
  settings: Partial<OnlineOrderingSettings>
) {
  const supabase = createServerSupabaseClient();

  const { data: currentLocation, error: locFetchError } = await supabase
    .from("locations")
    .select("merchant_id, name")
    .eq("id", locationId)
    .single();

  if (locFetchError || !currentLocation) {
    throw new Error("Location not found");
  }

  const merchantId = currentLocation.merchant_id;

  const { data: existingConfig } = await supabase
    .from("online_store_config")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();

  if (!existingConfig) {
    throw new Error(
      "Online-store setup has not been requested for this location yet."
    );
  }

  if (!canMerchantMaintainCompletedStore(existingConfig.setup_request_status)) {
    throw new Error(
      "HQ must finish the online-store setup before branch storefront settings can be changed."
    );
  }

  // Payment + tipping are HQ-only, enforced server-side to prevent UI bypass.
  const forbiddenKeys = [
    "ipospaysTpn",
    "ipospaysFtdEcomKey",
    "ipospaysDeviceLabel",
    "ipospaysDeviceId",
    "tippingEnabled",
    "tipPresets",
  ] as const;
  if (
    forbiddenKeys.some((key) =>
      Object.prototype.hasOwnProperty.call(settings, key)
    )
  ) {
    throw new Error(
      "Payment credentials and tips are managed by HQ and cannot be updated from the merchant dashboard."
    );
  }

  const auditChanges: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  } = { before: {}, after: {} };
  let hasChanges = false;

  const configData: Record<string, unknown> = {};

  // Identity / status (non-payment)
  if (settings.enabled !== undefined) configData.is_active = Boolean(settings.enabled);
  if (settings.storeName !== undefined) configData.store_name = settings.storeName;
  if (settings.description !== undefined) configData.description = settings.description;
  if (settings.phone !== undefined) configData.phone = settings.phone;
  if (settings.email !== undefined) configData.email = settings.email;

  // Branding
  if (settings.templateId !== undefined) configData.template_id = settings.templateId;
  if (settings.primaryColor !== undefined) configData.primary_color = settings.primaryColor;
  if (settings.secondaryColor !== undefined) configData.secondary_color = settings.secondaryColor;
  if (settings.accentColor !== undefined) configData.accent_color = settings.accentColor;
  if (settings.backgroundColor !== undefined) configData.background_color = settings.backgroundColor;
  if (settings.textColor !== undefined) configData.text_color = settings.textColor;
  if (settings.fontFamily !== undefined) configData.font_family = settings.fontFamily;
  if (settings.logoUrl !== undefined) configData.logo_url = settings.logoUrl;
  if (settings.heroImageUrl !== undefined) configData.hero_image_url = settings.heroImageUrl;
  if (settings.faviconUrl !== undefined) configData.favicon_url = settings.faviconUrl;
  if (settings.ogImageUrl !== undefined) configData.og_image_url = settings.ogImageUrl;

  // Hours
  if (settings.operatingHours !== undefined) configData.operating_hours = settings.operatingHours;

  // Ordering
  if (settings.pickupEnabled !== undefined) configData.accepts_pickup = Boolean(settings.pickupEnabled);
  if (settings.deliveryEnabled !== undefined) configData.accepts_delivery = Boolean(settings.deliveryEnabled);
  if (settings.preparationLeadTime !== undefined) configData.estimated_prep_minutes = Number(settings.preparationLeadTime) || 0;
  if (settings.futureOrderMaxDays !== undefined) configData.max_future_order_days = Number(settings.futureOrderMaxDays) || 0;
  if (settings.minimumOrderAmount !== undefined) configData.min_order_cents = Math.round(Number(settings.minimumOrderAmount || 0) * 100);

  // Delivery
  if (settings.baseDeliveryFee !== undefined) configData.delivery_fee_cents = Math.round(Number(settings.baseDeliveryFee || 0) * 100);
  if (settings.freeDeliveryThreshold !== undefined) configData.free_delivery_threshold_cents = Math.round(Number(settings.freeDeliveryThreshold || 0) * 100);
  if (settings.deliveryRadiusMiles !== undefined) {
    const parsed = settings.deliveryRadiusMiles === null ? null : Number(settings.deliveryRadiusMiles);
    configData.delivery_radius_miles = parsed === null || Number.isFinite(parsed) ? parsed : null;
  }

  // Merchant cannot change payment device/TPN/whitelist.

  for (const key of Object.keys(configData)) {
    const newVal = configData[key];
    const oldVal = existingConfig[key as keyof typeof existingConfig];
    if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
      auditChanges.before[key] = oldVal;
      auditChanges.after[key] = newVal;
      hasChanges = true;
    }
  }

  if (Object.keys(configData).length > 0) {
    const { error: updateError } = await supabase
      .from("online_store_config")
      .update(configData)
      .eq("id", existingConfig.id);

    if (updateError) {
      throw new Error(`Store config update failed: ${updateError.message}`);
    }
  }

  if (hasChanges) {
    await LogAuditEvent({
      merchantId,
      action: "Updated Merchant Online Store Settings",
      actionCategory: "settings",
      resourceType: "online_store",
      resourceId: locationId,
      resourceName: currentLocation.name as string,
      locationId,
      changes: auditChanges,
    });
  }

  revalidatePath("/dashboard/online-ordering");
  return { success: true };
}
/**
 * Manually re-triggers the Dejavoo domain whitelist for a location's TPN.
 * Useful if the initial whitelist failed or if the domain changed.
 */
export async function retriggerDomainWhitelist(
  locationId: string
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  throw new Error("Domain whitelisting is managed by HQ only.");
}


