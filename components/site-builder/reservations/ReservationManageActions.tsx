"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CANCEL_PATH } from "@/lib/site-builder/reservations/protocol";

/**
 * The only interactive part of the guest's manage page.
 *
 * Everything else on that page is server-rendered from
 * `get_public_reservation_by_token`, including the decision about whether
 * cancelling is still allowed — this component is handed `canCancel` rather
 * than computing it, because the answer depends on the venue's timezone and the
 * merchant's cutoff, and a browser clock is wrong often enough to matter.
 *
 * Lives under `components/site-builder/reservations/`, which is excluded from
 * the render-graph scan in `render.test.tsx` and is imported only by public
 * routes. Nothing a section can reach may import this file.
 */

type Phase = "idle" | "confirming" | "working" | "done" | "cutoff" | "error";

export default function ReservationManageActions({
  token,
  canCancel,
  awaitingAnswer = false,
  venuePhone,
  cutoffMin,
}: {
  token: string;
  canCancel: boolean;
  /**
   * Whether this is still a request the restaurant has not answered.
   *
   * Only changes wording — the action underneath is the same cancel, and
   * `can_cancel` already includes `pending`. But "cancel your reservation" is
   * the wrong sentence for someone who was told they do not have one yet:
   * it implies they are giving up a table, when they are withdrawing a
   * question. Defaults false so any caller that has not been updated keeps
   * today's copy.
   */
  awaitingAnswer?: boolean;
  venuePhone: string | null;
  cutoffMin: number;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function cancel() {
    setPhase("working");
    setMessage(null);

    try {
      const res = await fetch(CANCEL_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();

      if (json.ok) {
        setPhase("done");
        /*
          Re-render the server component above this one.

          Everything outside this panel — the headline, and for a pending
          request the line promising the table is held — is server-rendered
          from the reservation's status at page load. Without this refresh a
          guest who withdraws reads "Your table is held while they decide, and
          we'll email and text you as soon as they answer" directly above "Your
          request has been withdrawn". The first sentence is a promise, and it
          has just stopped being true.

          The staleness pre-dates manual review — a cancelled booking kept the
          neutral "Your reservation" heading — but §4.10 put a much stronger
          claim in that region, which is what turned an awkward page into a
          contradictory one. Caught in browser QA, 2026-08-30.
        */
        router.refresh();
        return;
      }

      // The one refusal worth naming. The guest has a real booking and a real
      // problem, and "unavailable" here would be actively unhelpful — they need
      // the phone number, not an apology.
      if (json.code === "cutoff_passed") {
        setPhase("cutoff");
        return;
      }

      setPhase("error");
      setMessage(
        json.code === "rate_limited"
          ? "Too many attempts just now. Please wait a moment and try again."
          : awaitingAnswer
            ? "We could not withdraw this request. Please call us instead."
            : "We could not cancel this reservation. Please call us instead.",
      );
    } catch {
      setPhase("error");
      setMessage("We could not reach the restaurant. Please try again, or call us.");
    }
  }

  if (phase === "done") {
    return (
      <div
        className="rounded-[var(--site-radius)] border p-5 text-center"
        role="status"
        aria-live="polite"
      >
        <p className="font-semibold">
          {awaitingAnswer ? "Your request has been withdrawn." : "This reservation is cancelled."}
        </p>
        <p className="mt-1 text-sm opacity-70">
          We have let the restaurant know and sent you a confirmation. We hope to see you
          another time.
        </p>
      </div>
    );
  }

  if (phase === "cutoff") {
    return <CutoffNotice venuePhone={venuePhone} cutoffMin={cutoffMin} />;
  }

  if (!canCancel) {
    return <CutoffNotice venuePhone={venuePhone} cutoffMin={cutoffMin} />;
  }

  return (
    <div className="space-y-3">
      {message && (
        <p className="rounded-[var(--site-radius)] border p-3 text-sm" role="alert">
          {message}
        </p>
      )}

      {phase === "confirming" ? (
        <div className="rounded-[var(--site-radius)] border p-5">
          <p className="font-medium">
            {awaitingAnswer ? "Withdraw this request?" : "Cancel this reservation?"}
          </p>
          <p className="mt-1 text-sm opacity-70">
            {awaitingAnswer
              ? "This releases the table being held for you, so it cannot be undone — you would need to ask again."
              : "This frees your table for someone else, so it cannot be undone — you would need to book again."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void cancel()}
              className="rounded-full border px-5 py-2.5 text-sm font-semibold"
            >
              {awaitingAnswer ? "Yes, withdraw it" : "Yes, cancel it"}
            </button>
            <button
              type="button"
              onClick={() => setPhase("idle")}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-[var(--site-brand-contrast)]"
              style={{ background: "var(--site-brand)" }}
            >
              {awaitingAnswer ? "Keep waiting" : "Keep my table"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={phase === "working"}
          onClick={() => setPhase("confirming")}
          className="w-full rounded-full border px-6 py-3 text-sm font-semibold disabled:opacity-60"
        >
          {phase === "working"
            ? awaitingAnswer
              ? "Withdrawing…"
              : "Cancelling…"
            : awaitingAnswer
              ? "Withdraw request"
              : "Cancel reservation"}
        </button>
      )}
    </div>
  );
}

/**
 * Past the cutoff, or already un-cancellable for any other reason.
 *
 * Shows the venue's phone number rather than a disabled button. A greyed-out
 * control tells a guest what they cannot do; a phone number tells them what
 * they can — and the restaurant would far rather take the call than have the
 * table sit empty.
 */
function CutoffNotice({
  venuePhone,
  cutoffMin,
}: {
  venuePhone: string | null;
  cutoffMin: number;
}) {
  return (
    <div className="rounded-[var(--site-radius)] border p-5 text-sm">
      <p className="font-medium">Need to change or cancel?</p>
      <p className="mt-1 opacity-70">
        Online cancellation closes {describeCutoff(cutoffMin)} before your booking.
        {venuePhone ? " Give us a call and we will sort it out." : " Please contact the restaurant directly."}
      </p>
      {venuePhone && (
        <a
          href={`tel:${venuePhone.replace(/[^0-9+]/g, "")}`}
          className="mt-3 inline-block rounded-full px-5 py-2.5 font-semibold text-[var(--site-brand-contrast)]"
          style={{ background: "var(--site-brand)" }}
        >
          Call {venuePhone}
        </a>
      )}
    </div>
  );
}

/** `120` → `2 hours`. Merchants set minutes; nobody thinks in them. */
function describeCutoff(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}
