# Bay Ridge Owner Identity Relink

## Ticket

Data remediation: owner mis-provisioned as `pos_only` with no Clerk linkage and no `members` row, causing merchant-dashboard reactivation to fail with `Member not found`.

Merchant:

- `Bay Ridge House of Wings`
- `merchant_id = a7af715f-586f-4229-bb34-fc9947e0a474`

Affected person:

- `Moe Money`
- `moekadi68@gmail.com`
- `staff_profile_id = bf0234fb-3270-49d9-b1a4-2600a8973752`
- existing Clerk user: `user_3D36TxS8Ysfd4Qefg0kLOeXvAOi`

## Scope

- Shared identity/account data remediation
- Website repo is the primary implementation surface
- POS repo is impacted only indirectly through shared `members` and org-membership data
- No POS UI or tablet code change is required for the root-cause fix
- Companion hardening ticket remains separate:
  - do not mix generic status-toggle fallback logic into this data-remediation stream

## Implemented In Repo

### 1. HQ recurrence guard

Implemented in:

- `app/manage/actions/admin-merchant/staff.ts`

What changed:

- `adminCreateStaff(...)` now validates the selected role before creating a POS-only profile
- it rejects roles that imply dashboard/Clerk access
- it also rejects roles outside the merchant scope

Why:

- this closes the easiest known recurrence path where an HQ-only POS-staff creation action could be called with an owner/admin role

### 2. Deterministic repair utility

Implemented in:

- `scripts/repair-staff-clerk-link.ts`

What it does:

- loads target merchant + staff profile
- verifies the existing Clerk user
- ensures Clerk org membership exists with the intended org role
- ensures the `users` row exists
- repairs `staff_profiles`
- repairs or creates the `members` row
- repairs `location_members.user_id`
- defaults to dry-run

Usage:

```powershell
npx tsx scripts/repair-staff-clerk-link.ts `
  --merchant a7af715f-586f-4229-bb34-fc9947e0a474 `
  --staff-profile bf0234fb-3270-49d9-b1a4-2600a8973752 `
  --clerk-user user_3D36TxS8Ysfd4Qefg0kLOeXvAOi `
  --email moekadi68@gmail.com
```

Apply:

```powershell
npx tsx scripts/repair-staff-clerk-link.ts `
  --merchant a7af715f-586f-4229-bb34-fc9947e0a474 `
  --staff-profile bf0234fb-3270-49d9-b1a4-2600a8973752 `
  --clerk-user user_3D36TxS8Ysfd4Qefg0kLOeXvAOi `
  --email moekadi68@gmail.com `
  --run
```

Operational note:

- the current local `.env` is staging-only in this repo
- production repair requires running the same script with production Supabase + Clerk credentials in environment

## Repo Verification

### Merchant dashboard failure path

Verified in `app/dashboard/actions/unified-staff.ts`:

- `ReactivateStaffMember(memberId, ...)` loads the record from `members` first
- if no `members` row exists, it returns `Member not found`
- the same dependency exists in:
  - `UpdateStaffLocationAssignment(...)`
  - `ResetStaffPIN(...)`
  - `DeactivateStaffMember(...)`
  - `DemoteClerkToPOSOnly(...)`
  - `UpgradePOSStaffToClerk(...)`

This exactly matches the merchant-dashboard impersonation screenshot.

### Unified staff view behavior

Verified in `supabase/migrations/20260413223430_remote_schema.sql`:

- `get_unified_staff_view(...)` LEFT JOINs `members` by `staff_profile_id` or `user_id`
- rows can still appear from `location_members` even when `member_id` is null
- that means the staff table can show the person while the row remains non-actionable for member-based actions

### HQ toggle path

Verified in `app/manage/actions/admin-merchant/staff.ts` and `supabase/migrations/20260413215901_remote_schema.sql`:

- HQ toggle uses `admin_toggle_staff_status(p_staff_profile_id, p_location_id, p_new_status)`
- that path works from `staff_profile_id` and `location_members`
- it does not require a `members` row

This ticket is therefore specifically about the merchant-side unified staff directory and shared identity shape, not the HQ toggle RPC itself.

### POS impact

Verified in `C:\Users\Ali DIka\Desktop\Dexa-POS\app\(auth)\store-select.tsx`:

- Clerk-authenticated store selection loads `users -> members -> organizations`
- if the Clerk user is not linked into the merchant org through `members`, POS store/org resolution can fail or return no accessible merchant context

Important boundary:

- PIN login itself is still based on `location_members` and staff/PIN flows
- relinking the Clerk user fixes shared org identity
- it does not automatically create a PIN

If Moe also needs tablet PIN login after the relink, run a normal PIN reset/set flow after the data repair.

## Root Cause Assessment

The broken shape is:

- `staff_profiles.account_type = 'pos_only'`
- `staff_profiles.user_id = NULL`
- no `members` row for the staff profile
- owner role still present in `location_members`
- existing Clerk user already exists separately

This is not the normal steady-state model for an owner.

### Verified recurrence risk

The current merchant dashboard create-staff wizard separates:

- POS-only -> member-level roles
- Clerk -> admin/manager roles

So the ordinary merchant self-serve path is not the likely source of a POS-only owner.

However, the HQ action `adminCreateStaff(...)` in `app/manage/actions/admin-merchant/staff.ts` is still a direct POS-only insert path and does not itself enforce a role-level Clerk requirement before inserting the profile.

That does not prove it created this record, but it is a credible recurrence risk if called with an owner/admin role outside the intended UI guardrails.

## Critical Implementation Caveat

The ticket's preferred "membership webhook only" repair path is not sufficient by itself for this exact orphaned shape.

Why:

- the merchant membership webhook promotion path in `supabase/functions/clerk-webhooks/index.ts` updates `members` by:
  - `.eq('staff_profile_id', promotionStaffProfileId)`
  - `.eq('organization_id', organizationId)`
- if the `members` row is fully missing, that update can affect zero rows without creating one

So for this ticket, the remediation must guarantee all three tables are repaired:

- `staff_profiles`
- `members`
- `location_members`

## Recommended Repair Strategy

### Preferred operational sequence

1. Confirm Bay Ridge merchant `clerk_org_id`.
2. Confirm no existing merchant-org membership already exists for `user_3D36TxS8Ysfd4Qefg0kLOeXvAOi`.
3. Add the existing Clerk user to the Bay Ridge Clerk organization as owner/admin.
4. Repair the database rows deterministically:
   - use the actual Clerk membership id as `members.id` if the row must be created manually
   - set `staff_profiles.user_id`
   - set `staff_profiles.account_type = 'clerk'`
   - set `staff_profiles.is_active = true`
   - upsert/create the `members` row
   - set `location_members.user_id`
   - keep `location_members.staff_profile_id`
   - normalize `location_members.role_code = 'merchant.owner'`
5. Re-test merchant dashboard reactivate/deactivate.
6. If POS PIN access is desired, set/reset a PIN after the identity repair.

### Why this is the recommended sequence

- It fixes the shared identity model used by both website and POS auth surfaces.
- It does not depend on the current webhook promotion branch to create a missing `members` row.
- It preserves the existing Clerk user instead of reinviting or creating a duplicate person.
- It keeps `members.id` aligned with the real Clerk membership when the row is repaired manually.

## Deterministic Data Repair Shape

Expected final state:

- `staff_profiles.id = bf0234fb-3270-49d9-b1a4-2600a8973752`
  - `user_id = 'user_3D36TxS8Ysfd4Qefg0kLOeXvAOi'`
  - `account_type = 'clerk'`
  - `is_active = true`
- `members`
  - `organization_id = <Bay Ridge clerk_org_id>`
  - `user_id = 'user_3D36TxS8Ysfd4Qefg0kLOeXvAOi'`
  - `staff_profile_id = 'bf0234fb-3270-49d9-b1a4-2600a8973752'`
  - `role = 'merchant.owner'`
- `location_members`
  - existing assignment row remains
  - `user_id = 'user_3D36TxS8Ysfd4Qefg0kLOeXvAOi'`
  - `staff_profile_id` remains unchanged
  - `is_active = true`

## Production Rollout Steps

This ticket is not complete with a SQL migration alone.

Production requires both code deployment and live identity/data repair.

### Required order

1. Merge the website branch that contains:
   - `app/manage/actions/admin-merchant/staff.ts`
   - `scripts/repair-staff-clerk-link.ts`
   - this ticket documentation
2. Deploy the website production branch.
3. Run the repair script with production Supabase service-role credentials and production Clerk secret:

```powershell
npx tsx scripts/repair-staff-clerk-link.ts `
  --merchant a7af715f-586f-4229-bb34-fc9947e0a474 `
  --staff-profile bf0234fb-3270-49d9-b1a4-2600a8973752 `
  --clerk-user user_3D36TxS8Ysfd4Qefg0kLOeXvAOi `
  --email moekadi68@gmail.com `
  --run
```

4. Verify the repaired account in production:
   - merchant dashboard login works
   - merchant-side reactivation/deactivation works
   - no `Member not found` toast remains
5. If Moe also needs tablet PIN login:
   - run the normal PIN reset/generate flow separately

### Explicit non-steps

- No new POS repo code change is required for this ticket.
- No standalone Supabase schema migration is required for this ticket.
- Do not treat Clerk org-membership repair as something a SQL migration can finish by itself.

## Verification Queries

### 1. Merchant org lookup

```sql
select
  id as merchant_id,
  name,
  clerk_org_id
from public.merchants
where id = 'a7af715f-586f-4229-bb34-fc9947e0a474';
```

### 2. Broken profile state

```sql
select
  sp.id,
  sp.merchant_id,
  sp.user_id,
  sp.account_type,
  sp.is_active,
  sp.email,
  sp.first_name,
  sp.last_name
from public.staff_profiles sp
where sp.id = 'bf0234fb-3270-49d9-b1a4-2600a8973752';
```

### 3. Member lookup by staff profile or user

```sql
select
  m.id,
  m.user_id,
  m.organization_id,
  m.role,
  m.staff_profile_id,
  m.created_at,
  m.updated_at
from public.members m
where m.staff_profile_id = 'bf0234fb-3270-49d9-b1a4-2600a8973752'
   or m.user_id = 'user_3D36TxS8Ysfd4Qefg0kLOeXvAOi';
```

### 4. Location-members linkage

```sql
select
  lm.id,
  lm.location_id,
  lm.merchant_id,
  lm.user_id,
  lm.staff_profile_id,
  lm.role_code,
  lm.is_active,
  lm.is_primary_location,
  lm.pin_plain,
  lm.pin_code
from public.location_members lm
where lm.staff_profile_id = 'bf0234fb-3270-49d9-b1a4-2600a8973752';
```

### 5. Post-fix audit

```sql
select
  sp.account_type,
  count(*) as orphan_count
from public.staff_profiles sp
left join public.members m
  on m.staff_profile_id = sp.id
  or m.user_id = sp.user_id
where m.id is null
group by sp.account_type
order by sp.account_type;
```

Expected:

- no orphan row for staff that should carry a Clerk/member identity
- if any `pos_only` rows remain, they should be intentional POS-only staff

## Validation Checklist

### Website

1. Merchant dashboard impersonation:
   - `/dashboard/staff`
2. Locate Moe in inactive filter/state.
3. Reactivate succeeds without `Member not found`.
4. Deactivate succeeds afterward as a regression check.
5. Moe can authenticate to the merchant dashboard.

### POS

1. Clerk-authenticated store selection:
   - confirm merchant org/store is visible for the relinked user if that flow is used
2. If tablet PIN login is required:
   - reset or generate a PIN after the relink
   - verify PIN sign-in separately

## Decision

This ticket should be handled as:

- shared data remediation
- website-side verification stream
- cross-surface validation for POS auth

It should not be treated as a POS app code ticket.

## Follow-Up Recommendations

1. Keep Ali Awdi's companion hardening ticket separate:
   - merchant dashboard staff toggle should not hard-fail on missing `members`
2. Add HQ-side guardrails so `adminCreateStaff(...)` cannot be used to create owner/admin records as POS-only, even if a caller bypasses the wizard UI
3. Run the orphan audit across production and record any other non-intentional missing-`members` cases
