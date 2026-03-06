# DM-013 Plan: Merchant Onboarding, Billing, and Location Compliance

**Owner:** Ali + Codex  
**Date:** February 24, 2026  
**Surface:** Next.js Admin Dashboard (HQ/Carrier) + Merchant Dashboard + Supabase

## Scope

This workstream covers `DM-013-01` through `DM-013-09` with a total of **35 points**.

## Execution Snapshot (Current)

1. `DM-013-01`: Implemented in code. Pending migration apply + QA.
2. `DM-013-02`: Implemented in code. Pending migration apply + QA.
3. `DM-013-03`: Core implemented (wizard + server action). Pending final QA and carrier non-HQ path decision.
4. `DM-013-04`: Core implemented (merchant/admin billing routes + save/load actions). Pending processor token UI hardening + QA.
5. `DM-013-05`: Completed (status actions + checklist + auto-activation trigger + QA confirmation).
6. `DM-013-06`: In progress (location wizard Tax UI step added).
7. `DM-013-07`: In progress in UI only (banking step shell added, backend wiring deferred due hold).
8. `DM-013-08` and `DM-013-09`: Not started.

## Latest Validation Update (March 6, 2026)

1. Status-management flow (`DM-013-05`) is user-validated.
2. Location wizard UI updates for `DM-013-06` and `DM-013-07` are user-validated at the UI layer.
3. Banking persistence/tokenization remains paused under bank-related hold policy.

## Banking Work Hold

`[BANK-RELATED: HOLD]` = do not implement or test further until admin approval.

Tickets currently under hold:
1. `DM-013-01` (billing profile surface)
2. `DM-013-02` (location banking surface)
3. `DM-013-04`
4. `DM-013-07`
5. `DM-013-08` (banking-specific parts)

## Locked Product Rules

1. Merchants are created by HQ/Carrier admins, not self-sign-up.
2. Merchant lifecycle states:
- `created`
- `onboarding`
- `active`
- `suspended`
- `cancelled`
3. Each location has independent tax/banking identity.
4. Server writes use Next.js Server Actions with direct Supabase queries.
5. Never store full EIN/bank routing/account in plain DB fields; store only last-4 display values and processor tokens.
6. Merchant onboarding starts lightweight and becomes complete over time.

## Ticket List

1. `DM-013-01`: Merchant onboarding schema + `merchant_billing_profiles`.
2. `DM-013-02`: Location tax/banking schema + `location_banking_profiles`.
3. `DM-013-03`: HQ/Carrier merchant creation wizard (3-step).
4. `DM-013-04`: Merchant billing setup (ACH/card tokenized) `[BANK-RELATED: HOLD]`.
5. `DM-013-05`: Merchant onboarding status and activation controls.
6. `DM-013-06`: Add Tax & Compliance step to location wizard.
7. `DM-013-07`: Add Banking & Payouts step to location wizard `[BANK-RELATED: HOLD]`.
8. `DM-013-08`: Location settings tax/banking management `[BANK-RELATED: HOLD]`.
9. `DM-013-09`: Admin merchant list onboarding status and filters.

## Delivery Order

### Sprint A (Foundation first)

1. `DM-013-01`
2. `DM-013-02`
3. `DM-013-03`
4. `DM-013-05`

### Sprint B (Feature depth)

1. `DM-013-04`
2. `DM-013-06`
3. `DM-013-07`
4. `DM-013-08`
5. `DM-013-09`

## Implementation Notes

1. Add DB constraints and indexes in migrations for status and filter performance.
2. Add strict RLS on new billing/banking tables with role-scoped policies.
3. Keep onboarding wizard resilient:
- rollback Clerk org if DB insert fails,
- do not insert merchant if Clerk org creation fails.
4. Reuse existing location wizard patterns for added steps.
5. Menu Configuration step in location onboarding is replaced by Assign Manager (invite new or assign existing).
6. Reuse existing audit-log pipeline for status/banking/tax changes.

## Security/Compliance Notes

1. Full card/bank details must be tokenized via processor SDK/API.
2. DB stores:
- masked/last-4 values,
- processor tokens,
- verification state.
3. EIN should be encrypted-at-rest path (vault or app-level encryption), with `ein_last_four` for display.

## QA Baseline

1. Migration apply and schema validation in Supabase.
2. RLS checks for HQ admin, carrier admin, and merchant owner scopes.
3. Full happy path merchant create -> owner invite -> onboarding status transition.
4. Wizard validation checks (EIN, email, phone, banking routing/account confirmation).
5. Audit log entries for all sensitive status/tax/banking modifications.
