# All Tickets Reference

## Purpose

Single index for active ticket streams and their source trackers.

## Stream A: ADM-001 to ADM-019 (Transactions/Admin Platform)

1. Continuation state:
- `.planning/.continue-here.md`

2. Sprint tracker:
- `.planning/SPRINT-2026-02-15-ADMIN-ONBOARDING-RBAC-AUDIT-NOTES-TRACKER.md`

3. Plan:
- `docs/SPRINT-2026-02-15-ADMIN-ONBOARDING-RBAC-AUDIT-NOTES-PLAN.md`

## Stream B: DM-013-01 to DM-013-09 (Merchant Onboarding + Billing)

1. Internal execution tracker:
- `.planning/SPRINT-DM-013-MERCHANT-ONBOARDING-TRACKER.md`

2. Continuation state:
- `.planning/.continue-here.md`

3. Notes:
- Use local/private status docs outside this index when you do not want them included in PR scope.

## Stream C: Device Registry Foundation

1. Internal execution tracker:
- `.planning/SPRINT-2026-03-14-DEVICE-REGISTRY-FOUNDATION-TRACKER.md`

2. Plan:
- `docs/SPRINT-2026-03-14-DEVICE-REGISTRY-FOUNDATION-PLAN.md`

3. Continuation state:
- `.planning/.continue-here.md`

## Stream D: Device Registry Admin UI

1. Internal execution tracker:
- `.planning/SPRINT-2026-03-16-DEVICE-REGISTRY-ADMIN-UI-TRACKER.md`

2. Plan:
- `docs/SPRINT-2026-03-16-DEVICE-REGISTRY-ADMIN-UI-PLAN.md`

3. Continuation state:
- `.planning/.continue-here.md`

## Stream E: Bunny CDN Migration

1. Internal execution tracker:
- `.planning/SPRINT-2026-03-21-BUNNY-CDN-MIGRATION-TRACKER.md`

2. Plan:
- `docs/SPRINT-2026-03-21-BUNNY-CDN-MIGRATION-PLAN.md`

3. Continuation state:
- `.planning/.continue-here.md`

## Stream F: Online Ordering Payments Hard Cut (NMI)

1. Current implementation handoff:
- `docs/HANDOFF-2026-05-04-NMI-ONLINE-ORDERING-HARD-CUT.md`

2. Previous Dejavoo payment handoff:
- `docs/SPRINT-2026-04-08-ONLINE-ORDERING-PAYMENTS-HANDOFF.md`

3. Continuation state:
- `.planning/.continue-here.md`

4. Scope notes:
- Online storefront checkout is now migrating to merchant-scoped NMI credentials.
- In-store POS terminal payments remain separate and are not part of this hard cut.
- Reconciliation exists as an on-demand admin action; scheduled reconciliation is still pending.

## Stream G: Dashboard Staff + Sidebar Polish

1. Plan:
- `docs/PLAN-2026-06-02-DASHBOARD-STAFF-SIDEBAR-POLISH.md`

2. Continuation state:
- `.planning/.continue-here.md`

3. Scope notes:
- Merchant dashboard only.
- Staff detail sheet only for the staff surface.
- That detail sheet now includes a stronger sectioned redesign, not only field cleanup.
- The staff detail sheet now uses an internal section navigator instead of a long stacked card layout.
- `/dashboard/staff` list/table view was not part of this polish pass.
- HQ/admin `/manage/*` staff pages were not part of this polish pass.
- No POS work.
- No backend or schema changes.

## Stream H: Modifier Reordering Safety Rollout

1. Plan:
- `docs/PLAN-2026-06-02-MODIFIER-REORDERING-SAFETY.md`

2. Continuation state:
- `.planning/.continue-here.md`

3. Scope notes:
- Website repo only.
- Merchant dashboard/menu flows only in this phase.
- Display-order-only changes.
- No schema redesign.
- No RLS/policy rewrites unless a proven blocker appears.
- No modifier pricing, default-option, or assignment semantic changes.

## Stream I: Modifier Display Order Alignment

1. Plan:
- `docs/PLAN-2026-06-04-MODIFIER-DISPLAY-ORDER-ALIGNMENT.md`

2. Continuation state:
- `.planning/.continue-here.md`

3. Scope notes:
- Website repo only.
- Backend migration stream for exact modifier ordering parity.
- Preserves existing location-scoped modifier assignment behavior.
- Backend migration has been applied.
- Merchant-facing reorder controls now exist in:
  - item edit for attached modifier groups
  - modifier group sheet for option order
  - modifiers page for guarded library group order

## Stream J: Reporting Date Range Boundaries And Loading State

1. Plan:
- `docs/PLAN-2026-06-04-REPORTING-DATE-RANGE-BOUNDARIES.md`

2. Continuation state:
- `.planning/.continue-here.md`

3. Scope notes:
- Cross-cutting reporting stream.
- Backend + frontend work.
- Not a quick-fix ticket and not mixed into modifier work.

## Stream K: Single-Location Global Modifier And Recipe RPCs

1. Plan:
- `docs/PLAN-2026-06-06-SINGLE-LOCATION-GLOBAL-MODIFIER-RECIPE-RPCS.md`

2. Continuation state:
- `.planning/.continue-here.md`

3. Scope notes:
- Website repo only.
- Backend/RPC stream for the single-location menu model.
- Fixes the missing global modifier path when `location_id` is omitted.
- Defensively removes stale recipe overload ambiguity while keeping one canonical function.
- Overlay cleanup is staging-first and split into safe auto-collapse vs manual-review rows.
- Charcoal cleanup must be sequenced separately.

## Stream L: QR Dine-In Unified

1. Plan:
- `docs/PLAN-2026-05-27-QR-DINE-IN-UNIFIED.md`

2. Ops runbook:
- `docs/RUNBOOK-PAYMENT-WHITELIST-SYNC.md`

3. Continuation state:
- `.planning/.continue-here.md`

4. Scope notes:
- Website repo only for this stream.
- QR storefront, dashboard QR manager, QR analytics, and guest-alert validation surfaces are implemented here.
- Remaining open items are primarily deploy, payment-origin registration, POS follow-up, and end-to-end QA.
- Do not mark QR payment or realtime items complete without staging or hosted-environment verification.

## Stream M: Bay Ridge Owner Identity Relink

1. Plan:
- `docs/PLAN-2026-06-22-BAY-RIDGE-OWNER-IDENTITY-RELINK.md`

2. Continuation state:
- `.planning/.continue-here.md`

3. Scope notes:
- Shared identity/data remediation for a live merchant owner account.
- Website repo is the primary investigation and validation surface.
- POS repo is affected only through shared Clerk org membership and `members` linkage.
- No POS UI change is required for the root-cause fix.
- PIN login is separate from Clerk relinking and may require its own reset after repair.
- Production completion requires website deploy plus live Clerk/Supabase data repair; it is not a SQL migration-only ticket.

## Stream N: Timesheets Manual Adjustment + Auto Clock-Out

1. Plan:
- `docs/PLAN-2026-06-29-TIMESHEETS-MANUAL-ADJUSTMENT-AUTO-CLOCKOUT.md`

2. Continuation state:
- `.planning/.continue-here.md`

3. Scope notes:
- Website repo merchant dashboard scope.
- Manual shift correction is implemented for `/dashboard/staff/timesheets`.
- Backend write path uses `admin_adjust_staff_shift(...)`.
- Scheduled/configurable auto clock-out remains gated pending scheduling/POS force-clock-out ownership confirmation.
- Do not ship a cron/worker auto-close path until that overlap is resolved.

## Stream O: Delivery Platform Logos - Web Scope

1. Plan:
- `docs/PLAN-2026-06-29-DELIVERY-PLATFORM-LOGOS-WEB.md`

2. Scope notes:
- Website repo only.
- Parent ticket also includes POS/KDS, but this stream implements web surfaces only.
- Shared resolver lives at `lib/orders/delivery-platform.ts`.
- Merchant dashboard and HQ merchant order list/detail surfaces render the same platform badge.
- Existing public logo assets are used for Grubhub, DoorDash, and Uber Eats.
- POS/KDS state rendering still belongs in the POS repo.

## Stream P: [POS/Web] Location-level POS Settings surface + per-station overrides

1. Plan:
- `docs/PLAN-2026-06-30-LOCATION-POS-CONFIG-STATION-OVERRIDES-WEB.md`

2. Scope notes:
- Website repo / web dashboard scope only.
- Adds `stations.pos_config_overrides` and `get_effective_pos_config(p_station_id)`.
- Location defaults are edited at `/dashboard/settings/pos`.
- `/dashboard/settings/pos` is linked from the Settings hub, Settings sidebar, and global search.
- Station overrides are limited to UI scale, app theme, notification sounds, and notification volume for v1.
- Existing `update_location_pos_config(p_location_id, p_namespace, p_config)` RPC is preserved.
- POS tablet consumption remains a separate POS repo pass.
- KDS config and hardware assignment are out of scope for this v1 web pass.

## Stream Q: In-Progress Ticket QA Closure Matrix

1. QA matrix:
- `docs/QA-2026-07-02-IN-PROGRESS-TICKETS-CLOSURE-MATRIX.md`

2. Scope notes:
- Built from the July 2 board screenshots.
- Covers the 13 visible in-progress tickets only.
- Separates website/dashboard work, POS work, Supabase/data repair, and tickets not ready to claim done.
- Use this before moving those tickets from In Progress to Done.

## Stream R: [BILLING][HIGH] DEXA HQ Self-Service Billing Control

1. Plan:
- `docs/PLAN-2026-07-12-HQ-SELF-SERVICE-BILLING-CONTROL.md`

2. Scope notes:
- Follow-up to Device Inventory & Registry and NMI SaaS Subscription Billing.
- Backend-first billing/device automation stream with HQ UI completion required before Done unless explicitly split.
- Existing repo has billing foundation, subscription workspace, service catalog, device catalog, and NMI billing rail.
- 2026-07-12 website/backend phase added:
  - `supabase/migrations/20260712120000_hq_self_service_billing_control_phase1.sql`
  - audited HQ pricing/catalog RPCs,
  - unified subscription calculator,
  - subscription recalculation helper,
  - invoice generation alignment,
  - POS ID generation/exposure,
  - website POS ID display/search,
  - device catalog deactivate-instead-of-delete behavior,
  - HQ service-billing plan editor,
  - HQ billable service/add-on editor,
  - live calculator quote backed by the unified calculator.
- 2026-07-13 website/backend phase added:
  - `supabase/migrations/20260713130000_hq_billing_device_bridge_and_access_gates.sql`
  - HQ-editable device billing mappings,
  - device inventory to subscription billing sync,
  - deployed POS tablet station-count bridge,
  - station quota enforcement,
  - suspended-subscription station/payment-terminal access gate,
  - HQ suspended/past-due billing status messaging.
- Website/backend code is locally complete and POS implementation is complete; remaining work is staging migration apply, SQL/RLS QA, live calculator parity, invoice parity, device billing sync QA, quota QA, suspend/restore QA, and proof attachment.
- POS repo implementation completed: suspended login/session refusal, clean quota/suspended error handling, and local device/station state sync after suspend/restore.
- Do not mark Done until calculator parity, next-invoice cascade, device-driven billing, quota blocking, suspension/restore, RLS checks, combined POS verification, and proof video pass.

## Stream S: HQ Developer Ticket Creation + New-Ticket Email Notifications

1. Feature and deployment guide:
- `docs/FEATURE-2026-07-28-HQ-SUPPORT-TICKET-CREATION-NOTIFICATIONS.md`

2. Scope notes:
- Authorized HQ support admins can create developer tickets from `/manage/support`.
- HQ-created tickets are forced to the server-configured DEXA HQ location.
- Every `support_tickets` insert, including POS and merchant-dashboard tickets, triggers the same asynchronous notification path.
- Resend recipients are configured through `SUPPORT_TICKET_NOTIFICATION_EMAILS`.
- Delivery attempts are recorded in `support_ticket_notification_deliveries`; email failure never rolls back the ticket.
- Platform Admin receives `hq.support.view` and `hq.support.manage` through the
  companion role-permission migration.
- Local implementation is complete. Migration/Vault configuration and cross-source staging QA remain.

## Notes

1. Keep this file updated whenever a new ticket stream starts.
2. Keep links here PR-safe (planning/internal tracker files only).
3. Keep `.planning/.continue-here.md` as the primary technical handoff state.
4. Recent senior-review bundle:
- `docs/HANDOFF-2026-06-10-SENIOR-RECENT-THREE-TICKETS.md`

5. Latest senior handoff:
- `docs/HANDOFF-2026-06-30-LATEST-TICKETS-SENIOR-REVIEW.md`

6. Latest billing-control handoff:
- `docs/HANDOFF-2026-07-13-HQ-BILLING-CONTROL-FINAL.md`
- `docs/HANDOFF-2026-07-13-BILLING-CONTROL-REMAINING-POS-ITEMS.md`

7. Next 16 upgrade handoff:
- `docs/HANDOFF-2026-07-13-NEXT-16-UPGRADE.md`
