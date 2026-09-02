import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXPIRY_REASON,
  REQUEST_GRACE_MINUTES,
  REQUEST_LOOKBACK_HOURS,
} from "../expiry";

/**
 * Safety contract for the sweep that cancels unanswered booking requests.
 *
 * This is the only job in the reservations feature that cancels bookings with
 * nobody watching, on a schedule, across every merchant at once. Its guards are
 * not stylistic — each one stands between the sweep and a specific, verified
 * way of destroying real data:
 *
 *   - Staging holds 10 `pending` reservations from the POS and the dashboard,
 *     where `pending` means "a host wrote this down", not "awaiting an answer".
 *   - Every one of those is in the PAST, the oldest from April, so a sweep
 *     without a lookback floor would cancel them and email those guests about
 *     dinners four months gone.
 *
 * Both were confirmed against the live staging database on 2026-08-30, and both
 * are exactly the kind of regression that would pass every other test in this
 * suite and read as harmless in review. Asserting on migration text follows the
 * convention set by tests/reservation-availability-function.test.ts.
 */
const read = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");

const sweep = read("20260830130000_expire_stale_reservation_requests.sql");
const schedule = read("20260830130100_schedule_reservation_request_expiry.sql");

describe("the schedule's own grant", () => {
  it("is revoked from the browser-facing roles too", () => {
    // Lower stakes than the sweep — it only fires an HTTP poke — but an
    // anonymous caller should not be able to trigger the job at will.
    expect(schedule).toMatch(
      /REVOKE ALL ON FUNCTION public\.poke_reservation_request_expiry\(\)\s*\n?\s*FROM PUBLIC, anon, authenticated;/,
    );
  });
});

describe("expire_stale_reservation_requests — the three guards", () => {
  it("only ever touches website-sourced requests", () => {
    // Without this, staff bookings marked pending are cancelled at every
    // restaurant on the platform — including ones that never turned manual
    // review on and have no idea this feature exists.
    expect(sweep).toMatch(/r\.source\s*=\s*'website'/);
  });

  it("refuses to reach further back than the lookback window", () => {
    // The past is a record of what happened. Rewriting it corrupts every
    // report built on it, and apologises to guests who have moved on.
    expect(sweep).toMatch(/>\s*now\(\)\s*-\s*make_interval\(hours\s*=>\s*p_lookback_hours\)/);
    expect(sweep).toMatch(/p_lookback_hours\s+int\s+DEFAULT\s+24/i);
  });

  it("measures the sitting on the branch's clock, not the server's", () => {
    // Otherwise the sweep expires tonight's dinner in Auckland and leaves this
    // afternoon's in Los Angeles standing.
    expect(sweep).toMatch(/AT TIME ZONE COALESCE\(NULLIF\(l\.timezone/);
    expect(sweep).toContain("JOIN locations l ON l.id = r.location_id");
  });
});

describe("expire_stale_reservation_requests — how it cancels", () => {
  it("never races a manager who is answering the same request", () => {
    expect(sweep).toContain("SKIP LOCKED");
  });

  it("attributes the cancellation to the system, the value that exists for it", () => {
    // Not 'guest' and not 'staff'. Also the only other value the CHECK allows,
    // and the one an archived branch already writes.
    expect(sweep).toMatch(/cancelled_by\s*=\s*'system'/);
  });

  it("returns the ids, because a cancellation nobody is told about is the bad case", () => {
    expect(sweep).toContain("RETURNS TABLE (reservation_id uuid)");
    expect(sweep).toMatch(/RETURNING r\.id/);
  });

  it("is reachable only by the service role", () => {
    /*
      Asserted POSITIVELY, because the negative version of this test is what
      let the hole through.

      This originally read `expect(sweep).not.toMatch(/TO anon/)` — which passes
      trivially on a file that never mentions anon, and did, while staging
      showed `anon=X/postgres` on the live function. Supabase's default
      privileges GRANT EXECUTE to `anon` and `authenticated` at creation time,
      so a file that says nothing about them is a file that leaves them wide
      open, and `REVOKE ... FROM PUBLIC` does not remove an explicit grant.

      The only text that means anything here is naming both roles in the
      REVOKE, so that is what is checked. A test over migration text cannot see
      `proacl`; the corrective migration 20260830130200 carries the query to
      confirm the live state.
    */
    expect(sweep).toMatch(
      /REVOKE ALL ON FUNCTION public\.expire_stale_reservation_requests\(int, int, text\)\s*\n?\s*FROM PUBLIC, anon, authenticated;/,
    );
    expect(sweep).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.expire_stale_reservation_requests\(int, int, text\) TO service_role;/,
    );
  });
});

describe("the corrective revoke", () => {
  const corrective = read("20260830130200_revoke_reservation_expiry_public_execute.sql");

  /**
   * The two functions were applied to staging with `anon` and `authenticated`
   * holding EXECUTE. `CREATE OR REPLACE` preserves grants, so fixing the
   * original files does not fix an environment that already ran them — this
   * migration is the only thing that closes it there.
   */
  it("names both browser-facing roles for both functions", () => {
    expect(corrective).toMatch(
      /REVOKE ALL ON FUNCTION public\.expire_stale_reservation_requests\(int, int, text\)\s*\n?\s*FROM PUBLIC, anon, authenticated;/,
    );
    expect(corrective).toMatch(
      /REVOKE ALL ON FUNCTION public\.poke_reservation_request_expiry\(\)\s*\n?\s*FROM PUBLIC, anon, authenticated;/,
    );
  });

  it("leaves the service role able to run the sweep", () => {
    // Revoking without re-granting would silently disable the whole feature.
    expect(corrective).toMatch(/GRANT EXECUTE ON FUNCTION public\.expire_stale_reservation_requests/);
    expect(corrective).toContain("TO service_role");
  });
});

describe("the schedule", () => {
  it("no-ops until someone points it at a running app", () => {
    // Deploy order matters: the migration must be safe to apply on its own,
    // with nothing expiring until the vault URL is set deliberately.
    expect(schedule).toContain("IF expiry_url IS NULL OR expiry_secret IS NULL THEN");
    expect(schedule).toContain("RETURN;");
  });

  it("re-registers cleanly instead of stacking duplicate jobs", () => {
    expect(schedule).toContain("cron.unschedule('website-reservation-request-expiry')");
    expect(schedule).toContain("cron.schedule(");
  });

  it("authenticates to the route with the shared internal secret", () => {
    expect(schedule).toContain("'internal_notification_secret'");
    expect(schedule).toContain("'x-internal-secret', expiry_secret");
  });

  it("runs often enough to stay well inside the grace window", () => {
    const cadence = /'\*\/(\d+) \* \* \* \*'/.exec(schedule);
    expect(cadence).not.toBeNull();
    const everyMinutes = Number(cadence![1]);
    // The lateness a guest could see is one cadence. It has to be small next to
    // the grace window, or a request could expire far closer to the sitting
    // than the two hours' notice the window promises.
    expect(everyMinutes).toBeLessThan(REQUEST_GRACE_MINUTES / 4);
  });
});

describe("the windows themselves", () => {
  it("gives a guest an evening to rescue", () => {
    expect(REQUEST_GRACE_MINUTES).toBeGreaterThanOrEqual(60);
  });

  it("keeps the lookback bounded to roughly a day", () => {
    // The floor's entire job is to be small. A lookback of weeks would sweep
    // history back into the guests' inboxes.
    expect(REQUEST_LOOKBACK_HOURS).toBeLessThanOrEqual(48);
  });

  it("tells the guest what actually happened, without blaming them", () => {
    expect(EXPIRY_REASON).toMatch(/not able to confirm/i);
    // The guest asked a question and got no answer; the copy must not imply
    // they did something wrong or that they cancelled.
    expect(EXPIRY_REASON).not.toMatch(/you|your/i);
  });
});
