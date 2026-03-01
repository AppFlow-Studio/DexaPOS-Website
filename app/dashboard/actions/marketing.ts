"use server";

import { auth } from "@clerk/nextjs/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendSMS, isValidPhoneNumber } from "@/lib/messaging/twilio";
import { sendEmail, buildEmailTemplate, isValidEmail } from "@/lib/messaging/resend";
import type { Database } from "@/database.types";

type MarketingCampaign = Database["public"]["Tables"]["marketing_campaigns"]["Row"];
type MarketingRecipient = Database["public"]["Tables"]["marketing_recipients"]["Row"];

/**
 * Get all marketing campaigns for a merchant
 */
export async function GetMerchantMarketingCampaigns(
  merchantId: string,
  options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }
) {
  if (!merchantId) return [];

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.limit) {
    const offset = options?.offset ?? 0;
    query = query.range(offset, offset + options.limit - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[GetMerchantMarketingCampaigns]", error);
    return [];
  }

  return data || [];
}

/**
 * Get marketing campaign details
 */
export async function GetMarketingCampaignDetail(campaignId: string) {
  if (!campaignId) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (error) {
    console.error("[GetMarketingCampaignDetail]", error);
    return null;
  }

  return data;
}

/**
 * Get campaign recipients
 */
export async function GetMarketingCampaignRecipients(campaignId: string) {
  if (!campaignId) return [];

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("marketing_recipients")
    .select(
      `
      *,
      customer:customers(id, name, phone, email)
      `
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GetMarketingCampaignRecipients]", error);
    return [];
  }

  return data || [];
}

/**
 * Get campaign history for a customer
 */
export async function GetCustomerMarketingCampaignHistory(
  customerId: string,
  limit: number = 50
) {
  if (!customerId) return [];

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("marketing_recipients")
    .select(
      `
      *,
      campaign:marketing_campaigns(
        id,
        name,
        campaign_type,
        status,
        body,
        created_at
      )
      `
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[GetCustomerMarketingCampaignHistory]", error);
    return [];
  }

  return data || [];
}

/**
 * Create a marketing campaign
 */
export async function CreateMarketingCampaign({
  merchantId,
  name,
  campaignType,
  subject,
  body,
  audienceType,
  audienceTags,
  audienceFilter,
  scheduledFor,
  createdBy,
}: {
  merchantId: string;
  name: string;
  campaignType: "sms" | "email";
  subject?: string;
  body: string;
  audienceType?: string;
  audienceTags?: string[];
  audienceFilter?: Record<string, any>;
  scheduledFor?: string;
  createdBy?: string;
}) {
  if (!merchantId || !name || !body) return null;

  const { userId } = await auth();
  if (!userId) return { error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert({
      merchant_id: merchantId,
      name,
      campaign_type: campaignType,
      subject,
      body,
      audience_type: audienceType || "all",
      audience_tags: audienceTags,
      audience_filter: audienceFilter,
      status: "draft",
      scheduled_for: scheduledFor,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    console.error("[CreateMarketingCampaign]", error);
    return { error: error.message };
  }

  return data;
}

/**
 * Update a marketing campaign
 */
export async function UpdateMarketingCampaign({
  campaignId,
  updates,
}: {
  campaignId: string;
  updates: Partial<MarketingCampaign>;
}) {
  if (!campaignId) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("marketing_campaigns")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .select()
    .single();

  if (error) {
    console.error("[UpdateMarketingCampaign]", error);
    return null;
  }

  return data;
}

/**
 * Send a marketing campaign to all eligible recipients
 */
export async function SendCampaignNow(campaignId: string) {
  if (!campaignId) return { error: "Campaign ID required" };

  const supabase = createServiceRoleClient();

  // 1. Fetch campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    console.error("[SendCampaignNow] Campaign fetch error:", campaignError);
    return { error: "Campaign not found" };
  }

  // Validate campaign status
  if (!["draft", "scheduled"].includes(campaign.status)) {
    return { error: `Cannot send campaign with status: ${campaign.status}` };
  }

  try {
    // 2. Resolve audience - fetch eligible customers
    let query = supabase
      .from("customers")
      .select("id, email, phone, merchant_id")
      .eq("merchant_id", campaign.merchant_id)
      .eq("is_active", true);

    // Filter by opt-in status based on channel
    if (campaign.campaign_type === "sms") {
      query = query.eq("sms_opt_in", true).not("phone", "is", null);
    } else if (campaign.campaign_type === "email") {
      query = query.eq("email_opt_in", true).not("email", "is", null);
    }

    // Filter by tags if specified
    if (campaign.audience_type === "tag" && campaign.audience_tags?.length > 0) {
      // PostgreSQL array overlap check
      query = query.overlaps("tags", campaign.audience_tags);
    }

    const { data: customers, error: customersError } = await query;

    if (customersError) {
      console.error("[SendCampaignNow] Customers fetch error:", customersError);
      return { error: "Failed to fetch customers" };
    }

    if (!customers || customers.length === 0) {
      // Don't send campaign if there are no eligible recipients
      return { error: "No eligible recipients found. Make sure customers have opted in and have valid contact information." };
    }

    // 3. Create recipient rows
    const recipientInserts = customers.map((customer) => ({
      campaign_id: campaignId,
      customer_id: customer.id,
      channel: campaign.campaign_type,
      destination:
        campaign.campaign_type === "sms" ? customer.phone : customer.email,
      status: "pending",
      created_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from("marketing_recipients")
      .insert(recipientInserts);

    if (insertError) {
      console.error("[SendCampaignNow] Recipients insert error:", insertError);
      return { error: "Failed to create recipient records" };
    }

    // 4. Update campaign status to "sending"
    await supabase
      .from("marketing_campaigns")
      .update({
        status: "sending",
        total_recipients: customers.length,
      })
      .eq("id", campaignId);

    // 5. Send messages (fire-and-forget)
    (async () => {
      let delivered = 0;
      let failed = 0;

      for (const customer of customers) {
        const destination =
          campaign.campaign_type === "sms" ? customer.phone : customer.email;

        if (!destination) continue;

        let sendResult: { sid?: string; id?: string; error?: string } = {};

        try {
          if (campaign.campaign_type === "sms") {
            if (!isValidPhoneNumber(destination)) {
              sendResult = { error: "Invalid phone number" };
            } else {
              sendResult = await sendSMS(destination, campaign.body);
            }
          } else if (campaign.campaign_type === "email") {
            if (!isValidEmail(destination)) {
              sendResult = { error: "Invalid email" };
            } else {
              const { data: merchant } = await supabase
                .from("merchants")
                .select("name")
                .eq("id", campaign.merchant_id)
                .single();

              const html = buildEmailTemplate(
                merchant?.name || "Your Business",
                campaign.subject || "Message from us",
                campaign.body
              );
              sendResult = await sendEmail(
                destination,
                campaign.subject || "Message from us",
                html
              );
            }
          }

          const status = sendResult.error ? "failed" : "delivered";
          if (status === "delivered") delivered++;
          else failed++;

          // Update recipient record
          await supabase
            .from("marketing_recipients")
            .update({
              status,
              sent_at: new Date().toISOString(),
              delivered_at: status === "delivered" ? new Date().toISOString() : null,
              error_message: sendResult.error || null,
            })
            .eq("campaign_id", campaignId)
            .eq("customer_id", customer.id);
        } catch (error: any) {
          console.error(
            `[SendCampaignNow] Error sending to ${destination}:`,
            error
          );
          failed++;

          await supabase
            .from("marketing_recipients")
            .update({
              status: "failed",
              error_message: error.message,
            })
            .eq("campaign_id", campaignId)
            .eq("customer_id", customer.id);
        }
      }

      // 6. Update campaign with final stats
      await supabase
        .from("marketing_campaigns")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          total_delivered: delivered,
        })
        .eq("id", campaignId);
    })();

    return {
      message: "Campaign sending started",
      sent: customers.length,
    };
  } catch (error: any) {
    console.error("[SendCampaignNow] Unexpected error:", error);
    return { error: error.message || "Unexpected error" };
  }
}

/**
 * Send a quick one-off message to a customer
 */
export async function SendQuickMessage({
  customerId,
  merchantId,
  channel,
  destination,
  message,
}: {
  customerId: string;
  merchantId: string;
  channel: "sms" | "email";
  destination: string;
  message: string;
}) {
  if (!customerId || !merchantId || !channel || !destination || !message)
    return null;

  const { userId } = await auth();
  if (!userId) return { error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  // Create a one-time campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("marketing_campaigns")
    .insert({
      merchant_id: merchantId,
      name: `Quick ${channel.toUpperCase()} to ${destination}`,
      campaign_type: channel,
      body: message,
      status: "sending",
      created_by: userId,
    })
    .select()
    .single();

  if (campaignError || !campaign) {
    console.error("[SendQuickMessage] Campaign creation error:", campaignError);
    return { error: "Failed to create campaign" };
  }

  // Determine if message should be sent
  let sendResult: { sid?: string; id?: string; error?: string } = {};
  let status: "delivered" | "failed" = "failed";

  if (channel === "sms") {
    if (!isValidPhoneNumber(destination)) {
      sendResult = { error: "Invalid phone number" };
      console.error("[SendQuickMessage] Invalid phone number:", destination);
    } else {
      console.log("[SendQuickMessage] Sending SMS to:", destination);
      sendResult = await sendSMS(destination, message);
      console.log("[SendQuickMessage] SMS result:", sendResult);
      if (!sendResult.error) {
        status = "delivered";
      } else {
        console.error("[SendQuickMessage] SMS error:", sendResult.error);
      }
    }
  } else if (channel === "email") {
    if (!isValidEmail(destination)) {
      sendResult = { error: "Invalid email address" };
    } else {
      // Get merchant name for email template
      const { data: merchant } = await supabase
        .from("merchants")
        .select("name")
        .eq("id", merchantId)
        .single();

      const html = buildEmailTemplate(
        merchant?.name || "Your Business",
        "Message from us",
        message
      );
      sendResult = await sendEmail(destination, "Message from us", html);
      if (!sendResult.error) {
        status = "delivered";
      }
    }
  }

  // Create recipient record
  const { data: recipient, error: recipientError } = await supabase
    .from("marketing_recipients")
    .insert({
      campaign_id: campaign.id,
      customer_id: customerId,
      channel,
      destination,
      status,
      sent_at: new Date().toISOString(),
      delivered_at: status === "delivered" ? new Date().toISOString() : null,
      error_message: sendResult.error || null,
    })
    .select()
    .single();

  if (recipientError) {
    console.error("[SendQuickMessage] Recipient error:", recipientError);
    return { error: "Failed to create recipient record" };
  }

  // Update campaign status
  await supabase
    .from("marketing_campaigns")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      total_recipients: 1,
      total_delivered: status === "delivered" ? 1 : 0,
    })
    .eq("id", campaign.id);

  return { campaign, recipient };
}

/**
 * Update customer's marketing preferences
 */
export async function UpdateCustomerMarketingPreferences({
  customerId,
  preferences,
}: {
  customerId: string;
  preferences: {
    sms_opt_in?: boolean;
    email_opt_in?: boolean;
    receipt_via_sms?: boolean;
    receipt_via_email?: boolean;
    preferred_language?: string;
  };
}) {
  if (!customerId) return null;

  const supabase = createServiceRoleClient();

  const updateData: any = { ...preferences };

  if (preferences.sms_opt_in !== undefined && preferences.sms_opt_in) {
    updateData.sms_opt_in_at = new Date().toISOString();
  }

  if (preferences.email_opt_in !== undefined && preferences.email_opt_in) {
    updateData.email_opt_in_at = new Date().toISOString();
  }

  if (
    (preferences.sms_opt_in === false || preferences.email_opt_in === false) &&
    (!preferences.sms_opt_in || !preferences.email_opt_in)
  ) {
    updateData.marketing_unsubscribed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("customers")
    .update(updateData)
    .eq("id", customerId)
    .select()
    .single();

  if (error) {
    console.error("[UpdateCustomerMarketingPreferences]", error);
    return null;
  }

  return data;
}

/**
 * Get customer's marketing preferences
 */
export async function GetCustomerMarketingPreferences(customerId: string) {
  if (!customerId) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("customers")
    .select(
      `
      id,
      phone,
      email,
      sms_opt_in,
      email_opt_in,
      receipt_via_sms,
      receipt_via_email,
      preferred_language,
      marketing_unsubscribed_at,
      sms_opt_in_at,
      email_opt_in_at
      `
    )
    .eq("id", customerId)
    .single();

  if (error) {
    console.error("[GetCustomerMarketingPreferences]", error);
    return null;
  }

  return data;
}

/**
 * Unsubscribe customer from marketing
 */
export async function UnsubscribeFromMarketing(customerId: string) {
  if (!customerId) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("customers")
    .update({
      sms_opt_in: false,
      email_opt_in: false,
      marketing_unsubscribed_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .select()
    .single();

  if (error) {
    console.error("[UnsubscribeFromMarketing]", error);
    return null;
  }

  return data;
}

/**
 * Get marketing stats for a campaign
 */
export async function GetMarketingCampaignStats(campaignId: string) {
  if (!campaignId) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select(
      `
      id,
      name,
      campaign_type,
      status,
      total_recipients,
      total_delivered,
      total_opened,
      total_clicked,
      total_bounced,
      total_unsubscribed
      `
    )
    .eq("id", campaignId)
    .single();

  if (error) {
    console.error("[GetMarketingCampaignStats]", error);
    return null;
  }

  return data;
}

/**
 * Delete a marketing campaign
 */
export async function DeleteMarketingCampaign(campaignId: string) {
  if (!campaignId) return null;

  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("marketing_campaigns")
    .delete()
    .eq("id", campaignId);

  if (error) {
    console.error("[DeleteMarketingCampaign]", error);
    return { error: error.message };
  }

  return { success: true };
}
