# Admin Onboarding Sprint Status

**Sprint Focus:** Admin Staff Onboarding, RBAC Enforcement, Audit Logging, Merchant Notes  
**Sprint Date:** February 15, 2026  
**Owner:** Ali + Codex  
**Primary test merchant:** Appflow Studio Cafe

## References

1. Full implementation plan:
- `docs/SPRINT-2026-02-15-ADMIN-ONBOARDING-RBAC-AUDIT-NOTES-PLAN.md`

2. Working tracker (detailed dev notes):
- `.planning/SPRINT-2026-02-15-ADMIN-ONBOARDING-RBAC-AUDIT-NOTES-TRACKER.md`

3. Previous task reference to keep intact:
- `supabase/migrations/029_adm_019_admin_payment_audit_logging.sql`

## Current Ticket Status

| Ticket | Title | Priority | Status | Progress |
|---|---|---|---|---|
| 1 | Role-Based Dashboard Visibility | High | Implemented (QA Pending) | 95% |
| 2 | Admin Invite System Cleanup | High | Not Started | 0% |
| 3 | Comprehensive Admin Audit Logging | High | Not Started | 0% |
| 4 | Merchant Notes System | Medium | Not Started | 0% |

## Execution Order

1. Ticket 1 (RBAC)
2. Ticket 3 (audit helper + catalog)
3. Ticket 2 (invites and direct create)
4. Ticket 4 (merchant notes)

## Checklist

## Ticket 1: Role-Based Dashboard Visibility

- [x] `1.1` Build/extend `useAdminPermissions` hook with cache and helper methods
- [x] `1.2` Gate sidebar items by permission/role
- [x] `1.3` Add page-level protection for direct URL access
- [x] `1.4` Gate in-page actions for restricted users
- [x] `1.5` Enforce manager scoping to assigned merchants only
- [x] Align HQ permission RPCs with `members` role storage (`030`)
- [x] Restore manager analytics visibility (`hq.manager` -> `system.analytics.view`)
- [x] Add `/manage/users` client-side permission redirect guard (deny + redirect instead of runtime page render)
- [ ] QA completed and validated against acceptance criteria

## Ticket 2: Admin Invite System Cleanup

- [ ] `2.1` Pending invites tab shows real-time invite lifecycle
- [ ] `2.2` Direct-create flow implemented with temporary password
- [ ] `2.3` Wizard step validation enforced
- [ ] `2.4` Merchant access persisted for invite and direct-create
- [ ] `2.5` Users tab shows required fields and actions
- [ ] QA completed and validated against acceptance criteria

## Ticket 3: Comprehensive Admin Audit Logging

- [ ] `3.1` Add `ADMIN_ACTIONS` catalog
- [ ] `3.2` Add typed `logAdminAction(...)` helper
- [ ] `3.3` Instrument required admin actions with before/after changes
- [ ] `3.4` Global audit page filters/search/expand/export complete
- [ ] `3.5` Merchant-specific audit tab scoped and feature-complete
- [ ] QA completed and validated against acceptance criteria

## Ticket 4: Merchant Notes System

- [ ] `4.1` Add `merchant_notes` table + indexes + RLS
- [ ] `4.2` Build notes UI in merchant details
- [ ] `4.3` Implement notes CRUD + pin/unpin actions
- [ ] `4.4` Show notes count in merchant list
- [ ] `4.5` Audit log integration for note actions
- [ ] QA completed and validated against acceptance criteria

## Migration Tracker

| Migration | Purpose | Status | Notes |
|---|---|---|---|
| `029_adm_019_admin_payment_audit_logging.sql` | Previous sprint payment-data audit | Applied | Reference only |
| `030_fix_hq_permission_functions_to_members.sql` | Fix HQ permission functions to read `members` (not `user_roles`) | Applied (dev) | Resolved invited HQ users loading role but empty permissions |
| `031_grant_hq_manager_system_analytics_permission.sql` | Grant analytics visibility permission to `hq.manager` | Created (apply pending) | Dev SQL grant confirmed by manager seeing Analytics |
| `TBD (Ticket 4)` | `merchant_notes` schema/RLS/indexes | Pending | To be created when Ticket 4 starts |

## Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-02-19 | Use build order `1 -> 3 -> 2 -> 4` | Dependency-safe implementation |
| 2026-02-19 | Keep payment audit (`payment_audit_log`) separate from general admin audit (`audit_logs`) | Different scope and reporting needs |

## Daily Notes

## 2026-02-19

1. New sprint plan and trackers created.
2. Baseline audit completed for Tickets 1-4.
3. Ticket 1 implementation completed in code and moved to QA pending.
4. Added `useAdminPermissions` hook + permission alias map + Zustand snapshot cache.
5. Added server route guards for users/roles/audit/create-merchant with dashboard redirect and toast messaging.
6. Enforced manager merchant scoping on server for merchant list/stats/details.

## 2026-02-21

1. Applied migration `030_fix_hq_permission_functions_to_members.sql` in dev.
2. Fixed missing `hq.manager` role setup and user-to-role membership mapping for invited manager.
3. Added manager analytics visibility permission and confirmed Analytics appears for manager account.
4. Added client-side Users page permission redirect guard to avoid unauthorized page render failures.
5. Ticket order reconfirmed: next implementation is Ticket 3 (Comprehensive Admin Audit Logging).
6. Hardened transaction-domain merchant scoping for non-super-admin users:
- merchant/location/staff filter loaders now return assigned merchants only.
- payment audit log and chargebacks queries now enforce assigned-merchant intersection even when no merchant filter is selected.
7. Fixed `/manage` dashboard analytics loaders to use manager-assigned merchant scope and manager-safe permission gate (prevents false `0` KPI cards due permission mismatch).

## Standup Template

```md
### YYYY-MM-DD
- Yesterday:
  1.
  2.
- Today:
  1.
  2.
- Blockers:
  1.
```
