import "server-only";

import { logOutboundMessage } from "@/lib/messaging/message-log";
import { createAppNotification } from "@/lib/notifications/app-notifications";
import { isValidEmail, sendEmail } from "@/lib/messaging/resend";
import {
  renderReservationCancelledHtml,
  renderReservationCancelledText,
  renderReservationConfirmedHtml,
  renderReservationConfirmedText,
  renderReservationDeclinedHtml,
  renderReservationDeclinedText,
  renderReservationRequestedHtml,
  renderReservationRequestedText,
  type ReservationDeclinedContext,
  renderReservationMerchantAlertHtml,
  renderReservationMerchantCancelledHtml,
  type MerchantReservationAlertContext,
  type ReservationContext,
} from "@/lib/messaging/reservation-templates";
import type { BrandedEmailContext } from "@/lib/messaging/notification-shared";
import { sendSMS } from "@/lib/messaging/telnyx";
import { sitePublicUrl } from "@/lib/site-builder/public-url";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Telling people about a website booking.
 *
 * **Store first, notify second, and never the other way round.** Every function
 * here is called only after `create_public_reservation` or
 * `cancel_public_reservation` has already committed, and none of them can fail
 * the request that triggered them — a Resend outage must not turn a stored
 * booking into an error page for someone who now has a table. That is why the
 * callers invoke these through `after()` and why every path below swallows its
 * own errors into a result object rather than throwing.
 *
 * **Why not the `notify-reservation-guest` edge function**, which the plan
 * originally named. That function is `verify_jwt = true` and reads the
 * reservation through an RLS-scoped *user* client — it is built for a host
 * tapping a button in the dashboard, and there is no user session anywhere in a
 * public booking. Rather than punch an anon hole through it, the website path
 * uses the same service-role Telnyx and Resend helpers that
 * `app/actions/notifications/reservation.ts` already uses for in-app
 * notifications. One provider, one template file, two entry points.
 */

export interface ReservationNotifyResult {
  guestSms: boolean;
  guestEmail: boolean;
  merchantEmails: number;
  errors: string[];
}

function emptyResult(): ReservationNotifyResult {
  return { guestSms: false, guestEmail: false, merchantEmails: 0, errors: [] };
}

/** The columns every notification needs, in one place so the two paths agree. */
const RESERVATION_COLUMNS =
  "id, merchant_id, location_id, party_name, party_size, phone, email, " +
  "reservation_date, reservation_time, confirmation_number, manage_token, " +
  "special_requests, occasion_tags, dietary_tags, sms_opt_in, source, " +
  // `status` drives which template pair a website booking gets: a manual-review
  // restaurant stores `pending`, and confirming that guest would be a lie.
  "status, cancellation_reason";

type Supabase = ReturnType<typeof createServiceRoleClient>;

interface LoadedReservation {
  reservation: {
    id: string;
    merchant_id: string;
    location_id: string;
    party_name: string;
    party_size: number;
    phone: string | null;
    email: string | null;
    reservation_date: string;
    reservation_time: string;
    confirmation_number: string | null;
    manage_token: string | null;
    special_requests: string | null;
    occasion_tags: string[] | null;
    dietary_tags: string[] | null;
    sms_opt_in: boolean | null;
    source: string | null;
    /** `pending` on a manual-review booking. Decides which template pair sends. */
    status: string | null;
    cancellation_reason: string | null;
  };
  brand: BrandedEmailContext;
  locationName: string | null;
  notifyEmails: string[];
}

/**
 * Everything a notification needs, in three round trips.
 *
 * The location and merchant reads are parallel because neither depends on the
 * other and this runs after a response has already been sent — the guest is not
 * waiting, but the platform still is.
 */
async function load(
  supabase: Supabase,
  reservationId: string,
): Promise<LoadedReservation | null> {
  const { data: reservation } = await supabase
    .from("reservations")
    .select(RESERVATION_COLUMNS)
    .eq("id", reservationId)
    .maybeSingle();

  if (!reservation) return null;
  const row = reservation as unknown as LoadedReservation["reservation"];

  const [{ data: location }, { data: merchant }, { data: settings }] = await Promise.all([
    supabase
      .from("locations")
      .select("name, address_line1, address_line2, city, state, postal_code, phone")
      .eq("id", row.location_id)
      .maybeSingle(),
    supabase
      .from("merchants")
      .select("name, organizations(imageURL)")
      .eq("id", row.merchant_id)
      .maybeSingle(),
    supabase
      .from("reservation_settings")
      .select("notify_emails")
      .eq("location_id", row.location_id)
      .maybeSingle(),
  ]);

  const addressParts = [
    location?.address_line1,
    location?.address_line2,
    [location?.city, location?.state].filter(Boolean).join(", "),
    location?.postal_code,
  ].filter(Boolean);

  // `organizations` comes back as an object or a one-element array depending on
  // how PostgREST resolves the embed, and both shapes are legal. Normalising
  // here rather than trusting one is what stops the logo silently vanishing.
  const orgs = (
    merchant as { organizations?: { imageURL?: string | null } | { imageURL?: string | null }[] | null } | null
  )?.organizations;
  const org = Array.isArray(orgs) ? orgs[0] : orgs;

  return {
    reservation: row,
    brand: {
      businessName: location?.name || merchant?.name || "Restaurant",
      address: addressParts.join(" · ") || null,
      phone: location?.phone ?? null,
      logoUrl: org?.imageURL ?? null,
    },
    locationName: location?.name ?? null,
    notifyEmails: dedupeEmails((settings?.notify_emails as string[] | null) ?? []),
  };
}

/**
 * Send an email and leave a durable trace of what happened.
 *
 * **Why this wrapper exists.** For weeks not a single confirmation email was
 * delivered — the local `RESEND_API_KEY` was invalid — and the only evidence
 * anywhere was a line in a dev-server log that nobody was reading. SMS sends
 * were already written to `message_log`; email sends were not, though
 * `logOutboundMessage` has taken a `channel` all along. So the one channel that
 * was failing was the one channel with no record.
 *
 * `message_log.channel` is a plain text column with no CHECK, and `to_number`
 * is text, so an address goes in as-is. No migration is involved.
 *
 * Logging never fails the send: `logOutboundMessage` swallows its own errors,
 * and this runs inside `after()` where nothing is waiting on it anyway.
 */
async function sendAndLogEmail(
  supabase: Supabase,
  merchantId: string,
  to: string | string[],
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const sent = await sendEmail(to, subject, html);
  const failed = "error" in sent;

  // One row per recipient. A merchant alert to three addresses that bounced for
  // one of them should not read as a single ambiguous failure.
  //
  // The subject, not the HTML: the ledger is there to answer "did this reach
  // them, and if not why", and a rendered branded email would bloat every row
  // for content the template file already documents.
  for (const address of Array.isArray(to) ? to : [to]) {
    await logOutboundMessage(supabase, {
      merchantId,
      toNumber: address,
      body: subject,
      channel: "email",
      status: failed ? "failed" : "sent",
      errorCode: failed ? sent.error : null,
    });
  }

  return failed ? { ok: false, error: sent.error } : { ok: true };
}

/**
 * A merchant typing the same address twice — or the same address in two cases —
 * should not send two emails, and `Resend` will happily deliver both.
 */
function dedupeEmails(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const email = (raw ?? "").trim();
    if (!email || !isValidEmail(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/**
 * The guest's own link to their booking.
 *
 * Built from the site's subdomain rather than `/sites/{slug}` for the same
 * reason `sitePublicUrl` exists: the subdomain is the address the merchant
 * chose, and it is the one that still works if the storefront slug is ever
 * renamed. Returns null when the site has no subdomain — a merchant can reach
 * `native` mode before claiming an address, and a link to nowhere in a
 * confirmation email is worse than a confirmation with no link.
 */
async function resolveManageUrl(
  supabase: Supabase,
  siteId: string,
  manageToken: string | null,
): Promise<string | null> {
  if (!manageToken) return null;

  const { data: site } = await supabase
    .from("merchant_sites")
    .select("subdomain")
    .eq("id", siteId)
    .maybeSingle();

  const subdomain = (site?.subdomain ?? "").trim();
  if (!subdomain) return null;

  return sitePublicUrl(subdomain, `r/${manageToken}`);
}

/**
 * Where a merchant clicks through to.
 *
 * `NEXT_PUBLIC_APP_URL` only, deliberately — never `resolveAppUrl()`'s header
 * fallback. This runs inside a request to the *guest's* brand subdomain, so the
 * fallback would build `https://joes-diner.dexaposai.com/dashboard/reservations`
 * and hand every member of staff a dead link.
 */
function dashboardReservationsUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  return base ? `${base}/dashboard/reservations` : null;
}

/** Best-effort audit row, written as the platform rather than as a user. */
async function logBookingAudit(
  supabase: Supabase,
  loaded: LoadedReservation,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { reservation } = loaded;
  try {
    await supabase.rpc("log_audit_event", {
      p_merchant_id: reservation.merchant_id,
      p_location_id: reservation.location_id,
      // There is no Clerk user behind a public booking, and inventing one would
      // make the log lie about who acted. The actor is the website itself.
      p_actor_user_id: null,
      p_actor_name: "Website guest",
      p_actor_role: null,
      p_action: action,
      // "website", matching every other action this sprint logs, so a merchant
      // filtering their audit log by website sees bookings alongside the page
      // edits that produced the booking page.
      p_action_category: "website",
      p_severity: "info",
      p_resource_type: "reservation",
      p_resource_id: reservation.id,
      p_resource_name: reservation.confirmation_number ?? reservation.party_name,
      p_changes: null,
      p_metadata: metadata,
      p_pii_access_type: null,
    } as never);
  } catch (err) {
    console.error("[site-reservations] audit log failed:", err);
  }
}

/**
 * The guest's confirmation, plus the merchant's alert.
 *
 * `siteId` is a parameter rather than something read back off the reservation
 * because a reservation row does not record which site booked it — and should
 * not: the booking belongs to the location, not to a web page. The route
 * already validated that this site owns this location, so passing it through is
 * both correct and free.
 */
export async function notifyWebsiteReservationBooked({
  reservationId,
  siteId,
}: {
  reservationId: string;
  siteId: string;
}): Promise<ReservationNotifyResult> {
  const result = emptyResult();

  try {
    const supabase = createServiceRoleClient();
    const loaded = await load(supabase, reservationId);
    if (!loaded) {
      result.errors.push("Reservation not found");
      return result;
    }

    const { reservation, brand } = loaded;
    const manageUrl = await resolveManageUrl(supabase, siteId, reservation.manage_token);

    const ctx: ReservationContext = {
      partyName: reservation.party_name,
      partySize: reservation.party_size,
      reservationDate: reservation.reservation_date,
      reservationTime: reservation.reservation_time,
      confirmationNumber: reservation.confirmation_number,
      specialRequests: reservation.special_requests,
      manageUrl,
    };

    /*
      Which pair the guest gets, decided by the STORED status.

      A manual-review restaurant stores `pending`, and sending the confirmed
      pair to that guest would be the exact lie the whole feature exists to
      avoid — they were just told on screen that nothing is confirmed. Read off
      the row rather than the site's approval mode, because a merchant can flip
      that setting between the booking and this notification running in
      `after()`.

      Anything unrecognised falls to confirmed, matching the rule the SQL and
      `resolveReservationApproval` both apply.
    */
    const requested = reservation.status === "pending";

    // ── The guest ────────────────────────────────────────────────────────────
    //
    // SMS is gated on the consent actually given at checkout. The box is
    // pre-ticked and the column defaults true, so this almost always sends —
    // but a guest who cleared it asked not to be texted, and honouring that is
    // the entire reason the column exists.
    if (reservation.phone && reservation.sms_opt_in !== false) {
      const text = requested
        ? renderReservationRequestedText(brand, ctx)
        : renderReservationConfirmedText(brand, ctx);
      const sms = await sendSMS(reservation.phone, text);
      await logOutboundMessage(supabase, {
        merchantId: reservation.merchant_id,
        toNumber: reservation.phone,
        body: text,
        telnyxMessageId: "error" in sms ? null : sms.id,
        status: "error" in sms ? "failed" : "sent",
        errorCode: "error" in sms ? sms.error : null,
      });
      if ("error" in sms) result.errors.push(`SMS: ${sms.error}`);
      else result.guestSms = true;
    }

    if (reservation.email && isValidEmail(reservation.email)) {
      const sent = await sendAndLogEmail(
        supabase,
        reservation.merchant_id,
        reservation.email,
        requested
          ? `Booking request sent · ${brand.businessName}`
          : `Reservation confirmed · ${brand.businessName}`,
        requested
          ? renderReservationRequestedHtml(brand, ctx)
          : renderReservationConfirmedHtml(brand, ctx),
      );
      if (!sent.ok) result.errors.push(`Email: ${sent.error}`);
      else result.guestEmail = true;
    }

    /*
      ── The merchant, in the dashboard ──────────────────────────────────────

      **The only alert channel that actually works.** The email below has never
      fired for anyone: `reservation_settings.notify_emails` is empty on every
      location we have looked at, and the Resend key is invalid. So a merchant
      in manual review — where a guest is genuinely waiting on them — would
      otherwise learn about it only by opening the dashboard and looking.

      `app_notifications` drives the bell that is already mounted in the
      dashboard header, with a realtime INSERT subscription and per-user read
      state. It does not touch Resend.

      Emitted here rather than in the book route because this function is
      already called only for a genuinely new booking — the route guards it
      behind `!booked.already_booked` — so a double submit cannot tell a
      restaurant twice.
    */
    const branchLabel = loaded.locationName ?? brand.businessName;
    const notification = await createAppNotification({
      audience: "merchant",
      merchantId: reservation.merchant_id,
      notificationType: requested
        ? "website_reservation_requested"
        : "website_reservation_created",
      // A confirmed booking is news; a request is a task. Same channel,
      // different sentence, because they need different reactions.
      title: requested
        ? `Booking request — ${branchLabel}`
        : `New website booking — ${branchLabel}`,
      body: `${reservation.party_name}, party of ${reservation.party_size}, ${reservation.reservation_date}${
        reservation.reservation_time ? ` at ${String(reservation.reservation_time).slice(0, 5)}` : ""
      }${requested ? " — waiting for your answer" : ""}`,
      href: "/dashboard/reservations",
    });
    if (notification.error) result.errors.push(`Bell: ${notification.error}`);

    // ── The merchant, by email ───────────────────────────────────────────────
    if (loaded.notifyEmails.length > 0) {
      const merchantCtx: MerchantReservationAlertContext = {
        ...ctx,
        // The merchant sees the real contact details. They are the ones who
        // have to ring the guest when the kitchen floods.
        email: reservation.email,
        phone: reservation.phone,
        locationName: loaded.locationName,
        occasionTags: reservation.occasion_tags,
        dietaryTags: reservation.dietary_tags,
        dashboardUrl: dashboardReservationsUrl(),
        // Never leak the guest's own cancellation link into staff inboxes: it
        // is their credential, not a shared reference.
        manageUrl: null,
      };
      const sent = await sendAndLogEmail(
        supabase,
        reservation.merchant_id,
        loaded.notifyEmails,
        // A manual-review merchant has a decision to make, not a booking to
        // note. The current subject would tell them they had a table filled.
        requested
          ? `Booking request · ${reservation.party_size} on ${reservation.reservation_date}`
          : `New website booking · ${reservation.party_size} on ${reservation.reservation_date}`,
        renderReservationMerchantAlertHtml(brand, merchantCtx),
      );
      if (!sent.ok) result.errors.push(`Merchant email: ${sent.error}`);
      else result.merchantEmails = loaded.notifyEmails.length;
    }

    // Stamped only when something actually reached the guest, so it stays a
    // record of delivery rather than of intent.
    if (result.guestSms || result.guestEmail) {
      await supabase
        .from("reservations")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", reservationId);
    }

    await logBookingAudit(supabase, loaded, "website_reservation_created", {
      party_size: reservation.party_size,
      reservation_date: reservation.reservation_date,
      reservation_time: reservation.reservation_time,
      source: reservation.source,
      guest_sms: result.guestSms,
      guest_email: result.guestEmail,
      merchant_emails: result.merchantEmails,
    });

    return result;
  } catch (err: unknown) {
    result.errors.push((err as { message?: string })?.message ?? "Unknown error");
    return result;
  }
}

/**
 * The site the merchant's own bookings live on, resolved from the merchant.
 *
 * `resolveManageUrl` takes a `siteId`, which the public booking route has and
 * the dashboard does not: a merchant clicking Confirm knows the reservation,
 * not the web page that produced it. Resolving by `merchant_id` is the same
 * lookup from the other end.
 *
 * Returns null when the merchant has no published subdomain, exactly as its
 * sibling does — a message with no link beats a link to nowhere.
 */
async function resolveManageUrlForMerchant(
  supabase: Supabase,
  merchantId: string,
  manageToken: string | null,
): Promise<string | null> {
  if (!manageToken) return null;

  const { data: site } = await supabase
    .from("merchant_sites")
    .select("subdomain")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  const subdomain = (site?.subdomain ?? "").trim();
  if (!subdomain) return null;

  return sitePublicUrl(subdomain, `r/${manageToken}`);
}

/**
 * The guest hears back: the restaurant accepted, or it did not.
 *
 * **This is the message the feature exists for.** A guest told "we'll answer
 * shortly" and then never told anything is worse off than one who was simply
 * refused a booking — they will turn up, or they will not, and neither they nor
 * the restaurant knows which. `update_reservation_status` writes the column and
 * sends nothing, which is why `RespondToReservationRequestAction` calls this
 * instead of relying on the existing Confirm button.
 *
 * Sent for **both** answers. A decline with no message is the same silence in a
 * politer shape.
 */
export async function notifyReservationRequestAnswered({
  reservationId,
  accepted,
  reason,
  expired = false,
}: {
  reservationId: string;
  accepted: boolean;
  /** The merchant's own words, shown to the guest verbatim. Optional. */
  reason?: string | null;
  /**
   * Whether nobody answered, rather than someone saying no.
   *
   * Changes the audit action only — the guest gets the same decline, because
   * from where they stand the outcome is identical and a fourth voice for the
   * same "no" would help nobody. The business, though, badly needs these
   * separated: "we turned guests away" and "we left guests unanswered until
   * the platform stepped in" are different facts, and a report that merges
   * them hides the second one entirely. See `expiry.ts`.
   */
  expired?: boolean;
}): Promise<ReservationNotifyResult> {
  const result = emptyResult();

  try {
    const supabase = createServiceRoleClient();
    const loaded = await load(supabase, reservationId);
    if (!loaded) {
      result.errors.push("Reservation not found");
      return result;
    }

    const { reservation, brand } = loaded;

    // Only on an acceptance. A declined booking has nothing left to manage, so
    // a "view or cancel" button would invite a click that can do nothing —
    // the same rule `notifyWebsiteReservationCancelled` already follows.
    const manageUrl = accepted
      ? await resolveManageUrlForMerchant(supabase, reservation.merchant_id, reservation.manage_token)
      : null;

    const ctx: ReservationDeclinedContext = {
      partyName: reservation.party_name,
      partySize: reservation.party_size,
      reservationDate: reservation.reservation_date,
      reservationTime: reservation.reservation_time,
      confirmationNumber: reservation.confirmation_number,
      specialRequests: reservation.special_requests,
      cancellationReason: reason?.trim() || null,
      // The branch's own number, which `load` already resolves into the brand
      // block. A declined guest's only useful next step is a phone call.
      venuePhone: brand.phone,
      manageUrl,
    };

    if (reservation.phone && reservation.sms_opt_in !== false) {
      const text = accepted
        ? renderReservationConfirmedText(brand, ctx)
        : renderReservationDeclinedText(brand, ctx);
      const sms = await sendSMS(reservation.phone, text);
      await logOutboundMessage(supabase, {
        merchantId: reservation.merchant_id,
        toNumber: reservation.phone,
        body: text,
        telnyxMessageId: "error" in sms ? null : sms.id,
        status: "error" in sms ? "failed" : "sent",
        errorCode: "error" in sms ? sms.error : null,
      });
      if ("error" in sms) result.errors.push(`SMS: ${sms.error}`);
      else result.guestSms = true;
    }

    if (reservation.email && isValidEmail(reservation.email)) {
      const sent = await sendAndLogEmail(
        supabase,
        reservation.merchant_id,
        reservation.email,
        accepted
          ? `Reservation confirmed · ${brand.businessName}`
          : `About your booking request · ${brand.businessName}`,
        accepted
          ? renderReservationConfirmedHtml(brand, ctx)
          : renderReservationDeclinedHtml(brand, ctx),
      );
      if (!sent.ok) result.errors.push(`Email: ${sent.error}`);
      else result.guestEmail = true;
    }

    // Stamped only on an acceptance, and only when something actually went out.
    // `confirmation_sent_at` means "the guest was told they have a table"; a
    // decline is not that, and neither is a send that failed.
    if (accepted && (result.guestSms || result.guestEmail)) {
      await supabase
        .from("reservations")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", reservationId);
    }

    await logBookingAudit(
      supabase,
      loaded,
      accepted
        ? "website_reservation_confirmed"
        : expired
          ? "website_reservation_expired"
          : "website_reservation_declined",
      {
        party_size: reservation.party_size,
        reservation_date: reservation.reservation_date,
        reservation_time: reservation.reservation_time,
        reason: reason?.trim() || null,
        expired,
        guest_sms: result.guestSms,
        guest_email: result.guestEmail,
      },
    );

    return result;
  } catch (err: unknown) {
    result.errors.push((err as { message?: string })?.message ?? "Unknown error");
    return result;
  }
}

/**
 * A guest cancelling themselves, from the link in their confirmation.
 *
 * No manage link in either message: the booking is gone, so a link to manage it
 * would only invite a click that can do nothing.
 */
export async function notifyWebsiteReservationCancelled({
  reservationId,
  manageToken,
}: {
  /** Known by the location-closure sweep, which cancels rows it selected. */
  reservationId?: string;
  /**
   * All the public cancel endpoint has: `cancel_public_reservation` answers
   * "did it cancel", not "which row". The lookup lives here rather than in the
   * route so the route keeps its single job of deciding whether a request is
   * legitimate.
   */
  manageToken?: string;
}): Promise<ReservationNotifyResult> {
  const result = emptyResult();

  try {
    const supabase = createServiceRoleClient();

    let id = reservationId ?? null;
    if (!id && manageToken) {
      const { data: row } = await supabase
        .from("reservations")
        .select("id")
        .eq("manage_token", manageToken)
        .maybeSingle();
      id = row?.id ?? null;
    }

    if (!id) {
      result.errors.push("Reservation not found");
      return result;
    }

    const loaded = await load(supabase, id);
    if (!loaded) {
      result.errors.push("Reservation not found");
      return result;
    }

    const { reservation, brand } = loaded;
    const ctx: ReservationContext = {
      partyName: reservation.party_name,
      partySize: reservation.party_size,
      reservationDate: reservation.reservation_date,
      reservationTime: reservation.reservation_time,
      confirmationNumber: reservation.confirmation_number,
      cancellationReason: reservation.cancellation_reason,
    };

    // The guest's receipt for an action they just took. Worth sending even
    // though they watched it happen — it is the only durable proof they have
    // that they cancelled in time.
    if (reservation.phone && reservation.sms_opt_in !== false) {
      const text = renderReservationCancelledText(brand, ctx);
      const sms = await sendSMS(reservation.phone, text);
      await logOutboundMessage(supabase, {
        merchantId: reservation.merchant_id,
        toNumber: reservation.phone,
        body: text,
        telnyxMessageId: "error" in sms ? null : sms.id,
        status: "error" in sms ? "failed" : "sent",
        errorCode: "error" in sms ? sms.error : null,
      });
      if ("error" in sms) result.errors.push(`SMS: ${sms.error}`);
      else result.guestSms = true;
    }

    if (reservation.email && isValidEmail(reservation.email)) {
      const sent = await sendAndLogEmail(
        supabase,
        reservation.merchant_id,
        reservation.email,
        `Reservation cancelled · ${brand.businessName}`,
        renderReservationCancelledHtml(brand, ctx),
      );
      if (!sent.ok) result.errors.push(`Email: ${sent.error}`);
      else result.guestEmail = true;
    }

    if (loaded.notifyEmails.length > 0) {
      const merchantCtx: MerchantReservationAlertContext = {
        ...ctx,
        locationName: loaded.locationName,
      };
      const sent = await sendAndLogEmail(
        supabase,
        reservation.merchant_id,
        loaded.notifyEmails,
        `Website booking cancelled · ${reservation.reservation_date}`,
        renderReservationMerchantCancelledHtml(brand, merchantCtx),
      );
      if (!sent.ok) result.errors.push(`Merchant email: ${sent.error}`);
      else result.merchantEmails = loaded.notifyEmails.length;
    }

    await logBookingAudit(supabase, loaded, "website_reservation_cancelled", {
      cancelled_by: "guest",
      reservation_date: reservation.reservation_date,
      reservation_time: reservation.reservation_time,
      reason: reservation.cancellation_reason,
    });

    return result;
  } catch (err: unknown) {
    result.errors.push((err as { message?: string })?.message ?? "Unknown error");
    return result;
  }
}
