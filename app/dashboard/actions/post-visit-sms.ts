"use server";

// ============================================================================
// Post-Visit SMS Server Action
// Description: Send SMS to customers after order completion (opt-in only)
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CheckSmsRateLimit, LogSmsSent, GetCustomerSmsOptIn } from "./loyalty-receipt";
import { SendSms } from "@/lib/messaging/twilio";

// ============================================================================
// Types
// ============================================================================

export interface PostVisitSmsRequest {
  customerId: string;
  orderId: string;
  merchantId: string;
  orderAmount: number;
  restaurantName: string;
}

export interface PostVisitSmsResponse {
  success: boolean;
  message: string;
  sms_sent?: boolean;
  reason?: string;
}

// ============================================================================
// Get Order Loyalty Earnings
// ============================================================================

/**
 * Calculate loyalty earnings from an order
 */
async function getOrderLoyaltyEarnings(
  orderId: string,
  customerId: string,
  merchantId: string,
): Promise<{
  programs: Array<{
    program_name: string;
    program_type: string;
    earning_description: string;
    points_earned?: number;
    progress?: {
      current: number;
      threshold: number;
      remaining: number;
    };
  }>;
  totalEarnings: string;
}> {
  const supabase = createServerSupabaseClient();

  try {
    // Get merchant's loyalty programs
    const { data: programs } = await supabase
      .from("loyalty_programs")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("is_active", true);

    if (!programs || programs.length === 0) {
      return { programs: [], totalEarnings: "no loyalty earnings" };
    }

    // Check which programs the customer is enrolled in
    const { data: enrollments } = await supabase
      .from("loyalty_transactions")
      .select("program_id")
      .eq("customer_id", customerId)
      .eq("merchant_id", merchantId);

    const enrolledProgramIds = new Set(enrollments?.map((e) => e.program_id) || []);

    const programEarnings = [];

    // For now, create simple earning descriptions
    // This would integrate with actual earning calculation logic
    for (const program of programs) {
      if (!enrolledProgramIds.has(program.id)) continue;

      let description = "";
      const emojiMap: Record<string, string> = {
        points: "⭐",
        visits: "☕",
        punch_card: "🎫",
        spend_based: "💰",
      };

      const emoji = emojiMap[program.program_type] || "🎁";

      switch (program.program_type) {
        case "punch_card":
          description = `${emoji} ${program.program_name}: +1 punch`;
          break;
        case "points":
          // Rough estimate: 1 point per dollar
          const pointsEarned = Math.floor(orderId.length); // Placeholder
          description = `${emoji} ${program.program_name}: +${pointsEarned} pts`;
          break;
        case "visits":
          description = `${emoji} ${program.program_name}: +1 visit`;
          break;
        default:
          description = `${emoji} ${program.program_name}: Earn a reward`;
      }

      programEarnings.push({
        program_name: program.program_name,
        program_type: program.program_type,
        earning_description: description,
      });
    }

    return {
      programs: programEarnings,
      totalEarnings:
        programEarnings.length > 0
          ? programEarnings.map((p) => p.earning_description).join(", ")
          : "no loyalty earnings",
    };
  } catch (error) {
    console.error("[getOrderLoyaltyEarnings] Exception:", error);
    return { programs: [], totalEarnings: "error calculating earnings" };
  }
}

// ============================================================================
// Send Post-Visit SMS
// ============================================================================

/**
 * Send post-visit SMS to customer after order completion
 * Called by Edge Function after ~15 minute delay
 */
export async function SendPostVisitSms(
  request: PostVisitSmsRequest,
): Promise<PostVisitSmsResponse> {
  const { customerId, orderId, merchantId, orderAmount, restaurantName } = request;

  try {
    // 1. Check if customer opted in and has phone
    const optInStatus = await GetCustomerSmsOptIn(customerId);
    if (!optInStatus.is_opted_in) {
      return {
        success: true,
        message: "Customer not opted in for SMS",
        sms_sent: false,
        reason: "not_opted_in",
      };
    }

    if (!optInStatus.has_phone || !optInStatus.phone) {
      return {
        success: true,
        message: "Customer phone number not available",
        sms_sent: false,
        reason: "no_phone",
      };
    }

    // 2. Check if customer has min_order_to_earn threshold met
    const supabase = createServerSupabaseClient();
    const { data: program } = await supabase
      .from("loyalty_programs")
      .select("min_order_to_earn")
      .eq("merchant_id", merchantId)
      .eq("is_active", true)
      .limit(1)
      .single();

    const minOrderAmount = program?.min_order_to_earn ?? 0;
    if (orderAmount < minOrderAmount) {
      return {
        success: true,
        message: "Order amount below minimum to earn rewards",
        sms_sent: false,
        reason: "below_min_order",
      };
    }

    // 3. Check daily SMS rate limit
    const rateLimit = await CheckSmsRateLimit(customerId, merchantId);
    if (!rateLimit.can_send) {
      return {
        success: true,
        message: "Customer has already received SMS today",
        sms_sent: false,
        reason: "rate_limit_exceeded",
      };
    }

    // 4. Get loyalty earnings from this order
    const earnings = await getOrderLoyaltyEarnings(orderId, customerId, merchantId);

    // 5. Build SMS message
    const smsMessage = buildPostVisitSmsMessage(restaurantName, earnings.totalEarnings);

    // 6. Send SMS via Twilio
    const smsResult = await SendSms(optInStatus.phone, smsMessage);

    if (!smsResult.success) {
      console.error("[SendPostVisitSms] Failed to send SMS:", smsResult.error);
      return {
        success: false,
        message: "Failed to send SMS",
        sms_sent: false,
        reason: "sms_failed",
      };
    }

    // 7. Log SMS sent for rate limiting and audit trail
    await LogSmsSent(customerId, merchantId, "post_visit", optInStatus.phone);

    return {
      success: true,
      message: "Post-visit SMS sent successfully",
      sms_sent: true,
    };
  } catch (error) {
    console.error("[SendPostVisitSms] Exception:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
      sms_sent: false,
    };
  }
}

// ============================================================================
// Build SMS Message
// ============================================================================

/**
 * Build a friendly post-visit SMS message
 */
function buildPostVisitSmsMessage(restaurantName: string, earnings: string): string {
  return `Thanks for visiting ${restaurantName}! ☕
You earned ${earnings}.
Reply STOP to opt out.`;
}

// ============================================================================
// Trigger Post-Visit SMS (for Edge Function)
// ============================================================================

/**
 * This function is called by a Supabase Edge Function
 * Triggered 15 minutes after order completion
 * Handles sending post-visit SMS with proper error handling
 */
export async function TriggerPostVisitSms(
  customerId: string,
  orderId: string,
  merchantId: string,
  orderAmount: number,
  restaurantName: string,
): Promise<PostVisitSmsResponse> {
  return SendPostVisitSms({
    customerId,
    orderId,
    merchantId,
    orderAmount,
    restaurantName,
  });
}
