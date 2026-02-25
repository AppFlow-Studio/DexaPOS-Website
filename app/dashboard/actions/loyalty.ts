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

  // Get all loyalty transactions for this customer to determine enrollments
  const { data, error } = await supabase
    .from("loyalty_transactions")
    .select(
      `
      program_id,
      loyalty_programs!inner(
        id,
        merchant_id,
        name,
        description,
        program_type,
        reward_type,
        reward_value,
        reward_description
      )
      `
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GetCustomerLoyaltyEnrollments]", error);
    return [];
  }

  // Deduplicate by program_id
  const uniquePrograms = new Map();
  data?.forEach((item: any) => {
    if (!uniquePrograms.has(item.program_id)) {
      uniquePrograms.set(item.program_id, item.loyalty_programs);
    }
  });

  return Array.from(uniquePrograms.values());
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

  // Get the most recent transaction to get the running balance
  const { data, error } = await supabase
    .from("loyalty_transactions")
    .select("balance_after")
    .eq("customer_id", customerId)
    .eq("program_id", programId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    // No transactions found, return 0
    return 0;
  }

  return data.balance_after || 0;
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
    .from("loyalty_transactions")
    .select("points_amount")
    .eq("customer_id", customerId)
    .eq("program_id", programId)
    .eq("transaction_type", "earn");

  if (error) {
    console.error("[GetCustomerLoyaltyLifetimePoints]", error);
    return 0;
  }

  return data?.reduce((sum, tx) => sum + tx.points_amount, 0) || 0;
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

  // Get current balance
  const currentBalance = await GetCustomerLoyaltyBalance(customerId, programId);
  const newBalance = Math.max(0, currentBalance + pointsAmount);

  const { data, error } = await supabase
    .from("loyalty_transactions")
    .insert({
      customer_id: customerId,
      program_id: programId,
      merchant_id: merchantId,
      transaction_type: "adjust",
      points_amount: pointsAmount,
      balance_after: newBalance,
      description,
      staff_id: staffId || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[AddLoyaltyPoints]", error);
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

  // Check if already enrolled (has any transaction)
  const { data: existingTx } = await supabase
    .from("loyalty_transactions")
    .select("id")
    .eq("customer_id", customerId)
    .eq("program_id", programId)
    .limit(1);

  if (existingTx && existingTx.length > 0) {
    // Already enrolled
    return { id: programId, already_enrolled: true };
  }

  // Create initial enrollment transaction (0 points)
  const { data, error } = await supabase
    .from("loyalty_transactions")
    .insert({
      customer_id: customerId,
      program_id: programId,
      merchant_id: merchantId,
      transaction_type: "earn",
      points_amount: 0,
      balance_after: 0,
      description: "Enrollment in loyalty program",
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
      .from("loyalty_transactions")
      .select("id")
      .eq("customer_id", customerId)
      .eq("program_id", program.id)
      .limit(1);

    if (!enrollmentCheck || enrollmentCheck.length === 0) {
      continue; // Customer not enrolled in this program
    }

    // Check if order meets minimum threshold
    if (
      program.min_order_to_earn &&
      orderAmount < Number(program.min_order_to_earn)
    ) {
      continue;
    }

    // Calculate points earned
    let pointsEarned = 0;
    if (program.program_type === "points") {
      pointsEarned = Math.floor(
        orderAmount * Number(program.points_per_dollar || 1)
      );
      if (program.points_per_visit) {
        pointsEarned += program.points_per_visit;
      }
    }

    if (pointsEarned === 0) continue;

    // Get current balance
    const currentBalance = await GetCustomerLoyaltyBalance(
      customerId,
      program.id
    );
    const newBalance = currentBalance + pointsEarned;

    // Create transaction
    const { data, error } = await supabase
      .from("loyalty_transactions")
      .insert({
        customer_id: customerId,
        program_id: program.id,
        merchant_id: merchantId,
        location_id: locationId,
        order_id: orderId,
        transaction_type: "earn",
        points_amount: pointsEarned,
        balance_after: newBalance,
        description: `Earned on Order #${orderId.slice(0, 8)}`,
      })
      .select()
      .single();

    if (!error && data) {
      results.push(data);

      // Check if customer earned a reward
      if (program.reward_type && program.reward_value) {
        // For points-based programs, create reward if points exceed threshold
        // This is simplified - in production you'd check the actual reward threshold
        if (newBalance >= 500) {
          // Example threshold
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
              reward_type: program.reward_type,
              reward_value: program.reward_value,
              reward_description: program.reward_description,
              status: "available",
              expires_at: program.points_expiry_days
                ? new Date(
                    Date.now() + program.points_expiry_days * 24 * 60 * 60 * 1000
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
