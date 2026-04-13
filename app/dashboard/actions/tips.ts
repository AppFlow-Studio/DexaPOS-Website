"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
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
  tip_source: "charged_tips" | "all_tips" | "cash_only" | "custom_percentage";
  source_percentage: number;
  contributing_role_codes: string[];
  is_active: boolean;
  effective_date: string;
  end_date: string | null;
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
      .order("created_at", { ascending: false });

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
    tip_source: "charged_tips" | "all_tips" | "cash_only" | "custom_percentage";
    source_percentage: number;
    contributing_role_codes: string[];
    is_active?: boolean;
    effective_date?: string;
    end_date?: string | null;
    role_shares: { role_code: string; share_percentage?: number; points_per_hour?: number }[];
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
      is_eligible: true,
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
    role_shares: { role_code: string; share_percentage?: number; points_per_hour?: number }[];
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
        is_eligible: true,
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

    const { data, error } = await supabase.rpc("calculate_tip_distribution", {
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
  limit: number = 20
): Promise<{ success: boolean; data: TipDistributionSession[] | null; error: string | null }> {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return { success: false, data: null, error: "Merchant not found" };

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tip_distribution_sessions")
      .select()
      .eq("location_id", locationId)
      .order("session_date", { ascending: false })
      .limit(limit);

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
