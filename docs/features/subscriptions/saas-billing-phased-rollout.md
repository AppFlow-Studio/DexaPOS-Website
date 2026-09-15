# SaaS Billing — phased rollout

Goal: introduce the SaaS billing system **without blocking any current merchant**.
The feature paywall (Tables/Fine Dining, Website Builder, Online Ordering, OrderOut,
QR) ships **dark** and is enforced in a later phase.

## Phase 1 — introduce SaaS billing (now)
- Billing infrastructure ships (subscriptions, `billable_services`, entitlement
  RPCs, HQ billing tabs, invoices).
- `FeaturePaywall` renders its children unconditionally: **`PAYWALL_ENABLED = false`**
  in `components/billing/FeaturePaywall.tsx`. No feature is gated for anyone.
- Existing merchants are NOT charged for gated features (they have no assignment,
  or a $0 comped one after the phase-2 backfill).

Deploy order for prod:
1. Apply the SaaS-billing migrations to prod (the `20260906`–`20260915` set) —
   deliberately/out-of-band; prod is behind. See
   [[project_mcp_apply_migration_ledger_drift]] for reconciling the ledger.
2. Deploy the branch. Paywall stays dark.

## Phase 2 — enforce the paywall (later)
Do these together, in order, so no existing merchant is ever blocked:
1. **Run the grandfather backfill** `grandfather-comp-backfill.sql` on the target
   env (staging, then prod). It comps every existing non-canceled location
   subscription to the 5 gated services at $0. Idempotent. Verified sound via
   read-only dry run (2026-09-15: 3 staging subs × 5 services = 15 rows).
2. Flip **`PAYWALL_ENABLED = true`** in `FeaturePaywall.tsx` and deploy.
3. From here, only merchants created AFTER the backfill pay to unlock a feature;
   everyone grandfathered keeps it free. The call sites also keep a runtime
   grandfather (floor plans for Tables, website/pages for Website Builder) as a
   backstop.

## Why not enforce now
The paywall is new in this branch (not on prod today). Enforcing it at go-live
would show a pay-to-unlock wall to any merchant/location not yet using a feature —
a regression in access. Phasing keeps the billing launch invisible to current
operations.
