# Billing Auto-Renew With Optional Period End

**Reported:** 2026-08-16 through the Dexa support system
**Surface:** HQ merchant subscription workspace
**Repository:** DexaPOS-Website
**Status:** Website code complete; staging and scheduler QA pending

## Report

Billing should start automatically and renew monthly until the merchant requests cancellation. HQ should not have to provide an end date when assigning a merchant tier.

## Contract Clarification

`current_period_end` is the boundary of the current invoice period, not the date on which the subscription terminates. Invoice snapshots require that boundary, so the database value remains non-null. The application will derive it from the period start instead of requiring an HQ operator to enter it.

Cancellation remains explicit through the subscription status. A period boundary must never cancel an active subscription.

## Implementation Plan

- Make the server action accept an omitted period end.
- Validate the period start as a date-only value.
- Derive a one-month billing period server-side when the end is omitted.
- Remove the required end-date input from merchant-tier assignment.
- Explain in the UI that billing renews monthly until cancellation.
- Preserve existing invoice snapshots, billing history, and period advancement.

## Completed Implementation

- Added a strict date-only billing-period utility that derives the inclusive
  monthly period end without local-time conversion.
- Made `currentPeriodEnd` optional at the server-action boundary while retaining
  support for existing callers that explicitly provide a valid end date.
- The server now validates and persists the calculated boundary before syncing
  the anchor subscription and generating the invoice snapshot.
- Removed the editable merchant-tier period-end field from HQ and replaced it
  with clear monthly-renewal/cancellation guidance.

## Files

- `lib/subscription-billing/billing-period.ts`
- `lib/subscription-billing/__tests__/billing-period.test.ts`
- `app/manage/actions/subscription-billing.ts`
- `components/billing/HqSubscriptionsWorkspace.tsx`

## Automated Verification

- `npx vitest run lib/subscription-billing/__tests__/billing-period.test.ts lib/subscription-billing/__tests__/merchant-tier-presentation.test.ts --config vitest.config.mts`
  - Passed: 2 files, 7 tests.
- `npm run build`
  - Passed on Next.js 16.2.12.
- `npx tsc --noEmit --pretty false`
  - Blocked by the repository's existing Clerk API, Supabase Edge/Deno, form
    resolver, and duplicate-type errors outside this ticket's files.
- Targeted ESLint passes with the repository's pre-existing React effect rules
  disabled. The two billing components still contain unrelated
  `react-hooks/set-state-in-effect` findings outside this ticket's changed lines.

## Acceptance Criteria

- HQ can assign a tier without entering a period end.
- The persisted subscription still receives a valid period start and end.
- Saving an active tier starts billing and does not schedule cancellation.
- Generating the next invoice advances the monthly period.
- Selecting `Cancelled` remains the explicit way to stop renewal.
- Existing subscriptions and invoices remain readable.

## Manual QA

1. Open an HQ merchant billing workspace.
2. Select a merchant tier and confirm there is no editable period-end field.
3. Save and confirm the tier is active.
4. Verify `merchant_plan_subscriptions.current_period_end` is populated and later than or equal to the start.
5. Confirm the generated invoice uses the calculated period.
6. Reload and confirm the subscription remains active.
7. Change status to `Cancelled`, save, and confirm renewal stops only through that status.

## Remaining Operational Check

The repository advances periods whenever an invoice is generated. Fully unattended invoice generation/collection still depends on the deployed billing scheduler and must be verified in the target environment; this ticket does not silently introduce an unapproved production charging cron.
