/**
 * Who sees every location their merchant owns.
 *
 * This rule used to exist twice and the two copies disagreed, which is the
 * whole reason this module exists.
 *
 *  - **TypeScript** — `GetLocations` (app/dashboard/actions/get-locations.ts)
 *    reads the Clerk `members` table and, for an owner or admin, returns every
 *    location the merchant owns. This feeds the dashboard location picker.
 *  - **SQL** — `user_location_ids()` decides what RLS policies and RPCs will
 *    actually answer for. Its merchant-level branch was unsatisfiable (it
 *    matched on `roles.level_type IN ('merchant','organization')`, values no
 *    merchant role carries), so in practice it meant "active `location_members`
 *    rows only".
 *
 * The picker therefore offered locations the data layer refused, and screens
 * rendered an empty list instead of an access error — a false zero, which is
 * worse than an error because it reads as an answer. Migration
 * `20260829120000_user_location_ids_merchant_admin_branch` repairs the SQL
 * branch to use `is_merchant_owner()`, which reads the same `members` table
 * this module reads.
 *
 * `merchant-location-access.test.ts` asserts the two stay in step.
 */

/**
 * Clerk `members.role` values that grant every location of the merchant.
 *
 * Mirrors `is_merchant_owner()`, which checks
 * `members.role IN ('merchant.owner', 'merchant.admin')`.
 *
 * **Not `is_merchant_admin()`**, despite the name being the more obvious match:
 * that helper also admits `merchant.manager`, which would make the database
 * grant broader access than the picker ever offered.
 */
export const MERCHANT_ALL_LOCATION_ROLES = [
  "merchant.owner",
  "merchant.admin",
] as const;

/**
 * Legacy role strings the TypeScript side still honours and the SQL side does
 * not.
 *
 * Zero rows on staging carry either value (checked 2026-08-29: the only roles
 * in `members` are `merchant.owner`, `merchant.admin`, `merchant.manager`,
 * `hq.super_admin` and `hq.platform_admin`). They are kept because production
 * has not been audited and dropping them would silently strip a real owner of
 * their locations — a far worse failure than the widening they represent.
 *
 * If one of these ever appears in `members`, the parity test's premise breaks
 * and the SQL helper must learn about it too. Prefer migrating the row.
 */
export const LEGACY_MERCHANT_ALL_LOCATION_ROLES = ["org:admin", "admin"] as const;

/**
 * Whether this Clerk org role sees every location the merchant owns.
 *
 * Accepts `null`/`undefined` because `members.role` is nullable and a row
 * without one is an incomplete invitation, not an administrator.
 */
export function grantsAllMerchantLocations(role: string | null | undefined): boolean {
  if (!role) return false;
  return (
    (MERCHANT_ALL_LOCATION_ROLES as readonly string[]).includes(role) ||
    (LEGACY_MERCHANT_ALL_LOCATION_ROLES as readonly string[]).includes(role)
  );
}

/**
 * The SQL side's predicate, modelled in TypeScript so a test can run both over
 * the same rows. Kept beside the rule it mirrors rather than inside the test,
 * so a change to one is visibly a change to the other.
 *
 * This is `is_merchant_owner(p_merchant_id)` as the migration leaves it:
 * a `members` row for this user and this merchant's org, with an owner/admin
 * role.
 */
export function sqlGrantsAllMerchantLocations(role: string | null | undefined): boolean {
  if (!role) return false;
  return (MERCHANT_ALL_LOCATION_ROLES as readonly string[]).includes(role);
}
