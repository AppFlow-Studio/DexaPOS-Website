"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { LogAuditEvent } from "./audit-logs";

// =====================================================
// TYPES
// =====================================================

export interface TipPoolConfig {
  id: string;
  merchant_id: string;
  location_id: string;
  name: string;
  description: string | null;
  distribution_method: "percentage" | "hours_weighted" | "equal_split" | "points";
  tip_source: "charged_tips" | "all_tips" | "cash_only";
  source_percentage: number;
  contributing_role_codes: string[];
  is_active: boolean;
  effective_date: string;
  end_date: string | null;
  priority: number;
  policy_interval: "full_workday" | "by_shift" | "order";
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface TipPoolRoleShare {
  id: string;
  tip_pool_config_id: string;
  role_code: string;
  share_percentage: number | null;
  points_per_hour: number | null;
  is_eligible: boolean;
  created_at: string;
  updated_at: string;
}

export interface TipPoolConfigWithShares extends TipPoolConfig {
  tip_pool_role_shares: TipPoolRoleShare[];
}

export interface TipOutRule {
  id: string;
  merchant_id: string;
  location_id: string;
  from_role_code: string;
  to_role_code: string;
  tip_out_type: "percentage_of_tips" | "percentage_of_sales" | "flat_amount";
  tip_out_value: number;
  is_active: boolean;
  effective_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TipDistributionSession {
  id: string;
  merchant_id: string;
  location_id: string;
  session_date: string;
  shift_period: "full_day" | "lunch" | "dinner" | "custom";
  total_tips_collected: number;
  total_tips_pooled: number;
  total_tip_outs: number;
  total_distributed: number;
  rounding_adjustment: number;
  status: "draft" | "calculated" | "pending_approval" | "approved" | "exported" | "voided";
  calculated_at: string | null;
  calculated_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  approval_notes: string | null;
  config_snapshot: any;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  data_start_after: string | null;
  data_cutoff_at: string | null;
  sequence_number: number;
  created_at: string;
  updated_at: string;
}

export interface TipDistributionDetail {
  id: string;
  session_id: string;
  staff_profile_id: string;
  role_code: string;
  hours_worked: number;
  gross_sales: number;
  individual_tips_earned: number;
  charged_tips: number;
  cash_tips: number;
  tip_pool_contributed: number;
  tip_pool_received: number;
  tip_out_given: number;
  tip_out_received: number;
  tip_out_clipped: number;
  manual_adjustment: number;
  adjustment_reason: string | null;
  net_tips: number;
  created_at: string;
  updated_at: string;
}

export interface StaffProfile {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
}

export interface TipDetailWithStaff extends TipDistributionDetail {
  staff_profiles: StaffProfile;
}

export interface TipSessionWithDetails extends TipDistributionSession {
  tip_distribution_details: TipDetailWithStaff[];
}

export interface Role {
  code: string;
  name: string;
  level: number;
  organization_type: string;
}

export interface TodaySummary {
  totalPayments: number;
  totalTipsCollected: number;
  staffClockedIn: number;
  totalHoursWorked: number;
}

export interface TodayShift {
  id: string;
  staffProfileId: string;
  staffName: string;
  avatarUrl: string | null;
  roleCode: string;
  clockInTime: string;
  clockOutTime: string | null;
  declaredCashTips: number;
  tipsDeclaredAt: string | null;
  chargedTips: number;
  cashPaymentTips: number;
  grossSales: number;
  hoursWorked: number;
}

export interface TipPayrollExport {
  id: string;
  session_id: string;
  destination: "gusto" | "adp" | "csv";
  status: "pending" | "sent" | "failed" | "downloaded";
  exported_by: string | null;
  exported_at: string;
  error_message: string | null;
  payload: any;
}

// =====================================================
// HELPERS
// =====================================================

async function getMerchantId(clerkOrgId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  return merchant?.id || null;
}

/**
 * Compute UTC start/end bounds for a given date in a given timezone.
 * e.g. date="2026-04-19", tz="America/New_York" →
 *   start = "2026-04-19T04:00:00.000Z" (midnight ET in UTC)
 *   end   = "2026-04-20T03:59:59.999Z" (11:59:59 PM ET in UTC)
 */
/**
 * Compute UTC start/end bounds for a business day in a given timezone.
 * @param date - "YYYY-MM-DD" calendar date
 * @param tz - IANA timezone (e.g. "America/New_York")
 * @param endHour - Hour (0-23) when business day ends. 0 = midnight (default).
 *                  4 = "Monday" runs Mon 4 AM → Tue 4 AM.
 */
function getDateBoundsUTC(date: string, tz: string, endHour: number = 0): { start: string; end: string } {
  const probe = new Date(`${date}T12:00:00Z`);
  const localStr = probe.toLocaleString("en-US", { timeZone: tz });
  const localDate = new Date(localStr);
  const offsetMs = localDate.getTime() - probe.getTime();

  // Business day start = date + endHour in local timezone → UTC
  const startLocal = new Date(`${date}T00:00:00`);
  startLocal.setHours(startLocal.getHours() + endHour);
  const startUTC = new Date(startLocal.getTime() - offsetMs);

  // Business day end = next date + endHour in local timezone → UTC (minus 1ms)
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + 1);
  nextDate.setHours(nextDate.getHours() + endHour);
  nextDate.setMilliseconds(nextDate.getMilliseconds() - 1);
  const endUTC = new Date(nextDate.getTime() - offsetMs);

  return {
    start: startUTC.toISOString(),
    end: endUTC.toISOString(),
  };
}

// =====================================================
// TIP POOL CONFIGS - CRUD
// =====================================================

export async function GetTipPoolConfigs(
  clerkOrgId: string,
  locationId: string
): Promise<{ success: boolean; data: TipPoolConfigWithShares[] | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tip_pool_configs")
      .select("*, tip_pool_role_shares(*)")
      .eq("merchant_id", merchantId)
      .eq("location_id", locationId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return { success: false, data: null, error: error.message };
    return { success: true, data: (data as TipPoolConfigWithShares[]) || [], error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function CreateTipPoolConfig(
  clerkOrgId: string,
  locationId: string,
  input: {
    name: string;
    description?: string;
    distribution_method: "percentage" | "hours_weighted" | "equal_split" | "points";
    tip_source: "charged_tips" | "all_tips" | "cash_only";
    source_percentage: number;
    contributing_role_codes: string[];
    is_active?: boolean;
    effective_date?: string;
    end_date?: string | null;
    priority?: number;
    policy_interval?: "full_workday" | "by_shift" | "order";
    role_shares: { role_code: string; share_percentage?: number; points_per_hour?: number; is_eligible?: boolean }[];
  }
): Promise<{ success: boolean; data: TipPoolConfigWithShares | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    // Create tip pool config
    const { data: config, error: configError } = await supabase
      .from("tip_pool_configs")
      .insert({
        merchant_id: merchantId,
        location_id: locationId,
        name: input.name,
        description: input.description,
        distribution_method: input.distribution_method,
        tip_source: input.tip_source,
        source_percentage: input.source_percentage,
        contributing_role_codes: input.contributing_role_codes,
        is_active: input.is_active !== false,
        effective_date: input.effective_date || new Date().toISOString().split("T")[0],
        end_date: input.end_date ?? null,
        priority: input.priority ?? 100,
        policy_interval: input.policy_interval ?? "full_workday",
      })
      .select()
      .single();

    if (configError) {
      return { success: false, data: null, error: configError.message };
    }

    // Insert role shares
    const shareInserts = input.role_shares.map((share) => ({
      tip_pool_config_id: config.id,
      role_code: share.role_code,
      share_percentage: share.share_percentage ?? null,
      points_per_hour: share.points_per_hour ?? null,
      is_eligible: share.is_eligible !== false,
    }));

    if (shareInserts.length > 0) {
      const { error: shareError } = await supabase
        .from("tip_pool_role_shares")
        .insert(shareInserts);
      if (shareError) {
        return { success: false, data: null, error: shareError.message };
      }
    }

    // Fetch complete config with shares
    const { data: fullConfig, error: fetchError } = await supabase
      .from("tip_pool_configs")
      .select("*, tip_pool_role_shares(*)")
      .eq("id", config.id)
      .single();

    if (fetchError) {
      return { success: false, data: null, error: fetchError.message };
    }

    await LogAuditEvent({
      clerkOrgId,
      locationId,
      action: `Created tip pool: ${input.name}`,
      actionCategory: "settings",
      resourceType: "tip_pool_config",
      resourceId: config.id,
      resourceName: input.name,
      changes: { after: fullConfig },
    });

    return { success: true, data: fullConfig as TipPoolConfigWithShares, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function UpdateTipPoolConfig(
  clerkOrgId: string,
  configId: string,
  input: Partial<{
    name: string;
    description: string;
    distribution_method: string;
    tip_source: string;
    source_percentage: number;
    contributing_role_codes: string[];
    is_active: boolean;
    effective_date: string;
    end_date: string | null;
    priority: number;
    policy_interval: string;
    role_shares: { role_code: string; share_percentage?: number; points_per_hour?: number; is_eligible?: boolean }[];
  }>
): Promise<{ success: boolean; data: TipPoolConfigWithShares | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    // Update config
    const updateData: Record<string, any> = {};
    if (input.name) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.distribution_method) updateData.distribution_method = input.distribution_method;
    if (input.tip_source) updateData.tip_source = input.tip_source;
    if (input.source_percentage !== undefined) updateData.source_percentage = input.source_percentage;
    if (input.contributing_role_codes)
      updateData.contributing_role_codes = input.contributing_role_codes;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    if ("end_date" in input) updateData.end_date = input.end_date ?? null;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.policy_interval) updateData.policy_interval = input.policy_interval;

    const { error: updateError } = await supabase
      .from("tip_pool_configs")
      .update(updateData)
      .eq("id", configId);

    if (updateError) {
      return { success: false, data: null, error: updateError.message };
    }

    // Update role shares if provided
    if (input.role_shares) {
      // Delete existing shares
      await supabase.from("tip_pool_role_shares").delete().eq("tip_pool_config_id", configId);

      // Insert new shares
      const shareInserts = input.role_shares.map((share) => ({
        tip_pool_config_id: configId,
        role_code: share.role_code,
        share_percentage: share.share_percentage ?? null,
        points_per_hour: share.points_per_hour ?? null,
        is_eligible: share.is_eligible !== false,
      }));

      if (shareInserts.length > 0) {
        const { error: shareError } = await supabase
          .from("tip_pool_role_shares")
          .insert(shareInserts);
        if (shareError) {
          return { success: false, data: null, error: shareError.message };
        }
      }
    }

    // Fetch updated config
    const { data: fullConfig, error: fetchError } = await supabase
      .from("tip_pool_configs")
      .select("*, tip_pool_role_shares(*)")
      .eq("id", configId)
      .single();

    if (fetchError) {
      return { success: false, data: null, error: fetchError.message };
    }

    await LogAuditEvent({
      clerkOrgId,
      locationId: (fullConfig as any).location_id,
      action: `Updated tip pool: ${input.name || ""}`,
      actionCategory: "settings",
      resourceType: "tip_pool_config",
      resourceId: configId,
      resourceName: input.name,
      changes: { after: fullConfig },
    });

    return { success: true, data: fullConfig as TipPoolConfigWithShares, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function DeleteTipPoolConfig(
  clerkOrgId: string,
  configId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    // Get config first for audit log
    const { data: config } = await supabase
      .from("tip_pool_configs")
      .select()
      .eq("id", configId)
      .single();

    const { error } = await supabase.from("tip_pool_configs").delete().eq("id", configId);

    if (error) {
      return { success: false, error: error.message };
    }

    if (config) {
      await LogAuditEvent({
        clerkOrgId,
        locationId: config.location_id,
        action: `Deleted tip pool: ${config.name}`,
        actionCategory: "settings",
        resourceType: "tip_pool_config",
        resourceId: configId,
        resourceName: config.name,
        changes: { before: config },
      });
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function ToggleTipPoolConfig(
  clerkOrgId: string,
  configId: string,
  isActive: boolean
): Promise<{ success: boolean; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from("tip_pool_configs")
      .select()
      .eq("id", configId)
      .single();

    const { error } = await supabase
      .from("tip_pool_configs")
      .update({ is_active: isActive })
      .eq("id", configId);

    if (error) {
      return { success: false, error: error.message };
    }

    if (config) {
      await LogAuditEvent({
        clerkOrgId,
        locationId: config.location_id,
        action: `${isActive ? "Activated" : "Deactivated"} tip pool: ${config.name}`,
        actionCategory: "settings",
        resourceType: "tip_pool_config",
        resourceId: configId,
        resourceName: config.name,
      });
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// =====================================================
// TIP-OUT RULES - CRUD
// =====================================================

export async function GetTipOutRules(
  clerkOrgId: string,
  locationId: string
): Promise<{ success: boolean; data: TipOutRule[] | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tip_out_rules")
      .select()
      .eq("merchant_id", merchantId)
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });

    if (error) return { success: false, data: null, error: error.message };
    return { success: true, data: (data as TipOutRule[]) || [], error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function CreateTipOutRule(
  clerkOrgId: string,
  locationId: string,
  input: {
    from_role_code: string;
    to_role_code: string;
    tip_out_type: "percentage_of_tips" | "percentage_of_sales" | "flat_amount";
    tip_out_value: number;
    is_active?: boolean;
    effective_date?: string;
    end_date?: string | null;
  }
): Promise<{ success: boolean; data: TipOutRule | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    if (input.from_role_code === input.to_role_code) {
      return { success: false, data: null, error: "From and To roles must be different" };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tip_out_rules")
      .insert({
        merchant_id: merchantId,
        location_id: locationId,
        from_role_code: input.from_role_code,
        to_role_code: input.to_role_code,
        tip_out_type: input.tip_out_type,
        tip_out_value: input.tip_out_value,
        is_active: input.is_active !== false,
        effective_date: input.effective_date || new Date().toISOString().split("T")[0],
        end_date: input.end_date ?? null,
      })
      .select()
      .single();

    if (error) {
      return { success: false, data: null, error: error.message };
    }

    await LogAuditEvent({
      clerkOrgId,
      locationId,
      action: `Created tip-out rule: ${input.from_role_code} → ${input.to_role_code}`,
      actionCategory: "settings",
      resourceType: "tip_out_rule",
      resourceId: data.id,
      resourceName: `${input.from_role_code} to ${input.to_role_code}`,
      changes: { after: data },
    });

    return { success: true, data: data as TipOutRule, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function UpdateTipOutRule(
  clerkOrgId: string,
  ruleId: string,
  input: Partial<{
    tip_out_type: string;
    tip_out_value: number;
    is_active: boolean;
    effective_date: string;
    end_date: string | null;
  }>
): Promise<{ success: boolean; data: TipOutRule | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("tip_out_rules")
      .update(input)
      .eq("id", ruleId)
      .select()
      .single();

    if (error) {
      return { success: false, data: null, error: error.message };
    }

    await LogAuditEvent({
      clerkOrgId,
      locationId: data.location_id,
      action: `Updated tip-out rule: ${data.from_role_code} → ${data.to_role_code}`,
      actionCategory: "settings",
      resourceType: "tip_out_rule",
      resourceId: ruleId,
      resourceName: `${data.from_role_code} to ${data.to_role_code}`,
      changes: { after: data },
    });

    return { success: true, data: data as TipOutRule, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function DeleteTipOutRule(
  clerkOrgId: string,
  ruleId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    const { data: rule } = await supabase
      .from("tip_out_rules")
      .select()
      .eq("id", ruleId)
      .single();

    const { error } = await supabase.from("tip_out_rules").delete().eq("id", ruleId);

    if (error) {
      return { success: false, error: error.message };
    }

    if (rule) {
      await LogAuditEvent({
        clerkOrgId,
        locationId: rule.location_id,
        action: `Deleted tip-out rule: ${rule.from_role_code} → ${rule.to_role_code}`,
        actionCategory: "settings",
        resourceType: "tip_out_rule",
        resourceId: ruleId,
        resourceName: `${rule.from_role_code} to ${rule.to_role_code}`,
        changes: { before: rule },
      });
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// =====================================================
// DISTRIBUTION SESSIONS & RPC CALLS
// =====================================================

export async function CalculateTipDistribution(
  clerkOrgId: string,
  locationId: string,
  sessionDate: string,
  shiftPeriod: string = "full_day",
  calculatedByStaffProfileId: string | null = null
): Promise<{
  success: boolean;
  data: { session_id: string; total_collected: number; total_distributed: number } | null;
  error: string | null;
}> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.rpc("calculate_tip_distribution_v2", {
      p_location_id: locationId,
      p_merchant_id: merchantId,
      p_session_date: sessionDate,
      p_shift_period: shiftPeriod,
      p_calculated_by: calculatedByStaffProfileId,
    });

    if (error) {
      return { success: false, data: null, error: error.message };
    }

    await LogAuditEvent({
      clerkOrgId,
      locationId,
      action: `Calculated tip distribution for ${sessionDate} (${shiftPeriod})`,
      actionCategory: "financial",
      resourceType: "tip_distribution_session",
      resourceId: data.session_id,
      resourceName: sessionDate,
    });

    return {
      success: true,
      data: {
        session_id: data.session_id,
        total_collected: data.total_collected,
        total_distributed: data.total_distributed,
      },
      error: null,
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================================
// PREVIEW TIP DISTRIBUTION (non-destructive)
// ============================================================================

export interface PreviewDistributionDetail {
  staff_name: string;
  role_code: string;
  hours_worked: number;
  gross_sales: number;
  charged_tips: number;
  cash_tips: number;
  individual_tips_earned: number;
  tip_pool_contributed: number;
  tip_pool_received: number;
  tip_out_given: number;
  tip_out_received: number;
  tip_out_clipped: number;
  net_tips: number;
}

export interface PreviewDistributionResult {
  success: boolean;
  total_collected: number;
  total_distributed: number;
  total_tips_pooled: number;
  total_tip_outs: number;
  details: PreviewDistributionDetail[];
}

export async function PreviewTipDistribution(
  clerkOrgId: string,
  locationId: string,
  sessionDate: string,
  shiftPeriod: string = "full_day"
): Promise<{
  success: boolean;
  data: PreviewDistributionResult | null;
  error: string | null;
}> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.rpc("preview_tip_distribution", {
      p_location_id: locationId,
      p_merchant_id: merchantId,
      p_session_date: sessionDate,
      p_shift_period: shiftPeriod,
    });

    if (error) {
      return { success: false, data: null, error: error.message };
    }

    return { success: true, data: data as PreviewDistributionResult, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function ApproveTipDistribution(
  clerkOrgId: string,
  sessionId: string,
  approvedByStaffProfileId: string | null = null
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createServerSupabaseClient();

    // Get session for audit log
    const { data: session } = await supabase
      .from("tip_distribution_sessions")
      .select()
      .eq("id", sessionId)
      .single();

    const { error } = await supabase.rpc("approve_tip_distribution", {
      p_session_id: sessionId,
      p_approved_by: approvedByStaffProfileId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (session) {
      await LogAuditEvent({
        clerkOrgId,
        locationId: session.location_id,
        action: `Approved tip distribution for ${session.session_date}`,
        actionCategory: "financial",
        resourceType: "tip_distribution_session",
        resourceId: sessionId,
        resourceName: session.session_date,
      });
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GetTipDistributionSession(
  clerkOrgId: string,
  locationId: string,
  sessionDate: string,
  shiftPeriod: string
): Promise<{ success: boolean; data: TipSessionWithDetails | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tip_distribution_sessions")
      .select(
        `
        *,
        tip_distribution_details(
          *,
          staff_profiles(id, first_name, last_name, display_name)
        )
      `
      )
      .eq("location_id", locationId)
      .eq("session_date", sessionDate)
      .eq("shift_period", shiftPeriod)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found
      return { success: false, data: null, error: error.message };
    }

    return { success: true, data: data as TipSessionWithDetails, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GetTipDistributionHistory(
  clerkOrgId: string,
  locationId: string,
  limit: number = 20,
  statusFilter?: string[],
  dateFrom?: string,
  dateTo?: string
): Promise<{ success: boolean; data: TipDistributionSession[] | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    let query = supabase
      .from("tip_distribution_sessions")
      .select()
      .eq("location_id", locationId)
      .order("session_date", { ascending: false })
      .limit(limit);

    if (statusFilter && statusFilter.length > 0) {
      query = query.in("status", statusFilter);
    }
    if (dateFrom) {
      query = query.gte("session_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("session_date", dateTo);
    }

    const { data, error } = await query;

    if (error) return { success: false, data: null, error: error.message };
    return { success: true, data: (data as TipDistributionSession[]) || [], error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function UpdateManualAdjustment(
  clerkOrgId: string,
  detailId: string,
  amount: number,
  reason?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    // Get detail for calculation
    const { data: detail } = await supabase
      .from("tip_distribution_details")
      .select("*")
      .eq("id", detailId)
      .single();

    if (!detail) {
      return { success: false, error: "Detail not found" };
    }

    const sessionId = detail.session_id;

    // Get session for aggregation and audit log
    const { data: session } = await supabase
      .from("tip_distribution_sessions")
      .select("id, total_tips_collected, location_id")
      .eq("id", sessionId)
      .single();

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    // Calculate new net_tips
    const newNetTips =
      detail.individual_tips_earned -
      detail.tip_pool_contributed +
      detail.tip_pool_received -
      detail.tip_out_given +
      detail.tip_out_received +
      amount;

    // Update detail with new adjustment and net_tips
    const { error: updateError } = await supabase
      .from("tip_distribution_details")
      .update({ manual_adjustment: amount, net_tips: newNetTips })
      .eq("id", detailId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Re-aggregate session totals
    const { data: aggregated } = await supabase
      .from("tip_distribution_details")
      .select("net_tips")
      .eq("session_id", sessionId);

    const newTotalDistributed =
      (aggregated as any[])?.reduce((sum: number, row: any) => sum + (row.net_tips || 0), 0) || 0;

    const roundingAdjustment = session.total_tips_collected - newTotalDistributed;

    const { error: sessionError } = await supabase
      .from("tip_distribution_sessions")
      .update({ total_distributed: newTotalDistributed, rounding_adjustment: roundingAdjustment })
      .eq("id", sessionId);

    if (sessionError) {
      return { success: false, error: sessionError.message };
    }

    await LogAuditEvent({
      clerkOrgId,
      locationId: session.location_id,
      action: `Adjusted tip for employee (${reason || "no reason"})`,
      actionCategory: "financial",
      resourceType: "tip_distribution_detail",
      resourceId: detailId,
      resourceName: `Manual adjustment: ${amount}`,
      changes: { after: { adjustment: amount, reason } as any },
    });

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// =====================================================
// TODAY TAB — LIVE TIP DATA
// =====================================================

export async function GetTodayTipSummary(
  clerkOrgId: string,
  locationId: string,
  date: string,
  afterCutoff?: string | null
): Promise<{ success: boolean; data: TodaySummary | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    // Use service role to bypass RLS on staff_shifts and order_payments
    const supabase = createServiceRoleClient();

    // Get location timezone
    const { data: loc } = await supabase
      .from("locations")
      .select("timezone, business_day_end_hour")
      .eq("id", locationId)
      .single();
    const tz = loc?.timezone || "UTC";
    const endHour = loc?.business_day_end_hour || 0;

    // Compute timezone-aware date bounds, scoped by afterCutoff if a prior session exists
    const bounds = getDateBoundsUTC(date, tz, endHour);
    const windowStart = afterCutoff || bounds.start;

    // Order payments within the window
    let totalPayments = 0;
    let totalTipsCollected = 0;

    const { data: payments } = await supabase
      .from("order_payments")
      .select("tip_amount, orders!inner(location_id, created_at, status)")
      .eq("orders.location_id", locationId)
      .eq("status", "captured")
      .gte("orders.created_at", windowStart)
      .lte("orders.created_at", bounds.end);

    if (payments) {
      const filtered = payments.filter((p: any) =>
        p.orders.status !== "cancelled" && p.orders.status !== "void" && p.orders.status !== "refunded"
      );
      totalPayments = filtered.length;
      totalTipsCollected = filtered.reduce((sum: number, p: any) => sum + (p.tip_amount || 0), 0);
    }

    // Staff shifts within the window, or still clocked in from today
    let shiftSummaryQuery = supabase
      .from("staff_shifts")
      .select("clock_in_time, clock_out_time")
      .eq("location_id", locationId)
      .eq("merchant_id", merchantId)
      .gte("clock_in_time", bounds.start)
      .lte("clock_in_time", bounds.end);

    if (afterCutoff) {
      shiftSummaryQuery = shiftSummaryQuery.or(`clock_in_time.gte.${afterCutoff},clock_out_time.is.null`);
    }

    const { data: shifts } = await shiftSummaryQuery;

    let staffClockedIn = 0;
    let totalHoursWorked = 0;

    if (shifts) {
      const now = new Date();
      for (const s of shifts) {
        const clockIn = new Date(s.clock_in_time);
        const clockOut = s.clock_out_time ? new Date(s.clock_out_time) : now;
        totalHoursWorked += (clockOut.getTime() - clockIn.getTime()) / 3600000;

        if (!s.clock_out_time) staffClockedIn++;
      }
    }

    return {
      success: true,
      data: {
        totalPayments,
        totalTipsCollected,
        staffClockedIn,
        totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
      },
      error: null,
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GetTodayShifts(
  clerkOrgId: string,
  locationId: string,
  date: string,
  afterCutoff?: string | null
): Promise<{ success: boolean; data: TodayShift[] | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    // Use service role to bypass RLS on staff_shifts
    const supabase = createServiceRoleClient();

    // Get location timezone
    const { data: loc } = await supabase
      .from("locations")
      .select("timezone, business_day_end_hour")
      .eq("id", locationId)
      .single();
    const tz = loc?.timezone || "UTC";
    const endHour = loc?.business_day_end_hour || 0;
    const bounds = getDateBoundsUTC(date, tz, endHour);
    const windowStart = afterCutoff || bounds.start;

    // Fetch shifts with staff profile + declared cash tips
    // When afterCutoff is set: include shifts started in current window OR still clocked in from today
    let shiftQuery = supabase
      .from("staff_shifts")
      .select(`
        id,
        clock_in_time,
        clock_out_time,
        declared_cash_tips,
        tips_declared_at,
        staff_profile_id,
        staff_profiles(id, first_name, last_name, display_name, avatar_url)
      `)
      .eq("location_id", locationId)
      .eq("merchant_id", merchantId)
      .gte("clock_in_time", bounds.start)
      .lte("clock_in_time", bounds.end);

    if (afterCutoff) {
      shiftQuery = shiftQuery.or(`clock_in_time.gte.${afterCutoff},clock_out_time.is.null`);
    }

    const { data: shifts, error: shiftErr } = await shiftQuery.order("clock_in_time", { ascending: true });

    if (shiftErr) return { success: false, data: null, error: shiftErr.message };

    const todayShifts = shifts || [];

    // Get role codes from location_members
    const staffIds = todayShifts.map((s: any) => s.staff_profile_id);
    const { data: members } = await supabase
      .from("location_members")
      .select("staff_profile_id, role_code")
      .eq("location_id", locationId)
      .in("staff_profile_id", staffIds.length > 0 ? staffIds : ["__none__"]);

    const roleMap: Record<string, string> = {};
    for (const m of members || []) {
      roleMap[m.staff_profile_id] = m.role_code;
    }

    // Query orders + payments within the window
    // Attribution: assigned_server_id (primary) → created_by_staff_id (fallback)
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, subtotal, status, assigned_server_id, created_by_staff_id, created_at, order_payments(tip_amount, status, payment_method)")
      .eq("location_id", locationId)
      .gte("created_at", windowStart)
      .lte("created_at", bounds.end);

    const tipsMap: Record<string, { chargedTips: number; cashPaymentTips: number; grossSales: number }> = {};
    const excludeStatuses = ["cancelled", "void", "refunded"];

    for (const o of (orders || [])) {
      if (excludeStatuses.includes(o.status)) continue;

      const serverId = o.assigned_server_id || o.created_by_staff_id;
      if (!serverId || !staffIds.includes(serverId)) continue;

      if (!tipsMap[serverId]) tipsMap[serverId] = { chargedTips: 0, cashPaymentTips: 0, grossSales: 0 };
      tipsMap[serverId].grossSales += o.subtotal || 0;

      for (const p of (o.order_payments || [])) {
        if (p.status === "captured" && p.tip_amount) {
          if (p.payment_method === "cash") {
            tipsMap[serverId].cashPaymentTips += p.tip_amount;
          } else {
            tipsMap[serverId].chargedTips += p.tip_amount;
          }
        }
      }
    }

    const now = new Date();
    const result: TodayShift[] = todayShifts.map((s: any) => {
      const sp = s.staff_profiles;
      const clockIn = new Date(s.clock_in_time);
      const clockOut = s.clock_out_time ? new Date(s.clock_out_time) : now;
      const hours = Math.round(((clockOut.getTime() - clockIn.getTime()) / 3600000) * 10) / 10;
      const tips = tipsMap[s.staff_profile_id] || { chargedTips: 0, cashPaymentTips: 0, grossSales: 0 };

      return {
        id: s.id,
        staffProfileId: s.staff_profile_id,
        staffName: sp?.display_name || `${sp?.first_name || ""} ${sp?.last_name || ""}`.trim() || "Unknown",
        avatarUrl: sp?.avatar_url || null,
        roleCode: roleMap[s.staff_profile_id] || "unknown",
        clockInTime: s.clock_in_time,
        clockOutTime: s.clock_out_time,
        declaredCashTips: s.declared_cash_tips || 0,
        tipsDeclaredAt: s.tips_declared_at || null,
        chargedTips: tips.chargedTips,
        cashPaymentTips: tips.cashPaymentTips,
        grossSales: tips.grossSales,
        hoursWorked: hours,
      };
    });

    return { success: true, data: result, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// =====================================================
// ORPHANED SHIFTS + UNCLOSED DAYS
// =====================================================

export interface OrphanedShift {
  id: string;
  staffName: string;
  avatarUrl: string | null;
  roleCode: string;
  clockInTime: string;
  shiftDate: string;
  hoursSinceClockIn: number;
  suggestedClockOut: string;
}

export interface UnclosedDay {
  date: string;
  orderCount: number;
  shiftCount: number;
  totalTips: number;
  hasOrphanedShifts: boolean;
}

export async function GetOrphanedShifts(
  clerkOrgId: string,
  locationId: string
): Promise<{ success: boolean; data: OrphanedShift[] | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServiceRoleClient();

    // Get location timezone
    const { data: loc } = await supabase
      .from("locations")
      .select("timezone, business_day_end_hour")
      .eq("id", locationId)
      .single();
    const tz = loc?.timezone || "UTC";
    const endHour = loc?.business_day_end_hour || 0;

    const bounds = getDateBoundsUTC(new Date().toISOString().split("T")[0], tz, endHour);

    // Shifts that are still "clocked in" but started before today
    const { data: shifts, error } = await supabase
      .from("staff_shifts")
      .select(`
        id, clock_in_time, staff_profile_id,
        staff_profiles(first_name, last_name, display_name, avatar_url)
      `)
      .eq("location_id", locationId)
      .eq("merchant_id", merchantId)
      .is("clock_out_time", null)
      .lt("clock_in_time", bounds.start)
      .order("clock_in_time", { ascending: true });

    if (error) return { success: false, data: null, error: error.message };

    // Get role codes
    const staffIds = (shifts || []).map((s: any) => s.staff_profile_id);
    const { data: members } = await supabase
      .from("location_members")
      .select("staff_profile_id, role_code")
      .eq("location_id", locationId)
      .in("staff_profile_id", staffIds.length > 0 ? staffIds : ["__none__"]);

    const roleMap: Record<string, string> = {};
    for (const m of members || []) roleMap[m.staff_profile_id] = m.role_code;

    const now = new Date();
    const result: OrphanedShift[] = (shifts || []).map((s: any) => {
      const sp = s.staff_profiles;
      const clockIn = new Date(s.clock_in_time);
      const hoursSince = (now.getTime() - clockIn.getTime()) / 3600000;
      // Suggest clock_in + 8 hours, capped to end of clock-in day
      const suggested = new Date(clockIn.getTime() + 8 * 3600000);
      // Business date: subtract endHour so a 2 AM shift with endHour=4 maps to previous day
      const adjusted = new Date(clockIn.getTime() - endHour * 3600000);
      const shiftDate = adjusted.toLocaleDateString("en-CA", { timeZone: tz });

      return {
        id: s.id,
        staffName: sp?.display_name || `${sp?.first_name || ""} ${sp?.last_name || ""}`.trim() || "Unknown",
        avatarUrl: sp?.avatar_url || null,
        roleCode: roleMap[s.staff_profile_id] || "unknown",
        clockInTime: s.clock_in_time,
        shiftDate,
        hoursSinceClockIn: Math.round(hoursSince * 10) / 10,
        suggestedClockOut: suggested.toISOString(),
      };
    });

    return { success: true, data: result, error: null };
  } catch (err) {
    return { success: false, data: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function GetUnclosedDays(
  clerkOrgId: string,
  locationId: string,
  lookbackDays: number = 7
): Promise<{ success: boolean; data: UnclosedDay[] | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServiceRoleClient();

    const { data: loc } = await supabase
      .from("locations")
      .select("timezone, business_day_end_hour")
      .eq("id", locationId)
      .single();
    const tz = loc?.timezone || "UTC";
    const endHour = loc?.business_day_end_hour || 0;

    // Business day "today" — at 3 AM with endHour=4, "today" is still yesterday
    const nowAdjusted = new Date(Date.now() - endHour * 3600000);
    const today = nowAdjusted.toLocaleDateString("en-CA", { timeZone: tz });

    // Get dates that have approved sessions (these are "closed")
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - lookbackDays);
    const sinceDateStr = sinceDate.toISOString().split("T")[0];

    const { data: closedSessions } = await supabase
      .from("tip_distribution_sessions")
      .select("session_date")
      .eq("location_id", locationId)
      .eq("status", "approved")
      .gte("session_date", sinceDateStr);

    const closedDates = new Set((closedSessions || []).map((s: any) => s.session_date));

    // Get orders in the lookback window
    const lookbackBounds = getDateBoundsUTC(sinceDateStr, tz, endHour);
    const todayBounds = getDateBoundsUTC(today, tz, endHour);

    const { data: orders } = await supabase
      .from("orders")
      .select("created_at, subtotal, order_payments(tip_amount, status)")
      .eq("location_id", locationId)
      .gte("created_at", lookbackBounds.start)
      .lt("created_at", todayBounds.start); // exclude today

    // Get shifts in the lookback window
    const { data: shifts } = await supabase
      .from("staff_shifts")
      .select("clock_in_time, clock_out_time")
      .eq("location_id", locationId)
      .eq("merchant_id", merchantId)
      .gte("clock_in_time", lookbackBounds.start)
      .lt("clock_in_time", todayBounds.start);

    // Helper: get business date for a UTC timestamp
    // Subtracts endHour so a 2 AM event with endHour=4 maps to the previous calendar day
    const getBusinessDate = (utcStr: string) => {
      const d = new Date(utcStr);
      const adjusted = new Date(d.getTime() - endHour * 3600000);
      return adjusted.toLocaleDateString("en-CA", { timeZone: tz });
    };

    // Aggregate by business date
    const dayMap: Record<string, { orderCount: number; shiftCount: number; totalTips: number; hasOrphanedShifts: boolean }> = {};

    for (const o of (orders || [])) {
      const d = getBusinessDate(o.created_at);
      if (d === today || closedDates.has(d)) continue;
      if (!dayMap[d]) dayMap[d] = { orderCount: 0, shiftCount: 0, totalTips: 0, hasOrphanedShifts: false };
      dayMap[d].orderCount++;
      for (const p of (o.order_payments || [])) {
        if (p.status === "captured") dayMap[d].totalTips += p.tip_amount || 0;
      }
    }

    for (const s of (shifts || [])) {
      const d = getBusinessDate(s.clock_in_time);
      if (d === today || closedDates.has(d)) continue;
      if (!dayMap[d]) dayMap[d] = { orderCount: 0, shiftCount: 0, totalTips: 0, hasOrphanedShifts: false };
      dayMap[d].shiftCount++;
      if (!s.clock_out_time) dayMap[d].hasOrphanedShifts = true;
    }

    // Sort chronologically (oldest first for sequential close-out enforcement)
    const result: UnclosedDay[] = Object.entries(dayMap)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { success: true, data: result, error: null };
  } catch (err) {
    return { success: false, data: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function ForceClockOutShift(
  clerkOrgId: string,
  shiftId: string,
  clockOutTime: string,
  cashTipsDeclared: number = 0
): Promise<{ success: boolean; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, error: "Merchant not found" };

    const supabase = createServiceRoleClient();

    // Get shift for audit + validation
    const { data: shift } = await supabase
      .from("staff_shifts")
      .select("id, clock_in_time, location_id, staff_profile_id, staff_profiles(first_name, last_name)")
      .eq("id", shiftId)
      .single();

    if (!shift) return { success: false, error: "Shift not found" };

    // Validate clock_out_time is after clock_in_time
    if (new Date(clockOutTime) <= new Date(shift.clock_in_time)) {
      return { success: false, error: "Clock-out time must be after clock-in time" };
    }

    // Update shift: clock_out_time + status in one operation
    const { error: updateErr } = await supabase
      .from("staff_shifts")
      .update({
        clock_out_time: clockOutTime,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", shiftId);

    if (updateErr) return { success: false, error: updateErr.message };

    // Declare cash tips if provided
    if (cashTipsDeclared > 0) {
      const { error: declareErr } = await supabase
        .from("staff_shifts")
        .update({
          declared_cash_tips: cashTipsDeclared,
          tips_declared_at: new Date().toISOString(),
        })
        .eq("id", shiftId);

      if (declareErr) return { success: false, error: declareErr.message };
    }

    const staffName = (shift as any).staff_profiles?.first_name
      ? `${(shift as any).staff_profiles.first_name} ${(shift as any).staff_profiles.last_name}`
      : "Unknown";

    await LogAuditEvent({
      clerkOrgId,
      locationId: shift.location_id,
      action: `Force clocked out orphaned shift for ${staffName}`,
      actionCategory: "settings",
      resourceType: "staff_shift",
      resourceId: shiftId,
      resourceName: staffName,
      changes: { after: { clock_out_time: clockOutTime, cash_tips: cashTipsDeclared } as any },
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// =====================================================
// VOID / EXPORT / SESSION BY ID
// =====================================================

export async function VoidTipDistribution(
  clerkOrgId: string,
  sessionId: string,
  reason: string,
  voidedBy: string | null = null
): Promise<{ success: boolean; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.rpc("void_tip_distribution", {
      p_session_id: sessionId,
      p_reason: reason,
      p_voided_by: voidedBy,
    });

    if (error) return { success: false, error: error.message };

    // Get session for audit
    const { data: session } = await supabase
      .from("tip_distribution_sessions")
      .select("location_id, session_date")
      .eq("id", sessionId)
      .single();

    if (session) {
      await LogAuditEvent({
        clerkOrgId,
        locationId: session.location_id,
        action: `Voided tip distribution for ${session.session_date}: ${reason}`,
        actionCategory: "financial",
        resourceType: "tip_distribution_session",
        resourceId: sessionId,
        resourceName: session.session_date,
      });
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GetNeedsApprovalSessions(
  clerkOrgId: string,
  locationId: string
): Promise<{ success: boolean; data: TipDistributionSession[] | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tip_distribution_sessions")
      .select()
      .eq("location_id", locationId)
      .eq("status", "calculated")
      .order("session_date", { ascending: false });

    if (error) return { success: false, data: null, error: error.message };
    return { success: true, data: (data as TipDistributionSession[]) || [], error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export interface LatestSessionCutoff {
  cutoffAt: string;
  sequenceNumber: number;
  sessionId: string;
  status: string;
  totalDistributed: number;
}

export async function GetLatestSessionCutoff(
  clerkOrgId: string,
  locationId: string,
  date: string
): Promise<{ success: boolean; data: LatestSessionCutoff | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tip_distribution_sessions")
      .select("id, status, data_cutoff_at, sequence_number, total_distributed")
      .eq("location_id", locationId)
      .eq("session_date", date)
      .eq("status", "approved")
      .order("sequence_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { success: false, data: null, error: error.message };
    if (!data || !data.data_cutoff_at) return { success: true, data: null, error: null };

    return {
      success: true,
      data: {
        cutoffAt: data.data_cutoff_at,
        sequenceNumber: data.sequence_number,
        sessionId: data.id,
        status: data.status,
        totalDistributed: data.total_distributed || 0,
      },
      error: null,
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GetTipDistributionSessionById(
  clerkOrgId: string,
  sessionId: string
): Promise<{ success: boolean; data: TipSessionWithDetails | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tip_distribution_sessions")
      .select(`
        *,
        tip_distribution_details(
          *,
          staff_profiles(id, first_name, last_name, display_name)
        )
      `)
      .eq("id", sessionId)
      .single();

    if (error) return { success: false, data: null, error: error.message };

    // Verify merchant access
    if (data && data.merchant_id !== merchantId) {
      return { success: false, data: null, error: "Not authorized" };
    }

    return { success: true, data: data as TipSessionWithDetails, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function ExportTipDistribution(
  clerkOrgId: string,
  sessionId: string,
  destination: "gusto" | "adp" | "csv",
  exportedBy: string | null = null
): Promise<{ success: boolean; data: { export_id: string; payload: any } | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc("export_tip_distribution", {
      p_session_id: sessionId,
      p_destination: destination,
      p_exported_by: exportedBy,
    });

    if (error) return { success: false, data: null, error: error.message };

    const { data: session } = await supabase
      .from("tip_distribution_sessions")
      .select("location_id, session_date")
      .eq("id", sessionId)
      .single();

    if (session) {
      await LogAuditEvent({
        clerkOrgId,
        locationId: session.location_id,
        action: `Exported tip distribution for ${session.session_date} to ${destination}`,
        actionCategory: "financial",
        resourceType: "tip_distribution_session",
        resourceId: sessionId,
        resourceName: session.session_date,
      });
    }

    return {
      success: true,
      data: { export_id: data.export_id, payload: data.payload },
      error: null,
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GetSessionExports(
  clerkOrgId: string,
  sessionId: string
): Promise<{ success: boolean; data: TipPayrollExport[] | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tip_payroll_exports")
      .select("id, session_id, destination, status, exported_by, exported_at, error_message, payload")
      .eq("session_id", sessionId)
      .order("exported_at", { ascending: false });

    if (error) return { success: false, data: null, error: error.message };
    return { success: true, data: (data as TipPayrollExport[]) || [], error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// =====================================================
// LATE TIP RECONCILIATION
// =====================================================

export interface ReconciliationResult {
  needsReconciliation: boolean;
  delta: number;
  sessionTotal: number;
  currentTotal: number;
  latePayments: { orderId: string; tipAmount: number; capturedAt: string }[];
}

export async function CheckSessionReconciliation(
  clerkOrgId: string,
  sessionId: string
): Promise<{ success: boolean; data: ReconciliationResult | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServiceRoleClient();

    // Get the session with its time window
    const { data: session } = await supabase
      .from("tip_distribution_sessions")
      .select("id, total_tips_collected, data_start_after, data_cutoff_at, location_id, session_date, status, reconciliation_acknowledged_at")
      .eq("id", sessionId)
      .single();

    if (!session) return { success: false, data: null, error: "Session not found" };

    // Skip if not approved or already acknowledged
    if (session.status !== "approved" || session.reconciliation_acknowledged_at) {
      return { success: true, data: { needsReconciliation: false, delta: 0, sessionTotal: session.total_tips_collected, currentTotal: session.total_tips_collected, latePayments: [] }, error: null };
    }

    // Get location timezone + end hour for day bounds
    const { data: loc } = await supabase
      .from("locations")
      .select("timezone, business_day_end_hour")
      .eq("id", session.location_id)
      .single();
    const tz = loc?.timezone || "UTC";
    const endHour = loc?.business_day_end_hour || 0;

    // Compute the time window this session covers
    const bounds = getDateBoundsUTC(session.session_date, tz, endHour);
    const windowStart = session.data_start_after || bounds.start;
    const windowEnd = session.data_cutoff_at || bounds.end;

    // Query current tip totals from order_payments in this window
    const { data: payments } = await supabase
      .from("order_payments")
      .select("tip_amount, initiated_at, order_id, orders!inner(location_id, created_at, status)")
      .eq("orders.location_id", session.location_id)
      .eq("status", "captured")
      .gte("orders.created_at", windowStart)
      .lte("orders.created_at", windowEnd);

    const validPayments = (payments || []).filter((p: any) =>
      p.orders.status !== "cancelled" && p.orders.status !== "void" && p.orders.status !== "refunded"
    );

    const currentTotal = validPayments.reduce((sum: number, p: any) => sum + (p.tip_amount || 0), 0);
    const delta = currentTotal - session.total_tips_collected;

    // Find specific late payments (captured after the session's cutoff)
    const latePayments = session.data_cutoff_at
      ? validPayments
          .filter((p: any) => p.initiated_at && new Date(p.initiated_at) > new Date(session.data_cutoff_at))
          .map((p: any) => ({
            orderId: p.order_id,
            tipAmount: p.tip_amount || 0,
            capturedAt: p.initiated_at,
          }))
      : [];

    return {
      success: true,
      data: {
        needsReconciliation: Math.abs(delta) > 0.005,
        delta,
        sessionTotal: session.total_tips_collected,
        currentTotal,
        latePayments,
      },
      error: null,
    };
  } catch (err) {
    return { success: false, data: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function AcknowledgeReconciliation(
  clerkOrgId: string,
  sessionId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("tip_distribution_sessions")
      .update({ reconciliation_acknowledged_at: new Date().toISOString() })
      .eq("id", sessionId);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// =====================================================
// VALIDATION RPCs
// =====================================================

export async function ValidateTipPoolConfig(
  clerkOrgId: string,
  configId: string
): Promise<{
  success: boolean;
  data: { valid: boolean; issues: { code: string; message: string; severity: string }[] } | null;
  error: string | null;
}> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc("validate_tip_pool_config", {
      p_config_id: configId,
    });

    if (error) return { success: false, data: null, error: error.message };
    return { success: true, data: data as any, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function CheckForReciprocalTipOutRule(
  clerkOrgId: string,
  locationId: string,
  fromRoleCode: string,
  toRoleCode: string,
  excludeRuleId?: string
): Promise<{ success: boolean; data: TipOutRule | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    let query = supabase
      .from("tip_out_rules")
      .select()
      .eq("location_id", locationId)
      .eq("from_role_code", toRoleCode)
      .eq("to_role_code", fromRoleCode)
      .eq("is_active", true);

    if (excludeRuleId) {
      query = query.neq("id", excludeRuleId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) return { success: false, data: null, error: error.message };
    return { success: true, data: (data as TipOutRule) ?? null, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// =====================================================
// LOOKUP FUNCTIONS
// =====================================================

export async function GetRolesForMerchant(
  clerkOrgId: string
): Promise<{ success: boolean; data: Role[] | null; error: string | null }> {
  try {
    const supabase = createServerSupabaseClient();
    // Only return merchant-level roles — HQ/carrier/system roles must not appear
    // in tip configuration or tip distribution UI
    const { data, error } = await supabase
      .from("roles")
      .select("code, name, level, organization_type")
      .eq("organization_type", "merchant")
      .order("level", { ascending: false });

    if (error) return { success: false, data: null, error: error.message };
    return { success: true, data: (data as Role[]) || [], error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// =====================================================
// TOGGLE TIP-OUT RULE
// =====================================================

export async function ToggleTipOutRule(
  clerkOrgId: string,
  ruleId: string,
  isActive: boolean
): Promise<{ success: boolean; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    const { data: rule } = await supabase
      .from("tip_out_rules")
      .select()
      .eq("id", ruleId)
      .single();

    const { error } = await supabase
      .from("tip_out_rules")
      .update({ is_active: isActive })
      .eq("id", ruleId);

    if (error) return { success: false, error: error.message };

    if (rule) {
      await LogAuditEvent({
        clerkOrgId,
        locationId: rule.location_id,
        action: `${isActive ? "Activated" : "Deactivated"} tip-out rule: ${rule.from_role_code} → ${rule.to_role_code}`,
        actionCategory: "settings",
        resourceType: "tip_out_rule",
        resourceId: ruleId,
        resourceName: `${rule.from_role_code} to ${rule.to_role_code}`,
      });
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// =====================================================
// MARK SESSION AS EXPORTED
// =====================================================

export async function MarkTipDistributionExported(
  clerkOrgId: string,
  sessionId: string,
  exportFormat: "csv" | "pdf" = "csv"
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createServerSupabaseClient();

    const { data: session } = await supabase
      .from("tip_distribution_sessions")
      .select("location_id, session_date, status")
      .eq("id", sessionId)
      .single();

    if (!session) return { success: false, error: "Session not found" };

    const { error } = await supabase
      .from("tip_distribution_sessions")
      .update({
        status: "exported",
        exported_at: new Date().toISOString(),
        export_format: exportFormat,
      })
      .eq("id", sessionId);

    if (error) return { success: false, error: error.message };

    await LogAuditEvent({
      clerkOrgId,
      locationId: session.location_id,
      action: `Exported tip distribution for ${session.session_date} as ${exportFormat.toUpperCase()}`,
      actionCategory: "financial",
      resourceType: "tip_distribution_session",
      resourceId: sessionId,
      resourceName: session.session_date,
    });

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// =====================================================
// EMPLOYEE SELF-SERVICE: MY TIP HISTORY
// =====================================================

export interface MyTipEntry {
  session_id: string;
  session_date: string;
  shift_period: string;
  session_status: string;
  role_code: string;
  hours_worked: number;
  individual_tips_earned: number;
  tip_pool_contributed: number;
  tip_pool_received: number;
  tip_out_given: number;
  tip_out_received: number;
  manual_adjustment: number;
  net_tips: number;
}

export async function GetMyTipHistory(
  clerkOrgId: string,
  locationId?: string,
  limitDays: number = 30
): Promise<{ success: boolean; data: MyTipEntry[] | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();

    // Resolve current user's staff profile for this merchant
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return { success: false, data: null, error: "Not authenticated" };

    const { data: staffProfile } = await supabase
      .from("staff_profiles")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("user_id", authData.user.id)
      .single();

    if (!staffProfile) return { success: false, data: null, error: "Staff profile not found" };

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - limitDays);

    let query = supabase
      .from("tip_distribution_details")
      .select(
        `
        id,
        role_code,
        hours_worked,
        individual_tips_earned,
        tip_pool_contributed,
        tip_pool_received,
        tip_out_given,
        tip_out_received,
        manual_adjustment,
        net_tips,
        tip_distribution_sessions!inner(
          id,
          session_date,
          shift_period,
          status,
          location_id
        )
      `
      )
      .eq("staff_profile_id", staffProfile.id)
      .eq("tip_distribution_sessions.status", "approved")
      .gte("tip_distribution_sessions.session_date", sinceDate.toISOString().split("T")[0])
      .order("tip_distribution_sessions.session_date", { ascending: false });

    if (locationId && locationId !== "all") {
      query = query.eq("tip_distribution_sessions.location_id", locationId);
    }

    const { data, error } = await query;

    if (error) return { success: false, data: null, error: error.message };

    const entries: MyTipEntry[] = (data || []).map((row: any) => ({
      session_id: row.tip_distribution_sessions.id,
      session_date: row.tip_distribution_sessions.session_date,
      shift_period: row.tip_distribution_sessions.shift_period,
      session_status: row.tip_distribution_sessions.status,
      role_code: row.role_code,
      hours_worked: row.hours_worked || 0,
      individual_tips_earned: row.individual_tips_earned || 0,
      tip_pool_contributed: row.tip_pool_contributed || 0,
      tip_pool_received: row.tip_pool_received || 0,
      tip_out_given: row.tip_out_given || 0,
      tip_out_received: row.tip_out_received || 0,
      manual_adjustment: row.manual_adjustment || 0,
      net_tips: row.net_tips || 0,
    }));

    return { success: true, data: entries, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
