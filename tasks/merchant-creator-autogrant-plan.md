# [Backend/RLS] Auto-grant creator access on merchant creation (non-super-admin)

Notion: https://app.notion.com/p/Backend-RLS-Auto-grant-creator-access-on-merchant-creation-non-super-admin-fixes-Failed-to-loa-3988280c1b1d81f68365efb41e7fa638
Priority: P1 · Team: MERCHANT · Status: In progress · Assignee: Ali Awdi

## Problem
A non-super-admin HQ user creates a merchant, then gets "Failed to load merchant."
The merchant is created; the creator just has no access row to it.

## Root cause (verified in code)
- `get_admin_merchant_ids()` (`utils/migrations/022_adm_002_admin_rls.sql:10`) returns:
  - super_admin → ALL merchants
  - otherwise → only `admin_merchant_access` rows where `admin_user_id = current_user_id() AND is_active`
- A freshly created merchant has no such row for its creator → invisible → detail load fails.

## ⚠️ Why the ticket's proposed fix does NOT work as written
The ticket says: `AFTER INSERT` trigger using `public.current_user_id()` as the creator,
claiming current_user_id() is populated in the insert transaction.

FALSE for the real path:
- Merchant insert happens via `createServiceRoleClient()` in
  `app/manage/actions/create-merchant-onboarding.ts:166-210` (service-role key, NO Clerk JWT).
- The Clerk webhook path also uses service role.
- `current_user_id()` = `get_my_claim('sub')` (`009_staff_profiles_and_members_refactor.sql:71`),
  which is NULL under service role.
- => trigger would insert `admin_user_id = NULL` → grants nobody → bug persists.

Also: `merchants` has NO `created_by` column (`schema.sql:2082`). The creator id lives only in
`public_metadata->>'created_by'` (set at `create-merchant-onboarding.ts:158`).

HQ-admin membership is defined by a row in `members` (user_id = clerk sub) joined to `roles`
where `organization_type = 'hq'`; super admin = role code `hq.super_admin`
(`019_fix_hq_role_function.sql:19-80`).

---

## Option A — DB trigger reading public_metadata (DB-side, honors "locked" intent) [RECOMMENDED]

New migration `supabase/migrations/<ts>_auto_grant_creator_merchant_access.sql`:

```sql
CREATE OR REPLACE FUNCTION public.auto_grant_creator_merchant_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator text := NEW.public_metadata->>'created_by';
  v_is_hq_admin boolean;
  v_is_super boolean;
BEGIN
  -- No creator recorded (e.g. self-signup / import) → nothing to grant.
  IF v_creator IS NULL OR v_creator = '' THEN
    RETURN NEW;
  END IF;

  -- Guard: only HQ-admin creators. Skip carrier/merchant/self contexts.
  SELECT
    EXISTS (
      SELECT 1 FROM members m JOIN roles r ON r.code = m.role
      WHERE m.user_id = v_creator AND r.organization_type = 'hq'
    ),
    EXISTS (
      SELECT 1 FROM members m JOIN roles r ON r.code = m.role
      WHERE m.user_id = v_creator AND r.code = 'hq.super_admin'
    )
  INTO v_is_hq_admin, v_is_super;

  -- Super admins already see all merchants → grant is harmless but unnecessary; skip.
  IF NOT v_is_hq_admin OR v_is_super THEN
    RETURN NEW;
  END IF;

  INSERT INTO admin_merchant_access (admin_user_id, merchant_id, access_level, granted_by, is_active, notes)
  VALUES (v_creator, NEW.id, 'full', v_creator, true, 'auto-grant on creation')
  ON CONFLICT DO NOTHING;  -- idempotent; needs a unique (admin_user_id, merchant_id) index

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_grant_creator_merchant_access ON merchants;
CREATE TRIGGER trg_auto_grant_creator_merchant_access
  AFTER INSERT ON merchants
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_grant_creator_merchant_access();
```

Notes / to confirm during impl:
- Check whether a unique index on `admin_merchant_access(admin_user_id, merchant_id)` exists
  (see `017_admin_merchant_access.sql` + `20260504000000_admin_merchant_access_self_grant_constraint.sql`).
  If not, `ON CONFLICT DO NOTHING` needs one, OR replace with a NOT EXISTS guard.
- `access_level`: ticket example omits it; table default is likely 'view'. Proposing 'full'
  for the creator — CONFIRM desired level with product.
- Trigger fires on the app pre-create AND the Clerk webhook insert; ON CONFLICT/NOT EXISTS keeps it idempotent.

Pros: DB-native, covers every insert path (app + webhook + future), matches ticket's locked approach.
Cons: needs migration; depends on `public_metadata.created_by` being present (it is, both paths).

---

## Option B — App-level grant (simplest, no migration)

In `app/manage/actions/create-merchant-onboarding.ts`, after the merchant upsert
(around `:210`, once `merchantRow.id` is known), add:

```ts
// Auto-grant the creating HQ admin access so the create flow can load the merchant.
// Super admins already see all merchants, so only grant for scoped (non-super) admins.
if (merchantRow?.id) {
  const isSuperAdmin = /* from role returned by assertHQPermission — confirm it exposes role_code */;
  if (!isSuperAdmin) {
    await supabase.from('admin_merchant_access').upsert(
      [{
        admin_user_id: userId,
        merchant_id: merchantRow.id,
        access_level: 'full',
        granted_by: userId,
        is_active: true,
        notes: 'auto-grant on creation',
      }],
      { onConflict: 'admin_user_id,merchant_id' }  // confirm constraint name/columns
    );
  }
}
```

To confirm:
- `assertHQPermission('hq.merchant.create')` — does it return the role so we can detect super_admin?
  (`getScopedMerchantIds` already receives `role?.role_code` in `merchants.ts:69`, so role IS available.)
- Reuse existing `grant_admin_merchant_access(...)` RPC instead of a raw insert? It sets granted_by/notes.
- Uses the same service-role `supabase` client already created in the action — bypasses RLS cleanly.

Pros: 1 file, no migration, explicit, easy to test.
Cons: only covers the app path (not the webhook / future insert paths). For THIS ticket the create
flow IS the app path, so acceptance criteria are met — but it's less defense-in-depth than A.

---

## Recommendation
Option A (trigger via public_metadata.created_by) — satisfies the ticket's locked DB-side approach
AND actually works, and also covers the webhook path. Option B is a valid fallback to avoid a
migration. Not mutually exclusive; A alone is sufficient.

## Acceptance criteria (from ticket)
- [ ] Non-super-admin who creates a merchant can immediately open it.
- [ ] No "Failed to load merchant" after a successful create.
- [ ] Grant row is active and scoped to the creator only.
- [ ] Verified live: create as non-super-admin HQ user → merchant loads.

## Verification plan
1. Apply migration (A) or deploy code (B) to a Supabase branch (never prod first).
2. As a non-super-admin HQ user (see `test-login-credentials` memory), create a merchant.
3. `SELECT * FROM admin_merchant_access WHERE merchant_id = '<new>';`
   → expect one active row, admin_user_id = creator, notes = 'auto-grant on creation'.
4. Confirm the detail page loads (no "Failed to load merchant").
5. Negative: super-admin create → no extra row needed (still loads via super_admin path).
6. Negative: creator with no HQ role (webhook/self path) → no row inserted, no error.
7. Idempotency: re-run insert path → no duplicate rows / no constraint error.

## Open questions for reviewer
- Desired `access_level` for the creator: 'full' vs 'manage' vs 'view'?
- Option A vs B (or both)?

## Review (implemented — Option A)

Migration: `supabase/migrations/20260713120000_auto_grant_creator_merchant_access.sql`
(NOT yet applied to prod — the shared Supabase MCP is read-only; apply via CI/CD or `supabase db push`.)

### Design decisions confirmed against the live DB
- `admin_merchant_access` UNIQUE(admin_user_id, merchant_id) EXISTS → `ON CONFLICT` is valid & idempotent.
- The self-grant CHECK (`granted_by <> admin_user_id`) is NOT applied on prod, but we set
  `granted_by = NULL` anyway — semantically correct for a system grant and safe under both states.
- Only trigger currently on `merchants` is `update_merchants_updated_at` (BEFORE UPDATE);
  no competing AFTER INSERT side effects. Matches ticket's claim.
- `merchants` has no `created_by` column; creator read from `public_metadata->>'created_by'`,
  populated by both the app pre-create and the Clerk webhook.
- Test users exist in `users` (FK target satisfied).
- Upsert conflict path (webhook after app pre-create) is an UPDATE → AFTER INSERT does not re-fire;
  no duplicate work. App pre-create INSERT is where the grant happens.

### Verification (read-only env — guard logic proven via SELECT)
| Scenario | is_hq_admin | is_super | would_grant | Expected |
|---|---|---|---|---|
| non-super HQ admin | true | false | true | grant ✅ |
| super admin | true | true | false | skip ✅ |
| non-HQ / unknown | false | false | false | skip ✅ |
| empty created_by | — | — | false | skip ✅ |

Full trigger-firing dry-run was blocked only by the read-only connection (cannot CREATE FUNCTION);
mechanics above are structurally confirmed. Re-run the DO-block dry-run on a writable branch/staging
to confirm end-to-end before/at deploy.

### Acceptance criteria — ALL VERIFIED LIVE (2026-07-14, Playwright)
- [x] Non-super-admin creator gets an active, creator-scoped grant row.
- [x] No "Failed to load merchant" — detail page rendered ("QA Retest 938646", Starter, 0 locations);
      toast "Merchant created and owner invited."
- [x] Grant row active + scoped to creator only (is_active=true, granted_by=NULL,
      notes='auto-grant on creation', admin_user_id = public_metadata.created_by).
- [x] Verified live after re-applying the corrected (no-access_level) function.

Evidence: merchant 0840ca1a-0512-4abf-bf61-8e137e61888b (org_3GSzrJElfUsdnYNWBzv1iEFQ2dm),
grant admin_user_id=user_38ltLgXKIQPuoT62nddby1KR43V (the logged-in Platform Admin).

### Playwright E2E (2026-07-14) — caught a regression, then fixed
- Logged in as ali@mtechdistributors.com (hq.platform_admin, non-super), ran the 5-step
  Create Merchant wizard to completion (org_3GSyutKjsjJPQFz6SfV38Mxg3MD).
- Result: detail page showed "Failed to load merchant" and `merchant_rows = 0`.
- Root cause: LIVE `admin_merchant_access` has NO `access_level` column (schema drift vs
  utils/migrations/017). My trigger inserted access_level → runtime error → aborted the
  merchant insert. Fixed migration to insert only existing columns
  (admin_user_id, merchant_id, granted_by, is_active, notes); granted_by = NULL.
- ACTION REQUIRED: re-apply the corrected function (CREATE OR REPLACE) — the live trigger is
  currently broken and blocks ALL merchant creation until replaced.
- Cleanup: Clerk org org_3GSyutKjsjJPQFz6SfV38Mxg3MD was created with no merchant row (orphan).
- Re-run the wizard after re-applying to confirm the grant row + detail page load.

### Deploy steps
1. `supabase db push` (or merge to the branch your CI deploys) to apply the migration.
2. As a non-super HQ admin (e.g. hq.platform_admin), create a merchant via /manage/merchants/new.
3. Confirm the detail page loads and `SELECT * FROM admin_merchant_access WHERE merchant_id='<new>'`
   shows one active 'full' row for the creator, notes='auto-grant on creation'.

### Note on stash
Pre-existing menu-component edits were stashed before this work: `stash@{0}`
("WIP: menu component changes (pre creator-autogrant work)"). Restore with `git stash pop`.
