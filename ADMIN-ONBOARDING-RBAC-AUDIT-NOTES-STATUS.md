# Admin Onboarding Sprint Status

**Sprint Focus:** Admin Staff Onboarding, RBAC Enforcement, Audit Logging, Merchant Notes  
**Sprint Date:** February 15, 2026  
**Owner:** Ali 
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
| 2 | Admin Invite System Cleanup | High | Implemented (QA Pending) | 95% |
| 3 | Comprehensive Admin Audit Logging | High | Implemented (QA Pending) | 95% |
| 4 | Merchant Notes System | Medium | In Progress | 90% |

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

- [x] `2.1` Pending invites tab shows real-time invite lifecycle
- [x] `2.2` Direct-create flow implemented with temporary password
- [x] `2.3` Wizard step validation enforced
- [x] `2.4` Merchant access persisted for invite and direct-create
- [x] `2.5` Users tab shows required fields and actions (role edit, deactivate, reset password wired)
- [ ] QA completed and validated against acceptance criteria

## Ticket 3: Comprehensive Admin Audit Logging

- [x] `3.1` Add `ADMIN_ACTIONS` catalog
- [x] `3.2` Add typed `logAdminAction(...)` helper
- [x] `3.3` Instrument required admin actions with before/after changes
- [x] `3.4` Global audit page filters/search/expand/export complete
- [x] `3.5` Merchant-specific audit tab scoped and feature-complete
- [x] Route merchant-access grant/revoke flows (single + bulk) through audited server actions
- [x] Add catalog logging for merchant create/deactivate lifecycle actions
- [x] Verify all catalog categories are represented in `/manage/audit-logs` filters (`merchant`, `user_management`, `device`, `staff`, `notes`)
- [ ] QA completed and validated against acceptance criteria

Coverage note:
`ADMIN_ROLE_CHANGED` and `DEVICE_REBOOTED` are catalog-ready but currently have no active UI/server action path in this app yet, so no runtime event source exists to emit them.

## Ticket 4: Merchant Notes System

- [x] `4.1` Add `merchant_notes` table + indexes + RLS (migration created, pending apply)
- [x] `4.2` Build notes UI in merchant details
- [x] `4.3` Implement notes CRUD + pin/unpin actions
- [x] `4.4` Show notes count in merchant list
- [x] `4.5` Audit log integration for note actions
- [ ] QA completed and validated against acceptance criteria

## Migration Tracker

| Migration | Purpose | Status | Notes |
|---|---|---|---|
| `029_adm_019_admin_payment_audit_logging.sql` | Previous sprint payment-data audit | Applied | Reference only |
| `030_fix_hq_permission_functions_to_members.sql` | Fix HQ permission functions to read `members` (not `user_roles`) | Applied (dev) | Resolved invited HQ users loading role but empty permissions |
| `031_grant_hq_manager_system_analytics_permission.sql` | Grant analytics visibility permission to `hq.manager` | Created (apply pending) | Dev SQL grant confirmed by manager seeing Analytics |
| `032_merchant_notes_system.sql` | Merchant notes table + RLS + trigger + indexes | Created (apply pending) | Required before Ticket 4 QA in env |

## Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-02-19 | Use build order `1 -> 3 -> 2 -> 4` | Dependency-safe implementation |
| 2026-02-19 | Keep payment audit (`payment_audit_log`) separate from general admin audit (`audit_logs`) | Different scope and reporting needs |
| 2026-02-21 | Implement Ticket 3 with shared TS helper (`logAdminAction`) on top of existing `log_audit_event` RPC | Standardize logging without introducing new migration risk |
| 2026-02-21 | Add CSV export cap at `10,000` rows for global audit page | Prevent oversized client export and keep UI responsive |

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
8. Ticket 3 implementation completed in code (pending QA):
- Added `lib/admin/audit-actions.ts` catalog.
- Added `lib/admin/log-admin-action.ts` typed helper with automatic metadata tagging.
- Instrumented key admin actions (merchant settings/location toggle, invite create/resend/revoke, remove user, staff PIN/status/create, payment terminal config/pair/unpair/delete).
- Rebuilt `/manage/audit-logs` with required filters (category, severity, actor, merchant, date range, status, resource type), expandable change/metadata view, 50-row pagination, and CSV export.
- Added merchant audit tab CSV export for scoped compliance reporting.
9. QA hotfix for invite/revoke audit verification:
- Wired Pending Invites dropdown actions in `Users` page to actual server actions (`resend`/`revoke`).
- Fixed HQ org-scoped audit logging fallback so logs can be recorded even when no merchant row exists for HQ org id.
10. Invite revoke/resend API fix:
- Switched from Clerk personal invitation API (`invitations.*`) to Clerk organization invitation API (`organizations.*`) so `orginv_*` ids revoke/resend correctly.
11. Audit write reliability hardening:
- Added fallback direct insert path in `logAdminAction` when `log_audit_event` RPC returns an error, so HQ invite/revoke events still persist to `audit_logs`.

## 2026-02-22

1. Ticket 2 invite wizard upgrades completed:
- Added invite mode selection: single invite, bulk invite, direct account creation.
- Added direct-create flow with one-time temporary password dialog.
- Added server action `createAdminDirectly(...)` with Clerk user creation, HQ membership creation, merchant assignment persistence, and audit logging.
2. Ticket 2 validation hardening:
- Enforced server-side merchant assignment requirement for non-super-admin roles in single and bulk invite actions.
- Enforced wizard merchant step requirement for non-super-admin roles and auto-skip merchant step for `hq.super_admin`.
3. Ticket 2 pending invites UI cleanup:
- Pending list now shows pending-only rows with name/email/role/invited-by/date and working resend/revoke actions.
- Users table now surfaces assigned merchant count, status, and last active.
4. Ticket 4 implementation pass completed (pending migration apply + QA):
- Added migration `032_merchant_notes_system.sql`.
- Added merchant notes server actions (list/add/update/delete/pin) with role/author constraints and audit log hooks.
- Added merchant Notes tab in merchant detail page.
- Added merchant notes count indicator in merchant list cards/table.
5. Ticket 3 cleanup pass completed:
- Merchant access grant/revoke (single + bulk) now runs through server actions with `ADMIN_MERCHANT_ACCESS_GRANTED` / `ADMIN_MERCHANT_ACCESS_REVOKED` audit writes.
- Merchant lifecycle coverage added for `MERCHANT_CREATED` and `MERCHANT_DEACTIVATED`.
- Verified global audit filters include all live catalog categories.
6. Ticket 2.5 implementation pass completed:
- Added server actions for HQ user role change, user deactivation (soft deactivate), and password reset with temporary password return.
- Wired Users table dropdown actions to real handlers and added role/password dialogs in `/manage/users`.
- Added audit events for role changes, deactivation, and password reset actions.
