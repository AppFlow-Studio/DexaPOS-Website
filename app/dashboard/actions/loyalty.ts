"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/types/database.types";

type LoyaltyProgram = Database["public"]["Tables"]["loyalty_programs"]["Row"];
type LoyaltyTransaction = Database["public"]["Tables"]["loyalty_transactions"]["Row"];
type LoyaltyReward = Database["public"]["Tables"]["loyalty_rewards"]["Row"];

/**
 * Get all active loyalty programs for a merchant
 */
export async function GetMerchantLoyaltyPrograms(merchantId: string) {
  if (!merchantId) return [];

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("loyalty_programs")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GetMerchantLoyaltyPrograms]", error);
    return [];
  }

  return data || [];
}

/**
 * Get customer enrollment in loyalty programs
 */
export async function GetCustomerLoyaltyEnrollments(customerId: string) {
  if (!customerId) return [];

  const supabase = createServiceRoleClient();

  // Get active enrollments with program details
  const { data, error } = await supabase
    .from("loyalty_enrollments")
    .select(
      `
      *,
      loyalty_programs!inner(
        id,
        merchant_id,
        name,
        description,
        program_type,
        reward_type,
        reward_value,
        reward_description,
        points_redemption_threshold,
        visits_required,
        punches_required,
        display_color,
        display_icon
      )
      `
    )
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .order("enrolled_at", { ascending: false });

  if (error) {
    console.error("[GetCustomerLoyaltyEnrollments]", error);
    return [];
  }

  return data || [];
}

/**
 * Get customer's current points balance for a loyalty program
 */
export async function GetCustomerLoyaltyBalance(
  customerId: string,
  programId: string
) {
  if (!customerId || !programId) return 0;

  const supabase = createServiceRoleClient();

  // Check loyalty_enrollments for current points balance
  const { data, error } = await supabase
    .from("loyalty_enrollments")
    .select("current_points")
    .eq("customer_id", customerId)
    .eq("program_id", programId)
    .single();

  if (error || !data) {
    // No enrollment found, return 0
    return 0;
  }

  return data.current_points || 0;
}

/**
 * Get customer's total earned points (lifetime) for a program
 */
export async function GetCustomerLoyaltyLifetimePoints(
  customerId: string,
  programId: string
) {
  if (!customerId || !programId) return 0;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("loyalty_enrollments")
    .select("lifetime_points")
    .eq("customer_id", customerId)
    .eq("program_id", programId)
    .single();

  if (error) {
    console.error("[GetCustomerLoyaltyLifetimePoints]", error);
    return 0;
  }

  return data?.lifetime_points || 0;
}

/**
 * Get customer's available and earned rewards for a program
 */
export async function GetCustomerLoyaltyRewards(
  customerId: string,
  programId: string
) {
  if (!customerId || !programId) return [];

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("loyalty_rewards")
    .select("*")
    .eq("customer_id", customerId)
    .eq("program_id", programId)
    .order("earned_at", { ascending: false });

  if (error) {
    console.error("[GetCustomerLoyaltyRewards]", error);
    return [];
  }

  return data || [];
}

/**
 * Get customer's points transaction history for a program
 */
export async function GetCustomerLoyaltyTransactionHistory(
  customerId: string,
  programId: string,
  limit: number = 50
) {
  if (!customerId || !programId) return [];

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("loyalty_transactions")
    .select(
      `
      *,
      staff:staff_profiles(display_name)
      `
    )
    .eq("customer_id", customerId)
    .eq("program_id", programId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[GetCustomerLoyaltyTransactionHistory]", error);
    return [];
  }

  return data || [];
}

/**
 * Add points to customer's loyalty balance (admin action)
 * Calls the loyalty_manual_adjust RPC function
 */
export async function AddLoyaltyPoints({
  customerId,
  programId,
  merchantId,
  pointsAmount,
  description,
  staffId,
}: {
  customerId: string;
  programId: string;
  merchantId: string;
  pointsAmount: number;
  description: string;
  staffId?: string;
}) {
  if (!customerId || !programId || !merchantId) return null;

  const supabase = createServiceRoleClient();

  // Get enrollment record to get enrollment_id
  const { data: enrollment, error: enrollmentError } = await supabase
    .from("loyalty_enrollments")
    .select("id")
    .eq("customer_id", customerId)
    .eq("program_id", programId)
    .single();

  if (enrollmentError || !enrollment) {
    console.error("[AddLoyaltyPoints] Enrollment not found", enrollmentError);
    return null;
  }

  // Call the loyalty_manual_adjust RPC function
  const { data, error } = await supabase.rpc("loyalty_manual_adjust", {
    p_enrollment_id: enrollment.id,
    p_adjustment_type: "points",
    p_amount: pointsAmount,
    p_reason: description,
    p_staff_id: staffId || null,
  });

  if (error) {
    console.error("[AddLoyaltyPoints] RPC error", error);
    return null;
  }

  return data;
}

/**
 * Redeem a loyalty reward
 */
export async function RedeemLoyaltyReward({
  rewardId,
  orderId,
}: {
  rewardId: string;
  orderId?: string;
}) {
  if (!rewardId) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("loyalty_rewards")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
      redeemed_order_id: orderId || null,
    })
    .eq("id", rewardId)
    .select()
    .single();

  if (error) {
    console.error("[RedeemLoyaltyReward]", error);
    return null;
  }

  return data;
}

/**
 * Enroll customer in a loyalty program
 */
export async function EnrollInLoyaltyProgram({
  customerId,
  programId,
  merchantId,
}: {
  customerId: string;
  programId: string;
  merchantId: string;
}) {
  if (!customerId || !programId || !merchantId) return null;

  const supabase = createServiceRoleClient();

  // Check if already enrolled
  const { data: existingEnrollment } = await supabase
    .from("loyalty_enrollments")
    .select("id")
    .eq("customer_id", customerId)
    .eq("program_id", programId)
    .limit(1);

  if (existingEnrollment && existingEnrollment.length > 0) {
    // Already enrolled
    return { id: programId, already_enrolled: true };
  }

  // Create enrollment record in loyalty_enrollments
  const { data, error } = await supabase
    .from("loyalty_enrollments")
    .insert({
      customer_id: customerId,
      program_id: programId,
      merchant_id: merchantId,
      current_points: 0,
      current_punches: 0,
      current_visits: 0,
      lifetime_points: 0,
      lifetime_punches: 0,
      lifetime_visits: 0,
      total_rewards_earned: 0,
      total_rewards_redeemed: 0,
      total_reward_value: 0,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error("[EnrollInLoyaltyProgram]", error);
    return null;
  }

  return data;
}

/**
 * Get loyalty program details with customer context
 */
export async function GetLoyaltyProgramWithCustomerContext(
  programId: string,
  customerId: string
) {
  if (!programId || !customerId) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("loyalty_programs")
    .select("*")
    .eq("id", programId)
    .single();

  if (error) {
    console.error("[GetLoyaltyProgramWithCustomerContext]", error);
    return null;
  }

  if (!data) return null;

  // Enrich with customer's data
  const currentBalance = await GetCustomerLoyaltyBalance(customerId, programId);
  const lifetimePoints = await GetCustomerLoyaltyLifetimePoints(
    customerId,
    programId
  );
  const rewards = await GetCustomerLoyaltyRewards(customerId, programId);

  return {
    ...data,
    customer: {
      currentBalance,
      lifetimePoints,
      rewardsEarned: rewards.length,
      savedValue: rewards
        .filter((r) => r.status === "redeemed")
        .reduce((sum, r) => sum + Number(r.reward_value), 0),
    },
  };
}

/**
 * Earn points on an order (called from order completion)
 */
export async function EarnLoyaltyPointsOnOrder({
  customerId,
  orderId,
  merchantId,
  locationId,
  orderAmount,
}: {
  customerId: string;
  orderId: string;
  merchantId: string;
  locationId: string;
  orderAmount: number;
}) {
  if (!customerId || !orderId || !merchantId) return null;

  const supabase = createServiceRoleClient();

  // Get all loyalty programs for the merchant
  const { data: programs, error: programError } = await supabase
    .from("loyalty_programs")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("is_active", true);

  if (programError || !programs) {
    console.error("[EarnLoyaltyPointsOnOrder]", programError);
    return [];
  }

  const results = [];

  for (const program of programs) {
    // Check if customer is enrolled
    const { data: enrollmentCheck } = await supabase
      .from("loyalty_enrollments")
      .select("id")
      .eq("customer_id", customerId)
      .eq("program_id", program.id)
      .limit(1);

    if (!enrollmentCheck || enrollmentCheck.length === 0) {
      continue; // Customer not enrolled in this program
    }

    // Check if order meets minimum threshold
    if (
      program.min_order_amount &&
      orderAmount < Number(program.min_order_amount)
    ) {
      continue;
    }

    // Calculate points earned
    let pointsEarned = 0;
    if (program.program_type === "points") {
      pointsEarned = Math.floor(
        orderAmount * Number(program.points_per_dollar || 1)
      );
    }

    if (pointsEarned === 0) continue;

    // Get current balance and enrollment
    const enrollment = enrollmentCheck[0];
    const currentBalance = enrollment.current_points || 0;
    const newBalance = currentBalance + pointsEarned;

    // Create transaction with enrollment_id
    const { data, error } = await supabase
      .from("loyalty_transactions")
      .insert({
        customer_id: customerId,
        program_id: program.id,
        merchant_id: merchantId,
        enrollment_id: enrollment.id,
        location_id: locationId,
        order_id: orderId,
        transaction_type: "earn_points",
        points_delta: pointsEarned,
        balance_points: newBalance,
        description: `Earned on Order #${orderId.slice(0, 8)}`,
      })
      .select()
      .single();

    if (!error && data) {
      results.push(data);

      // Check if customer earned a reward
      if (program.reward_type && program.reward_value) {
        // For points-based programs, create reward if points exceed threshold
        if (
          program.points_redemption_threshold &&
          newBalance >= Number(program.points_redemption_threshold)
        ) {
          const { data: existingReward } = await supabase
            .from("loyalty_rewards")
            .select("id")
            .eq("customer_id", customerId)
            .eq("program_id", program.id)
            .eq("status", "available")
            .limit(1);

          if (!existingReward || existingReward.length === 0) {
            await supabase.from("loyalty_rewards").insert({
              customer_id: customerId,
              program_id: program.id,
              merchant_id: merchantId,
              enrollment_id: enrollment.id,
              reward_type: program.reward_type,
              reward_value: program.reward_value,
              reward_description: program.reward_description,
              status: "available",
              expires_at: program.reward_expiry_days
                ? new Date(
                    Date.now() + program.reward_expiry_days * 24 * 60 * 60 * 1000
                  ).toISOString()
                : null,
            });
          }
        }
      }
    }
  }

  return results;
}

/**
 * Void a loyalty reward (mark as voided instead of redeemed)
 */
export async function VoidLoyaltyReward({
  rewardId,
  reason,
}: {
  rewardId: string;
  reason?: string;
}) {
  if (!rewardId) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("loyalty_rewards")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_reason: reason || null,
    })
    .eq("id", rewardId)
    .select()
    .single();

  if (error) {
    console.error("[VoidLoyaltyReward]", error);
    return null;
  }

  return data;
}

/**
 * Get customer's promotion usage history
 */
export async function GetCustomerPromotionUsage(
  customerId: string,
  merchantId: string
) {
  if (!customerId || !merchantId) return [];

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("promotion_usage")
    .select(
      `
      id,
      created_at,
      discount_applied,
      order_id,
      promotions!inner(
        id,
        name,
        discount_type,
        discount_value
      )
      `
    )
    .eq("customer_id", customerId)
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[GetCustomerPromotionUsage]", error);
    return [];
  }

  return data || [];
}
