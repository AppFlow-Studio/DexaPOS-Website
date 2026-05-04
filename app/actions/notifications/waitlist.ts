"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendSMS } from "@/lib/messaging/telnyx";
import { sendEmail, isValidEmail } from "@/lib/messaging/resend";
import {
  renderWaitlistAddedHtml,
  renderWaitlistAddedText,
} from "@/lib/messaging/waitlist-templates";
import type { BrandedEmailContext } from "@/lib/messaging/notification-shared";

interface NotifyResult {
  smsSent: boolean;
  emailSent: boolean;
  errors: string[];
}

async function loadBranding(
  supabase: ReturnType<typeof createServiceRoleClient>,
  merchantId: string,
  locationId: string
): Promise<BrandedEmailContext> {
  const [{ data: location }, { data: merchant }] = await Promise.all([
    supabase
      .from("locations")
      .select("name, address_line1, address_line2, city, state, postal_code, phone")
      .eq("id", locationId)
      .maybeSingle(),
    supabase
      .from("merchants")
      .select("name, clerk_org_id, organizations(imageURL)")
      .eq("id", merchantId)
      .maybeSingle(),
  ]);

  const businessName = location?.name || merchant?.name || "Restaurant";
  const addressParts = [
    location?.address_line1,
    location?.address_line2,
    [location?.city, location?.state].filter(Boolean).join(", "),
    location?.postal_code,
  ].filter(Boolean);
  const address = addressParts.join(" · ");

  let logoUrl: string | null = null;
  const orgs = (merchant as { organizations?: { imageURL?: string | null } | { imageURL?: string | null }[] | null } | null)?.organizations;
  if (orgs) {
    const record = Array.isArray(orgs) ? orgs[0] : orgs;
    logoUrl = record?.imageURL ?? null;
  }

  return {
    businessName,
    address: address || null,
    phone: location?.phone ?? null,
    logoUrl,
  };
}

/**
 * Notify a waitlist guest that they've been added.
 * Sends SMS if phone present, email if email present. Best-effort —
 * never throws; updates waitlist tracking columns on success.
 */
export async function notifyWaitlistAdded(
  waitlistId: string
): Promise<NotifyResult> {
  const result: NotifyResult = { smsSent: false, emailSent: false, errors: [] };
  try {
    const supabase = createServiceRoleClient();
    const { data: entry, error } = await supabase
      .from("waitlist")
      .select(
        "id, merchant_id, location_id, party_name, party_size, phone, email, position_in_queue, quoted_wait_minutes"
      )
      .eq("id", waitlistId)
      .maybeSingle();
    if (error || !entry) {
      result.errors.push("Waitlist entry not found");
      return result;
    }

    const brand = await loadBranding(
      supabase,
      entry.merchant_id,
      entry.location_id
    );

    const ctx = {
      partyName: entry.party_name,
      partySize: entry.party_size,
      position: entry.position_in_queue ?? null,
      quotedWaitMinutes: entry.quoted_wait_minutes ?? null,
    };

    let lastNotificationType: "sms" | "email" | null = null;

    if (entry.phone) {
      const text = renderWaitlistAddedText(brand, ctx);
      const smsResult = await sendSMS(entry.phone, text);
      if ("error" in smsResult) {
        result.errors.push(`SMS: ${smsResult.error}`);
      } else {
        result.smsSent = true;
        lastNotificationType = "sms";
      }
    }

    if (entry.email && isValidEmail(entry.email)) {
      const html = renderWaitlistAddedHtml(brand, ctx);
      const emailResult = await sendEmail(
        entry.email,
        `You're on the waitlist · ${brand.businessName}`,
        html
      );
      if ("error" in emailResult) {
        result.errors.push(`Email: ${emailResult.error}`);
      } else {
        result.emailSent = true;
        lastNotificationType = "email";
      }
    }

    if (result.smsSent || result.emailSent) {
      const { data: current } = await supabase
        .from("waitlist")
        .select("notification_count, notification_failures")
        .eq("id", waitlistId)
        .maybeSingle();
      await supabase
        .from("waitlist")
        .update({
          notification_count: (current?.notification_count ?? 0) + 1,
          notification_failures:
            (current?.notification_failures ?? 0) + result.errors.length,
          last_notification_type: lastNotificationType,
          notified_at: new Date().toISOString(),
        })
        .eq("id", waitlistId);
    } else if (result.errors.length > 0) {
      const { data: current } = await supabase
        .from("waitlist")
        .select("notification_failures")
        .eq("id", waitlistId)
        .maybeSingle();
      await supabase
        .from("waitlist")
        .update({
          notification_failures:
            (current?.notification_failures ?? 0) + result.errors.length,
        })
        .eq("id", waitlistId);
    }

    return result;
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? "Unknown error";
    result.errors.push(msg);
    return result;
  }
}
