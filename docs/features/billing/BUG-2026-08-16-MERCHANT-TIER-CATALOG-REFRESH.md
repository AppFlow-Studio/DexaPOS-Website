# Merchant Tier Catalog and Price Refresh

**Reported:** 2026-08-16 through the Dexa support system
**Surface:** HQ merchant subscription workspace and merchant billing overview
**Repository:** DexaPOS-Website and shared Supabase schema
**Status:** Website code and migration complete; migration not applied and QA pending

## Report

Replace the visible `Basic`, `Multi-Location`, and `Franchise` tier cards with the requested pricing presentation:

| Visible tier | Monthly price |
| --- | ---: |
| Quick-Service (First Station) | $59.99 |
| Fine Dining (First Station) | $99.99 |
| Additional Station | $49.99 |

`Franchise` must no longer appear, and all displayed prices must include the `.99` amount.

## Compatibility Decision

Existing subscriptions, QR gates, and billing artifacts refer to the legacy internal plan codes `basic`, `multi_location`, and `franchise`. Renaming or deleting those referenced keys would risk breaking active subscriptions and feature gates.

The migration therefore preserves IDs and internal codes while updating merchant-visible names, descriptions, prices, and metadata. This removes the Franchise presentation without invalidating historical rows or foreign keys.

## Implementation Plan

- Add an idempotent catalog migration for the three existing merchant-tier records.
- Update both HQ and merchant-facing tier descriptions/highlights.
- Preserve all current subscription references and invoice history.
- Keep money in integer cents for the merchant-tier catalog and decimal dollars for the billing calculator fields.
- Do not execute the migration from this coding session.

## Completed Implementation

- Added migration `20260816120000_refresh_merchant_tier_catalog.sql`.
- The migration updates visible names, descriptions, display order,
  `monthly_price_cents`, and `base_price_monthly` for the three referenced rows.
- The migration requires all three legacy rows to exist and fails instead of
  silently applying a partial catalog update.
- Added one shared presentation resolver used by both HQ and merchant billing
  cards, removing location-capacity and Franchise copy from these tier cards.
- Preserved plan IDs, internal codes, subscriptions, and feature-gate references.

## Files

- `supabase/migrations/20260816120000_refresh_merchant_tier_catalog.sql`
- `lib/subscription-billing/merchant-tier-presentation.ts`
- `lib/subscription-billing/__tests__/merchant-tier-presentation.test.ts`
- `components/billing/HqSubscriptionsWorkspace.tsx`
- `components/billing/MerchantSubscriptionOverviewCard.tsx`

## Automated Verification

- Shared resolver tests confirm all three labels and verify that the Additional
  Station presentation contains no `Franchise` text.
- Targeted suite passed: 2 test files, 7 tests total.
- Production build passed on Next.js 16.2.12.
- Repository-wide `tsc` remains blocked by pre-existing errors outside this
  ticket; no global type-clean claim is made.

## Acceptance Criteria

- Exactly three active merchant-tier cards appear in the requested order.
- The visible names and prices are `$59.99`, `$99.99`, and `$49.99`.
- No card or highlight displays `Franchise`.
- Existing merchant tier subscriptions still resolve after migration.
- Saving each tier generates billing artifacts using its new price.
- HQ and merchant billing views show consistent names and prices.

## Manual QA

1. Apply the migration to staging using the approved Supabase workflow.
2. Open `/manage/subscriptions` and select a merchant.
3. Confirm the three requested cards and prices appear in order.
4. Assign each tier to a test merchant and verify save/reload behavior.
5. Confirm the invoice amount matches the selected tier.
6. Impersonate the merchant and verify the billing overview uses the same label and price.
7. Query existing subscriptions and confirm no `plan_id` reference became orphaned.

## Staging Verification SQL

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

Expected prices in order are `5999`, `9999`, and `4999` cents. The internal
codes remain unchanged by design.
