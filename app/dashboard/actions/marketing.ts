"use server";

import { auth } from "@clerk/nextjs/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendSMS, isValidPhoneNumber } from "@/lib/messaging/telnyx";
import { sendEmail, buildEmailTemplate, isValidEmail } from "@/lib/messaging/resend";
import { logOutboundMessage } from "@/lib/messaging/message-log";
import type { Database } from "@/database.types";

type MarketingCampaign = Database["public"]["Tables"]["marketing_campaigns"]["Row"];
type MarketingRecipient = Database["public"]["Tables"]["marketing_recipients"]["Row"];

type EligibleRow = {
  recipient_id: string;
  customer_id: string;
  destination: string;
  channel: string;
};

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
 * Create a campaign and immediately send it in a single round trip.
 */
export async function CreateAndSendCampaign({
  merchantId,
  name,
  campaignType,
  subject,
  body,
  audienceType,
  audienceTags,
  scheduledFor,
}: {
  merchantId: string;
  name: string;
  campaignType: "sms" | "email";
  subject?: string;
  body: string;
  audienceType?: string;
  audienceTags?: string[];
  scheduledFor?: string;
}) {
  if (!merchantId || !name || !body) return { error: "Missing required fields" };

  const { userId } = await auth();
  if (!userId) return { error: "Not authenticated" };

  const supabase = createServiceRoleClient();
  const sendNow = !scheduledFor;

  // 1. Create the campaign as draft
  const { data: campaign, error: createError } = await supabase
    .from("marketing_campaigns")
    .insert({
      merchant_id: merchantId,
      name,
      campaign_type: campaignType,
      subject,
      body,
      audience_type: audienceType || "all",
      audience_tags: audienceTags,
      status: "draft",
      scheduled_for: scheduledFor,
      created_by: userId,
    })
    .select()
    .single();

  if (createError || !campaign) {
    console.error("[CreateAndSendCampaign] Create error:", createError);
    return { error: createError?.message || "Failed to create campaign" };
  }

  if (!sendNow) {
    return { campaign, sent: 0, scheduled: true };
  }

  // 2. Resolve audience + apply consent gate via hardened RPC
  const { data: eligibleRows, error: expandError } = await (supabase as any).rpc(
    "resolve_and_expand_campaign",
    { p_campaign_id: campaign.id, p_merchant_id: merchantId }
  ) as { data: EligibleRow[] | null; error: any };

  if (expandError) {
    console.error("[CreateAndSendCampaign] Expand error:", expandError);
    await supabase.from("marketing_campaigns").delete().eq("id", campaign.id);
    return { error: expandError.message };
  }

  if (!eligibleRows || eligibleRows.length === 0) {
    await supabase.from("marketing_campaigns").delete().eq("id", campaign.id);
    return { error: "No eligible recipients found. Make sure customers have opted in and have valid contact information." };
  }

  // 3. Mark campaign as sending
  await supabase
    .from("marketing_campaigns")
    .update({ status: "sending" })
    .eq("id", campaign.id);

  // 4. Fire-and-forget delivery
  (async () => {
    let merchantName = "Your Business";
    if (campaignType === "email") {
      const { data: merchant } = await supabase
        .from("merchants")
        .select("name")
        .eq("id", merchantId)
        .single();
      merchantName = merchant?.name || "Your Business";
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    for (const row of eligibleRows) {
      const { recipient_id, customer_id: cid, destination, channel } = row;
      if (!destination) continue;

      let sendResult: { id?: string; error?: string } = {};
      try {
        if (channel === "sms") {
          sendResult = isValidPhoneNumber(destination)
            ? await sendSMS(destination, body)
            : { error: "Invalid phone number" };
        } else {
          const unsubscribeUrl = `${appUrl}/api/marketing/unsubscribe?c=${cid}`;
          const html = buildEmailTemplate(
            merchantName,
            subject || "Message from us",
            body,
            unsubscribeUrl
          );
          sendResult = isValidEmail(destination)
            ? await sendEmail(destination, subject || "Message from us", html, {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              })
            : { error: "Invalid email" };
        }
      } catch (err: any) {
        sendResult = { error: err.message };
      }

      // SMS outbound ledger row (Part C). Telnyx webhooks advance this row's
      // status by telnyx_message_id; email goes through Resend (no Telnyx ledger).
      if (channel === "sms") {
        await logOutboundMessage(supabase, {
          merchantId,
          toNumber: destination,
          body,
          telnyxMessageId: sendResult.id || null,
          customerId: cid,
          campaignId: campaign.id,
          recipientId: recipient_id,
          status: sendResult.error ? "failed" : "sent",
          errorCode: sendResult.error || null,
        });
      }

      await (supabase as any).rpc("record_marketing_result", {
        p_recipient_id: recipient_id,
        p_status: sendResult.error ? "failed" : "delivered",
        p_provider_message_id: sendResult.id || null,
        p_error: sendResult.error || null,
      });
    }

    await supabase
      .from("marketing_campaigns")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", campaign.id);
  })();

  return { campaign, sent: eligibleRows.length };
}

/**
 * Send a marketing campaign to all eligible recipients
 */
export async function SendCampaignNow(campaignId: string) {
  if (!campaignId) return { error: "Campaign ID required" };

  const supabase = createServiceRoleClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    console.error("[SendCampaignNow] Campaign fetch error:", campaignError);
    return { error: "Campaign not found" };
  }

  if (!["draft", "scheduled"].includes(campaign.status)) {
    return { error: `Cannot send campaign with status: ${campaign.status}` };
  }

  try {
    // Resolve audience + apply consent gate via hardened RPC
    const { data: eligibleRows, error: expandError } = await (supabase as any).rpc(
      "resolve_and_expand_campaign",
      { p_campaign_id: campaignId, p_merchant_id: campaign.merchant_id }
    ) as { data: EligibleRow[] | null; error: any };

    if (expandError) {
      console.error("[SendCampaignNow] Expand error:", expandError);
      return { error: expandError.message };
    }

    if (!eligibleRows || eligibleRows.length === 0) {
      return { error: "No eligible recipients found. Make sure customers have opted in and have valid contact information." };
    }

    // Mark campaign as sending
    await supabase
      .from("marketing_campaigns")
      .update({ status: "sending" })
      .eq("id", campaignId);

    // Fire-and-forget delivery
    (async () => {
      let merchantName = "Your Business";
      if (campaign.campaign_type === "email") {
        const { data: merchant } = await supabase
          .from("merchants")
          .select("name")
          .eq("id", campaign.merchant_id)
          .single();
        merchantName = merchant?.name || "Your Business";
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

      for (const row of eligibleRows) {
        const { recipient_id, customer_id: cid, destination, channel } = row;
        if (!destination) continue;

        let sendResult: { id?: string; error?: string } = {};
        try {
          if (channel === "sms") {
            sendResult = isValidPhoneNumber(destination)
              ? await sendSMS(destination, campaign.body)
              : { error: "Invalid phone number" };
          } else {
            const unsubscribeUrl = `${appUrl}/api/marketing/unsubscribe?c=${cid}`;
            const html = buildEmailTemplate(
              merchantName,
              campaign.subject || "Message from us",
              campaign.body,
              unsubscribeUrl
            );
            sendResult = isValidEmail(destination)
              ? await sendEmail(destination, campaign.subject || "Message from us", html, {
                  "List-Unsubscribe": `<${unsubscribeUrl}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                })
              : { error: "Invalid email" };
          }
        } catch (err: any) {
          sendResult = { error: err.message };
        }

        if (channel === "sms") {
          await logOutboundMessage(supabase, {
            merchantId: campaign.merchant_id,
            toNumber: destination,
            body: campaign.body,
            telnyxMessageId: sendResult.id || null,
            customerId: cid,
            campaignId,
            recipientId: recipient_id,
            status: sendResult.error ? "failed" : "sent",
            errorCode: sendResult.error || null,
          });
        }

        await (supabase as any).rpc("record_marketing_result", {
          p_recipient_id: recipient_id,
          p_status: sendResult.error ? "failed" : "delivered",
          p_provider_message_id: sendResult.id || null,
          p_error: sendResult.error || null,
        });
      }

      await supabase
        .from("marketing_campaigns")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", campaignId);
    })();

    return { message: "Campaign sending started", sent: eligibleRows.length };
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

  // Hard consent gate for quick messages
  const { data: customerConsent } = await supabase
    .from("customers")
    .select("sms_opt_in, email_opt_in, marketing_unsubscribed_at")
    .eq("id", customerId)
    .single();

  if (customerConsent?.marketing_unsubscribed_at) {
    return { error: "Customer has unsubscribed from all marketing communications" };
  }
  if (channel === "sms" && !customerConsent?.sms_opt_in) {
    return { error: "Customer has not opted in to SMS marketing" };
  }
  if (channel === "email" && !customerConsent?.email_opt_in) {
    return { error: "Customer has not opted in to email marketing" };
  }

  // Create a one-time campaign record
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

  let sendResult: { id?: string; error?: string } = {};
  let status: "delivered" | "failed" = "failed";

  if (channel === "sms") {
    if (!isValidPhoneNumber(destination)) {
      sendResult = { error: "Invalid phone number" };
    } else {
      sendResult = await sendSMS(destination, message);
      if (!sendResult.error) status = "delivered";
    }
  } else if (channel === "email") {
    if (!isValidEmail(destination)) {
      sendResult = { error: "Invalid email address" };
    } else {
      const { data: merchant } = await supabase
        .from("merchants")
        .select("name")
        .eq("id", merchantId)
        .single();

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      const unsubscribeUrl = `${appUrl}/api/marketing/unsubscribe?c=${customerId}`;
      const html = buildEmailTemplate(
        merchant?.name || "Your Business",
        "Message from us",
        message,
        unsubscribeUrl
      );
      sendResult = await sendEmail(destination, "Message from us", html, {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      });
      if (!sendResult.error) status = "delivered";
    }
  }

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

  // SMS outbound ledger row (Part C). Telnyx webhooks reconcile delivery status.
  if (channel === "sms") {
    await logOutboundMessage(supabase, {
      merchantId,
      toNumber: destination,
      body: message,
      telnyxMessageId: sendResult.id || null,
      customerId,
      campaignId: campaign.id,
      recipientId: recipient?.id ?? null,
      status: sendResult.error ? "failed" : "sent",
      errorCode: sendResult.error || null,
    });
  }

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

  // Global unsubscribe reflects whether the customer is reachable on ANY channel.
  // Both opt-ins are always sent together from the preferences form, so we only
  // act when both are present. Opting into at least one channel clears any prior
  // unsubscribe stamp; turning both off stamps a global opt-out.
  if (
    preferences.sms_opt_in !== undefined &&
    preferences.email_opt_in !== undefined
  ) {
    updateData.marketing_unsubscribed_at =
      !preferences.sms_opt_in && !preferences.email_opt_in
        ? new Date().toISOString()
        : null;
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
 * Unsubscribe customer from all marketing (stamps consent, updates recipients via RPC)
 */
export async function UnsubscribeFromMarketing({
  customerId,
  merchantId,
}: {
  customerId: string;
  merchantId: string;
}) {
  if (!customerId || !merchantId) return null;

  const supabase = createServiceRoleClient();

  const { error } = await (supabase as any).rpc("unsubscribe_customer", {
    p_customer_id: customerId,
    p_merchant_id: merchantId,
  });

  if (error) {
    console.error("[UnsubscribeFromMarketing]", error);
    return null;
  }

  return { success: true };
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
