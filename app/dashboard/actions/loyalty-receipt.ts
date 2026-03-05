"use server";

// ============================================================================
// Loyalty Receipt Integration
// Description: Server actions for loyalty information on receipts and post-visit communication
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";

// ============================================================================
// Types
// ============================================================================

export interface ReceiptLoyaltyItem {
  program_id: string;
  program_name: string;
  program_type: "points" | "visits" | "punch_card" | "spend_based";
  emoji?: string;
  points_earned?: number;
  current_balance?: number;
  lifetime_earned?: number;
  progress_toward_reward?: {
    amount: number;
    threshold: number;
    points_remaining: number;
  };
  rewards_available?: number;
  message?: string;
}

export interface ReceiptLoyaltySummary {
  customer_id?: string;
  programs: ReceiptLoyaltyItem[];
  has_available_rewards: boolean;
  available_rewards_count: number;
  call_to_action?: string;
}

// ============================================================================
// Get Loyalty Data for Receipt
// ============================================================================

/**
 * Get loyalty program information for a customer to display on receipt
 * Shows current balance, progress toward rewards, and any available rewards
 */
export async function GetReceiptLoyaltyData(
  customerId: string,
  merchantId: string,
): Promise<ReceiptLoyaltySummary> {
  const supabase = createServerSupabaseClient();

  try {
    // Get all active loyalty programs for the merchant
    const { data: programs, error: programsError } = await supabase
      .from("loyalty_programs")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (programsError || !programs) {
      console.error("[GetReceiptLoyaltyData] Error fetching programs:", programsError);
      return {
        programs: [],
        has_available_rewards: false,
        available_rewards_count: 0,
      };
    }

    // For each program, get customer's enrollment and balance
    const programData: ReceiptLoyaltyItem[] = [];
    let totalRewardsAvailable = 0;

    for (const program of programs) {
      // Get customer's enrollment in this program
      const { data: transactions } = await supabase
        .from("loyalty_transactions")
        .select("balance_after, transaction_type, points")
        .eq("customer_id", customerId)
        .eq("program_id", program.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const currentBalance = transactions?.balance_after ?? 0;

      // Get customer's earned rewards in this program
      const { data: rewards } = await supabase
        .from("loyalty_rewards")
        .select("id, status")
        .eq("customer_id", customerId)
        .eq("program_id", program.id)
        .eq("status", "available");

      const availableRewards = rewards?.length ?? 0;
      totalRewardsAvailable += availableRewards;

      // Calculate progress (simplified - assumes 500pt threshold)
      const pointsToThreshold = 500;
      const pointsRemaining = Math.max(0, pointsToThreshold - currentBalance);

      // Get emoji based on program type
      const emojiMap: Record<string, string> = {
        points: "⭐",
        visits: "☕",
        punch_card: "🎫",
        spend_based: "💰",
      };

      programData.push({
        program_id: program.id,
        program_name: program.program_name,
        program_type: program.program_type as any,
        emoji: emojiMap[program.program_type] || "🎁",
        points_earned: currentBalance,
        current_balance: currentBalance,
        progress_toward_reward: {
          amount: currentBalance,
          threshold: pointsToThreshold,
          points_remaining: pointsRemaining,
        },
        rewards_available: availableRewards,
        message:
          pointsRemaining === 0
            ? `🎉 You have a reward available!`
            : `${pointsRemaining} ${program.program_type === "punch_card" ? "more" : "points"} to your next reward!`,
      });
    }

    return {
      programs: programData,
      has_available_rewards: totalRewardsAvailable > 0,
      available_rewards_count: totalRewardsAvailable,
      call_to_action:
        programData.length === 0
          ? "Earn rewards → Ask your server to enroll!"
          : undefined,
    };
  } catch (error) {
    console.error("[GetReceiptLoyaltyData] Exception:", error);
    return {
      programs: [],
      has_available_rewards: false,
      available_rewards_count: 0,
    };
  }
}

// ============================================================================
// Get Customer SMS Opt-In Status
// ============================================================================

/**
 * Check if customer has opted in for post-visit SMS and has a valid phone number
 */
export async function GetCustomerSmsOptIn(customerId: string) {
  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("customers")
      .select("id, phone, sms_opt_in")
      .eq("id", customerId)
      .single();

    if (error || !data) {
      console.error("[GetCustomerSmsOptIn] Error:", error);
      return {
        is_opted_in: false,
        has_phone: false,
        phone: null,
      };
    }

    return {
      is_opted_in: data.sms_opt_in === true,
      has_phone: !!data.phone,
      phone: data.phone,
    };
  } catch (error) {
    console.error("[GetCustomerSmsOptIn] Exception:", error);
    return {
      is_opted_in: false,
      has_phone: false,
      phone: null,
    };
  }
}

// ============================================================================
// Check Daily SMS Rate Limit
// ============================================================================

/**
 * Check if customer has already received an SMS today
 * Rate limit: Max 1 SMS per customer per day
 */
export async function CheckSmsRateLimit(customerId: string, merchantId: string) {
  const supabase = createServerSupabaseClient();

  try {
    // Get today's date range (UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const { data, error } = await supabase
      .from("customer_sms_log")
      .select("id")
      .eq("customer_id", customerId)
      .eq("merchant_id", merchantId)
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString())
      .limit(1);

    // If table doesn't exist or other error, allow sending (graceful degradation)
    if (error) {
      console.warn("[CheckSmsRateLimit] Warning:", error.message);
      return { can_send: true, messages_sent_today: 0 };
    }

    return {
      can_send: (data?.length ?? 0) === 0,
      messages_sent_today: data?.length ?? 0,
    };
  } catch (error) {
    console.warn("[CheckSmsRateLimit] Warning:", error instanceof Error ? error.message : "Unknown error");
    // If SMS log table doesn't exist, gracefully allow sending
    return { can_send: true, messages_sent_today: 0 };
  }
}

// ============================================================================
// Log SMS Sent
// ============================================================================

/**
 * Log that an SMS was sent to a customer
 * Used for rate limiting and audit trail
 */
export async function LogSmsSent(
  customerId: string,
  merchantId: string,
  smsType: "post_visit" | "post_visit_invite",
  phone: string,
) {
  const supabase = createServerSupabaseClient();

  try {
    const { error } = await supabase.from("customer_sms_log").insert({
      customer_id: customerId,
      merchant_id: merchantId,
      sms_type: smsType,
      phone_number: phone,
      created_at: new Date().toISOString(),
    });

    if (error) {
      // If table doesn't exist, silently ignore (graceful degradation)
      console.warn("[LogSmsSent] Warning:", error.message);
    }

    return { success: true }; // Always return success even if logging fails
  } catch (error) {
    console.warn("[LogSmsSent] Warning:", error instanceof Error ? error.message : "Unknown error");
    return { success: true }; // Always return success - logging failure is non-critical
  }
}
