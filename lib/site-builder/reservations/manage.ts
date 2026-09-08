import "server-only";

import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { TOKEN_RE } from "./protocol";

/**
 * What the guest's manage page reads.
 *
 * **Service role, not anon** — and that is the whole security posture of this
 * feature restated. `reservations` has no anon RLS policy and never will: the
 * table holds strangers' names, phone numbers and email addresses, and one
 * permissive policy would expose every booking every merchant has ever taken.
 * So the read goes through `get_public_reservation_by_token`, a
 * `SECURITY DEFINER` function granted to `service_role` alone, called from the
 * server with a token that is 256 bits of random hex.
 *
 * **The token is the entire authentication.** There is no second factor and
 * there should not be: a guest booking a table without an account has nothing
 * else to prove. That is exactly why the function masks the contact details it
 * returns — a manage link may be forwarded, sit in a shared inbox, or be read
 * over someone's shoulder, and it should prove "this is your booking" without
 * handing over the phone number of whoever made it.
 */

export interface ManagedReservation {
  confirmationNumber: string | null;
  status: string;
  reservationDate: string;
  reservationTime: string;
  partySize: number;
  partyName: string;
  specialRequests: string | null;
  occasionTags: string[];
  dietaryTags: string[];
  /** `j•••••@example.com` — enough to recognise, not enough to harvest. */
  emailMasked: string | null;
  /** `•••• 4021`. */
  phoneMasked: string | null;
  location: {
    name: string | null;
    phone: string | null;
    timezone: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
  };
  bookingPolicy: string | null;
  cancellationCutoffMin: number;
  /**
   * Computed in Postgres against the venue's own timezone, never in the
   * browser. A client clock is wrong often enough that "can I still cancel?"
   * must not depend on it — and a guest shown a Cancel button that the server
   * then refuses has been lied to at the worst possible moment.
   */
  canCancel: boolean;
}

/**
 * Returns null for an unknown token, a malformed one, and a database failure
 * alike. The caller turns all three into the same 404, so a token that does not
 * exist is indistinguishable from one that does but belongs to a booking the
 * caller may not see.
 *
 * Wrapped in React's `cache` so the manage page's `generateMetadata` and its
 * body share one lookup rather than each paying a round trip. Per-request only:
 * the page is `force-dynamic` precisely because a stale manage page can show a
 * cancelled booking as confirmed, and this does not weaken that — two calls in
 * one render collapse into one, and the next request starts clean.
 */
export const loadReservationByToken = cache(async function loadReservationByToken(
  token: string,
): Promise<ManagedReservation | null> {
  // Shape-checked before any database work, so a malformed token costs nothing
  // and cannot be used to time the difference between "wrong shape" and "right
  // shape, no such booking".
  if (!TOKEN_RE.test(token)) return null;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("get_public_reservation_by_token", {
    p_token: token,
  } as never);

  if (error) {
    console.error("[site-reservations] manage lookup failed:", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const location = (row.location ?? {}) as Record<string, unknown>;

  return {
    confirmationNumber: str(row.confirmation_number),
    status: str(row.status) ?? "confirmed",
    reservationDate: str(row.reservation_date) ?? "",
    reservationTime: String(row.reservation_time ?? "").slice(0, 5),
    partySize: Number(row.party_size ?? 0),
    partyName: str(row.party_name) ?? "Guest",
    specialRequests: str(row.special_requests),
    occasionTags: strArray(row.occasion_tags),
    dietaryTags: strArray(row.dietary_tags),
    emailMasked: str(row.email_masked),
    phoneMasked: str(row.phone_masked),
    location: {
      name: str(location.name),
      phone: str(location.phone),
      timezone: str(location.timezone),
      addressLine1: str(location.address_line1),
      city: str(location.city),
      state: str(location.state),
    },
    bookingPolicy: str(row.booking_policy),
    cancellationCutoffMin: Number(row.cancellation_cutoff_min ?? 120),
    canCancel: row.can_cancel === true,
  };
});

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** The statuses whose manage page is a receipt rather than something to act on. */
const TERMINAL_STATUSES = new Set(["cancelled", "no_show", "completed", "departed"]);

export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}
