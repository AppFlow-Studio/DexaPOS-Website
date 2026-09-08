import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BLOCKING_STATUSES } from "@/lib/reservations/conflict-detection";

/**
 * Contract tests for the reservation functions an anonymous stranger can reach.
 *
 * Their security properties are not incidental details — they are the reason it
 * is safe to expose any of this. A later edit that drops `SECURITY DEFINER`,
 * widens what comes back, removes the site scoping, or hands a writer to `anon`
 * would fail no other test in the suite and would not be obvious in review.
 *
 * Asserting on migration text follows the convention set by
 * tests/kds-routing-traceability-migration.test.ts. Each property is checked
 * against the file that actually establishes it: the availability function was
 * introduced in 140000 and REWRITTEN in 150000, and `CREATE OR REPLACE`
 * preserves grants, which is why the anon grant is still asserted against the
 * older file.
 */
const read = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");

/** Where the anon grant was established. */
const introduced = read("20260828140000_reservation_availability_function.sql");
/** The current definition of availability, plus the shared occupancy function. */
const current = read("20260828150000_reservation_occupancy_function.sql");
/** The write path. */
const writes = read("20260828160000_reservation_public_write.sql");

describe("get_public_reservation_availability — security contract", () => {
  it("runs as definer with a pinned search_path", () => {
    expect(current).toContain("SECURITY DEFINER");
    expect(current).toContain("SET search_path = 'public'");
    // STABLE, not VOLATILE: it reads, and must be safe to call repeatedly.
    expect(current).toContain("STABLE");
  });

  it("is executable by anon, which is the entire point of it existing", () => {
    expect(introduced).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_public_reservation_availability[\s\S]*TO anon/,
    );
  });

  /**
   * Without the join through `merchant_sites` on a shared `merchant_id`, a
   * location id harvested from one merchant's page HTML could be queried under
   * any other merchant's site id.
   */
  it("scopes the location to the site that owns it", () => {
    expect(current).toContain("FROM merchant_sites ms");
    expect(current).toContain("JOIN locations l ON l.merchant_id = ms.merchant_id");
    expect(current).toContain("WHERE ms.id = p_site_id");
  });

  it("refuses anything but native mode, at both levels", () => {
    expect(current).toContain("ms.features->>'reservations'");
    expect(current).toContain("ms.brand->>'reservationMode'");
    expect(current).toContain("'native'");
    expect(current).toContain("rs.accepts_reservations");
  });

  /**
   * Times only. Returning a table id would let a caller map the dining room;
   * returning a count would tell a competitor how busy the restaurant is.
   */
  it("returns times and service labels, never table ids or capacity", () => {
    // Anchored to this function specifically: `reservation_occupancy` is
    // defined earlier in the same file and DOES return table ids — which is
    // fine, because it is service_role only and anon can never call it.
    const fn = current.indexOf("FUNCTION public.get_public_reservation_availability");
    const start = current.indexOf("RETURNS TABLE (", fn);
    const signature = current.slice(start, current.indexOf(")", start) + 1);

    expect(signature).toContain("slot_time");
    expect(signature).toContain("service_period_id");
    expect(signature).toContain("service_name");
    expect(signature).not.toContain("table_id");
    expect(signature).not.toContain("capacity");
    expect(signature).not.toContain("party");
  });
});

describe("get_public_reservation_availability — correctness contract", () => {
  /** Only real seating. `is_reservable` alone would let decor seat a party. */
  it("treats only tables and booths as seating", () => {
    expect(current).toContain("fpo.category IN ('table', 'booth')");
    expect(current).toContain("COALESCE(fpo.is_reservable, true)");
  });

  /**
   * The fit test's ceiling must match DEFAULT_MAX_TABLES_PER_PARTY in
   * lib/reservations/availability.ts, or the two implementations disagree about
   * how many tables may be pushed together — which the golden-output parity
   * tests in that module's suite would then catch as a mismatch.
   */
  it("caps pushed-together tables at three", () => {
    expect(current).toContain("LIMIT 3");
  });

  it("compares wall-clock time in the location's own zone", () => {
    expect(current).toContain("now() AT TIME ZONE");
    expect(current).toContain("v_timezone");
  });

  /** Half-open intervals: a table turning at 19:00 is free at 19:00. */
  it("uses strict inequalities so a clean turnover is not a clash", () => {
    expect(current).toContain("f.start_min < o.end_min");
    expect(current).toContain("o.start_min < f.start_min + f.turn_time_min");
  });
});

describe("reservation_occupancy — the single definition of 'occupied'", () => {
  /**
   * The grid a guest sees and the check that accepts their booking must agree
   * about what occupies a table. Two copies of this union is exactly how a
   * double booking gets shipped, so there is one function and both call it.
   */
  it("is called by the availability function rather than reimplemented", () => {
    expect(current).toContain("FROM public.reservation_occupancy(p_location_id, p_date)");
    expect(writes).toContain("public.reservation_occupancy(");
  });

  it("counts reservations, live holds and seated sessions", () => {
    expect(current).toContain("FROM reservations r");
    expect(current).toContain("FROM reservation_holds h");
    expect(current).toContain("FROM table_sessions ts");
    expect(current).toContain("h.converted_reservation_id IS NULL");
    expect(current).toContain("h.expires_at > now()");
    expect(current).toContain("ts.cleared_at IS NULL");
  });

  /**
   * The SQL list and `BLOCKING_STATUSES` are the same fact written twice and
   * must not drift: a status missing from the SQL is a table the grid offers
   * while it is occupied.
   */
  it("blocks on exactly the statuses BLOCKING_STATUSES names", () => {
    const clause = current.match(/r\.status IN \(([^)]+)\)/);
    expect(clause).not.toBeNull();

    const inSql = clause![1]
      .split(",")
      .map((s) => s.trim().replace(/'/g, ""))
      .sort();

    expect(inSql).toEqual([...BLOCKING_STATUSES].sort());
  });

  it("is not reachable by anon", () => {
    expect(current).toContain(
      "REVOKE ALL ON FUNCTION public.reservation_occupancy(uuid, date) FROM PUBLIC, anon, authenticated",
    );
  });
});

describe("the public write path", () => {
  /**
   * The routes authenticate; these functions write atomically. Handing any of
   * them to anon would move abuse control into plpgsql and let a caller skip
   * the rate limiter entirely.
   */
  it("grants every writer to service_role only", () => {
    for (const fn of [
      "create_public_reservation_hold",
      "create_public_reservation",
      "get_public_reservation_by_token",
      "cancel_public_reservation",
    ]) {
      expect(writes).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`),
      );
      expect(writes).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`),
      );
      expect(writes).not.toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO anon`),
      );
    }
  });

  /**
   * The only thing standing between two simultaneous bookings and one
   * double-booked table. Both writers take it on (location, date) before
   * reading anything.
   */
  it("serialises writers with a transaction-scoped advisory lock", () => {
    const locks = writes.match(/pg_advisory_xact_lock/g) ?? [];
    expect(locks.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * A hold occupies the very tables it is about to convert. Counting it would
   * reject every booking — this is the single easiest way to break the feature
   * while every other test still passes.
   */
  it("excludes its own hold from the booking re-check", () => {
    expect(writes).toContain("o.source_id IS DISTINCT FROM v_hold.id");
  });

  /** Plan decision D1. A 'pending' booking makes the confirmation SMS a lie. */
  it("auto-confirms and records the website as the source", () => {
    expect(writes).toContain("'confirmed', 'website'");
  });

  it("returns the existing booking on a double submit rather than making a second", () => {
    expect(writes).toContain("v_hold.converted_reservation_id IS NOT NULL");
    expect(writes).toContain("'already_booked',      true");
  });

  it("refuses an expired hold", () => {
    expect(writes).toContain("v_hold.expires_at <= now()");
  });

  /**
   * A manage link can be forwarded or read over a shoulder. It should prove
   * "this is your booking" without handing over the contact details of whoever
   * made it.
   */
  it("masks contact details on the manage page", () => {
    expect(writes).toContain("email_masked");
    expect(writes).toContain("phone_masked");
    const start = writes.indexOf("get_public_reservation_by_token");
    const body = writes.slice(start, writes.indexOf("cancel_public_reservation", start));
    expect(body).not.toMatch(/'email',\s+r\.email/);
    expect(body).not.toMatch(/'phone',\s+r\.phone/);
  });

  it("honours the cancellation cutoff, in the location's timezone", () => {
    expect(writes).toContain("cancellation_cutoff_min");
    expect(writes).toContain("now() AT TIME ZONE COALESCE(NULLIF(l.timezone, ''), 'UTC')");
    expect(writes).toContain("'cutoff_passed'");
  });

  /** Cancelling an already-cancelled booking is what the guest wanted. */
  it("treats a repeat cancellation as success", () => {
    expect(writes).toContain("'already_cancelled', true");
  });

  it("marks a guest cancellation as such, so it is distinguishable from a host's", () => {
    expect(writes).toContain("cancelled_by        = 'guest'");
  });
});
