# [Reporting - Kiosk] Website Channel-Segmented Reports

## Ticket

- Notion: `[Reporting - Kiosk] Kiosk orders reported separately from in-store POS - channel contract, source-taxonomy hardening & channel-segmented reports`
- Notion page: `https://app.notion.com/p/3a58280c1b1d81a68f0deed92fecb1e2`
- Website owner: Ali Dika
- Status: `code_complete_manual_qa_pending`
- Priority: High

## Goal

Separate kiosk revenue and order activity from in-store POS throughout the
merchant Reports UI and HQ transaction reporting while preserving existing
all-channel totals and tenant/HQ access controls.

Canonical `orders.order_source` values:

- `pos` - In-Store
- `kiosk` - Kiosk
- `online_store` - Online
- `orderout` - Delivery Apps

## Shared Backend Status

- POS implementation: Dexa-POS commit `816c882c`.
- Corrected shared migration:
  `C:\Users\Ali DIka\Desktop\Dexa-POS\supabase\migrations\20260722120000_kiosk_channel_reporting.sql`
- The corrected migration has already been applied to shared staging.
- The website must not execute or reapply this migration.
- The website duplicate is retained only as repository parity and must match
  the corrected POS file byte-for-byte.

## Repository Workflow

- No `AGENTS.md` exists in this checkout.
- Reviewed `CLAUDE.md`, `.planning/.continue-here.md`,
  `.planning/codebase/CONVENTIONS.md`, and
  `.planning/codebase/TESTING.md`.
- Do not commit unless explicitly requested.
- Do not modify package or lock files for this ticket.

## Investigation

### Already Implemented

- The Orders list exposes an `order_source` channel filter.
- Orders list/detail views already share delivery-platform normalization.
- Online Ordering analytics normalizes Grubhub, DoorDash, Uber Eats, and
  first-party platform identity.
- The merchant Reports page already has Sales Summary, Item Sales, and Payment
  Summary tabs with date and location scope.
- HQ Payments & Banking already consumes an admin transaction summary RPC and
  renders overall summary cards.
- The shared staging database already exposes:
  - `get_business_day_summary_v2(...)`
  - `get_sales_by_item_report_v2(...)`
  - `get_payment_summary_stats_v2(...)`
  - `get_admin_transaction_summary_v2(...)`

### Partial or Incorrect

- Website channel vocabulary still includes legacy `phone` and omits `kiosk`.
- Sales Summary has no channel breakdown card.
- Item Sales still calls `get_sales_by_item_report` and has no channel filter.
- Sales Summary has no canonical channel filter.
- HQ transaction summary still calls `get_admin_transaction_summary` and
  discards the channel dimension returned by v2.
- Kiosk-like platform values can resolve to a generic online fallback instead
  of being excluded.
- The website migration copy differs materially from the corrected POS file.

### Backend Contract Mismatch

`get_payment_summary_stats_v2(p_from, p_to, p_order_source)` is HQ-protected
because it has no merchant or location parameters. The merchant Payment Summary
tab must not call it. This ticket will not weaken that access contract.

The merchant Payment Summary channel filter remains blocked until a
merchant/location-scoped payment-summary vNext RPC exists, or the backend owner
explicitly extends the contract with tenant parameters and access checks.

## Implementation Plan

1. Synchronize the website migration duplicate with the corrected POS migration.
2. Correct the shared canonical channel vocabulary and labels.
3. Add typed contracts and pure helpers for channel filters and v2 RPC payloads.
4. Add Sales Summary channel cards and canonical filtering.
5. Switch Item Sales to `get_sales_by_item_report_v2`, passing `NULL` for All.
6. Switch HQ summary to `get_admin_transaction_summary_v2`, preserve overall
   cards by aggregating rows, and render per-channel rows.
7. Exclude kiosk from Revenue-by-Platform and delivery-platform badges.
8. Add targeted tests for:
   - canonical labels,
   - `All -> NULL` compatibility,
   - v2 Item Sales RPC arguments,
   - HQ channel aggregation,
   - kiosk platform exclusion.
9. Run targeted tests, lint, TypeScript/build checks, and document results.

## Progress

- [x] Full Notion ticket fetched and reviewed.
- [x] Repository workflow and current branch inspected.
- [x] Existing, partial, and missing website behavior identified.
- [x] HQ-only payment-summary caller mismatch identified.
- [x] Website migration duplicate synchronized.
- [x] Canonical channel utilities corrected.
- [x] Sales Summary channel card/filter implemented.
- [x] Item Sales v2 filter implemented.
- [x] HQ channel rendering implemented.
- [x] Kiosk platform exclusion hardened.
- [x] HQ payment-summary caller moved to v2 with `p_order_source = NULL`.
- [x] Targeted tests added and passing.
- [ ] Manual staging QA completed.

## Files

### Merchant Reports

- `app/dashboard/actions/order-analytics.ts`
- `app/dashboard/hooks/useOrderAnalytics.ts`
- `app/dashboard/orders/reports/page.tsx`
- `components/dashboard/orders/reports/ItemSalesReport.tsx`
- `components/dashboard/orders/reports/ReportChannelFilter.tsx`
- `components/dashboard/orders/reports/SalesSummaryReport.tsx`
- `components/dashboard/orders/reports/SummaryCard.tsx`
- `types/analytics.ts`

### HQ Reports

- `app/manage/actions/hq-platform/analytics-payments.ts`
- `app/manage/actions/hq-platform/transactions.ts`
- `app/manage/transactions/page.tsx`

### Shared Channel Identity

- `app/dashboard/actions/online-ordering-analytics.ts`
- `components/dashboard/orders/OrdersDataTable.tsx`
- `lib/orderout/platform.ts`
- `lib/orders/delivery-platform.ts`
- `lib/reporting/order-channel.ts`

### Tests

- `lib/orderout/__tests__/platform.test.ts`
- `lib/orders/__tests__/delivery-platform.test.ts`
- `lib/reporting/__tests__/order-channel.test.ts`

### Migration Parity and Documentation

- `supabase/migrations/20260722120000_kiosk_channel_reporting.sql`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`
- `docs/features/reporting/PLAN-2026-07-30-KIOSK-CHANNEL-REPORTING-WEB.md`
- `.planning/.continue-here.md`

## Verification

### Passed

- Targeted Vitest:
  - command:
    `npm test -- lib/reporting/__tests__/order-channel.test.ts lib/orderout/__tests__/platform.test.ts lib/orders/__tests__/delivery-platform.test.ts`
  - result: 3 files passed, 28 tests passed.
- Production build:
  - command: `npm run build`
  - result: passed; Next.js compiled and generated all 118 static pages.
- Targeted ESLint:
  - all ticket-modified TypeScript files pass.
  - `app/manage/transactions/page.tsx` and
    `components/dashboard/orders/OrdersDataTable.tsx` have existing React hook
    lint findings outside this ticket's changed lines.
- Filtered TypeScript:
  - no TypeScript errors reference a ticket-modified file.
  - the repository-wide TypeScript check still fails on substantial pre-existing
    Clerk, inventory, duplicate-type, and Deno Edge Function errors.
- Migration parity:
  - website SHA-256:
    `5C0AE850595C32F0A35CEDC53074348C451F716D9509035F43777BE2CA160312`
  - POS SHA-256:
    `5C0AE850595C32F0A35CEDC53074348C451F716D9509035F43777BE2CA160312`
  - result: exact match.
- `git diff --check`: passed.

### Repository Baseline Failures

- Full Vitest run:
  - 174 passed, 3 skipped, 22 failed.
  - failures are outside this ticket:
    - storefront a11y tests run without a DOM in the general Vitest config,
    - existing menu cascade-label implementation/expectation mismatches,
    - Orders API tests lack Supabase test environment variables.
- Repository-wide `tsc --noEmit` remains red on unrelated pre-existing errors.

### Not Executed

- No Supabase migration was executed from the website repository.
- No commit was created.

## Manual QA

Manual staging QA is pending. Use a merchant/date/location with reportable
In-Store, Kiosk, Online, and Delivery Apps orders.

### Merchant Dashboard

1. Open `/dashboard/orders/reports`.
2. Select the mixed-channel location and date range.
3. On `Sales Summary`, confirm four cards render:
   `In-Store`, `Kiosk`, `Online`, and `Delivery Apps`.
4. Confirm each card shows net revenue, order count, and average ticket.
5. Select `All Channels`; confirm the current unfiltered totals remain intact.
6. Select each channel individually; confirm the daily rows, totals, and export
   data contain only that source while all four channel cards remain visible.
7. Switch to `Item Sales`; repeat `All Channels` and each channel.
8. Confirm `All Channels` matches the pre-ticket item-sales totals to the penny.
9. Select a channel with no orders and confirm the intentional empty state
   renders without an error or broken layout.
10. Change date and location; confirm loading, data, and empty states refresh.

### Revenue by Platform

1. Open the Online Ordering analytics surface for the same range.
2. Confirm Grubhub, DoorDash, Uber Eats, and first-party storefront data retain
   their existing normalized buckets.
3. Confirm no `Kiosk` platform row or kiosk fallback logo appears.
4. Use a row with `online_order_provider = 'kiosk'` if available; confirm it has
   no Revenue-by-Platform effect.
5. If a valid marketplace row also carries stale kiosk provider metadata,
   confirm the real marketplace remains authoritative.

### HQ

1. Sign in with HQ transaction-report access.
2. Open `/manage/transactions`.
3. Apply a date range and optional merchant/location filters.
4. Confirm `Revenue by Channel` renders four channel cards.
5. Confirm the sum of channel revenue and transactions matches the existing
   overall cards for the same filters.
6. Confirm the legacy fallback message appears cleanly only in an environment
   where the v2 RPC is unavailable.
7. Open the HQ payment analytics surface and confirm summary metrics still load;
   this caller now uses `get_payment_summary_stats_v2` with a NULL source filter.

### SQL Cross-Check

Use the same location and timestamp window as the UI:

```sql
select
  public.normalize_order_source(o.order_source) as channel,
  count(*) as orders,
  round(sum(o.subtotal - coalesce(o.discount_amount, 0)), 2) as pre_refund_net
from public.orders o
where o.location_id = '<LOCATION_UUID>'
  and o.created_at >= '<FROM_TIMESTAMPTZ>'
  and o.created_at < '<TO_TIMESTAMPTZ>'
  and public.is_order_reportable(o.status, o.payment_status)
group by 1
order by 1;
```

Cross-check refunds separately through `order_payments` and confirm refunded
kiosk orders reduce only the Kiosk channel.

## Remaining Contract Blocker

The merchant `Payment Summary` report cannot receive the channel filter yet.
`get_payment_summary_stats_v2(p_from, p_to, p_order_source)` is protected for HQ
and has no merchant or location parameters. Calling it from a merchant report
would either fail authorization or expose cross-tenant data if weakened.

Required backend follow-up:

1. Add merchant/location scope parameters to a new payment-summary RPC.
2. Enforce `user_merchant_id()` and `user_location_ids()` for non-HQ callers.
3. Preserve `p_order_source = NULL` as the all-channel compatibility path.
4. Then wire the existing `ReportChannelFilter` into the Payment Summary tab.

## Remaining Staging Evidence

- Screenshot of merchant Sales Summary channel cards.
- Screenshot of Item Sales under each channel filter.
- Screenshot of HQ channel breakdown.
- SQL cross-check showing channel totals equal all-channel totals.
- Negative proof that kiosk does not appear in Revenue-by-Platform.
- Backend follow-up or explicit contract decision for merchant Payment Summary.
- Temur sign-off remains external to this website implementation.
