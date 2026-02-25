"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/types/database.types";

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
  createdBy: string;
}) {
  if (!merchantId || !name || !body) return null;

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
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) {
    console.error("[CreateMarketingCampaign]", error);
    return null;
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
 * Send a quick one-off message to a customer
 */
export async function SendQuickMessage({
  customerId,
  merchantId,
  channel,
  destination,
  message,
  createdBy,
}: {
  customerId: string;
  merchantId: string;
  channel: "sms" | "email";
  destination: string;
  message: string;
  createdBy: string;
}) {
  if (!customerId || !merchantId || !channel || !destination || !message)
    return null;

  const supabase = createServiceRoleClient();

  // Create a one-time campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("marketing_campaigns")
    .insert({
      merchant_id: merchantId,
      name: `Quick ${channel.toUpperCase()} to ${destination}`,
      campaign_type: channel,
      body: message,
      status: "sent",
      sent_at: new Date().toISOString(),
      created_by: createdBy,
    })
    .select()
    .single();

  if (campaignError || !campaign) {
    console.error("[SendQuickMessage] Campaign creation error:", campaignError);
    return null;
  }

  // Create recipient record
  const { data: recipient, error: recipientError } = await supabase
    .from("marketing_recipients")
    .insert({
      campaign_id: campaign.id,
      customer_id: customerId,
      channel,
      destination,
      status: "delivered",
      sent_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (recipientError) {
    console.error("[SendQuickMessage] Recipient error:", recipientError);
    return null;
  }

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
