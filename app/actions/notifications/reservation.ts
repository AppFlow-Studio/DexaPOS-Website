"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendSMS } from "@/lib/messaging/telnyx";
import { logOutboundMessage } from "@/lib/messaging/message-log";
import { sendEmail, isValidEmail } from "@/lib/messaging/resend";
import {
  renderReservationConfirmedHtml,
  renderReservationConfirmedText,
  renderReservationCancelledHtml,
  renderReservationCancelledText,
  type ReservationContext,
} from "@/lib/messaging/reservation-templates";
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

async function loadReservation(reservationId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, merchant_id, location_id, party_name, party_size, phone, email, reservation_date, reservation_time, confirmation_number, special_requests, cancellation_reason"
    )
    .eq("id", reservationId)
    .maybeSingle();
  return { data, error };
}

/** Notify guest that their reservation is confirmed. Best-effort. */
export async function notifyReservationConfirmed(
  reservationId: string
): Promise<NotifyResult> {
  const result: NotifyResult = { smsSent: false, emailSent: false, errors: [] };
  try {
    const supabase = createServiceRoleClient();
    const { data: entry, error } = await loadReservation(reservationId);
    if (error || !entry) {
      result.errors.push("Reservation not found");
      return result;
    }

    const brand = await loadBranding(
      supabase,
      entry.merchant_id,
      entry.location_id
    );

    const ctx: ReservationContext = {
      partyName: entry.party_name,
      partySize: entry.party_size,
      reservationDate: entry.reservation_date,
      reservationTime: entry.reservation_time,
      confirmationNumber: entry.confirmation_number,
      specialRequests: entry.special_requests,
    };

    if (entry.phone) {
      const text = renderReservationConfirmedText(brand, ctx);
      const smsResult = await sendSMS(entry.phone, text);
      await logOutboundMessage(supabase, {
        merchantId: entry.merchant_id,
        toNumber: entry.phone,
        body: text,
        telnyxMessageId: "error" in smsResult ? null : smsResult.id,
        status: "error" in smsResult ? "failed" : "sent",
        errorCode: "error" in smsResult ? smsResult.error : null,
      });
      if ("error" in smsResult) {
        result.errors.push(`SMS: ${smsResult.error}`);
      } else {
        result.smsSent = true;
      }
    }

    if (entry.email && isValidEmail(entry.email)) {
      const html = renderReservationConfirmedHtml(brand, ctx);
      const emailResult = await sendEmail(
        entry.email,
        `Reservation confirmed · ${brand.businessName}`,
        html
      );
      if ("error" in emailResult) {
        result.errors.push(`Email: ${emailResult.error}`);
      } else {
        result.emailSent = true;
      }
    }

    if (result.smsSent || result.emailSent) {
      await supabase
        .from("reservations")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", reservationId);
    }

    return result;
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? "Unknown error";
    result.errors.push(msg);
    return result;
  }
}

/** Notify guest that their reservation has been cancelled. Best-effort. */
export async function notifyReservationCancelled(
  reservationId: string,
  cancellationReason?: string | null
): Promise<NotifyResult> {
  const result: NotifyResult = { smsSent: false, emailSent: false, errors: [] };
  try {
    const supabase = createServiceRoleClient();
    const { data: entry, error } = await loadReservation(reservationId);
    if (error || !entry) {
      result.errors.push("Reservation not found");
      return result;
    }

    const brand = await loadBranding(
      supabase,
      entry.merchant_id,
      entry.location_id
    );

    const ctx: ReservationContext = {
      partyName: entry.party_name,
      partySize: entry.party_size,
      reservationDate: entry.reservation_date,
      reservationTime: entry.reservation_time,
      confirmationNumber: entry.confirmation_number,
      cancellationReason: cancellationReason ?? entry.cancellation_reason,
    };

    if (entry.phone) {
      const text = renderReservationCancelledText(brand, ctx);
      const smsResult = await sendSMS(entry.phone, text);
      await logOutboundMessage(supabase, {
        merchantId: entry.merchant_id,
        toNumber: entry.phone,
        body: text,
        telnyxMessageId: "error" in smsResult ? null : smsResult.id,
        status: "error" in smsResult ? "failed" : "sent",
        errorCode: "error" in smsResult ? smsResult.error : null,
      });
      if ("error" in smsResult) {
        result.errors.push(`SMS: ${smsResult.error}`);
      } else {
        result.smsSent = true;
      }
    }

    if (entry.email && isValidEmail(entry.email)) {
      const html = renderReservationCancelledHtml(brand, ctx);
      const emailResult = await sendEmail(
        entry.email,
        `Reservation cancelled · ${brand.businessName}`,
        html
      );
      if ("error" in emailResult) {
        result.errors.push(`Email: ${emailResult.error}`);
      } else {
        result.emailSent = true;
      }
    }

    return result;
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? "Unknown error";
    result.errors.push(msg);
    return result;
  }
}
