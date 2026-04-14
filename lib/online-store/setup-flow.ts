import { buildEmailTemplate, isValidEmail, sendEmail } from "@/lib/messaging/resend";

export const ONLINE_STORE_REQUEST_STATUSES = [
  "pending_review",
  "approved",
  "rejected",
  "setup_completed",
] as const;

export type OnlineStoreRequestStatus =
  | (typeof ONLINE_STORE_REQUEST_STATUSES)[number]
  | "not_requested";

type MerchantRecord = {
  id?: string | null;
  name?: string | null;
  clerk_org_id?: string | null;
  owner_email?: string | null;
  owner_first_name?: string | null;
  owner_last_name?: string | null;
  business_legal_name?: string | null;
  dba_name?: string | null;
  ein_last_four?: string | null;
  public_metadata?: Record<string, unknown> | null;
};

type LocationRecord = {
  id?: string | null;
  name?: string | null;
  public_metadata?: Record<string, unknown> | null;
};

export interface MerchantOnlineStoreReviewPacket {
  legalBusinessName: string | null;
  dbaName: string | null;
  einTaxId: string | null;
  w9FormUrl: string | null;
  ownerFullName: string | null;
  ownerSsn: string | null;
  ownerDob: string | null;
  ownerGovernmentIdUrl: string | null;
}

export interface LocationOnlineStoreReviewPacket {
  bankName: string | null;
  accountHolderName: string | null;
  ddaAccountNumber: string | null;
  routingNumber: string | null;
  bankSupportDocumentUrl: string | null;
}

export interface OnlineStoreReviewChecklist {
  legalBusinessName: boolean;
  dbaName: boolean;
  einTaxId: boolean;
  w9Form: boolean;
  ownerIdentity: boolean;
  ownerGovernmentId: boolean;
  bankingInfo: boolean;
  bankSupportDocument: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = readString(value);
    if (parsed) return parsed;
  }

  return null;
}

export function normalizeOnlineStoreRequestStatus(
  value: string | null | undefined
): OnlineStoreRequestStatus {
  if (!value) return "not_requested";
  return ONLINE_STORE_REQUEST_STATUSES.includes(
    value as (typeof ONLINE_STORE_REQUEST_STATUSES)[number]
  )
    ? (value as OnlineStoreRequestStatus)
    : "not_requested";
}

export function isOnlineStoreSetupComplete(status: string | null | undefined) {
  return normalizeOnlineStoreRequestStatus(status) === "setup_completed";
}

export function canMerchantMaintainCompletedStore(
  status: string | null | undefined
) {
  return isOnlineStoreSetupComplete(status);
}

export function canHqEditStoreSetup(status: string | null | undefined) {
  const normalized = normalizeOnlineStoreRequestStatus(status);
  return normalized === "approved" || normalized === "setup_completed";
}

export function getDefaultStoreSlug(locationName: string) {
  return locationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function extractMerchantOnlineStoreReviewPacket(
  merchant: MerchantRecord | null | undefined
): MerchantOnlineStoreReviewPacket {
  const metadata = asRecord(merchant?.public_metadata);

  const ownerFullName =
    [
      merchant?.owner_first_name,
      merchant?.owner_last_name,
      metadata.owner_first_name,
      metadata.owner_last_name,
    ]
      .map(readString)
      .filter(Boolean)
      .join(" ") ||
    firstString(metadata.owner_name);

  return {
    legalBusinessName: firstString(
      merchant?.business_legal_name,
      metadata.business_legal_name,
      metadata.legal_business_name,
      merchant?.name
    ),
    dbaName: firstString(
      merchant?.dba_name,
      metadata.dba_name,
      metadata.business_name,
      merchant?.name
    ),
    einTaxId: firstString(
      metadata.online_store_ein_tax_id,
      metadata.ein_tax_id,
      metadata.tax_id,
      merchant?.ein_last_four ? `****${merchant.ein_last_four}` : null
    ),
    w9FormUrl: firstString(
      metadata.online_store_w9_form_url,
      metadata.w9_form_url,
      metadata.w9FormUrl
    ),
    ownerFullName,
    ownerSsn: firstString(
      metadata.online_store_owner_ssn,
      metadata.owner_ssn
    ),
    ownerDob: firstString(
      metadata.online_store_owner_dob,
      metadata.owner_dob
    ),
    ownerGovernmentIdUrl: firstString(
      metadata.online_store_owner_government_id_url,
      metadata.owner_government_id_url,
      metadata.ownerGovernmentIdUrl
    ),
  };
}

export function extractLocationOnlineStoreReviewPacket(
  location: LocationRecord | null | undefined
): LocationOnlineStoreReviewPacket {
  const metadata = asRecord(location?.public_metadata);

  return {
    bankName:
      readString(metadata.online_store_bank_name) ??
      readString(metadata.bank_name),
    accountHolderName:
      readString(metadata.online_store_account_holder_name) ??
      readString(metadata.account_holder_name),
    ddaAccountNumber:
      readString(metadata.online_store_bank_dda_account_number) ??
      readString(metadata.account_number),
    routingNumber:
      readString(metadata.online_store_bank_routing_number) ??
      readString(metadata.routing_number),
    bankSupportDocumentUrl:
      readString(metadata.online_store_bank_support_document_url) ??
      readString(metadata.bank_support_document_url),
  };
}

export function buildOnlineStoreReviewChecklist(
  merchantPacket: MerchantOnlineStoreReviewPacket,
  locationPacket: LocationOnlineStoreReviewPacket
): OnlineStoreReviewChecklist {
  return {
    legalBusinessName: Boolean(merchantPacket.legalBusinessName),
    dbaName: Boolean(merchantPacket.dbaName),
    einTaxId: Boolean(merchantPacket.einTaxId),
    w9Form: Boolean(merchantPacket.w9FormUrl),
    ownerIdentity: Boolean(
      merchantPacket.ownerFullName &&
        merchantPacket.ownerDob &&
        merchantPacket.ownerSsn
    ),
    ownerGovernmentId: Boolean(merchantPacket.ownerGovernmentIdUrl),
    bankingInfo: Boolean(
      locationPacket.bankName &&
        locationPacket.accountHolderName &&
        locationPacket.ddaAccountNumber &&
        locationPacket.routingNumber
    ),
    bankSupportDocument: Boolean(locationPacket.bankSupportDocumentUrl),
  };
}

async function getMerchantNotificationRecipients(
  supabase: any,
  merchantId: string
) {
  const { data: merchant } = await supabase
    .from("merchants")
    .select("name, owner_email, clerk_org_id")
    .eq("id", merchantId)
    .single();

  const recipients = new Set<string>();

  const ownerEmail = readString(merchant?.owner_email);
  if (ownerEmail && isValidEmail(ownerEmail)) {
    recipients.add(ownerEmail);
  }

  const clerkOrgId = readString(merchant?.clerk_org_id);
  if (clerkOrgId) {
    const { data: members } = await supabase
      .from("members")
      .select("user_id, role")
      .eq("organization_id", clerkOrgId);

    const adminUserIds = ((members as Array<{ user_id?: string | null; role?: string | null }> | null) ?? [])
      .filter((member) => {
        const role = member.role?.toLowerCase() ?? "";
        return Boolean(member.user_id) && (role.includes("admin") || role.includes("owner"));
      })
      .map((member) => member.user_id as string);

    if (adminUserIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, email")
        .in("id", adminUserIds);

      for (const user of (users as Array<{ email?: string | null }> | null) ?? []) {
        const email = readString(user.email);
        if (email && isValidEmail(email)) {
          recipients.add(email);
        }
      }
    }
  }

  return {
    merchantName: readString(merchant?.name) ?? "DexaPOS Merchant",
    recipients: Array.from(recipients),
  };
}

export async function sendOnlineStoreDecisionEmail(params: {
  supabase: any;
  merchantId: string;
  locationName: string;
  status: "approved" | "rejected";
  rejectionReason?: string | null;
}) {
  const { supabase, merchantId, locationName, status, rejectionReason } = params;
  const { merchantName, recipients } = await getMerchantNotificationRecipients(
    supabase,
    merchantId
  );

  if (recipients.length === 0) {
    return { success: false, error: "No merchant owner/admin emails found" };
  }

  const subject =
    status === "approved"
      ? `Online store request approved for ${locationName}`
      : `Online store request rejected for ${locationName}`;

  const body =
    status === "approved"
      ? [
          `<p>Your online store request for <strong>${locationName}</strong> has been approved.</p>`,
          `<p>HQ is now completing the storefront setup. The merchant online-store page will show setup progress until the branch is fully configured.</p>`,
        ].join("")
      : [
          `<p>Your online store request for <strong>${locationName}</strong> was rejected.</p>`,
          `<p><strong>Reason:</strong> ${rejectionReason || "No reason provided."}</p>`,
          `<p>Update the branch information and submit the request again when ready.</p>`,
        ].join("");

  const html = buildEmailTemplate(merchantName, subject, body);
  const results = await Promise.all(recipients.map((to) => sendEmail(to, subject, html)));

  return {
    success: true,
    recipients,
    errors: results
      .filter((result): result is { error: string } => "error" in result)
      .map((result) => result.error),
  };
}
