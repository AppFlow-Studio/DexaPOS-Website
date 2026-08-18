# Resolution Report: Billing Renewal, Merchant Tiers, and POS Auto-Create

**Reported:** 2026-08-16 through the Dexa support system
**Website repository:** DexaPOS-Website
**Website branch:** `bugfix/reported-tickets-batch`
**Website commit:** `a10cb271`
**Pull request:** [#278](https://github.com/AppFlow-Studio/DexaPOS-Website/pull/278)

## Executive Summary

Three issues were reviewed as one reported-ticket batch:

| Ticket | Repository | Current status |
| --- | --- | --- |
| Billing period end should be optional and renew automatically | Website | Code complete; staging and scheduler QA pending |
| Replace legacy merchant tiers and prices | Website + shared database | Code and migration complete; migration application and staging QA pending |
| POS auto-create order did not trigger | POS | Triaged and handed off; POS implementation and QA pending |

The first two tickets are implemented in the website pull request. The third
ticket is not a website defect: the complete setting and order-creation flow is
owned by Dexa-POS, so no POS code was changed from this branch.

## Ticket 1: Billing Auto-Renew With Optional Period End

### Reported Problem

HQ administrators had to enter both a billing-period start and end date when
assigning a merchant tier. The requested behavior is for billing to start from
the selected start date and continue in monthly periods until the merchant is
explicitly cancelled.

### Resolution

- Removed the editable `Current Period End` field from the HQ tier-assignment
  interface.
- Made `currentPeriodEnd` optional at the server-action boundary.
- Added strict `YYYY-MM-DD` validation.
- Added a shared billing-period utility that derives the inclusive monthly end
  date without local-timezone conversion.
- Retained support for older callers that still supply a valid explicit end.
- Kept cancellation controlled by subscription status; reaching a period end
  does not cancel an active merchant.

### Why the Database End Date Remains

`current_period_end` is an invoice-period boundary, not a subscription
termination date. Invoice snapshots still need this value, so the application
calculates and persists it instead of making an HQ user enter it.

### Files

- `app/manage/actions/subscription-billing.ts`
- `components/billing/HqSubscriptionsWorkspace.tsx`
- `lib/subscription-billing/billing-period.ts`
- `lib/subscription-billing/__tests__/billing-period.test.ts`

### Remaining Verification

The website can create and advance monthly billing periods. Fully unattended
invoice generation still depends on the existing deployed billing scheduler.
The target environment must confirm that scheduler is enabled before this
ticket is closed as a complete automatic-renewal workflow.

## Ticket 2: Merchant Tier Catalog and Price Refresh

### Reported Problem

The HQ catalog displayed the legacy `Basic`, `Multi-Location`, and `Franchise`
tiers at `$99.00`, `$199.00`, and `$299.00`. The requested presentation is:

| Customer-facing tier | Monthly price |
| --- | ---: |
| Quick-Service (First Station) | $59.99 |
| Fine Dining (First Station) | $99.99 |
| Additional Station | $49.99 |

### Resolution

- Added a shared presentation resolver used by HQ and merchant billing views.
- Replaced the visible names, descriptions, billing units, and feature copy.
- Removed visible `Franchise` and location-capacity framing from these cards.
- Added a database migration that updates the three existing plan rows in
  place.
- Preserved the existing plan IDs and internal codes `basic`,
  `multi_location`, and `franchise` so subscriptions, foreign keys, historical
  invoices, and feature gates do not break.
- Added tests that verify all three labels and ensure the Additional Station
  presentation contains no `Franchise` text.

### SQL Migration

File:

`supabase/migrations/20260816120000_refresh_merchant_tier_catalog.sql`

The migration has been authored but was not executed by the coding session. It
must be applied to staging through the approved Supabase workflow before UI and
invoice QA.

The SQL:

- updates exactly three existing `subscription_plans` rows;
- does not insert replacement plans or alter referenced IDs/codes;
- updates names, prices, descriptions, display order, and presentation
  metadata;
- keeps prices synchronized as integer cents and decimal dollars; and
- aborts the transaction if it cannot update all three expected rows.

After applying the migration, verify it with:

```sql
select
  plan_code,
  display_name,
  monthly_price_cents,
  base_price_monthly,
  display_order,
  is_active
from public.subscription_plans
where plan_scope = 'merchant_tier'
  and plan_code in ('basic', 'multi_location', 'franchise')
order by display_order;
```

Expected prices are `5999`, `9999`, and `4999` cents in display order 1-3.

### Files

- `supabase/migrations/20260816120000_refresh_merchant_tier_catalog.sql`
- `lib/subscription-billing/merchant-tier-presentation.ts`
- `lib/subscription-billing/__tests__/merchant-tier-presentation.test.ts`
- `components/billing/HqSubscriptionsWorkspace.tsx`
- `components/billing/MerchantSubscriptionOverviewCard.tsx`

## Ticket 3: POS Auto-Create Order Not Triggering

### Reported Problem

After `Auto-create orders` was enabled on Samir's tablet, the expected draft or
next order did not appear to be created automatically.

### Triage Result

This behavior is owned entirely by Dexa-POS:

- `stores/useStoreSettingsStore.ts` persists `autoCreateOrder`.
- `app/(main)/settings/order-line.tsx` exposes the toggle.
- `app/(main)/order-processing.tsx` selects or creates an order on entry.
- `stores/usePaymentStore.ts` starts the next order after payment.

The website does not read or execute this setting. The POS repository was
inspected read-only, and no POS source file was modified from this website
branch.

### Resolution Path Still Required in Dexa-POS

1. Confirm the toggle survives navigation, app restart, and store hydration.
2. Test entering Sales with no active order.
3. Test completing a quick-service or takeout payment and observing the next
   order.
4. Determine whether an existing empty draft is reused, which may make the
   behavior appear not to trigger.
5. Check for effects using a stale pre-toggle setting value.
6. Verify that disabling the setting leaves Sales empty until `New Order` is
   selected and that dine-in safeguards remain unchanged.

The detailed POS handoff is in:

`docs/features/pos-settings/HANDOFF-2026-08-16-AUTO-CREATE-ORDER-NOT-TRIGGERING.md`

## Automated Verification

- Targeted Vitest suite: 2 files and 7 tests passed.
- `npm run build`: passed with Next.js 16.2.12.
- Staged diff whitespace validation: passed before the website commit.
- No package or lockfile was changed.
- Repository-wide TypeScript validation still has pre-existing failures outside
  these ticket files, so no global type-clean claim is made.

## Website Manual QA

### Page 1: HQ Subscription Management

Open `/manage/subscriptions`, select a test merchant, and verify:

1. The editable period-end field is gone.
2. Monthly renewal guidance is visible.
3. A tier saves with the period start only.
4. The persisted subscription receives a calculated period end.
5. The three new tier names and prices appear after the migration.
6. Selecting `Cancelled` remains the explicit way to stop renewal.

### Page 2: Merchant Subscription Overview

Open `/dashboard/subscriptions` as the test merchant and verify:

1. The current plan uses the same customer-facing name and price as HQ.
2. No visible tier uses the `Franchise` label.
3. No old location-capacity framing appears in the tier presentation.
4. Reloading preserves the assigned plan and billing values.

## Closure Checklist

- [x] Website billing-period implementation complete.
- [x] Website merchant-tier presentation implementation complete.
- [x] Targeted automated tests pass.
- [x] Production website build passes.
- [ ] Apply the catalog migration to staging.
- [ ] Complete HQ and merchant-page manual QA.
- [ ] Verify invoice amounts for all three plans.
- [ ] Verify the deployed recurring billing scheduler.
- [ ] Implement and verify the auto-create behavior in Dexa-POS.

