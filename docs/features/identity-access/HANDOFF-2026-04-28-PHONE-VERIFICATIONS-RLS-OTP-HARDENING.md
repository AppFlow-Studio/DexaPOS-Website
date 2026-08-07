# Handoff: Phone Verifications RLS and OTP Hardening

**Date:** 2026-04-28  
**Source QA finding:** `TC-XCC-SEC-001`  
**Purpose:** close the `phone_verifications` portion of the earlier RLS audit and remove plaintext OTP storage from the storefront OTP flow.

## What was confirmed before the fix

The QA finding was real.

Confirmed pre-fix state:

1. `public.phone_verifications` existed.
2. RLS was enabled and forced.
3. No `pg_policies` rows existed for the table.
4. Storefront OTP used raw service-role reads and writes in `app/sites/auth-actions.ts`.
5. OTP values were stored in plaintext in the `code` column.

Important nuance:

- direct `anon` access to the table was already blocked by "RLS with no policy"
- the real gap was that the table had no explicit policy model and the OTP flow depended on elevated server-side access

## What this fix does

### 1. Replaces plaintext OTP storage with bcrypt hashes

Migration:

- `supabase/migrations/20260428160000_phone_verifications_rls_rpc_hardening.sql`

Changes:

1. renames `phone_verifications.code` to `code_hash`
2. backfills existing rows with `extensions.crypt(...)`
3. adds `request_ip inet` for coarse abuse-rate tracking
4. keeps the existing table shape otherwise intact

### 2. Adds an explicit RLS policy

Direct table access is denied for:

1. `anon`
2. `authenticated`

Policy:

- `phone_verifications_direct_access_denied`

This resolves the `rls_enabled_no_policy` state without reopening direct reads.

### 3. Moves legitimate table access into SECURITY DEFINER RPCs

New RPCs:

1. `public.issue_phone_verification_otp(...)`
2. `public.verify_phone_verification_otp(...)`
3. `public.cleanup_phone_verifications()`

These functions:

1. hash the OTP before insert
2. throttle issuance per phone number
3. throttle issuance per IP address
4. verify against the stored bcrypt hash
5. increment failed attempts
6. mark `verified_at` on success
7. delete expired rows on a schedule

Important security decision:

- these RPCs are executable by `service_role` only
- they are intentionally not exposed to `anon` or `authenticated`
- exposing them to `anon` would let a client choose its own OTP code and self-verify without ever receiving SMS

### 4. Rewires the storefront OTP flow

Updated file:

- `app/sites/auth-actions.ts`

Changes:

1. `sendOtp(...)` now calls `issue_phone_verification_otp` through the existing server-side service-role client
2. `verifyOtp(...)` now calls `verify_phone_verification_otp` through the same server-side path
3. service-role is still used for:
   - reading `online_store_config`
   - customer creation
   - `online_order_sessions`
4. if Twilio send fails, the newly inserted verification row is deleted to avoid polluting rate limits

## Why this approach was chosen

The ticket description assumed a direct table-access model based on session claims.

That does not match the current app.

Current storefront OTP flow is server-action based, so the safer model is:

1. no direct table access for `anon` or `authenticated`
2. only server-side RPC execution can touch `phone_verifications`
3. storefront server actions call those RPCs

This fixes the RLS finding, removes plaintext OTP storage, and avoids introducing a client-callable OTP bypass.

## Files changed

1. `supabase/migrations/20260428160000_phone_verifications_rls_rpc_hardening.sql`
2. `app/sites/auth-actions.ts`
3. `supabase/validation/048_phone_verifications_rls_validation.sql`
4. `docs/features/identity-access/HANDOFF-2026-04-28-PHONE-VERIFICATIONS-RLS-OTP-HARDENING.md`

## How to test on staging

Apply the migration first:

- `supabase/migrations/20260428160000_phone_verifications_rls_rpc_hardening.sql`

Then run:

- `supabase/validation/048_phone_verifications_rls_validation.sql`

### Expected SQL results

1. `phone_verifications` still shows `rls_enabled = true` and `rls_forced = true`
2. `pg_policies` now returns the deny-direct-access policy
3. direct `anon` table reads return `0` rows
4. `anon` cannot execute the OTP RPCs directly
5. `service_role` still sees full row count and can execute the OTP RPCs
6. `cron.job` contains `cleanup-phone-verifications`

### App smoke tests

1. request storefront OTP for a valid phone number
2. confirm Twilio send still works or, in development, confirm the code logs locally
3. verify the OTP with the correct code
4. verify customer session creation still works
5. enter a wrong code repeatedly and confirm max-attempt messaging still works

## Remaining notes

1. this fix keeps the current customer/session flow intact
2. it narrows only the `phone_verifications` path
3. if the team later moves fully to Twilio Verify, the table-backed OTP issuance path can be removed entirely
