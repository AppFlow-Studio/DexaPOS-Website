import { describe, expect, it } from "vitest";

import {
  LEGACY_MERCHANT_ALL_LOCATION_ROLES,
  MERCHANT_ALL_LOCATION_ROLES,
  grantsAllMerchantLocations,
  sqlGrantsAllMerchantLocations,
} from "../merchant-location-access";

/**
 * The regression this file exists to prevent.
 *
 * `GetLocations` (TypeScript, feeds the dashboard location picker) and
 * `user_location_ids()` (SQL, gates ~75 RLS policies and RPCs) both answer
 * "which locations may this user see". They drifted apart, and the drift was
 * invisible for weeks because it does not throw: the picker offered a branch,
 * the RPC returned an empty set for it, and the screen rendered `0` — which
 * reads as "no bookings" rather than "no access".
 *
 * Website reservations is where it surfaced. Bookings stored with the right
 * merchant_id and location_id were absent from /dashboard/reservations, and
 * every layer reported success.
 */

/** Every `members.role` observed on staging, 2026-08-29. */
const REAL_ROLES = [
  "merchant.owner",
  "merchant.admin",
  "merchant.manager",
  "hq.super_admin",
  "hq.platform_admin",
] as const;

describe("grantsAllMerchantLocations", () => {
  it("grants every location to an owner and an admin", () => {
    expect(grantsAllMerchantLocations("merchant.owner")).toBe(true);
    expect(grantsAllMerchantLocations("merchant.admin")).toBe(true);
  });

  /**
   * A manager is scoped to the locations they are assigned to. `is_merchant_admin()`
   * would admit them, which is exactly why the migration uses `is_merchant_owner()`
   * instead — the database must not grant access the picker never offered.
   */
  it("does not grant every location to a manager", () => {
    expect(grantsAllMerchantLocations("merchant.manager")).toBe(false);
  });

  it("treats HQ roles as no grant, since they hold no merchant membership", () => {
    expect(grantsAllMerchantLocations("hq.super_admin")).toBe(false);
    expect(grantsAllMerchantLocations("hq.platform_admin")).toBe(false);
  });

  /** `members.role` is nullable, and a row without one is an unfinished invite. */
  it("treats a missing role as no grant", () => {
    expect(grantsAllMerchantLocations(null)).toBe(false);
    expect(grantsAllMerchantLocations(undefined)).toBe(false);
    expect(grantsAllMerchantLocations("")).toBe(false);
  });

  it("does not grant on an unrecognised role", () => {
    expect(grantsAllMerchantLocations("merchant.cashier")).toBe(false);
    expect(grantsAllMerchantLocations("merchant.owner ")).toBe(false);
    expect(grantsAllMerchantLocations("MERCHANT.OWNER")).toBe(false);
  });
});

describe("parity with user_location_ids()", () => {
  /**
   * The assertion that matters: over every role that actually occurs, the
   * picker and the SQL gate agree. If they ever diverge again, this fails
   * rather than a merchant quietly losing sight of their own bookings.
   */
  it("answers exactly what the SQL gate answers, for every role in use", () => {
    for (const role of REAL_ROLES) {
      expect(grantsAllMerchantLocations(role), role).toBe(sqlGrantsAllMerchantLocations(role));
    }
  });

  it("agrees on absent and unknown roles", () => {
    for (const role of [null, undefined, "", "merchant.cashier", "nonsense"]) {
      expect(grantsAllMerchantLocations(role), String(role)).toBe(
        sqlGrantsAllMerchantLocations(role),
      );
    }
  });

  /**
   * The one deliberate, documented divergence. These legacy strings occur zero
   * times in `members` on staging; production has not been audited, so the
   * TypeScript side still honours them rather than risk stripping a real owner
   * of their locations.
   *
   * This test pins the divergence so it stays a decision rather than becoming a
   * surprise: if one of these ever appears in `members`, the SQL helper must
   * learn about it too, or the row must be migrated.
   */
  it("keeps the legacy aliases TypeScript-only, knowingly", () => {
    for (const role of LEGACY_MERCHANT_ALL_LOCATION_ROLES) {
      expect(grantsAllMerchantLocations(role), role).toBe(true);
      expect(sqlGrantsAllMerchantLocations(role), role).toBe(false);
    }
  });

  it("never overlaps the two role lists", () => {
    for (const role of MERCHANT_ALL_LOCATION_ROLES) {
      expect(LEGACY_MERCHANT_ALL_LOCATION_ROLES as readonly string[]).not.toContain(role);
    }
  });
});
