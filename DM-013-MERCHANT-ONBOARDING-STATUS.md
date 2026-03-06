# DM-013 Status: Merchant Onboarding and Billing (Merchant & Location Onboarding )

**Owner:** Ali 
**Started:** February 24, 2026  
**Total Points:** 35  
**Overall Status:** In Progress (Non-banking scope wrapped; banking scope held)

## Banking Hold Indicator


`[BANK-RELATED: HOLD]` means do not continue implementation/testing until admin approval is received.

Current hold scope:
1. `DM-013-01` (billing profile table/policies validation only, no new banking changes)
2. `DM-013-02` (location banking portions)
3. `DM-013-04` (merchant billing UI/flows)
4. `DM-013-07` (location banking & payouts wizard step)
5. `DM-013-08` (location tax & banking management where banking fields are involved)

## Notion Marker List (Banking)

Use this marker in Notion: `[BANK-RELATED: HOLD]`

1. `DM-013-01` `[BANK-RELATED: HOLD]`
2. `DM-013-02` `[BANK-RELATED: HOLD]`
3. `DM-013-04` `[BANK-RELATED: HOLD]`
4. `DM-013-07` `[BANK-RELATED: HOLD]`
5. `DM-013-08` `[BANK-RELATED: HOLD]` (banking sub-scope only; tax sub-scope is active)

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
| DM-013-03 | 5 | In Progress (Core Flow implemented; carrier `/manage` access path blocked by HQ-only middleware) | 85% |
| DM-013-04 | 5 | In Progress (Core Flow Implemented) `[BANK-RELATED: HOLD]` | 75% |
| DM-013-05 | 3 | Completed (QA Confirmed) | 100% |
| DM-013-06 | 5 | Completed (QA Confirmed, non-banking scope) | 100% |
| DM-013-07 | 5 | In Progress (UI Shell Only) `[BANK-RELATED: HOLD]` | 30% |
| DM-013-08 | 3 | In Progress (Tax settings + dedicated route implemented, banking scope on hold) `[BANK-RELATED: HOLD]` | 60% |
| DM-013-09 | 3 | Completed (QA Confirmed) | 100% |

## Current Phase

1. Docs and tracker setup complete.
2. Schema foundation execution in progress:
- `DM-013-01` code implementation complete (migration + type updates).
- `DM-013-02` code implementation complete (migration + type updates).
3. `DM-013-03` implementation is in progress with core wizard/action flow now added.
4. `DM-013-05` implementation and QA are complete.
5. `DM-013-04` core billing flow is now implemented and pending QA + tokenization integration hardening.
6. Location wizard UI has been expanded to include Tax, Banking (UI only), and Assign Manager steps.
7. Location settings now include editable tax/compliance management in the settings sheet.

## Latest QA Confirmation (March 6, 2026)

1. DM-013-05 status actions were manually verified in UI and confirmed working.
2. DM-013-06 and DM-013-07 wizard UI flow was validated for step rendering and form behavior.
3. DM-013-09 merchant list status/owner/filter/sort was manually validated and confirmed working.
4. Banking-related persistence remains intentionally deferred due hold.
5. DM-013-08 tax settings implementation is ready for manual QA.
6. DM-013-08 dedicated location settings route is implemented and ready for QA.

## Non-Banking Wrap-Up (March 6, 2026)

1. DM-013-05 is complete and QA confirmed.
2. DM-013-06 is complete and QA confirmed (tax persistence + assign-manager flow + audit events).
3. DM-013-09 is complete and QA confirmed.
4. DM-013-08 non-banking tax scope is implemented; only banking scope remains held.
5. Remaining non-banking blocker: DM-013-03 carrier-admin create flow under `/manage` (current middleware is HQ-only).

## Completed in This Step (DM-013-09)

1. Merchant list status filter now supports onboarding lifecycle statuses:
- `created`
- `onboarding`
- `active`
- `suspended`
- `cancelled`
2. Added status sort option in merchants table UI.
3. Added owner identity display in merchant list table:
- owner full name
- owner email (when present)
4. Added owner name display in merchant grid card view.
5. Backend `getMerchants(...)` now filters lifecycle statuses using `merchants.onboarding_status`.

## DM-013-09 QA Completed

1. Status filter options validated in merchant list UI.
2. Status sort option validated.
3. Owner name/email display validated in list and grid views.

## Completed in This Step (DM-013-06 Backend Wiring)

1. Location create action now persists tax/compliance fields:
- `ein`
- `tax_id`
- `sales_tax_rate`
- `tax_registration_status`
- `onboarding_step`
- `onboarding_completed`
2. Location update action now supports tax/compliance updates for the same fields.
3. Location wizard submit now maps tax rate percent input to DB decimal format.
4. Location wizard now executes manager assignment behavior on submit:
- invite new manager -> creates location invite with `merchant.manager`
- assign existing manager -> resolves user by ID/email and creates `location_members` assignment
5. Assign Existing Manager now uses searchable user picker (no raw free-text required).
6. Manager assignment actions now emit explicit audit log events.

## Completed in This Step (DM-013-06 + DM-013-07 UI-only)

1. Updated merchant dashboard location onboarding wizard from 5 steps to 7 steps in UI:
- Location Info
- Address
- Tax & Compliance
- Banking & Payouts (UI only)
- Business Hours
- Assign Manager
- Review & Create
2. Added new wizard step components:
- `components/dashboard/locations/steps/TaxComplianceStep.tsx`
- `components/dashboard/locations/steps/BankingPayoutsStep.tsx`
- `components/dashboard/locations/steps/AssignManagerStep.tsx`
3. Replaced Menu Configuration step with Assign Manager in wizard navigation and review.
4. Updated review screen to include tax, banking summary (masked), and manager assignment summary.
5. Kept create-location backend logic unchanged for banking persistence by design (hold).
6. Added local form typing support for the new UI fields in `types/merchant_locations.ts`.

## Pending for DM-013-06 + DM-013-07

1. Wire Banking fields to tokenization + `location_banking_profiles` persistence after hold is lifted.
2. Add audit logs for banking updates once backend wiring is enabled.

## Completed in This Step (DM-013-08 Tax Settings)

1. Added Tax & Compliance management card to location settings sheet:
- masked EIN display
- tax ID display
- sales tax rate display
- tax registration status badge
2. Added Edit Tax Settings dialog in `Settings` tab:
- EIN input/validation
- state tax ID input
- sales tax percentage input
- tax registration status select
3. Wired saves to `UpdateLocation(...)` so tax changes persist immediately.
4. Kept banking management logic deferred to honor `[BANK-RELATED: HOLD]`.
5. Added dedicated route: `/dashboard/locations/[locationId]/settings`.
6. Added read-only Banking & Payouts visibility on the route with explicit hold indicator.
7. Added quick link button from locations list cards to open location settings route directly.

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

## DM-013-05 QA Completed

1. Migration `035` applied and trigger/function presence validated.
2. Manual status changes verified in UI:
- Activate
- Suspend (with reason)
- Cancel
3. Audit behavior verified for status transitions.
4. Auto-activation trigger wiring verified at DB level.

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
