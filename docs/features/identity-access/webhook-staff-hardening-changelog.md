# Clerk Webhook & Staff Operations — Hardening Changelog

## Files Modified

- `supabase/functions/clerk-webhooks/index.ts`
- `app/dashboard/actions/unified-staff.ts`

---

## Changes by Category

### 1. Missing Handlers (Security)

#### 1A. Added `organizationMembership.deleted` handler
When a member is removed from a Clerk org, the webhook now:
- Finds the `members` row by `user_id + organization_id`
- Deactivates all `location_members` rows (sets `is_active = false`)
- Deactivates the linked `staff_profiles` row
- Hard-deletes the `members` row
- Returns 200 (idempotent if member already removed)
- Deactivations run in parallel for efficiency

#### 1B. `handleOrganizationMembershipUpdated` — role sync
- Now extracts `roleCode` from `public_metadata.roleCode` (our Supabase role codes)
- Does NOT map Clerk roles (org:admin/org:member) since they're too coarse — both `merchant.owner` and `merchant.admin` are `org:admin`
- Updates `members.role` when roleCode is present
- Syncs `role_code` to all `location_members` for that user+merchant

---

### 2. Silent Failures → Proper Error Handling

#### 2A. `handleOrganizationUpdated` — carrier/merchant update errors
- Carrier and merchant name updates now capture `{ error }` and log failures as non-fatal

#### 2B. `DemoteClerkToPOSOnly` — Promise.all location update errors
- `Promise.all()` results are now checked via `.find((r) => r.error)`
- Returns error before proceeding to staff_profiles/members updates if any location update fails

#### 2C. `ensureUserExists` — removed `ignoreDuplicates: true`
- Upsert now actually updates name/email/avatar when user already exists instead of silently skipping

#### 2D. `DemoteClerkToPOSOnly` — staff_profiles and members error checks
- Both updates now capture and check errors, returning early on failure instead of silently continuing

#### 2E. `UpdateStaffProfile` — users table error check
- Users table update now logs errors (non-fatal since staff_profiles is the primary record)

---

### 3. Race Conditions → Idempotency

#### 3A. `staff_profiles` INSERT — handle 23505 gracefully
- Duplicate-key error (23505) on INSERT now re-fetches the existing profile instead of returning 500
- Covers the case where two concurrent webhooks both see `existingProfile = null`

#### 3B. `location_members` INSERT — handle 23505 gracefully
- Duplicate-key error (23505) on INSERT is now treated as success (idempotent)

---

### 4. Data Consistency

#### 4A. `DemoteClerkToPOSOnly` — fail on non-idempotent Clerk errors
- Only continues on 404 / "resource_not_found" (membership already removed)
- All other errors (e.g., "last admin", network error) abort the demotion before DB changes

#### 4B. Early-exit verification in membership created webhook
- Before returning 200 on early-exit, now verifies `location_members` also exist
- If member row exists but location assignments are missing, continues provisioning instead of returning incomplete 200

#### 4C. Promotion rollback preserves original roles
- When promotion fails at step 2 (location_members) or step 3 (members), rollback now restores each location_member's original `role_code` instead of hardcoding `'staff'`
- Prevents accidental role downgrade on promotion failure

---

### 5. Code Quality (from /simplify review)

- Fixed `long_message` → `longMessage` (correct Clerk SDK field name) in DemoteClerkToPOSOnly
- Simplified `locMemberCount && locMemberCount > 0` → `locMemberCount` (0 is falsy)
- Parallelized location_members + staff_profiles deactivation in membership deleted handler

---

## Not Changed (noted for future)

- Clerk error extraction pattern (`errors.map(e => e.longMessage || e.message).join("; ")`) is duplicated in CreateClerkUserDirectly and UpgradePOSStaffToClerk — could be extracted to a shared helper
- `ADMIN_ROLE_CODES` constant is defined in both unified-staff.ts and webhook (different runtimes, so intentional)
