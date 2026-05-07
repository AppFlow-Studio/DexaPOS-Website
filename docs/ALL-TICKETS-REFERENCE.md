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

## Notes

1. Keep this file updated whenever a new ticket stream starts.
2. Keep links here PR-safe (planning/internal tracker files only).
3. Keep `.planning/.continue-here.md` as the primary technical handoff state.
