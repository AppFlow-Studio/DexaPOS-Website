# DM-013 Status: Merchant Onboarding and Billing

**Owner:** Ali + Codex  
**Started:** February 24, 2026  
**Total Points:** 35  
**Overall Status:** In Progress

## Banking Hold Indicator

`[BANK-RELATED: HOLD]` means do not continue implementation/testing until admin approval is received.

Current hold scope:
1. `DM-013-01` (billing profile table/policies validation only, no new banking changes)
2. `DM-013-02` (location banking portions)
3. `DM-013-04` (merchant billing UI/flows)
4. `DM-013-07` (location banking & payouts wizard step)
5. `DM-013-08` (location tax & banking management where banking fields are involved)

## What This Workstream Covers

1. Merchant onboarding schema expansion.
2. Location tax and banking schema expansion.
3. HQ/Carrier merchant creation wizard.
4. Merchant billing setup flow.
5. Merchant activation/suspension/cancellation controls.
6. Location wizard tax + banking step additions.
7. Location settings tax/banking management.
8. Admin merchant list onboarding status filters.

## Ticket Progress

| Ticket | Points | Status | Progress |
|---|---:|---|---:|
| DM-013-01 | 3 | Implemented (Pending Migration Apply + QA) `[BANK-RELATED: HOLD]` | 90% |
| DM-013-02 | 3 | Implemented (Pending Migration Apply + QA) `[BANK-RELATED: HOLD]` | 90% |
| DM-013-03 | 5 | In Progress (Core Flow Implemented) | 80% |
| DM-013-04 | 5 | In Progress (Core Flow Implemented) `[BANK-RELATED: HOLD]` | 75% |
| DM-013-05 | 3 | Implemented (Pending Migration Apply + QA) | 90% |
| DM-013-06 | 5 | Not Started | 0% |
| DM-013-07 | 5 | Not Started `[BANK-RELATED: HOLD]` | 0% |
| DM-013-08 | 3 | Not Started `[BANK-RELATED: HOLD]` | 0% |
| DM-013-09 | 3 | Not Started | 0% |

## Current Phase

1. Docs and tracker setup complete.
2. Schema foundation execution in progress:
- `DM-013-01` code implementation complete (migration + type updates).
- `DM-013-02` code implementation complete (migration + type updates).
3. `DM-013-03` implementation is in progress with core wizard/action flow now added.
4. `DM-013-05` implementation is complete in code and pending migration apply + QA.
5. `DM-013-04` core billing flow is now implemented and pending QA + tokenization integration hardening.

## Completed in This Step (DM-013-01)

1. Added migration: `supabase/migrations/033_dm_013_01_merchant_onboarding_schema.sql`.
2. Expanded `public.merchants` with onboarding/business fields.
3. Added merchant constraints:
- `onboarding_status` enum-like check.
- `business_type` enum-like check.
- `ein_last_four` format check.
4. Added index: `idx_merchants_onboarding_status`.
5. Created `public.merchant_billing_profiles` with:
- ACH/card metadata fields (last-4/token model),
- verification/primary/active state,
- `updated_at` trigger.
6. Added billing profile constraints for billing/account/card formats.
7. Added RLS policies on `merchant_billing_profiles`:
- HQ admins full access,
- carrier org users read-only for their merchants,
- merchant owners read/write for own merchant.
8. Updated local Supabase types in `database.types.ts`:
- new `merchants` fields,
- new `merchant_billing_profiles` table types.

## Pending for DM-013-01 QA

1. Apply migration `033` in Supabase target environment.
2. Verify policies with HQ admin, carrier admin, merchant owner accounts.
3. Validate no full sensitive values are persisted (only last-4/token metadata).

## Completed in This Step (DM-013-02)

1. Added migration: `supabase/migrations/034_dm_013_02_location_tax_banking_schema.sql`.
2. Expanded `public.locations` with:
- `ein`, `ein_last_four`, `tax_id`, `sales_tax_rate`, `tax_registration_status`,
- `onboarding_step`, `onboarding_completed`.
3. Added location constraints:
- `tax_registration_status` allowed set,
- `sales_tax_rate` range check,
- `ein_last_four` format check,
- `onboarding_step` range check.
4. Added trigger function `public.set_location_ein_last_four()` to derive last-4 when plain EIN is provided.
5. Created `public.location_banking_profiles` with payout schedule + token/last-4 model.
6. Added banking constraints:
- `account_type` check,
- `payout_frequency` check,
- last-4 checks,
- payout day range checks.
7. Added trigger function `public.sync_location_banking_profile_merchant_id()` for location->merchant consistency.
8. Added RLS policies on `location_banking_profiles`:
- HQ admins full access,
- carrier users read-only for their carrier scope,
- merchant owners read/write for their own merchant locations.
9. Updated local Supabase types in `database.types.ts`:
- new `locations` fields,
- new `location_banking_profiles` table types.

## Pending for DM-013-02 QA

1. Apply migration `034` in Supabase target environment.
2. Verify RLS role behavior on `location_banking_profiles`.
3. Validate `ein_last_four` derivation behavior and payout constraints.

## Completed in This Step (DM-013-03 Core)

1. Added server action: `app/manage/actions/create-merchant-onboarding.ts`.
2. Added new route: `app/manage/merchants/new/page.tsx`.
3. Added 3-step wizard UI: `app/manage/merchants/new/wizard.tsx`.
4. Wizard flow now includes:
- Step 1: Business info (`businessLegalName`, `dbaName`, `businessType`, `einLastFour`)
- Step 2: Owner + address info
- Step 3: Review + carrier assignment
5. Action behavior implemented:
- permission gate via `assertHQPermission('hq.merchant.create')`,
- Clerk organization creation,
- merchant upsert with onboarding fields (`onboarding_status='onboarding'`),
- owner invitation creation,
- rollback (delete Clerk org) on failure after org creation,
- revalidation + redirect target support.
6. Updated navigation links to new route:
- `app/manage/layout.tsx`
- `app/manage/merchants/page.tsx`
7. Added legacy route redirect:
- `app/manage/create-merchant/page.tsx` -> `/manage/merchants/new`.

## Pending for DM-013-03 Completion

1. Carrier auto-assign path for non-HQ carrier admins is not enabled yet because `/manage` is HQ-only in current middleware.
2. QA pass for wizard end-to-end with real Clerk invite acceptance.

## Completed in This Step (DM-013-04 Core)

1. Added merchant billing server actions:
- `app/manage/actions/merchant-billing.ts`
- `getMerchantBillingProfiles(merchantId)`
- `saveMerchantBilling(params)`
2. Added merchant billing UI component:
- `components/billing/MerchantBillingSetupCard.tsx`
3. Added merchant dashboard billing route:
- `app/dashboard/settings/billing/page.tsx`
4. Added admin billing route:
- `app/manage/merchants/[merchantId]/billing/page.tsx`
5. Added quick navigation links:
- Admin merchant detail now links to `/manage/merchants/[merchantId]/billing`
- Dashboard settings page links to `/dashboard/settings/billing`
6. Security behavior enforced in server action:
- ACH saves only last-4 for account/routing
- Card path saves token + last-4 metadata
- Existing primary profile is deactivated before new primary insert

## Pending for DM-013-04 Completion

1. Replace temporary card token input with Stripe Elements (or approved processor SDK) in UI flow.
2. Add optional read-only summary cards in merchant/admin settings parent pages.
3. Full QA pass for:
- merchant owner flow,
- HQ admin on-behalf flow,
- RLS scope boundaries for carrier/merchant/HQ actors.

## Completed in This Step (DM-013-05)

1. Added merchant onboarding status server action:
- `updateMerchantOnboardingStatus({ merchantId, newStatus, reason? })` in `app/manage/actions/merchants.ts`.
2. Added audit logging on every manual status transition via `logAdminAction(...)`.
3. Added merchant detail status/checklist UI:
- new component `app/manage/merchants/[merchantId]/components/OnboardingStatusCard.tsx`.
- integrated into `app/manage/merchants/[merchantId]/page.tsx`.
4. Added suspend reason capture dialog and cancel confirmation modal.
5. Added automatic activation migration:
- `supabase/migrations/035_dm_013_05_merchant_auto_activation.sql`.
- trigger promotes merchant from `created/onboarding` to `active` on first successful payment and writes an audit record.
6. Extended merchant list/detail data to include lifecycle fields:
- onboarding status/timestamps and owner contact fields are now merged from `merchants`.
7. Updated list status badge rendering to prefer `onboarding_status` when present.

## Pending for DM-013-05 QA

1. Apply migration `035` in target Supabase environment.
2. Verify manual status changes in UI:
- Activate, Suspend (with reason), Cancel.
3. Verify audit entries for manual and auto status transitions.
4. Verify first successful payment auto-activates merchant status.

## Security Rules (Locked)

1. Never store full bank account or full routing number.
2. Never store raw card numbers.
3. Never expose full EIN in UI; only masked/last-4 display.
4. Use tokenization for payment/bank data.

## Quick Links

1. Detailed plan:
- `docs/DM-013-MERCHANT-ONBOARDING-PLAN.md`

2. Internal execution tracker:
- `.planning/SPRINT-DM-013-MERCHANT-ONBOARDING-TRACKER.md`

3. Global ticket reference:
- `docs/ALL-TICKETS-REFERENCE.md`

4. Apply + QA checklist:
- `DM-013-APPLY-QA-CHECKLIST.md`
