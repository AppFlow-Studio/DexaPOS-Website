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

## Notes

1. Keep this file updated whenever a new ticket stream starts.
2. Keep links here PR-safe (planning/internal tracker files only).
3. Keep `.planning/.continue-here.md` as the primary technical handoff state.
4. Recent senior-review bundle:
- `docs/HANDOFF-2026-06-10-SENIOR-RECENT-THREE-TICKETS.md`
