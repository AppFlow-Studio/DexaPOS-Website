import { after } from "next/server";

import {
  fail,
  ok,
  readJsonBody,
  serviceClient,
  str,
  withinRateLimit,
} from "@/lib/site-builder/reservations/endpoint";
import { notifyWebsiteReservationCancelled } from "@/lib/site-builder/reservations/notify";
import { TOKEN_RE } from "@/lib/site-builder/reservations/protocol";

/**
 * The guest cancelling their own booking, from the link in their confirmation.
 *
 * **The token is the entire authentication.** That is why it is 256 bits of
 * random hex from `generate_reservation_manage_token()` and not the
 * confirmation number, which is short, printed on tickets and readable over
 * someone's shoulder — a cancel endpoint keyed on a guessable id lets anyone
 * cancel a stranger's dinner.
 *
 * No site id is required or accepted here. The token already identifies exactly
 * one booking, and asking for a site as well would only add a field to get
 * wrong: it could not make an unguessable token more authoritative.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tight, and keyed on the address rather than the token. The thing worth
 * preventing is someone grinding through tokens; someone cancelling their own
 * booking does it once.
 */
const RATE_LIMIT = { max: 10, windowSeconds: 900 };

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return fail("invalid");

  const token = str(body.token, 80);
  // Shape-checked before anything else, so a malformed token costs no database
  // work and cannot be used to time the difference between "wrong shape" and
  // "right shape, no such booking".
  if (!TOKEN_RE.test(token)) return fail("unavailable");

  if (!(await withinRateLimit(request, "site-reservations:cancel", RATE_LIMIT.max, RATE_LIMIT.windowSeconds))) {
    return fail("rate_limited");
  }

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc("cancel_public_reservation", {
    p_token: token,
    p_reason: str(body.reason, 500) || null,
  });

  if (error) {
    console.error("[site-reservations] cancel failed:", error.message);
    return fail("unavailable");
  }

  // NULL means no booking carries that token. Answered identically to any other
  // failure so this cannot be used to confirm whether a token is real.
  if (!data) return fail("unavailable");

  const result = data as { cancelled: boolean; already_cancelled?: boolean; reason?: string };

  if (!result.cancelled) {
    // The one refusal worth naming: the guest is inside the merchant's
    // cancellation window, and the manage page shows them the phone number
    // instead. Telling them "unavailable" here would be actively unhelpful —
    // they have a real booking and a real problem.
    return fail(result.reason === "cutoff_passed" ? "cutoff_passed" : "unavailable");
  }

  // A repeat cancellation is a success. The guest wanted it cancelled; it is
  // cancelled. Erroring on a double-click would say something went wrong when
  // nothing did.
  //
  // It does NOT re-notify, though. The table was already freed and the merchant
  // already told; a second alert for the same cancellation is how staff learn
  // to ignore these.
  if (!result.already_cancelled) {
    after(async () => {
      const notified = await notifyWebsiteReservationCancelled({ manageToken: token });
      if (notified.errors.length > 0) {
        console.error(
          "[site-reservations] cancellation notice partly failed:",
          notified.errors.join("; "),
        );
      }
    });
  }

  return ok({ alreadyCancelled: result.already_cancelled === true });
}
