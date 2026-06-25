"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
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
import { buildQrTableUrl } from "@/app/sites/lib/store-url";
import { syncStorefrontPaymentDomainWhitelist } from "@/lib/online-store/payment-domain-whitelist";

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

export type QrTableManagerStatus = "not_generated" | "active" | "revoked";

export interface QrTableManagerRow {
  floorPlanObjectId: string;
  tableLabel: string;
  tableName: string;
  zoneName: string | null;
  sectionId: string | null;
  capacity: number | null;
  qrStatus: QrTableManagerStatus;
  qrCodeId: string | null;
  tableToken: string | null;
  qrUrl: string | null;
  tokenVersion: number | null;
  scanCountLifetime: number;
  scanCount7d: number;
  lastScannedAt: string | null;
  generatedAt: string | null;
}

export interface QrTableManagerSnapshot {
  success: boolean;
  storeName: string | null;
  storeSlug: string | null;
  customDomain: string | null;
  acceptsDineIn: boolean;
  qrKillSwitch: boolean;
  tables: QrTableManagerRow[];
  generatedCount: number;
  activeCount: number;
  error?: string;
}

export interface QrAnalyticsSnapshot {
  success: boolean;
  rangeDays: 7 | 30;
  stages: {
    scanned: number;
    menuViewed: number;
    cartStarted: number;
    checkout: number;
    paid: number;
    abandoned: number;
  };
  conversionRate: number;
  abandonmentRate: number;
  qrOrderCount: number;
  qrRevenue: number;
  qrAov: number;
  serverAov: number;
  repeatPhoneRate: number;
  byHour: Array<{
    hour: number;
    label: string;
    scans: number;
    paid: number;
  }>;
  topTables: Array<{
    tableLabel: string;
    scans: number;
    paidOrders: number;
    revenue: number;
  }>;
  topItems: Array<{
    itemName: string;
    quantity: number;
    revenue: number;
  }>;
  error?: string;
}

export interface QrGuestAlertRow {
  id: string;
  tableLabel: string;
  alertType: string;
  message: string | null;
  status: string;
  createdAt: string;
  orderId: string | null;
  onlineOrderSessionId: string | null;
}

export interface QrGuestAlertsSnapshot {
  success: boolean;
  openCount: number;
  alerts: QrGuestAlertRow[];
  error?: string;
}

export interface QrBillingGateStatus {
  entitled: boolean;
  requiredPlanCode: string | null;
  requiredPlanName: string | null;
  currentPlanCode: string | null;
  currentPlanName: string | null;
  subscriptionStatus: string | null;
  hasServiceOverride: boolean;
  serviceCode: string;
  reason: string | null;
}

interface QrCodeRow {
  id: string;
  floor_plan_object_id: string;
  table_label: string;
  token: string;
  token_version: number;
  is_active: boolean;
  scan_count: number;
  last_scanned_at: string | null;
  created_at: string;
  rotated_at: string | null;
}

interface QrScanEventRow {
  table_qr_code_id: string | null;
  occurred_at: string;
}

interface QrAnalyticsEventRow {
  stage: string;
  table_qr_code_id: string | null;
  occurred_at: string;
}

interface QrAnalyticsOrderItemRow {
  item_name: string | null;
  quantity: number | null;
  subtotal: number | string | null;
}

interface QrAnalyticsOrderRow {
  id: string;
  total_amount: number | string | null;
  customer_phone: string | null;
  table_number: string | null;
  created_at: string;
  order_items?: QrAnalyticsOrderItemRow[] | null;
}

interface QrAnalyticsSessionOrderRow {
  order_id: string | null;
  customer_phone: string | null;
  table_label: string | null;
  created_at: string;
}

const QR_BILLING_SERVICE_CODE = "qr_table_ordering";
const QR_DEFAULT_REQUIRED_PLAN_CODE = "multi_location";

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

function toMoneyNumber(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatHourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const displayHour = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${displayHour}${suffix}`;
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

/**
 * Validates the caller is an owner/admin of the merchant they're acting on and
 * returns the *effective* Clerk org id to gate against. Under HQ impersonation
 * this resolves to the impersonated merchant's clerk_org_id (not the HQ admin's
 * org), since getCurrentUserMerchantRole() is impersonation-aware. Callers must
 * compare merchant.clerk_org_id against this value — never the raw auth() orgId.
 */
async function assertMerchantOrgAdmin(): Promise<string> {
  const info = await getCurrentUserMerchantRole();
  if (!info) throw new Error("Unauthorized");
  if (!info.isOwnerOrAdmin) {
    throw new Error("Only merchant admins can submit an online-store setup request.");
  }
  return info.clerkOrgId;
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

async function getQrBillingGateStatus(
  locationId: string,
  merchantId: string
): Promise<QrBillingGateStatus> {
  const serviceRole = createServiceRoleClient();

  const [
    serviceResult,
    merchantPlanStatusResult,
    merchantPlansResult,
    locationSubscriptionResult,
  ] = await Promise.all([
    serviceRole
      .from("billable_services")
      .select("id, service_code, display_name, metadata, is_active")
      .eq("service_code", QR_BILLING_SERVICE_CODE)
      .maybeSingle(),
    serviceRole.rpc("get_merchant_subscription_status", {
      p_merchant_id: merchantId,
    }),
    serviceRole
      .from("subscription_plans")
      .select("plan_code, display_name, display_order")
      .eq("plan_scope", "merchant_tier")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    serviceRole
      .from("merchant_subscriptions")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("location_id", locationId)
      .maybeSingle(),
  ]);

  const service = serviceResult.data as
    | {
        id: string;
        service_code: string;
        display_name: string;
        metadata: Record<string, unknown> | null;
        is_active: boolean;
      }
    | null;
  const serviceMetadata =
    (service?.metadata as Record<string, unknown> | null) ?? null;
  const requiredPlanCode =
    readString(serviceMetadata?.required_plan_code) ??
    QR_DEFAULT_REQUIRED_PLAN_CODE;

  const planRows =
    (merchantPlansResult.data as
      | Array<{
          plan_code: string;
          display_name: string;
          display_order: number | null;
        }>
      | null) ?? [];
  const planOrderMap = new Map(
    planRows.map((plan) => [plan.plan_code, Number(plan.display_order ?? 0)])
  );
  const planLabelMap = new Map(
    planRows.map((plan) => [plan.plan_code, plan.display_name])
  );

  const merchantPlanStatus =
    (merchantPlanStatusResult.data as
      | {
          plan?: { code?: string | null; name?: string | null } | null;
          subscription_status?: string | null;
        }
      | null) ?? null;

  let hasServiceOverride = false;
  if (locationSubscriptionResult.data?.id) {
    const assignmentResult = await serviceRole.rpc(
      "list_subscription_service_assignments",
      {
        p_subscription_id: locationSubscriptionResult.data.id,
      }
    );

    const assignments =
      (assignmentResult.data as
        | Array<{
            service_code: string;
            is_enabled: boolean;
          }>
        | null) ?? [];
    hasServiceOverride = assignments.some(
      (assignment) =>
        assignment.service_code === QR_BILLING_SERVICE_CODE &&
        assignment.is_enabled
    );
  }

  const currentPlanCode = readString(merchantPlanStatus?.plan?.code) ?? null;
  const currentPlanName = readString(merchantPlanStatus?.plan?.name) ?? null;
  const subscriptionStatus =
    readString(merchantPlanStatus?.subscription_status) ?? null;
  const requiredPlanName =
    planLabelMap.get(requiredPlanCode) ??
    (requiredPlanCode === QR_DEFAULT_REQUIRED_PLAN_CODE
      ? "Multi-Location"
      : null);

  const currentPlanOrder =
    currentPlanCode !== null ? planOrderMap.get(currentPlanCode) ?? -1 : -1;
  const requiredPlanOrder = planOrderMap.get(requiredPlanCode) ?? 9999;
  const planStatusAllowsAccess =
    subscriptionStatus === "active" || subscriptionStatus === "past_due";
  const entitledByPlan =
    service?.is_active !== false &&
    planStatusAllowsAccess &&
    currentPlanOrder >= requiredPlanOrder;

  let reason: string | null = null;
  if (!service) {
    reason =
      "QR billing gate is not configured yet. Ask Dexa HQ to seed QR Table Ordering in the service catalog.";
  } else if (hasServiceOverride) {
    reason =
      "HQ override is active for this location through the QR Table Ordering service assignment.";
  } else if (entitledByPlan) {
    reason = null;
  } else if (!currentPlanCode) {
    reason = `QR Table Ordering requires the ${requiredPlanName ?? requiredPlanCode} tier or an HQ override.`;
  } else if (!planStatusAllowsAccess) {
    reason = `QR Table Ordering is unavailable while the merchant subscription is ${subscriptionStatus ?? "inactive"}.`;
  } else {
    reason = `QR Table Ordering requires the ${requiredPlanName ?? requiredPlanCode} tier or an HQ override. Current tier: ${currentPlanName ?? currentPlanCode}.`;
  }

  return {
    entitled: Boolean(hasServiceOverride || entitledByPlan),
    requiredPlanCode,
    requiredPlanName,
    currentPlanCode,
    currentPlanName,
    subscriptionStatus,
    hasServiceOverride,
    serviceCode: QR_BILLING_SERVICE_CODE,
    reason,
  };
}

async function computeOnlineStoreRequestRequirements(
  locationId: string
): Promise<OnlineStoreRequestRequirementsResult> {
  const supabase = createServerSupabaseClient();

  const missing = emptyMissing();

  // Impersonation-aware: resolves to the impersonated merchant's org under HQ impersonation.
  let effectiveOrgId: string;
  try {
    effectiveOrgId = await assertMerchantOrgAdmin();
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      missing.legalBusinessName = true;
      return {
        success: false,
        complete: false,
        missing,
        values: {},
        error: "Unauthorized",
      };
    }
    throw err;
  }

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

  if (merchant.clerk_org_id && merchant.clerk_org_id !== effectiveOrgId) {
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
    const locationId = readFormText(formData, "locationId");

    if (!locationId) {
      return { success: false, error: "locationId is required" };
    }

    // Impersonation-aware: resolves to the impersonated merchant's org under HQ impersonation.
    const effectiveOrgId = await assertMerchantOrgAdmin();

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
    if (!organizationId || organizationId !== effectiveOrgId) {
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
  location: any,
  qrBillingGate?: QrBillingGateStatus
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
    customDomain: config.custom_domain ?? null,
    description: config.description ?? "",
    phone: config.phone ?? location.phone ?? "",
    email: config.email ?? location.email ?? "",
    address: location
      ? `${location.address_line1 ?? ""}, ${location.city ?? ""}, ${location.state ?? ""} ${location.postal_code ?? ""}`
      : "",

    templateId: (["hero", "market", "boutique"].includes(config.template_id ?? "") ? config.template_id : "classic") as "classic" | "hero" | "market" | "boutique",
    primaryColor: config.primary_color ?? "#0C4FD1",
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
    acceptsDineIn: config.accepts_dine_in ?? false,
    qrFulfillmentMode:
      config.qr_fulfillment_mode === "counter" ? "counter" : "runner",
    qrGeofenceEnabled: config.qr_geofence_enabled ?? false,
    qrServiceFeePct: Number(config.qr_service_fee_pct ?? 0),
    qrKillSwitch: config.qr_kill_switch ?? false,
    qrBillingGate:
      qrBillingGate ?? {
        entitled: false,
        requiredPlanCode: QR_DEFAULT_REQUIRED_PLAN_CODE,
        requiredPlanName: "Multi-Location",
        currentPlanCode: null,
        currentPlanName: null,
        subscriptionStatus: null,
        hasServiceOverride: false,
        serviceCode: QR_BILLING_SERVICE_CODE,
        reason:
          "QR billing gate is not configured yet. Ask Dexa HQ to seed QR Table Ordering in the service catalog.",
      },

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
      "merchant_id, name, phone, email, address_line1, city, state, postal_code, business_hours"
    )
    .eq("id", locationId)
    .single();

  if (locError) {
    console.error("Error fetching location:", locError);
    return null;
  }

  const qrBillingGate = await getQrBillingGateStatus(
    locationId,
    location.merchant_id as string
  );

  const { data: config, error: configError } = await supabase
    .from("online_store_config")
    .select("*")
    .eq("location_id", locationId)
    .single();

  if (configError && configError.code !== "PGRST116") {
    console.error("Error fetching store config:", configError);
  }

  if (config) {
    return mapConfigToSettings(config, location, qrBillingGate);
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
    qrBillingGate,
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

  const qrBillingGate = await getQrBillingGateStatus(locationId, merchantId);
  const qrKeys = [
    "acceptsDineIn",
    "qrFulfillmentMode",
    "qrGeofenceEnabled",
    "qrServiceFeePct",
    "qrKillSwitch",
  ] as const;
  const touchedQrKeys = qrKeys.filter((key) => {
    if (!Object.prototype.hasOwnProperty.call(settings, key)) return false;

    switch (key) {
      case "acceptsDineIn":
        return Boolean(settings.acceptsDineIn) !== Boolean(existingConfig.accepts_dine_in);
      case "qrFulfillmentMode":
        return (
          (settings.qrFulfillmentMode === "counter" ? "counter" : "runner") !==
          (existingConfig.qr_fulfillment_mode === "counter" ? "counter" : "runner")
        );
      case "qrGeofenceEnabled":
        return Boolean(settings.qrGeofenceEnabled) !== Boolean(existingConfig.qr_geofence_enabled);
      case "qrServiceFeePct":
        return Number(settings.qrServiceFeePct ?? 0) !== Number(existingConfig.qr_service_fee_pct ?? 0);
      case "qrKillSwitch":
        return Boolean(settings.qrKillSwitch) !== Boolean(existingConfig.qr_kill_switch);
      default:
        return false;
    }
  });

  if (touchedQrKeys.length > 0 && !qrBillingGate.entitled) {
    const onlyTurningOffQr =
      touchedQrKeys.length === 1 && settings.acceptsDineIn === false;
    if (!onlyTurningOffQr) {
      throw new Error(
        qrBillingGate.reason ||
          "QR Table Ordering is not available for the current subscription tier."
      );
    }
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
  if (settings.acceptsDineIn !== undefined) configData.accepts_dine_in = Boolean(settings.acceptsDineIn);
  if (settings.qrFulfillmentMode !== undefined) {
    configData.qr_fulfillment_mode = settings.qrFulfillmentMode === "counter" ? "counter" : "runner";
  }
  if (settings.qrGeofenceEnabled !== undefined) configData.qr_geofence_enabled = Boolean(settings.qrGeofenceEnabled);
  if (settings.qrServiceFeePct !== undefined) {
    const v = Number(settings.qrServiceFeePct || 0);
    configData.qr_service_fee_pct = Number.isFinite(v) ? Math.max(0, Number(v.toFixed(2))) : 0;
  }
  if (settings.qrKillSwitch !== undefined) configData.qr_kill_switch = Boolean(settings.qrKillSwitch);
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

  const domainWhitelistResult = await syncStorefrontPaymentDomainWhitelist({
    locationId,
    slug:
      (typeof configData.slug === "string" && configData.slug.trim().length > 0
        ? configData.slug
        : (existingConfig.slug as string | null)) ?? null,
    customDomain:
      Object.prototype.hasOwnProperty.call(configData, "custom_domain")
        ? ((configData.custom_domain as string | null) ?? null)
        : ((existingConfig.custom_domain as string | null) ?? null),
  });

  revalidatePath("/dashboard/online-ordering");
  return {
    success: true,
    domainWhitelisted: domainWhitelistResult.domainWhitelisted,
    domainWhitelistError: domainWhitelistResult.domainWhitelistError,
    domainWhitelistSkipped: domainWhitelistResult.domainWhitelistSkipped,
  };
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

function compareQrManagerRows(a: QrTableManagerRow, b: QrTableManagerRow) {
  const zoneA = (a.zoneName || "zzz").toLowerCase();
  const zoneB = (b.zoneName || "zzz").toLowerCase();
  if (zoneA !== zoneB) return zoneA.localeCompare(zoneB);
  return a.tableLabel.localeCompare(b.tableLabel, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export async function getQrTableManagerSnapshot(
  locationId: string
): Promise<QrTableManagerSnapshot> {
  if (!locationId) {
    return {
      success: false,
      storeName: null,
      storeSlug: null,
      customDomain: null,
      acceptsDineIn: false,
      qrKillSwitch: false,
      tables: [],
      generatedCount: 0,
      activeCount: 0,
      error: "Missing location",
    };
  }

  const supabase = createServerSupabaseClient();
  const db = supabase as any;

  const { data: config, error: configError } = await supabase
    .from("online_store_config")
    .select(
      "id, store_name, slug, custom_domain, setup_request_status, accepts_dine_in, qr_kill_switch"
    )
    .eq("location_id", locationId)
    .maybeSingle();

  if (configError) {
    return {
      success: false,
      storeName: null,
      storeSlug: null,
      customDomain: null,
      acceptsDineIn: false,
      qrKillSwitch: false,
      tables: [],
      generatedCount: 0,
      activeCount: 0,
      error: configError.message,
    };
  }

  if (!config) {
    return {
      success: false,
      storeName: null,
      storeSlug: null,
      customDomain: null,
      acceptsDineIn: false,
      qrKillSwitch: false,
      tables: [],
      generatedCount: 0,
      activeCount: 0,
      error: "Online ordering is not configured for this location yet.",
    };
  }

  const { data: tables, error: tablesError } = await supabase
    .from("floor_plan_objects")
    .select(
      "id, name, label_override, zone_name, section_id, capacity, is_active, category"
    )
    .eq("location_id", locationId)
    .eq("is_active", true)
    .in("category", ["table", "booth"]);

  if (tablesError) {
    return {
      success: false,
      storeName: (config.store_name as string | null) ?? null,
      storeSlug: (config.slug as string | null) ?? null,
      customDomain: (config.custom_domain as string | null) ?? null,
      acceptsDineIn: Boolean(config.accepts_dine_in),
      qrKillSwitch: Boolean(config.qr_kill_switch),
      tables: [],
      generatedCount: 0,
      activeCount: 0,
      error: tablesError.message,
    };
  }

  const floorPlanObjectIds = (tables ?? []).map((row) => row.id as string);
  if (floorPlanObjectIds.length === 0) {
    return {
      success: true,
      storeName: (config.store_name as string | null) ?? null,
      storeSlug: (config.slug as string | null) ?? null,
      customDomain: (config.custom_domain as string | null) ?? null,
      acceptsDineIn: Boolean(config.accepts_dine_in),
      qrKillSwitch: Boolean(config.qr_kill_switch),
      tables: [],
      generatedCount: 0,
      activeCount: 0,
    };
  }

  const [{ data: qrCodes, error: qrCodesError }, { data: scanEvents, error: scanEventsError }] =
    await Promise.all([
      db
        .from("table_qr_codes")
        .select(
          "id, floor_plan_object_id, table_label, token, token_version, is_active, scan_count, last_scanned_at, created_at, rotated_at"
        )
        .in("floor_plan_object_id", floorPlanObjectIds)
        .order("created_at", { ascending: false }),
      db
        .from("qr_scan_events")
        .select("table_qr_code_id, occurred_at")
        .eq("location_id", locationId)
        .gte(
          "occurred_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        ),
    ]);

  if (qrCodesError) {
    return {
      success: false,
      storeName: (config.store_name as string | null) ?? null,
      storeSlug: (config.slug as string | null) ?? null,
      customDomain: (config.custom_domain as string | null) ?? null,
      acceptsDineIn: Boolean(config.accepts_dine_in),
      qrKillSwitch: Boolean(config.qr_kill_switch),
      tables: [],
      generatedCount: 0,
      activeCount: 0,
      error: qrCodesError.message,
    };
  }

  if (scanEventsError) {
    return {
      success: false,
      storeName: (config.store_name as string | null) ?? null,
      storeSlug: (config.slug as string | null) ?? null,
      customDomain: (config.custom_domain as string | null) ?? null,
      acceptsDineIn: Boolean(config.accepts_dine_in),
      qrKillSwitch: Boolean(config.qr_kill_switch),
      tables: [],
      generatedCount: 0,
      activeCount: 0,
      error: scanEventsError.message,
    };
  }

  const activeQrByTable = new Map<string, QrCodeRow>();
  const latestQrByTable = new Map<string, QrCodeRow>();
  for (const qrCode of ((qrCodes ?? []) as QrCodeRow[])) {
    if (!latestQrByTable.has(qrCode.floor_plan_object_id)) {
      latestQrByTable.set(qrCode.floor_plan_object_id, qrCode);
    }
    if (qrCode.is_active && !activeQrByTable.has(qrCode.floor_plan_object_id)) {
      activeQrByTable.set(qrCode.floor_plan_object_id, qrCode);
    }
  }

  const scanCountByQrId = new Map<string, number>();
  for (const scanEvent of ((scanEvents ?? []) as QrScanEventRow[])) {
    if (!scanEvent.table_qr_code_id) continue;
    scanCountByQrId.set(
      scanEvent.table_qr_code_id,
      (scanCountByQrId.get(scanEvent.table_qr_code_id) ?? 0) + 1
    );
  }

  const rows: QrTableManagerRow[] = (tables ?? []).map((table) => {
    const floorPlanObjectId = table.id as string;
    const activeQr = activeQrByTable.get(floorPlanObjectId) ?? null;
    const latestQr = latestQrByTable.get(floorPlanObjectId) ?? null;
    const qrSource = activeQr ?? latestQr;
    const tableLabel =
      readString(table.label_override) ??
      readString(table.name) ??
      "Unnamed table";

    let qrStatus: QrTableManagerStatus = "not_generated";
    if (activeQr) {
      qrStatus = "active";
    } else if (latestQr) {
      qrStatus = "revoked";
    }

    return {
      floorPlanObjectId,
      tableLabel,
      tableName: (table.name as string) ?? tableLabel,
      zoneName: readString(table.zone_name),
      sectionId: (table.section_id as string | null) ?? null,
      capacity: (table.capacity as number | null) ?? null,
      qrStatus,
      qrCodeId: qrSource?.id ?? null,
      tableToken: qrSource?.token ?? null,
      qrUrl: buildQrTableUrl({
        slug: (config.slug as string | null) ?? null,
        customDomain: (config.custom_domain as string | null) ?? null,
        token: qrSource?.token ?? null,
      }) || null,
      tokenVersion: qrSource?.token_version ?? null,
      scanCountLifetime: qrSource?.scan_count ?? 0,
      scanCount7d:
        activeQr && activeQr.id ? scanCountByQrId.get(activeQr.id) ?? 0 : 0,
      lastScannedAt: qrSource?.last_scanned_at ?? null,
      generatedAt: qrSource?.created_at ?? null,
    };
  });

  rows.sort(compareQrManagerRows);

  return {
    success: true,
    storeName: (config.store_name as string | null) ?? null,
    storeSlug: (config.slug as string | null) ?? null,
    customDomain: (config.custom_domain as string | null) ?? null,
    acceptsDineIn: Boolean(config.accepts_dine_in),
    qrKillSwitch: Boolean(config.qr_kill_switch),
    generatedCount: rows.filter((row) => row.qrStatus !== "not_generated").length,
    activeCount: rows.filter((row) => row.qrStatus === "active").length,
    tables: rows,
  };
}

export async function getQrAnalyticsSnapshot(
  locationId: string,
  requestedRangeDays: number = 30
): Promise<QrAnalyticsSnapshot> {
  const rangeDays: 7 | 30 = requestedRangeDays === 7 ? 7 : 30;
  const empty: QrAnalyticsSnapshot = {
    success: false,
    rangeDays,
    stages: {
      scanned: 0,
      menuViewed: 0,
      cartStarted: 0,
      checkout: 0,
      paid: 0,
      abandoned: 0,
    },
    conversionRate: 0,
    abandonmentRate: 0,
    qrOrderCount: 0,
    qrRevenue: 0,
    qrAov: 0,
    serverAov: 0,
    repeatPhoneRate: 0,
    byHour: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: formatHourLabel(hour),
      scans: 0,
      paid: 0,
    })),
    topTables: [],
    topItems: [],
  };

  if (!locationId) {
    return {
      ...empty,
      error: "Missing location",
    };
  }

  const supabase = createServerSupabaseClient();
  const db = supabase as any;
  const sinceIso = new Date(
    Date.now() - rangeDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const [eventsResult, storeConfigsResult, dineInOrdersResult] = await Promise.all([
    db
      .from("qr_scan_events")
      .select("stage, table_qr_code_id, occurred_at")
      .eq("location_id", locationId)
      .gte("occurred_at", sinceIso),
    db
      .from("online_store_config")
      .select("id")
      .eq("location_id", locationId),
    db
      .from("orders")
      .select("id, total_amount")
      .eq("location_id", locationId)
      .eq("order_type", "dine_in")
      .not("status", "in", "(draft,cancelled,void)")
      .gte("created_at", sinceIso),
  ]);

  if (eventsResult.error) {
    return {
      ...empty,
      error: eventsResult.error.message,
    };
  }

  if (storeConfigsResult.error) {
    return {
      ...empty,
      error: storeConfigsResult.error.message,
    };
  }

  if (dineInOrdersResult.error) {
    return {
      ...empty,
      error: dineInOrdersResult.error.message,
    };
  }

  const storeConfigIds = ((storeConfigsResult.data ?? []) as Array<{ id: string }>)
    .map((row) => row.id)
    .filter((value): value is string => Boolean(readString(value)));

  const qrSessionOrdersResult =
    storeConfigIds.length > 0
      ? await db
          .from("online_order_sessions")
          .select("order_id, customer_phone, table_label, created_at")
          .in("store_config_id", storeConfigIds)
          .not("table_qr_code_id", "is", null)
          .not("order_id", "is", null)
          .gte("created_at", sinceIso)
      : { data: [], error: null };

  if (qrSessionOrdersResult.error) {
    return {
      ...empty,
      error: qrSessionOrdersResult.error.message,
    };
  }

  const qrSessionOrders = (qrSessionOrdersResult.data ??
    []) as QrAnalyticsSessionOrderRow[];
  const qrOrderIds = Array.from(
    new Set(
      qrSessionOrders
        .map((row) => readString(row.order_id))
        .filter((value): value is string => Boolean(value))
    )
  );

  const qrOrdersResult =
    qrOrderIds.length > 0
      ? await db
          .from("orders")
          .select(
            "id, total_amount, customer_phone, table_number, created_at, order_items(item_name, quantity, subtotal)"
          )
          .in("id", qrOrderIds)
          .eq("location_id", locationId)
          .not("status", "in", "(draft,cancelled,void)")
      : { data: [], error: null };

  if (qrOrdersResult.error) {
    return {
      ...empty,
      error: qrOrdersResult.error.message,
    };
  }

  const tableQrCodeIds = Array.from(
    new Set(
      ((eventsResult.data ?? []) as QrAnalyticsEventRow[])
        .map((event) => readString(event.table_qr_code_id))
        .filter((value): value is string => Boolean(value))
    )
  );

  const qrCodeLabelMap = new Map<string, string>();
  if (tableQrCodeIds.length > 0) {
    const qrCodesResult = await db
      .from("table_qr_codes")
      .select("id, table_label")
      .in("id", tableQrCodeIds);

    if (qrCodesResult.error) {
      return {
        ...empty,
        error: qrCodesResult.error.message,
      };
    }

    for (const row of (qrCodesResult.data ?? []) as Array<{
      id: string;
      table_label: string | null;
    }>) {
      qrCodeLabelMap.set(
        row.id,
        readString(row.table_label) ?? "Unknown table"
      );
    }
  }

  const events = (eventsResult.data ?? []) as QrAnalyticsEventRow[];
  const qrOrders = (qrOrdersResult.data ?? []) as QrAnalyticsOrderRow[];
  const dineInOrders = (dineInOrdersResult.data ?? []) as QrAnalyticsOrderRow[];
  const qrSessionMetaByOrderId = new Map(
    qrSessionOrders
      .map((row) => {
        const orderId = readString(row.order_id);
        if (!orderId) return null;
        return [
          orderId,
          {
            customerPhone: readString(row.customer_phone),
            tableLabel: readString(row.table_label),
          },
        ] as const;
      })
      .filter(
        (
          value
        ): value is readonly [
          string,
          { customerPhone: string | null; tableLabel: string | null }
        ] => value !== null
      )
  );

  const stages = {
    scanned: 0,
    menuViewed: 0,
    cartStarted: 0,
    checkout: 0,
    paid: 0,
    abandoned: 0,
  };
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHourLabel(hour),
    scans: 0,
    paid: 0,
  }));
  const tableScanMap = new Map<string, number>();

  for (const event of events) {
    const stage = readString(event.stage);
    const hour = new Date(event.occurred_at).getHours();
    if (stage === "scanned") {
      stages.scanned += 1;
      byHour[hour].scans += 1;
      const tableLabel =
        (event.table_qr_code_id
          ? qrCodeLabelMap.get(event.table_qr_code_id)
          : null) ?? "Unknown table";
      tableScanMap.set(tableLabel, (tableScanMap.get(tableLabel) ?? 0) + 1);
      continue;
    }
    if (stage === "menu_viewed") {
      stages.menuViewed += 1;
      continue;
    }
    if (stage === "cart_started") {
      stages.cartStarted += 1;
      continue;
    }
    if (stage === "checkout") {
      stages.checkout += 1;
      continue;
    }
    if (stage === "paid") {
      stages.paid += 1;
      byHour[hour].paid += 1;
      continue;
    }
    if (stage === "abandoned") {
      stages.abandoned += 1;
    }
  }

  const tablePaidMap = new Map<string, { paidOrders: number; revenue: number }>();
  const itemMap = new Map<string, { quantity: number; revenue: number }>();
  const phoneCounts = new Map<string, number>();

  let qrRevenue = 0;
  for (const order of qrOrders) {
    const amount = toMoneyNumber(order.total_amount);
    qrRevenue += amount;

    const sessionMeta = qrSessionMetaByOrderId.get(order.id);
    const tableLabel =
      readString(order.table_number) ??
      sessionMeta?.tableLabel ??
      "Unknown table";
    const existingTable = tablePaidMap.get(tableLabel) ?? {
      paidOrders: 0,
      revenue: 0,
    };
    existingTable.paidOrders += 1;
    existingTable.revenue += amount;
    tablePaidMap.set(tableLabel, existingTable);

    const phone = readString(order.customer_phone) ?? sessionMeta?.customerPhone;
    if (phone) {
      phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
    }

    for (const item of order.order_items ?? []) {
      const itemName = readString(item.item_name) ?? "Unnamed item";
      const quantity = Number(item.quantity ?? 0);
      const revenue = toMoneyNumber(item.subtotal);
      const existingItem = itemMap.get(itemName) ?? { quantity: 0, revenue: 0 };
      existingItem.quantity += quantity;
      existingItem.revenue += revenue;
      itemMap.set(itemName, existingItem);
    }
  }

  const qrOrderCount = qrOrders.length;
  const qrAov = qrOrderCount > 0 ? qrRevenue / qrOrderCount : 0;
  const serverRevenue = dineInOrders.reduce(
    (sum, order) => sum + toMoneyNumber(order.total_amount),
    0
  );
  const serverAov =
    dineInOrders.length > 0 ? serverRevenue / dineInOrders.length : 0;

  const uniquePhones = phoneCounts.size;
  const repeatPhones = Array.from(phoneCounts.values()).filter(
    (count) => count > 1
  ).length;
  const repeatPhoneRate =
    uniquePhones > 0 ? (repeatPhones / uniquePhones) * 100 : 0;

  const topTables = Array.from(
    new Set([...tableScanMap.keys(), ...tablePaidMap.keys()])
  )
    .map((tableLabel) => ({
      tableLabel,
      scans: tableScanMap.get(tableLabel) ?? 0,
      paidOrders: tablePaidMap.get(tableLabel)?.paidOrders ?? 0,
      revenue: tablePaidMap.get(tableLabel)?.revenue ?? 0,
    }))
    .sort((a, b) => {
      if (b.scans !== a.scans) return b.scans - a.scans;
      if (b.paidOrders !== a.paidOrders) return b.paidOrders - a.paidOrders;
      return b.revenue - a.revenue;
    })
    .slice(0, 5);

  const topItems = Array.from(itemMap.entries())
    .map(([itemName, values]) => ({
      itemName,
      quantity: values.quantity,
      revenue: values.revenue,
    }))
    .sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.revenue - a.revenue;
    })
    .slice(0, 5);

  return {
    success: true,
    rangeDays,
    stages,
    conversionRate:
      stages.scanned > 0 ? (stages.paid / stages.scanned) * 100 : 0,
    abandonmentRate:
      stages.scanned > 0 ? (stages.abandoned / stages.scanned) * 100 : 0,
    qrOrderCount,
    qrRevenue,
    qrAov,
    serverAov,
    repeatPhoneRate,
    byHour,
    topTables,
    topItems,
  };
}

export async function getQrGuestAlertsSnapshot(
  locationId: string
): Promise<QrGuestAlertsSnapshot> {
  if (!locationId) {
    return {
      success: false,
      openCount: 0,
      alerts: [],
      error: "Missing location",
    };
  }

  const supabase = createServerSupabaseClient();
  const db = supabase as any;

  const { data, error } = await db
    .from("qr_guest_alerts")
    .select(
      "id, table_label, alert_type, message, status, created_at, order_id, online_order_session_id"
    )
    .eq("location_id", locationId)
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return {
      success: false,
      openCount: 0,
      alerts: [],
      error: error.message,
    };
  }

  const alerts = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    tableLabel: readString(row.table_label) ?? "Unknown table",
    alertType: readString(row.alert_type) ?? "call_server",
    message: readString(row.message),
    status: readString(row.status) ?? "open",
    createdAt: String(row.created_at),
    orderId: readString(row.order_id),
    onlineOrderSessionId: readString(row.online_order_session_id),
  }));

  return {
    success: true,
    openCount: alerts.length,
    alerts,
  };
}

export async function resolveQrGuestAlertAction(alertId: string) {
  if (!alertId) {
    return { success: false, error: "Missing alert" };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("resolve_qr_guest_alert", {
    p_alert_id: alertId,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath("/dashboard/online-ordering");
  return { success: true };
}

export async function generateQrCodeForTable(
  floorPlanObjectId: string,
  options?: { regenerate?: boolean }
): Promise<{ success: boolean; error?: string; action?: string }> {
  if (!floorPlanObjectId) {
    return { success: false, error: "Missing table" };
  }

  const supabase = createServerSupabaseClient();
  const db = supabase as any;

  const { data: table, error: tableError } = await supabase
    .from("floor_plan_objects")
    .select("id, name, label_override, location_id, merchant_id")
    .eq("id", floorPlanObjectId)
    .single();

  if (tableError || !table) {
    return { success: false, error: tableError?.message || "Table not found" };
  }

  const qrBillingGate = await getQrBillingGateStatus(
    table.location_id as string,
    table.merchant_id as string
  );
  if (!qrBillingGate.entitled) {
    return {
      success: false,
      error:
        qrBillingGate.reason ||
        "QR Table Ordering is not available for the current subscription tier.",
    };
  }

  const { data, error } = await db.rpc("generate_table_qr_code", {
    p_floor_plan_object_id: floorPlanObjectId,
    p_regenerate: Boolean(options?.regenerate),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as { success?: boolean; error?: string; action?: string };
  if (!result?.success) {
    return {
      success: false,
      error: result?.error || "QR generation failed",
    };
  }

  const tableLabel =
    readString(table.label_override) ?? readString(table.name) ?? "Table";

  await LogAuditEvent({
    merchantId: table.merchant_id as string,
    action:
      options?.regenerate === true
        ? "Regenerated Table QR Code"
        : result.action === "reprint_existing"
          ? "Reprinted Table QR Code"
          : "Generated Table QR Code",
    actionCategory: "settings",
    resourceType: "table_qr_code",
    resourceId: floorPlanObjectId,
    resourceName: tableLabel,
    locationId: table.location_id as string,
    changes: {
      after: {
        table_label: tableLabel,
        qr_action: result.action ?? (options?.regenerate ? "regenerated" : "generated"),
      },
    },
  });

  revalidatePath("/dashboard/online-ordering");
  return { success: true, action: result.action };
}

export async function revokeTableQrCode(
  floorPlanObjectId: string
): Promise<{ success: boolean; error?: string }> {
  if (!floorPlanObjectId) {
    return { success: false, error: "Missing table" };
  }

  const supabase = createServerSupabaseClient();
  const db = supabase as any;

  const { data: table, error: tableError } = await supabase
    .from("floor_plan_objects")
    .select("id, name, label_override, location_id, merchant_id")
    .eq("id", floorPlanObjectId)
    .single();

  if (tableError || !table) {
    return { success: false, error: tableError?.message || "Table not found" };
  }

  const { data: activeCode, error: activeCodeError } = await db
    .from("table_qr_codes")
    .select("id")
    .eq("floor_plan_object_id", floorPlanObjectId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeCodeError) {
    return { success: false, error: activeCodeError.message };
  }

  if (!activeCode?.id) {
    return { success: false, error: "No active QR code to revoke" };
  }

  const { error: updateError } = await db
    .from("table_qr_codes")
    .update({
      is_active: false,
      rotated_at: new Date().toISOString(),
    })
    .eq("id", activeCode.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  const tableLabel =
    readString(table.label_override) ?? readString(table.name) ?? "Table";

  await LogAuditEvent({
    merchantId: table.merchant_id as string,
    action: "Revoked Table QR Code",
    actionCategory: "settings",
    resourceType: "table_qr_code",
    resourceId: activeCode.id as string,
    resourceName: tableLabel,
    locationId: table.location_id as string,
    changes: {
      before: { is_active: true },
      after: { is_active: false },
    },
  });

  revalidatePath("/dashboard/online-ordering");
  return { success: true };
}

export async function generateMissingQrCodesForLocation(
  locationId: string
): Promise<{ success: boolean; generated: number; error?: string }> {
  const supabase = createServerSupabaseClient();
  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("merchant_id")
    .eq("id", locationId)
    .single();

  if (locationError || !location) {
    return {
      success: false,
      generated: 0,
      error: locationError?.message || "Location not found",
    };
  }

  const qrBillingGate = await getQrBillingGateStatus(
    locationId,
    location.merchant_id as string
  );
  if (!qrBillingGate.entitled) {
    return {
      success: false,
      generated: 0,
      error:
        qrBillingGate.reason ||
        "QR Table Ordering is not available for the current subscription tier.",
    };
  }

  const snapshot = await getQrTableManagerSnapshot(locationId);
  if (!snapshot.success) {
    return { success: false, generated: 0, error: snapshot.error };
  }

  let generated = 0;
  for (const row of snapshot.tables) {
    if (row.qrStatus !== "not_generated") continue;
    const result = await generateQrCodeForTable(row.floorPlanObjectId);
    if (!result.success) {
      return {
        success: false,
        generated,
        error: result.error || `Failed on ${row.tableLabel}`,
      };
    }
    generated += 1;
  }

  revalidatePath("/dashboard/online-ordering");
  return { success: true, generated };
}



