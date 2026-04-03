"use server";

// ============================================================================
// Loyalty Programs Server Actions
// Description: CRUD operations for managing loyalty programs and promotions
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";
import type { Database } from "@/database.types";

// ============================================================================
// Types
// ============================================================================

export type LoyaltyProgram = Database["public"]["Tables"]["loyalty_programs"]["Row"];
export type LoyaltyProgramInsert = Database["public"]["Tables"]["loyalty_programs"]["Insert"];
export type LoyaltyProgramUpdate = Database["public"]["Tables"]["loyalty_programs"]["Update"];

export type Promotion = Database["public"]["Tables"]["promotions"]["Row"];
export type PromotionInsert = Database["public"]["Tables"]["promotions"]["Insert"];
export type PromotionUpdate = Database["public"]["Tables"]["promotions"]["Update"];

export interface ProgramWithStats extends LoyaltyProgram {
  [x: string]:
  // ============================================================================
  // Loyalty Programs Server Actions
  // Description: CRUD operations for managing loyalty programs and promotions
  // ============================================================================
  any // ============================================================================
  ;
  enrollment_count: number;
  total_points_issued: number;
  total_rewards_given: number;
}

// ============================================================================
// Helper: Get merchant_id from clerkOrgId
// ============================================================================

async function getMerchantId(clerkOrgId: string) {
  const supabase = createServerSupabaseClient();
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !merchant) {
    console.error("[LoyaltyPrograms] Error getting merchant:", error);
    return null;
  }

  return merchant.id as string;
}

// ============================================================================
// LOYALTY PROGRAMS - READ Operations
// ============================================================================

/**
 * Get all loyalty programs (active and inactive) for a merchant
 */
export async function GetLoyaltyPrograms(clerkOrgId: string) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found", data: null };
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("loyalty_programs")
      .select(
        `
        *,
        loyalty_enrollments!left(id)
      `
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GetLoyaltyPrograms] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Transform to include enrollment count and stats
    const programsWithStats: ProgramWithStats[] = (data || []).map((program: any) => ({
      ...program,
      enrollment_count: program.loyalty_enrollments?.length || 0,
      total_points_issued: 0, // Would need a separate aggregation query if needed
      total_rewards_given: 0, // Would need a separate aggregation query if needed
    }));

    return { success: true, data: programsWithStats, error: null };
  } catch (error) {
    console.error("[GetLoyaltyPrograms] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Get a specific loyalty program by ID
 */
export async function GetLoyaltyProgramById(clerkOrgId: string, programId: string) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found", data: null };
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("loyalty_programs")
      .select("*")
      .eq("id", programId)
      .eq("merchant_id", merchantId)
      .single();

    if (error) {
      console.error("[GetLoyaltyProgramById] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data as LoyaltyProgram, error: null };
  } catch (error) {
    console.error("[GetLoyaltyProgramById] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// LOYALTY PROGRAMS - CREATE Operation
// ============================================================================

/**
 * Create a new loyalty program
 */
export async function CreateLoyaltyProgram(
  clerkOrgId: string,
  input: Omit<LoyaltyProgramInsert, "merchant_id" | "created_at" | "updated_at">
) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found", data: null };
    }

    // Validate required fields
    if (!input.name || !input.program_type || !input.reward_description || !input.reward_type) {
      return {
        success: false,
        error: "Missing required fields: name, program_type, reward_description, reward_type",
        data: null,
      };
    }

    const supabase = createServerSupabaseClient();

    const insertData = {
      ...input,
      merchant_id: merchantId,
      is_active: input.is_active ?? true,
      display_color: input.display_color ?? "#6366f1",
      display_icon: input.display_icon ?? "star",
      earn_on_discounted: input.earn_on_discounted ?? true,
      max_active_rewards: input.max_active_rewards ?? 5,
      auto_enroll: input.auto_enroll ?? true,
    };

    console.log("[CreateLoyaltyProgram] Insert data:", insertData);

    const { data, error } = await supabase
      .from("loyalty_programs")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("[CreateLoyaltyProgram] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    console.log("[CreateLoyaltyProgram] Response data:", JSON.stringify(data, null, 2));

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Created loyalty program: ${input.name}`,
      actionCategory: "settings",
      resourceType: "loyalty_program",
      resourceId: data.id,
      resourceName: input.name,
      changes: {
        after: data,
      },
    });

    return { success: true, data: data as LoyaltyProgram, error: null };
  } catch (error) {
    console.error("[CreateLoyaltyProgram] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// LOYALTY PROGRAMS - UPDATE Operation
// ============================================================================

/**
 * Update a loyalty program
 */
export async function UpdateLoyaltyProgram(
  clerkOrgId: string,
  programId: string,
  input: LoyaltyProgramUpdate
) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found", data: null };
    }

    const supabase = createServerSupabaseClient();

    console.log("[UpdateLoyaltyProgram] Input data:", input);

    // Verify program belongs to merchant
    const { data: existing } = await supabase
      .from("loyalty_programs")
      .select("name")
      .eq("id", programId)
      .eq("merchant_id", merchantId)
      .single();

    if (!existing) {
      return { success: false, error: "Program not found or belongs to another merchant", data: null };
    }

    const { data, error } = await supabase
      .from("loyalty_programs")
      .update(input)
      .eq("id", programId)
      .eq("merchant_id", merchantId)
      .select()
      .single();

    if (error) {
      console.error("[UpdateLoyaltyProgram] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Updated loyalty program: ${existing.name}`,
      actionCategory: "settings",
      resourceType: "loyalty_program",
      resourceId: programId,
      resourceName: existing.name,
      changes: {
        before: existing,
        after: data,
      },
    });

    return { success: true, data: data as LoyaltyProgram, error: null };
  } catch (error) {
    console.error("[UpdateLoyaltyProgram] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// LOYALTY PROGRAMS - TOGGLE Operation
// ============================================================================

/**
 * Toggle a program's active status
 */
export async function ToggleLoyaltyProgram(
  clerkOrgId: string,
  programId: string,
  isActive: boolean
) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found", data: null };
    }

    const supabase = createServerSupabaseClient();

    // Get existing program for audit
    const { data: existing } = await supabase
      .from("loyalty_programs")
      .select("name, is_active")
      .eq("id", programId)
      .eq("merchant_id", merchantId)
      .single();

    if (!existing) {
      return { success: false, error: "Program not found or belongs to another merchant", data: null };
    }

    const { data, error } = await supabase
      .from("loyalty_programs")
      .update({ is_active: isActive })
      .eq("id", programId)
      .eq("merchant_id", merchantId)
      .select()
      .single();

    if (error) {
      console.error("[ToggleLoyaltyProgram] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `${isActive ? "Activated" : "Deactivated"} loyalty program: ${existing.name}`,
      actionCategory: "settings",
      resourceType: "loyalty_program",
      resourceId: programId,
      resourceName: existing.name,
    });

    return { success: true, data: data as LoyaltyProgram, error: null };
  } catch (error) {
    console.error("[ToggleLoyaltyProgram] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// LOYALTY PROGRAMS - DELETE Operation (Soft Delete)
// ============================================================================

/**
 * Delete a loyalty program (soft delete - just deactivate)
 */
export async function DeleteLoyaltyProgram(clerkOrgId: string, programId: string) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found" };
    }

    const supabase = createServerSupabaseClient();

    // Get existing program for audit
    const { data: existing } = await supabase
      .from("loyalty_programs")
      .select("name")
      .eq("id", programId)
      .eq("merchant_id", merchantId)
      .single();

    if (!existing) {
      return { success: false, error: "Program not found or belongs to another merchant" };
    }

    const { error } = await supabase
      .from("loyalty_programs")
      .update({ is_active: false })
      .eq("id", programId)
      .eq("merchant_id", merchantId);

    if (error) {
      console.error("[DeleteLoyaltyProgram] Error:", error);
      return { success: false, error: error.message };
    }

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Deleted loyalty program: ${existing.name}`,
      actionCategory: "settings",
      resourceType: "loyalty_program",
      resourceId: programId,
      resourceName: existing.name,
    });

    return { success: true };
  } catch (error) {
    console.error("[DeleteLoyaltyProgram] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// PROMOTIONS - READ Operations
// ============================================================================

/**
 * Get all promotions (active and inactive) for a merchant
 */
export async function GetPromotions(clerkOrgId: string) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found", data: null };
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("promotions")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GetPromotions] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data as Promotion[], error: null };
  } catch (error) {
    console.error("[GetPromotions] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Get a specific promotion by ID
 */
export async function GetPromotionById(clerkOrgId: string, promotionId: string) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found", data: null };
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("promotions")
      .select("*")
      .eq("id", promotionId)
      .eq("merchant_id", merchantId)
      .single();

    if (error) {
      console.error("[GetPromotionById] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data as Promotion, error: null };
  } catch (error) {
    console.error("[GetPromotionById] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// PROMOTIONS - CREATE Operation
// ============================================================================

/**
 * Create a new promotion
 */
export async function CreatePromotion(
  clerkOrgId: string,
  input: Omit<PromotionInsert, "merchant_id" | "created_at" | "updated_at">
) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found", data: null };
    }

    // Validate required fields
    if (!input.name || !input.promo_type || !input.discount_type) {
      return {
        success: false,
        error: "Missing required fields: name, promo_type, discount_type",
        data: null,
      };
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("promotions")
      .insert({
        ...input,
        merchant_id: merchantId,
        is_active: input.is_active ?? true,
        current_uses: input.current_uses ?? 0,
        auto_apply: input.auto_apply ?? false,
      })
      .select()
      .single();

    if (error) {
      console.error("[CreatePromotion] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Created promotion: ${input.name}`,
      actionCategory: "settings",
      resourceType: "promotion",
      resourceId: data.id,
      resourceName: input.name,
      changes: {
        after: data,
      },
    });

    return { success: true, data: data as Promotion, error: null };
  } catch (error) {
    console.error("[CreatePromotion] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// PROMOTIONS - UPDATE Operation
// ============================================================================

/**
 * Update a promotion
 */
export async function UpdatePromotion(
  clerkOrgId: string,
  promotionId: string,
  input: PromotionUpdate
) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found", data: null };
    }

    const supabase = createServerSupabaseClient();

    // Verify promotion belongs to merchant
    const { data: existing } = await supabase
      .from("promotions")
      .select("name")
      .eq("id", promotionId)
      .eq("merchant_id", merchantId)
      .single();

    if (!existing) {
      return { success: false, error: "Promotion not found or belongs to another merchant", data: null };
    }

    const { data, error } = await supabase
      .from("promotions")
      .update(input)
      .eq("id", promotionId)
      .eq("merchant_id", merchantId)
      .select()
      .single();

    if (error) {
      console.error("[UpdatePromotion] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Updated promotion: ${existing.name}`,
      actionCategory: "settings",
      resourceType: "promotion",
      resourceId: promotionId,
      resourceName: existing.name,
      changes: {
        before: existing,
        after: data,
      },
    });

    return { success: true, data: data as Promotion, error: null };
  } catch (error) {
    console.error("[UpdatePromotion] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// PROMOTIONS - TOGGLE Operation
// ============================================================================

/**
 * Toggle a promotion's active status
 */
export async function TogglePromotion(
  clerkOrgId: string,
  promotionId: string,
  isActive: boolean
) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found", data: null };
    }

    const supabase = createServerSupabaseClient();

    // Get existing promotion for audit
    const { data: existing } = await supabase
      .from("promotions")
      .select("name, is_active")
      .eq("id", promotionId)
      .eq("merchant_id", merchantId)
      .single();

    if (!existing) {
      return { success: false, error: "Promotion not found or belongs to another merchant", data: null };
    }

    const { data, error } = await supabase
      .from("promotions")
      .update({ is_active: isActive })
      .eq("id", promotionId)
      .eq("merchant_id", merchantId)
      .select()
      .single();

    if (error) {
      console.error("[TogglePromotion] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `${isActive ? "Activated" : "Deactivated"} promotion: ${existing.name}`,
      actionCategory: "settings",
      resourceType: "promotion",
      resourceId: promotionId,
      resourceName: existing.name,
    });

    return { success: true, data: data as Promotion, error: null };
  } catch (error) {
    console.error("[TogglePromotion] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// PROMOTIONS - DELETE Operation (Soft Delete)
// ============================================================================

/**
 * Delete a promotion (soft delete - just deactivate)
 */
export async function DeletePromotion(clerkOrgId: string, promotionId: string) {
  try {
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) {
      return { success: false, error: "Merchant not found" };
    }

    const supabase = createServerSupabaseClient();

    // Get existing promotion for audit
    const { data: existing } = await supabase
      .from("promotions")
      .select("name")
      .eq("id", promotionId)
      .eq("merchant_id", merchantId)
      .single();

    if (!existing) {
      return { success: false, error: "Promotion not found or belongs to another merchant" };
    }

    const { error } = await supabase
      .from("promotions")
      .update({ is_active: false })
      .eq("id", promotionId)
      .eq("merchant_id", merchantId);

    if (error) {
      console.error("[DeletePromotion] Error:", error);
      return { success: false, error: error.message };
    }

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Deleted promotion: ${existing.name}`,
      actionCategory: "settings",
      resourceType: "promotion",
      resourceId: promotionId,
      resourceName: existing.name,
    });

    return { success: true };
  } catch (error) {
    console.error("[DeletePromotion] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Analytics: Get loyalty program analytics and insights
// ============================================================================

export interface ProgramAnalytics {
  program_id: string;
  program_name: string;
  program_type: string;
  total_members: number;
  active_this_month: number;
  rewards_given: number;
  total_savings: number;
  active_rate: number;
  alerts: {
    rewards_expiring_week: number;
    inactive_customers: number;
  };
  top_customers: Array<{
    customer_id: string;
    customer_name: string;
    phone: string;
    lifetime_value: number;
    rewards_earned: number;
    total_savings: number;
  }>;
}

export type LoyaltyAnalytics = ProgramAnalytics;

export async function GetProgramAnalytics(
  clerkOrgId: string,
  programId: string
): Promise<ProgramAnalytics | null> {
  if (!clerkOrgId || !programId) return null;

  try {
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantId(clerkOrgId);
    if (!merchantId) return null;

    // Get program details
    const { data: programData } = await supabase
      .from("loyalty_programs")
      .select("id, name, program_type")
      .eq("id", programId)
      .eq("merchant_id", merchantId)
      .single();

    if (!programData) return null;

    // KPI: Members for this program
    const { data: kpiData } = await supabase
      .from("loyalty_enrollments")
      .select("id, last_earn_at, total_rewards_earned, total_reward_value")
      .eq("program_id", programId)
      .eq("merchant_id", merchantId)
      .eq("is_active", true);

    const total_members = kpiData?.length || 0;
    const active_this_month = (kpiData || []).filter((e) => {
      if (!e.last_earn_at) return false;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return new Date(e.last_earn_at) >= thirtyDaysAgo;
    }).length;
    const rewards_given = (kpiData || []).reduce(
      (sum, e) => sum + (e.total_rewards_earned || 0),
      0
    );

    // Total savings: SUM of REDEEMED rewards only
    const { data: redeemedRewardsData } = await supabase
      .from("loyalty_rewards")
      .select("reward_value")
      .eq("program_id", programId)
      .eq("status", "redeemed");

    const total_savings = (redeemedRewardsData || []).reduce(
      (sum, r) => sum + Number(r.reward_value || 0),
      0
    );

    // Alerts: Rewards expiring this week
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const { data: expiringData } = await supabase
      .from("loyalty_rewards")
      .select("id", { count: "exact" })
      .eq("program_id", programId)
      .eq("status", "available")
      .gte("expires_at", new Date().toISOString())
      .lte("expires_at", weekFromNow.toISOString());

    const rewards_expiring_week = expiringData?.length || 0;

    // Alerts: Inactive customers (no earn in 30 days)
    const thirtyDaysAgoStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: inactiveData } = await supabase
      .from("loyalty_enrollments")
      .select("id", { count: "exact" })
      .eq("program_id", programId)
      .eq("merchant_id", merchantId)
      .eq("is_active", true)
      .or(`last_earn_at.is.null,last_earn_at.lt.${thirtyDaysAgoStr}`);

    const inactive_customers = inactiveData?.length || 0;

    // Top customers: with REDEEMED rewards value (not total_reward_value)
    const { data: topCustomersBaseData } = await supabase
      .from("loyalty_enrollments")
      .select("id, customer_id, total_rewards_earned, customers!inner(id, name, phone)")
      .eq("program_id", programId)
      .eq("merchant_id", merchantId)
      .eq("is_active", true);

    // For each customer, calculate their actual redeemed value
    const topCustomersData = await Promise.all(
      (topCustomersBaseData || []).map(async (enrollment: any) => {
        const { data: customerRewards } = await supabase
          .from("loyalty_rewards")
          .select("reward_value")
          .eq("enrollment_id", enrollment.id)
          .eq("status", "redeemed");

        const redeemed_value = (customerRewards || []).reduce(
          (sum: number, r: any) => sum + Number(r.reward_value || 0),
          0
        );

        return {
          ...enrollment,
          lifetime_value: redeemed_value,
          total_savings: redeemed_value,
        };
      })
    );

    // Sort by lifetime_value and take top 5
    const top_customers = topCustomersData
      .sort((a: any, b: any) => b.lifetime_value - a.lifetime_value)
      .slice(0, 5)
      .map((enrollment: any) => ({
        customer_id: enrollment.customer_id,
        customer_name: enrollment.customers?.name || "Unknown",
        phone: enrollment.customers?.phone || "",
        lifetime_value: enrollment.lifetime_value,
        rewards_earned: enrollment.total_rewards_earned || 0,
        total_savings: enrollment.total_savings,
      }));

    return {
      program_id: programData.id,
      program_name: programData.name,
      program_type: programData.program_type,
      total_members,
      active_this_month,
      rewards_given,
      total_savings,
      active_rate: total_members > 0 ? (active_this_month / total_members) * 100 : 0,
      alerts: {
        rewards_expiring_week,
        inactive_customers,
      },
      top_customers,
    };
  } catch (error) {
    console.error("[GetProgramAnalytics] Exception:", error);
    return null;
  }
}
