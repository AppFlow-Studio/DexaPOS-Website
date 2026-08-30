import { after } from "next/server";

import {
  bool,
  fail,
  looksAutomated,
  looksLikeEmail,
  looksLikePhone,
  ok,
  readJsonBody,
  serviceClient,
  str,
  strArray,
  withinRateLimit,
} from "@/lib/site-builder/reservations/endpoint";
import { notifyWebsiteReservationBooked } from "@/lib/site-builder/reservations/notify";
import { TOKEN_RE, UUID_RE } from "@/lib/site-builder/reservations/protocol";

/**
 * Turn a hold into a confirmed booking.
 *
 * The guest's details are validated here; the atomicity lives in
 * `create_public_reservation`, which re-checks the held tables inside an
 * advisory lock and inserts in one transaction. That split is the whole design:
 * this route decides whether the request is legitimate, the function decides
 * whether the table is still free, and only the second can be done without a
 * race.
 *
 * Notifications are a SEPARATE STEP, and run through `after()` — the response
 * is already on the wire before Telnyx or Resend is touched. That ordering is
 * the point: a provider outage must never turn a successfully stored
 * reservation into an error page for someone who now has a table, and a guest
 * should not wait on two HTTP calls to third parties to be told they have one.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mean, because each success consumes a real table. */
const RATE_LIMIT = { max: 5, windowSeconds: 900 };

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return fail("invalid");

  const siteId = str(body.siteId, 40);
  const holdToken = str(body.holdToken, 80);

  if (!UUID_RE.test(siteId) || !TOKEN_RE.test(holdToken)) return fail("invalid");

  const firstName = str(body.firstName, 80);
  const lastName = str(body.lastName, 80);
  const email = str(body.email, 254);
  const phone = str(body.phone, 40);

  const fields: Record<string, string> = {};
  if (!firstName) fields.firstName = "Enter your first name";
  if (!lastName) fields.lastName = "Enter your last name";
  if (!email) fields.email = "Enter your email address";
  else if (!looksLikeEmail(email)) fields.email = "Enter a valid email address";
  if (!phone) fields.phone = "Enter your phone number";
  else if (!looksLikePhone(phone)) fields.phone = "Enter a valid phone number";

  // The one code that names what is wrong, because it is the one the guest can
  // actually fix.
  if (Object.keys(fields).length > 0) return fail("invalid", fields);

  // Bot signals AFTER validation, so a bot cannot use the field errors as an
  // oracle for what a valid payload looks like.
  //
  // A hit is a SILENT SUCCESS-shaped failure: nothing is written, and the
  // response is the generic unavailable rather than anything that says "we
  // think you are a robot". An automated submitter gets nothing to iterate
  // against — and the held slot simply expires on its own five minutes later.
  if (looksAutomated(body)) return fail("unavailable");

  if (!(await withinRateLimit(request, `site-reservations:book:${siteId}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds))) {
    return fail("rate_limited");
  }

  const supabase = serviceClient();

  /**
   * The booking policy, enforced here and not only in the browser.
   *
   * The checkout renders it as a `required`, unchecked box, but that is a
   * courtesy to the guest, not a consent record — this endpoint is public and
   * anyone can POST it directly. A restaurant that holds a no-show fee over a
   * guest needs the agreement to have actually happened.
   *
   * Two extra round trips on the booking path, deliberately: bookings are rare,
   * the guest is already waiting on a write, and the alternative is trusting the
   * client about the one field that has legal weight. Placed AFTER the rate
   * limit so it cannot be used to probe which branches have a policy.
   */
  const { data: hold } = await supabase
    .from("reservation_holds")
    .select("location_id")
    .eq("token", holdToken)
    .maybeSingle();

  const holdLocationId = (hold as { location_id?: string } | null)?.location_id ?? null;
  if (holdLocationId) {
    const { data: settings } = await supabase
      .from("reservation_settings")
      .select("booking_policy")
      .eq("location_id", holdLocationId)
      .maybeSingle();

    const policy = ((settings as { booking_policy?: string | null } | null)?.booking_policy ?? "").trim();
    if (policy && !bool(body.policyAccepted, false)) {
      return fail("invalid", {
        policyAccepted: "Please accept the booking policy to continue",
      });
    }
  }

  const { data, error } = await supabase.rpc("create_public_reservation", {
    p_site_id: siteId,
    p_hold_token: holdToken,
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: email,
    p_phone: phone,
    p_special_requests: str(body.specialRequests, 1000) || null,
    p_occasion_tags: strArray(body.occasionTags),
    p_dietary_tags: strArray(body.dietaryTags),
    // Marketing is opt-in and transactional messaging is opt-out, matching the
    // checkout defaults. Absent means the guest never saw the box, so the safe
    // reading of each differs.
    p_marketing_opt_in: bool(body.marketingOptIn, false),
    p_sms_opt_in: bool(body.smsOptIn, true),
  });

  if (error) {
    console.error("[site-reservations] book failed:", error.message);
    return fail("unavailable");
  }

  // NULL covers an unknown token, an expired hold, a hold under another site,
  // and a table taken since. `hold_expired` is the message the widget shows for
  // all of them because it is true often enough to be the useful thing to say,
  // and its recovery — re-query and show the grid — is right in every case.
  if (!data) return fail("hold_expired");

  const booked = data as {
    reservation_id: string;
    confirmation_number: string;
    manage_token: string;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    status: string;
    already_booked: boolean;
  };

  // Only for a genuinely new booking. A double submit returns the reservation
  // that already exists, and confirming it twice would tell a guest — and the
  // whole restaurant — that they had booked two tables.
  if (!booked.already_booked) {
    after(async () => {
      const notified = await notifyWebsiteReservationBooked({
        reservationId: booked.reservation_id,
        siteId,
      });
      if (notified.errors.length > 0) {
        console.error(
          "[site-reservations] confirmation partly failed:",
          booked.confirmation_number,
          notified.errors.join("; "),
        );
      }
    });
  }

  return ok({
    confirmationNumber: booked.confirmation_number,
    manageToken: booked.manage_token,
    date: booked.reservation_date,
    time: String(booked.reservation_time).slice(0, 5),
    partySize: booked.party_size,
    // Straight from the row. Not derived from the site's approval mode, which
    // the merchant may have changed between this page loading and this submit.
    // Anything the RPC does not recognise is read as confirmed, matching the
    // fail-toward-today's-behaviour rule the SQL and TypeScript both apply.
    status: booked.status === "pending" ? "pending" : "confirmed",
    alreadyBooked: booked.already_booked,
  });
}
