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
import {
  buildOnlineStoreReviewChecklist,
  extractLocationOnlineStoreReviewPacket,
  extractMerchantOnlineStoreReviewPacket,
} from "@/lib/online-store/setup-flow";
import { createClerkClient } from "@clerk/backend";
import { uploadMerchantDocument, uploadOrganizationDocument } from "@/lib/cdn/server";
import { getCurrentUserMerchantRole } from "@/app/dashboard/actions/role-check";

type MissingRequestFieldKey =
  | "legalBusinessName"
  | "dbaName"
  | "einTaxId"
  | "w9Form"
  | "ownerFirstName"
  | "ownerLastName"
  | "ownerDob"
  | "ownerSsn"
  | "ownerGovernmentId"
  | "bankName"
  | "accountHolderName"
  | "ddaAccountNumber"
  | "routingNumber"
  | "bankSupportDocument";

type RequestPacketMissing = Record<MissingRequestFieldKey, boolean>;

export interface OnlineStoreRequestRequirementsResult {
  success: boolean;
  complete: boolean;
  missing: RequestPacketMissing;
  values: Partial<Record<MissingRequestFieldKey, string>>;
  error?: string;
}

function emptyMissing(): RequestPacketMissing {
  return {
    legalBusinessName: false,
    dbaName: false,
    einTaxId: false,
    w9Form: false,
    ownerFirstName: false,
    ownerLastName: false,
    ownerDob: false,
    ownerSsn: false,
    ownerGovernmentId: false,
    bankName: false,
    accountHolderName: false,
    ddaAccountNumber: false,
    routingNumber: false,
    bankSupportDocument: false,
  };
}

function hasAnyMissing(missing: RequestPacketMissing): boolean {
  return Object.values(missing).some(Boolean);
}

function normalizeDigits(value: string): string {
  return value.replace(/\\D/g, "");
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readFormText(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  return readString(raw);
}

function readFormFile(formData: FormData, key: string): File | null {
  const raw = formData.get(key);
  if (!raw) return null;
  if (typeof raw === "string") return null;
  return raw as File;
}

async function getClerkOrgPublicMetadata(organizationId: string | null) {
  if (!organizationId) return null;
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
    const org = await clerk.organizations.getOrganization({ organizationId });
    return (org.publicMetadata as Record<string, unknown> | null) ?? null;
  } catch (err) {
    console.warn("[ONLINE_ORDERING] Failed to read Clerk org metadata:", err);
    return null;
  }
}

async function assertMerchantOrgAdmin(organizationId: string | null) {
  if (!organizationId) throw new Error("Unauthorized");
  const info = await getCurrentUserMerchantRole();
  if (!info) throw new Error("Unauthorized");
  if (info.clerkOrgId !== organizationId) throw new Error("Unauthorized");
  if (!info.isOwnerOrAdmin) {
    throw new Error("Only merchant admins can submit an online-store setup request.");
  }
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

async function computeOnlineStoreRequestRequirements(
  locationId: string
): Promise<OnlineStoreRequestRequirementsResult> {
  const supabase = createServerSupabaseClient();
  const { userId, orgId } = await auth();

  const missing = emptyMissing();

  if (!userId || !orgId) {
    missing.legalBusinessName = true;
    return {
      success: false,
      complete: false,
      missing,
      values: {},
      error: "Unauthorized",
    };
  }

  await assertMerchantOrgAdmin(orgId);

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id, name, merchant_id, public_metadata")
    .eq("id", locationId)
    .single();

  if (locationError || !location) {
    missing.legalBusinessName = true;
    return {
      success: false,
      complete: false,
      missing,
      values: {},
      error: "Location not found",
    };
  }

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select(
      "id, name, clerk_org_id, owner_first_name, owner_last_name, business_legal_name, dba_name, ein_last_four, public_metadata"
    )
    .eq("id", location.merchant_id)
    .single();

  if (merchantError || !merchant) {
    missing.legalBusinessName = true;
    return {
      success: false,
      complete: false,
      missing,
      values: {},
      error: "Merchant not found",
    };
  }

  if (merchant.clerk_org_id && merchant.clerk_org_id !== orgId) {
    missing.legalBusinessName = true;
    return {
      success: false,
      complete: false,
      missing,
      values: {},
      error: "Unauthorized",
    };
  }

  const clerkMetadata = await getClerkOrgPublicMetadata(
    (merchant.clerk_org_id as string | null) ?? null
  );

  const merchantReviewSource = {
    ...merchant,
    public_metadata: {
      ...(((merchant.public_metadata as Record<string, unknown> | null) ?? {})),
      ...((clerkMetadata ?? {})),
    },
  };

  const merchantPacket = extractMerchantOnlineStoreReviewPacket(
    merchantReviewSource as any
  );
  const locationPacket = extractLocationOnlineStoreReviewPacket(location as any);

  // Keep the checklist build for parity with HQ logic (even if we compute granular missing).
  buildOnlineStoreReviewChecklist(merchantPacket, locationPacket);

  if (!merchantPacket.legalBusinessName) missing.legalBusinessName = true;
  if (!merchantPacket.dbaName) missing.dbaName = true;
  if (!merchantPacket.einTaxId) missing.einTaxId = true;
  if (!merchantPacket.w9FormUrl) missing.w9Form = true;

  const md =
    (merchantReviewSource.public_metadata as Record<string, unknown> | null) ??
    {};
  const ownerFirstName =
    readString((merchant as any).owner_first_name) ??
    readString(md.owner_first_name) ??
    null;
  const ownerLastName =
    readString((merchant as any).owner_last_name) ??
    readString(md.owner_last_name) ??
    null;

  if (!ownerFirstName) missing.ownerFirstName = true;
  if (!ownerLastName) missing.ownerLastName = true;
  if (!merchantPacket.ownerDob) missing.ownerDob = true;
  if (!merchantPacket.ownerSsn) missing.ownerSsn = true;
  if (!merchantPacket.ownerGovernmentIdUrl) missing.ownerGovernmentId = true;

  if (!locationPacket.bankName) missing.bankName = true;
  if (!locationPacket.accountHolderName) missing.accountHolderName = true;
  if (!locationPacket.ddaAccountNumber) missing.ddaAccountNumber = true;
  if (!locationPacket.routingNumber) missing.routingNumber = true;
  if (!locationPacket.bankSupportDocumentUrl) missing.bankSupportDocument = true;

  const values: Partial<Record<MissingRequestFieldKey, string>> = {
    legalBusinessName: merchantPacket.legalBusinessName ?? "",
    dbaName: merchantPacket.dbaName ?? "",
    einTaxId: merchantPacket.einTaxId ?? "",
    ownerFirstName: ownerFirstName ?? "",
    ownerLastName: ownerLastName ?? "",
    ownerDob: merchantPacket.ownerDob ?? "",
    ownerSsn: merchantPacket.ownerSsn ?? "",
    bankName: locationPacket.bankName ?? "",
    accountHolderName: locationPacket.accountHolderName ?? "",
    ddaAccountNumber: locationPacket.ddaAccountNumber ?? "",
    routingNumber: locationPacket.routingNumber ?? "",
  };

  const complete = !hasAnyMissing(missing);

  return {
    success: true,
    complete,
    missing,
    values,
  };
}

export async function getOnlineStoreRequestRequirements(
  locationId: string
): Promise<OnlineStoreRequestRequirementsResult> {
  return await computeOnlineStoreRequestRequirements(locationId);
}

export async function saveOnlineStoreRequestRequirements(formData: FormData) {
  try {
    const supabase = createServerSupabaseClient();
    const { userId, orgId } = await auth();
    const locationId = readFormText(formData, "locationId");

    if (!userId || !orgId) {
      return { success: false, error: "Unauthorized" };
    }
    if (!locationId) {
      return { success: false, error: "locationId is required" };
    }

    await assertMerchantOrgAdmin(orgId);

    const { data: location, error: locationError } = await supabase
      .from("locations")
      .select("id, merchant_id, public_metadata")
      .eq("id", locationId)
      .single();

    if (locationError || !location) {
      return { success: false, error: "Location not found" };
    }

    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id, clerk_org_id")
      .eq("id", location.merchant_id)
      .single();

    if (merchantError || !merchant) {
      return { success: false, error: "Merchant not found" };
    }

    const organizationId = (merchant.clerk_org_id as string | null) ?? null;
    if (!organizationId || organizationId !== orgId) {
      return { success: false, error: "Unauthorized" };
    }

    const businessLegalName = readFormText(formData, "legalBusinessName");
    const dbaName = readFormText(formData, "dbaName");
    const einTaxIdRaw = readFormText(formData, "einTaxId");
    const ownerFirstName = readFormText(formData, "ownerFirstName");
    const ownerLastName = readFormText(formData, "ownerLastName");
    const ownerDob = readFormText(formData, "ownerDob");
    const ownerSsnRaw = readFormText(formData, "ownerSsn");

    const einTaxId = einTaxIdRaw ? normalizeDigits(einTaxIdRaw) : null;
    const ownerSsn = ownerSsnRaw ? normalizeDigits(ownerSsnRaw) : null;

    const w9File = readFormFile(formData, "w9FormFile");
    const ownerGovIdFile = readFormFile(formData, "ownerGovernmentIdFile");

    if (w9File && w9File.type !== "application/pdf") {
      return { success: false, error: "W-9 must be uploaded as a PDF" };
    }

    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
    const org = await clerk.organizations.getOrganization({ organizationId });
    const currentMetadata =
      (org.publicMetadata as Record<string, unknown> | null) ?? {};
    const metadataUpdates: Record<string, unknown> = { ...currentMetadata };

    if (businessLegalName) {
      metadataUpdates.business_legal_name = businessLegalName;
      metadataUpdates.legal_business_name = businessLegalName;
    }
    if (dbaName) {
      metadataUpdates.dba_name = dbaName;
      metadataUpdates.business_name = dbaName;
    }
    if (einTaxId) {
      metadataUpdates.online_store_ein_tax_id = einTaxId;
      metadataUpdates.ein_tax_id = einTaxId;
      metadataUpdates.ein_last_four = einTaxId.slice(-4);
    }
    if (ownerFirstName) metadataUpdates.owner_first_name = ownerFirstName;
    if (ownerLastName) metadataUpdates.owner_last_name = ownerLastName;
    if (ownerDob) metadataUpdates.online_store_owner_dob = ownerDob;
    if (ownerSsn) metadataUpdates.online_store_owner_ssn = ownerSsn;

    if (w9File) {
      const uploadResult = await uploadOrganizationDocument(
        w9File,
        organizationId,
        "online-store-w9"
      );
      if (!uploadResult.success || !uploadResult.cdnUrl) {
        return {
          success: false,
          error: uploadResult.error || "Failed to upload W-9 PDF",
        };
      }
      metadataUpdates.online_store_w9_form_url = uploadResult.cdnUrl;
    }

    if (ownerGovIdFile) {
      const uploadResult = await uploadOrganizationDocument(
        ownerGovIdFile,
        organizationId,
        "online-store-owner-id"
      );
      if (!uploadResult.success || !uploadResult.cdnUrl) {
        return {
          success: false,
          error: uploadResult.error || "Failed to upload owner government ID",
        };
      }
      metadataUpdates.online_store_owner_government_id_url = uploadResult.cdnUrl;
    }

    await clerk.organizations.updateOrganization(organizationId, {
      publicMetadata: metadataUpdates,
    });

    const merchantColumnUpdates: Record<string, unknown> = {};
    if (businessLegalName) merchantColumnUpdates.business_legal_name = businessLegalName;
    if (dbaName) merchantColumnUpdates.dba_name = dbaName;
    if (einTaxId) merchantColumnUpdates.ein_last_four = einTaxId.slice(-4);
    if (ownerFirstName) merchantColumnUpdates.owner_first_name = ownerFirstName;
    if (ownerLastName) merchantColumnUpdates.owner_last_name = ownerLastName;

    if (Object.keys(merchantColumnUpdates).length > 0) {
      const { error: merchantUpdateError } = await supabase
        .from("merchants")
        .update({
          ...merchantColumnUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", merchant.id);

      if (merchantUpdateError) {
        return { success: false, error: merchantUpdateError.message };
      }
    }

    const bankName = readFormText(formData, "bankName");
    const accountHolderName = readFormText(formData, "accountHolderName");
    const ddaAccountNumber = readFormText(formData, "ddaAccountNumber");
    const routingNumber = readFormText(formData, "routingNumber");
    const bankSupportFile = readFormFile(formData, "bankSupportDocumentFile");

    const locationMetadata =
      (location.public_metadata as Record<string, unknown> | null) ?? {};
    const nextLocationMetadata: Record<string, unknown> = { ...locationMetadata };

    if (bankName) nextLocationMetadata.online_store_bank_name = bankName;
    if (accountHolderName)
      nextLocationMetadata.online_store_account_holder_name = accountHolderName;
    if (ddaAccountNumber)
      nextLocationMetadata.online_store_bank_dda_account_number = ddaAccountNumber;
    if (routingNumber)
      nextLocationMetadata.online_store_bank_routing_number = routingNumber;

    if (bankSupportFile) {
      const uploadResult = await uploadMerchantDocument(
        bankSupportFile,
        location.merchant_id,
        "online-store-bank-support"
      );
      if (!uploadResult.success || !uploadResult.cdnUrl) {
        return {
          success: false,
          error: uploadResult.error || "Failed to upload bank support document",
        };
      }
      nextLocationMetadata.online_store_bank_support_document_url = uploadResult.cdnUrl;
    }

    const { error: locationUpdateError } = await supabase
      .from("locations")
      .update({
        public_metadata: nextLocationMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", locationId);

    if (locationUpdateError) {
      return { success: false, error: locationUpdateError.message };
    }

    revalidatePath("/dashboard/online-ordering");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save information",
    };
  }
}

function mapConfigToSettings(
  config: any,
  location: any
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

    templateId: (["hero", "market", "boutique"].includes(config.template_id ?? "") ? config.template_id : "classic") as "classic" | "hero" | "market" | "boutique",
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
    deliveryPricingEnabled: config.delivery_pricing_enabled ?? true,
    autoAcceptOrders: config.auto_accept_orders ?? false,
    minimumOrderAmount: Number(config.min_order ?? 0),
    preparationLeadTime: config.estimated_prep_minutes ?? 20,
    futureOrderMaxDays: config.max_future_order_days ?? 0,

    baseDeliveryFee: Number(config.delivery_fee ?? 0),
    freeDeliveryThreshold: Number(config.free_delivery_threshold ?? 0),
    deliveryRadiusMiles: config.delivery_radius_miles
      ? Number(config.delivery_radius_miles)
      : null,

    tippingEnabled: config.tip_enabled ?? true,
    tipPresets: Array.isArray(config.tip_presets)
      ? config.tip_presets
      : [15, 18, 20, 25],

    headerStyle: config.header_style ?? "filled",
    headerTextColor: config.header_text_color ?? null,
    borderColor: config.border_color ?? null,
    cardColor: config.card_color ?? null,

    menuLayout: config.menu_layout ?? "cards",

    metaTitle: config.meta_title ?? "",
    metaDescription: config.meta_description ?? "",
    googleAnalyticsId: config.google_analytics_id ?? "",
    facebookPixelId: config.facebook_pixel_id ?? "",

    notificationPrefs: {
      email_on_order_placed: true,
      sms_on_order_placed: true,
      email_on_status: ["ready", "cancelled"],
      sms_on_status: ["accepted", "ready", "cancelled"],
      admin_test_email: null,
      admin_test_phone: null,
      ...((config.notification_prefs as Record<string, unknown>) ?? {}),
    } as OnlineOrderingSettings["notificationPrefs"],
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

  const requirements = await computeOnlineStoreRequestRequirements(locationId);
  if (!requirements.success || !requirements.complete) {
    return {
      success: false,
      error: requirements.error || "Missing required information",
      missing: requirements.missing,
      values: requirements.values,
    };
  }

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
        min_order: 0,
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
    "nmiTokenizationKey",
    "nmiPrivateApiKey",
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
  if (settings.menuLayout !== undefined) configData.menu_layout = settings.menuLayout;
  if (settings.logoUrl !== undefined) configData.logo_url = settings.logoUrl;
  if (settings.heroImageUrl !== undefined) configData.hero_image_url = settings.heroImageUrl;
  if (settings.faviconUrl !== undefined) configData.favicon_url = settings.faviconUrl;
  if (settings.ogImageUrl !== undefined) configData.og_image_url = settings.ogImageUrl;

  // Hours
  if (settings.operatingHours !== undefined) configData.operating_hours = settings.operatingHours;

  // Ordering
  if (settings.pickupEnabled !== undefined) configData.accepts_pickup = Boolean(settings.pickupEnabled);
  if (settings.deliveryEnabled !== undefined) configData.accepts_delivery = Boolean(settings.deliveryEnabled);
  if (settings.deliveryPricingEnabled !== undefined) configData.delivery_pricing_enabled = Boolean(settings.deliveryPricingEnabled);
  if (settings.autoAcceptOrders !== undefined) configData.auto_accept_orders = Boolean(settings.autoAcceptOrders);
  if (settings.preparationLeadTime !== undefined) configData.estimated_prep_minutes = Number(settings.preparationLeadTime) || 0;
  if (settings.futureOrderMaxDays !== undefined) configData.max_future_order_days = Number(settings.futureOrderMaxDays) || 0;
  if (settings.minimumOrderAmount !== undefined) {
    const v = Number(settings.minimumOrderAmount || 0);
    configData.min_order_cents = Math.round(v * 100);
    configData.min_order = v;
  }

  // Delivery
  if (settings.baseDeliveryFee !== undefined) {
    const v = Number(settings.baseDeliveryFee || 0);
    configData.delivery_fee_cents = Math.round(v * 100);
    configData.delivery_fee = v;
  }
  if (settings.freeDeliveryThreshold !== undefined) {
    const v = Number(settings.freeDeliveryThreshold || 0);
    configData.free_delivery_threshold_cents = Math.round(v * 100);
    configData.free_delivery_threshold = v;
  }
  if (settings.deliveryRadiusMiles !== undefined) {
    const parsed = settings.deliveryRadiusMiles === null ? null : Number(settings.deliveryRadiusMiles);
    configData.delivery_radius_miles = parsed === null || Number.isFinite(parsed) ? parsed : null;
  }

  if (settings.notificationPrefs !== undefined) {
    configData.notification_prefs = settings.notificationPrefs;
  }

  // Merchant cannot change HQ-managed payment credentials or tipping.

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

export async function sendTestOrderNotification(
  locationId: string,
  channel: "email" | "sms",
  to: string
): Promise<{ success: boolean; error?: string }> {
  if (!locationId || !to) {
    return { success: false, error: "Missing recipient" };
  }

  const supabase = createServerSupabaseClient();
  const { data: config } = await supabase
    .from("online_store_config")
    .select("id")
    .eq("location_id", locationId)
    .maybeSingle();

  if (!config?.id) {
    return { success: false, error: "Online store not configured" };
  }

  const { sendTestNotification } = await import(
    "@/lib/messaging/order-notifications"
  );
  return sendTestNotification(config.id, channel, to);
}

export async function getOrderNotificationAuditLog(
  locationId: string,
  limit = 50
): Promise<{
  data: Array<{
    id: string;
    orderId: string;
    channel: "email" | "sms";
    event: string;
    recipient: string;
    status: "sent" | "failed" | "skipped";
    error: string | null;
    sentAt: string;
  }>;
  error?: string;
}> {
  if (!locationId) return { data: [], error: "Missing locationId" };
  const supabase = createServerSupabaseClient();

  const { data: location } = await supabase
    .from("locations")
    .select("merchant_id")
    .eq("id", locationId)
    .single();
  if (!location) return { data: [], error: "Location not found" };

  const { data, error } = await supabase
    .from("order_notifications")
    .select("id, order_id, channel, event, recipient, status, error, sent_at")
    .eq("merchant_id", location.merchant_id)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };

  return {
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      orderId: r.order_id as string,
      channel: r.channel as "email" | "sms",
      event: r.event as string,
      recipient: r.recipient as string,
      status: r.status as "sent" | "failed" | "skipped",
      error: (r.error as string | null) ?? null,
      sentAt: r.sent_at as string,
    })),
  };
}



