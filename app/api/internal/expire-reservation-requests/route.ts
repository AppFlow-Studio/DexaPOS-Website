import { NextResponse } from "next/server";

import { expireStaleReservationRequests } from "@/lib/site-builder/reservations/expiry";

/**
 * The scheduled sweep that closes booking requests nobody answered.
 *
 * §10 of PLAN-2026-08-29-RESERVATION-APPROVAL-MODE. Driven by pg_cron, which
 * pokes this over pg_net once a quarter-hour.
 *
 * **Why a route rather than the edge function the plan first named.** The plan
 * reached for an edge function because the guest has to be told and pg_cron
 * cannot send an email. That reasoning holds; the conclusion does not. Every
 * piece of telling a guest already exists here in the app — the declined
 * template pair, the branded email wrapper, the Telnyx and Resend helpers,
 * `message_log` writes, the audit trail — and none of it can be imported into
 * Deno. An edge function would have had to reimplement the guest's message, at
 * which point the expiry email and the decline email drift apart the first time
 * anyone edits one. So this reuses `INTERNAL_NOTIFICATION_SECRET` and the
 * `app/api/internal/*` pattern the repo already runs three other jobs through.
 *
 * Takes no parameters, deliberately. The grace and lookback windows are
 * constants in `expiry.ts`, not request fields: anyone holding the secret could
 * otherwise pass a lookback of ten years and cancel every historic booking on
 * the platform in one call.
 */
export async function POST(request: Request) {
  const secret = process.env.INTERNAL_NOTIFICATION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const auth = request.headers.get("x-internal-secret");
  if (auth !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await expireStaleReservationRequests();

    if (result.error) {
      console.error("[expire-reservation-requests] sweep failed:", result.error);
      return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
    }

    /*
      A partial failure is still a 200.

      The rows are already cancelled by the time any message is attempted, so
      failing the request would make pg_cron retry a sweep whose work is done —
      finding nothing to cancel, and never retrying the message that actually
      failed. The honest signal is the count: it is reported, and logged above
      by the sweep, so a guest who was cancelled without being told is visible
      rather than buried under a red status code that means something else.
    */
    return NextResponse.json({
      ok: true,
      expired: result.expired,
      notify_failures: result.notifyErrors.length,
    });
  } catch (err) {
    console.error("[expire-reservation-requests] failed:", err);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
}
