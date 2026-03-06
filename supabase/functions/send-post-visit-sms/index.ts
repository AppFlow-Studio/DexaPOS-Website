// Edge Function: send-post-visit-sms
// Purpose: Send SMS to customers 15 minutes after order completion
// Trigger: scheduled or called via HTTP endpoint

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PostVisitSmsPayload {
  customerId: string;
  orderId: string;
  merchantId: string;
  orderAmount: number;
  restaurantName: string;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER") || "";

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  try {
    // Parse request body
    const payload: PostVisitSmsPayload = await req.json();
    const { customerId, orderId, merchantId, orderAmount, restaurantName } = payload;

    console.log(`[PostVisitSMS] Processing request for order ${orderId}`);

    // =========================================================================
    // 1. Verify customer opted in
    // =========================================================================

    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .select("id, phone, sms_opt_in")
      .eq("id", customerId)
      .single();

    if (customerError || !customerData) {
      console.error(`[PostVisitSMS] Customer not found: ${customerId}`);
      return new Response(JSON.stringify({ success: false, reason: "customer_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!customerData.sms_opt_in) {
      console.log(`[PostVisitSMS] Customer not opted in: ${customerId}`);
      return new Response(JSON.stringify({ success: true, reason: "not_opted_in" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!customerData.phone) {
      console.log(`[PostVisitSMS] No phone number for customer: ${customerId}`);
      return new Response(JSON.stringify({ success: true, reason: "no_phone" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // 2. Check minimum order amount
    // =========================================================================

    const { data: programData } = await supabase
      .from("loyalty_programs")
      .select("min_order_to_earn")
      .eq("merchant_id", merchantId)
      .eq("is_active", true)
      .limit(1)
      .single();

    const minOrderAmount = programData?.min_order_to_earn ?? 0;
    if (orderAmount < minOrderAmount) {
      console.log(
        `[PostVisitSMS] Order ${orderAmount} below minimum ${minOrderAmount}`,
      );
      return new Response(JSON.stringify({ success: true, reason: "below_min_order" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // 3. Check daily SMS rate limit
    // =========================================================================

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const { data: smsSentToday } = await supabase
      .from("customer_sms_log")
      .select("id")
      .eq("customer_id", customerId)
      .eq("merchant_id", merchantId)
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString())
      .limit(1);

    if ((smsSentToday?.length ?? 0) > 0) {
      console.log(`[PostVisitSMS] Rate limit exceeded for customer: ${customerId}`);
      return new Response(JSON.stringify({ success: true, reason: "rate_limit" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // 4. Get loyalty earnings info
    // =========================================================================

    const earningsSummary = await getLoyaltyEarnings(customerId, merchantId);

    // =========================================================================
    // 5. Build and send SMS
    // =========================================================================

    const smsMessage = buildSmsMessage(restaurantName, earningsSummary);

    const twilioResult = await sendTwilioSms(customerData.phone, smsMessage);

    if (!twilioResult.success) {
      console.error(`[PostVisitSMS] Twilio failed: ${twilioResult.error}`);
      return new Response(
        JSON.stringify({
          success: false,
          reason: "sms_failed",
          error: twilioResult.error,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // =========================================================================
    // 6. Log SMS sent
    // =========================================================================

    const { error: logError } = await supabase.from("customer_sms_log").insert({
      customer_id: customerId,
      merchant_id: merchantId,
      sms_type: "post_visit",
      phone_number: customerData.phone,
      message: smsMessage,
      status: "sent",
      provider_response: twilioResult.data,
      created_at: new Date().toISOString(),
    });

    if (logError) {
      console.error(`[PostVisitSMS] Failed to log SMS: ${logError.message}`);
      // Don't fail the request if logging fails; SMS was already sent
    }

    console.log(`[PostVisitSMS] Successfully sent SMS to ${customerId}`);
    return new Response(JSON.stringify({ success: true, sms_sent: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[PostVisitSMS] Exception:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get loyalty earnings summary for the customer
 */
async function getLoyaltyEarnings(customerId: string, merchantId: string): Promise<string> {
  try {
    // Get customer's enrolled programs
    const { data: transactions } = await supabase
      .from("loyalty_transactions")
      .select("program_id")
      .eq("customer_id", customerId)
      .eq("merchant_id", merchantId)
      .limit(1);

    if (!transactions || transactions.length === 0) {
      return "no rewards today";
    }

    const programId = transactions[0].program_id;

    // Get program info
    const { data: program } = await supabase
      .from("loyalty_programs")
      .select("program_name, program_type")
      .eq("id", programId)
      .single();

    if (!program) {
      return "reward";
    }

    // Build earnings message based on program type
    switch (program.program_type) {
      case "punch_card":
        return `1 punch (on ${program.program_name})`;
      case "visits":
        return `1 visit (on ${program.program_name})`;
      case "points":
        // Estimate ~1 point per dollar
        return `points (on ${program.program_name})`;
      default:
        return `a reward (on ${program.program_name})`;
    }
  } catch (error) {
    console.error("[getLoyaltyEarnings] Error:", error);
    return "a reward";
  }
}

/**
 * Build friendly post-visit SMS message
 */
function buildSmsMessage(restaurantName: string, earnings: string): string {
  return `Thanks for visiting ${restaurantName}! ☕
You earned ${earnings} today.
Reply STOP to opt out.`;
}

/**
 * Send SMS via Twilio
 */
async function sendTwilioSms(
  phoneNumber: string,
  message: string,
): Promise<{
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}> {
  try {
    // Format phone number for Twilio (ensure it starts with +)
    const formattedPhone = phoneNumber.startsWith("+")
      ? phoneNumber
      : `+1${phoneNumber.replace(/\D/g, "")}`;

    const credentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: twilioPhoneNumber,
          To: formattedPhone,
          Body: message,
        }).toString(),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: (data as Record<string, unknown>).message as string ||
          "Failed to send SMS",
      };
    }

    return {
      success: true,
      data: data as Record<string, unknown>,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Twilio request failed",
    };
  }
}
