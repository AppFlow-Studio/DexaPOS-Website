"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// Location Banking Profiles Server Actions
// Track A scope: persist last-4 only. The full account number is never written
// to the database — Track B will handle processor tokenization and store the
// resulting token in `bank_account_token`.
// ============================================================================

export type AccountType = "checking" | "savings";
export type PayoutFrequency = "daily" | "weekly" | "monthly";

export interface LocationBankingProfileSummary {
  id: string;
  bank_name: string;
  account_holder_name: string;
  account_number_last_four: string;
  routing_number_last_four: string;
  account_type: AccountType;
  payout_frequency: PayoutFrequency;
  payout_day_of_week: number | null;
  payout_day_of_month: number | null;
  minimum_payout_amount: number;
  is_verified: boolean;
  is_active: boolean;
  updated_at: string;
}

export interface UpsertLocationBankingProfileInput {
  clerkOrgId: string;
  locationId: string;
  bank_name: string;
  account_holder_name: string;
  account_type: AccountType;
  /** Optional on update — when omitted, existing routing/account last-4 are kept. */
  routing_number_full?: string | null;
  /** Optional on update — when omitted, existing routing/account last-4 are kept. */
  account_number_full?: string | null;
  payout_frequency: PayoutFrequency;
  payout_day_of_week?: number | null;
  payout_day_of_month?: number | null;
  minimum_payout_amount?: number | null;
}

export interface UpsertLocationBankingProfileResult {
  success: boolean;
  error?: string;
  data?: LocationBankingProfileSummary | null;
}

const onlyDigits = (value: string): string => value.replace(/\D/g, "");

function validateInput(
  input: UpsertLocationBankingProfileInput,
  hasExistingProfile: boolean,
): string | null {
  if (!input.bank_name?.trim()) return "Bank name is required.";
  if (!input.account_holder_name?.trim()) return "Account holder name is required.";
  if (!["checking", "savings"].includes(input.account_type))
    return "Account type must be checking or savings.";
  if (!["daily", "weekly", "monthly"].includes(input.payout_frequency))
    return "Payout frequency is invalid.";

  if (input.payout_frequency === "weekly") {
    if (
      input.payout_day_of_week === null ||
      input.payout_day_of_week === undefined ||
      input.payout_day_of_week < 0 ||
      input.payout_day_of_week > 6
    ) {
      return "Select a weekly payout day (Sunday – Saturday).";
    }
  }

  if (input.payout_frequency === "monthly") {
    if (
      input.payout_day_of_month === null ||
      input.payout_day_of_month === undefined ||
      input.payout_day_of_month < 1 ||
      input.payout_day_of_month > 28
    ) {
      return "Monthly payout day must be between 1 and 28.";
    }
  }

  if (input.minimum_payout_amount !== undefined && input.minimum_payout_amount !== null) {
    if (
      Number.isNaN(input.minimum_payout_amount) ||
      input.minimum_payout_amount < 0
    ) {
      return "Minimum payout amount must be zero or greater.";
    }
  }

  const routingProvided = !!input.routing_number_full?.trim();
  const accountProvided = !!input.account_number_full?.trim();

  // First-time setup requires both. Edits may leave them blank to keep existing.
  if (!hasExistingProfile && (!routingProvided || !accountProvided)) {
    return "Routing and account numbers are required.";
  }

  if (routingProvided) {
    const digits = onlyDigits(input.routing_number_full!);
    if (digits.length !== 9) return "Routing number must be exactly 9 digits.";
  }

  if (accountProvided) {
    const digits = onlyDigits(input.account_number_full!);
    if (digits.length < 4 || digits.length > 17)
      return "Account number must be 4 – 17 digits.";
  }

  return null;
}

function toSummary(row: Record<string, unknown>): LocationBankingProfileSummary {
  return {
    id: row.id as string,
    bank_name: row.bank_name as string,
    account_holder_name: row.account_holder_name as string,
    account_number_last_four: row.account_number_last_four as string,
    routing_number_last_four: row.routing_number_last_four as string,
    account_type: row.account_type as AccountType,
    payout_frequency: row.payout_frequency as PayoutFrequency,
    payout_day_of_week: (row.payout_day_of_week as number | null) ?? null,
    payout_day_of_month: (row.payout_day_of_month as number | null) ?? null,
    minimum_payout_amount: Number(row.minimum_payout_amount ?? 0),
    is_verified: Boolean(row.is_verified),
    is_active: Boolean(row.is_active),
    updated_at: row.updated_at as string,
  };
}

export async function upsertLocationBankingProfile(
  input: UpsertLocationBankingProfileInput,
): Promise<UpsertLocationBankingProfileResult> {
  try {
    const supabase = createServerSupabaseClient();

    // Verify caller's merchant owns the location
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", input.clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, error: "Merchant not found" };
    }

    const { data: location, error: locationError } = await supabase
      .from("locations")
      .select("id, merchant_id, name")
      .eq("id", input.locationId)
      .single();

    if (locationError || !location) {
      return { success: false, error: "Location not found" };
    }

    if (location.merchant_id !== merchant.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Look up the active profile (if any) for this location
    const { data: existing, error: existingError } = await supabase
      .from("location_banking_profiles")
      .select("*")
      .eq("location_id", input.locationId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError && existingError.code !== "PGRST116") {
      console.error("[upsertLocationBankingProfile] read error:", existingError);
      return { success: false, error: existingError.message };
    }

    const validationError = validateInput(input, !!existing);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const routingDigits = input.routing_number_full
      ? onlyDigits(input.routing_number_full)
      : null;
    const accountDigits = input.account_number_full
      ? onlyDigits(input.account_number_full)
      : null;

    const routingLast4 =
      routingDigits?.slice(-4) ?? existing?.routing_number_last_four ?? null;
    const accountLast4 =
      accountDigits?.slice(-4) ?? existing?.account_number_last_four ?? null;

    if (!routingLast4 || !accountLast4) {
      return {
        success: false,
        error: "Account and routing numbers are required.",
      };
    }

    const now = new Date().toISOString();
    const minimumPayout =
      input.minimum_payout_amount !== undefined &&
      input.minimum_payout_amount !== null
        ? input.minimum_payout_amount
        : (existing?.minimum_payout_amount ?? 0);

    // Track A: full account/routing numbers are intentionally NOT persisted.
    // bank_account_token stays null until Track B wires the processor.
    const newAccountEntered = !!accountDigits;
    const newRoutingEntered = !!routingDigits;
    const accountChanged =
      newAccountEntered &&
      accountLast4 !== existing?.account_number_last_four;
    const routingChanged =
      newRoutingEntered &&
      routingLast4 !== existing?.routing_number_last_four;

    const sharedFields = {
      bank_name: input.bank_name.trim(),
      account_holder_name: input.account_holder_name.trim(),
      account_type: input.account_type,
      account_number_last_four: accountLast4,
      routing_number_last_four: routingLast4,
      payout_frequency: input.payout_frequency,
      payout_day_of_week:
        input.payout_frequency === "weekly"
          ? (input.payout_day_of_week ?? null)
          : null,
      payout_day_of_month:
        input.payout_frequency === "monthly"
          ? (input.payout_day_of_month ?? null)
          : null,
      minimum_payout_amount: minimumPayout,
      is_active: true,
      updated_at: now,
    };

    let savedRow: Record<string, unknown> | null = null;

    if (existing) {
      // Re-entering account or routing invalidates verification status.
      const verificationReset = accountChanged || routingChanged;
      const updatePayload: Record<string, unknown> = { ...sharedFields };
      if (verificationReset) {
        updatePayload.is_verified = false;
        updatePayload.verified_at = null;
        updatePayload.bank_account_token = null;
      }

      const { data, error } = await supabase
        .from("location_banking_profiles")
        .update(updatePayload)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        console.error("[upsertLocationBankingProfile] update error:", error);
        return { success: false, error: error.message };
      }
      savedRow = data;
    } else {
      const { data, error } = await supabase
        .from("location_banking_profiles")
        .insert({
          ...sharedFields,
          location_id: input.locationId,
          merchant_id: merchant.id, // trigger will overwrite, but keep to satisfy NOT NULL
          is_verified: false,
        })
        .select()
        .single();

      if (error) {
        console.error("[upsertLocationBankingProfile] insert error:", error);
        return { success: false, error: error.message };
      }
      savedRow = data;
    }

    if (!savedRow) {
      return { success: false, error: "Failed to save banking profile" };
    }

    await LogAuditEvent({
      merchantId: merchant.id,
      locationId: input.locationId,
      action: existing
        ? `Updated Banking Profile for ${location.name}`
        : `Created Banking Profile for ${location.name}`,
      actionCategory: "settings",
      severity: "info",
      resourceType: "location_banking_profile",
      resourceId: savedRow.id as string,
      resourceName: input.bank_name.trim(),
      metadata: {
        account_number_last_four: accountLast4,
        routing_number_last_four: routingLast4,
        account_type: input.account_type,
        payout_frequency: input.payout_frequency,
        full_account_persisted: false,
        full_routing_persisted: false,
        account_changed: accountChanged,
        routing_changed: routingChanged,
      },
    });

    return { success: true, data: toSummary(savedRow) };
  } catch (error) {
    console.error("[upsertLocationBankingProfile] exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
