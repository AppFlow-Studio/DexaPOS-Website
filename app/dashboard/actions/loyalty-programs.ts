"use server";

// ============================================================================
// Loyalty Programs Server Actions
// Description: CRUD operations for managing loyalty programs and promotions
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";
import type { Database } from "@/types/database.types";

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
