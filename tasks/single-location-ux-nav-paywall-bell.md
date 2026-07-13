# [Merchant Web] Single-Location UX — Nav, Add-Location Paywall, Bell → Support Glyph

Notion: 3968280c-1b1d-81f1-a70d-f69f801a887e · Branch: aliawdi-dev · Owner: Ali Awdi

## Locked decisions applied
- Gate price $X = target tier's full `base_price_monthly` (e.g. $199), read live, never hardcoded.
- Single-location nav routes to `/dashboard/locations/[id]/settings` (existing detail/settings view).
- Bell → LifeBuoy swapped globally in the shared `NotificationBell` (merchant + HQ).

## Changes
- [x] **DB** `supabase/migrations/20260708120000_single_location_gate_status.sql` — `create or replace get_merchant_subscription_status`, ADDITIVE new keys:
  `resolved_tier` (Basic default = lowest display_order active merchant_tier plan when no `merchant_plan_subscriptions` row → "no row ⇒ Basic"), `can_add_location`, `upgrade_target` (next tier admitting +1 location). Prices as `base_price_monthly` NUMERIC dollars.
- [x] **Server actions** `app/dashboard/actions/subscription-billing.ts` — `getMerchantLocationGateStatus()` (reads new RPC keys) + `RequestLocationUpgrade()` (authenticated client → `log_subscription_billing_event('upgrade_request', … p_status:'pending')` → audit_logs `billing` → HQ feed).
- [x] **Hook** `app/dashboard/hooks/useLocationGateStatus.ts`.
- [x] **Sidebar** `app/dashboard/layout.tsx` — "Locations" → "Location" (singular) + settings route when single-location, via `useIsSingleLocation` + `useGatedLocationId` (no new count). Applied to desktop `navMain` render and mobile `dashboardMoreItems`.
- [x] **Paywall** `components/dashboard/locations/AddLocationUpsellGate.tsx` + gate at `app/dashboard/locations/new/page.tsx` (single chokepoint: both Add buttons route here). Shows "This feature is an additional ${X}/month" + "Submit a request to unlock".
- [x] **Glyph** `components/notifications/NotificationBell.tsx` — `Bell` → `LifeBuoy`, title "Support", badge/link/realtime unchanged.

## Verification
- [x] `npm run build` — compiled successfully; all routes intact.
- [x] **Migration applied** (staging dfwqakoyittmrwbqvxgw); function exposes resolved_tier/can_add_location/upgrade_target; prices $99/$199/$299.
- [x] Playwright — multi-location (Joes): sidebar "Locations" plural → /dashboard/locations.
- [x] Playwright — single-location (Appflow, 1 active loc): sidebar "Location" singular → /dashboard/locations/{id}/settings.
- [x] Playwright — Support glyph: merchant + HQ header now `lucide-life-buoy`, title "Support", unread badge ("3") preserved.
- [x] Playwright — tier WITH headroom → wizard opens unchanged (Joes 2/5; franchise Appflow 1/∞ → can_add true → wizard, correct).
- [x] SQL — gate logic: no `merchant_plan_subscriptions` row ⇒ Basic; Basic 1-loc (Saucy/Mikes) → can_add=false, upgrade_target=Multi $199; 0-loc ⇒ can_add=true (onboarding not gated).
- [ ] **Gate card UI + upgrade_request audit write NOT rendered in-browser** — needs a Basic single-location login (e.g. Saucy) or an impersonation grant on one; this env has neither + read-only DB (see dexa-test-env-constraints). Data contract + /new gating branch verified; component compiles.
- [ ] Screen recording (Ali Dika, non-implementer): single vs multi nav, Basic gate + upgrade_request row, HQ price-edit reflects with zero deploy, glyph.

## Notes
- RPC extension is additive; `getMerchantSubscriptionOverview` (reads old `plan.monthly_price_cents`) untouched and still works.
- Exported symbol `NotificationBell` kept to avoid churn across both layouts; only glyph + copy changed.
