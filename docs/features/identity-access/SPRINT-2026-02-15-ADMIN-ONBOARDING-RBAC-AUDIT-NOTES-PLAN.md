# Sprint Plan: Admin Staff Onboarding, RBAC, Audit Logging, Merchant Notes

**Sprint focus date:** February 15, 2026  
**Scope tickets:** 1-4 from sprint brief  
**Primary test merchant:** Appflow Studio Cafe

## Goals

1. Enforce role-based access consistently across navigation, routes, and actions.
2. Stabilize admin invite flow (email + direct create) and pending invites lifecycle.
3. Make admin audit logging complete and consistent for all meaningful actions.
4. Add internal merchant notes with strict visibility and auditability.

## Reference to Previous Work

This sprint is mostly new scope, but keep these references:

1. `ADM-019` payment-access audit logging exists and should stay intact:
- migration: `supabase/migrations/029_adm_019_admin_payment_audit_logging.sql`
- runtime hooks: `app/manage/actions/hq-platform/transactions.ts`
- table/RPC: `payment_audit_log`, `log_admin_payment_audit_event(...)`

2. Existing audit framework already used broadly:
- helper: `app/dashboard/actions/audit-logs.ts` (`LogAuditEvent`)
- table/RPC: `audit_logs`, `log_audit_event(...)`

3. Existing HQ permission infrastructure:
- `hq_has_permission`, `get_my_hq_role`, `get_my_hq_permissions`
- server guard: `lib/admin/auth.ts`
- client hook/gate: `lib/hooks/useAdminAuth.ts`, `components/admin/PermissionGate.tsx`

## Current Baseline (Codebase Audit)

## Ticket 1: Role-Based Dashboard Visibility

### Already Exists

1. Client auth hook fetches role/permissions:
- `lib/hooks/useAdminAuth.ts`

2. Permission wrapper exists:
- `components/admin/PermissionGate.tsx`

3. Sidebar has permission-based filtering:
- `app/manage/layout.tsx`

4. Server action permission guard exists:
- `assertHQPermission(...)` in `lib/admin/auth.ts`

### Gaps to Close

1. Hook shape does not match requested API (`Set`, `hasAnyPermission`, `isAtLeast`).
2. Role/permission codes in sprint brief and codebase naming differ:
- brief: `users.manage`, `roles.manage`, `audit.view`, `analytics.view`
- codebase: `hq.team.manage`, `system.audit.view`, `system.analytics.view`, etc.

3. Page-level route guard needs consistent UX redirect + toast.
4. In-page action gating is partial/inconsistent.
5. Manager merchant scoping must be enforced by default using `admin_merchant_access` (not optional argument only).

---

## Ticket 2: Admin Invite System Cleanup

### Already Exists

1. Users page has Users + Pending Invites tabs:
- `app/manage/users/page.tsx`

2. Invite create/resend/revoke actions exist:
- `app/manage/organizations/actions/clerk-create-invitation-admin.ts`
- `app/manage/organizations/actions/clerk-resend-invitation-admin.ts`
- `app/manage/organizations/actions/clerk-revoke-invitation.ts`

3. Webhook integration exists for invite acceptance updates:
- `supabase/functions/clerk-webhooks/index.ts`

4. `pending_org_admin_invites` has merchant-access extension fields:
- `supabase/migrations/017_admin_merchant_access.sql`

### Gaps to Close

1. Confirm pending-invites UI is fully aligned to required fields/actions.
2. Add direct-create admin path in wizard (no email invite).
3. Enforce step-by-step wizard validation rules.
4. Ensure merchant assignments are persisted for both invite + direct create.
5. Users tab needs full action set and accurate columns/state.

---

## Ticket 3: Comprehensive Admin Audit Logging

### Already Exists

1. `audit_logs` pipeline + helper:
- `app/dashboard/actions/audit-logs.ts` (`LogAuditEvent`)

2. Global manage audit logs page:
- `app/manage/audit-logs/page.tsx`

3. Merchant-level audit tab exists:
- `app/manage/merchants/[merchantId]/components/AuditLogsTab.tsx`

### Gaps to Close

1. No single admin action catalog constant for this sprint scope.
2. No typed `logAdminAction` wrapper for clean, consistent call sites.
3. Instrumentation is broad but not guaranteed to match required admin action catalog.
4. Need strict before/after change tracking standard across update actions.
5. Global/merchant audit UIs need final validation against required filters/search/expand/export behavior.

---

## Ticket 4: Merchant Notes System

### Already Exists

1. Nothing dedicated to merchant account notes yet.
2. Separate "admin notes" pattern exists for menu resources only (not merchant profile notes).

### Gaps to Close

1. Create `merchant_notes` table + RLS + indexes.
2. Build merchant notes UI on merchant details page.
3. Add notes CRUD + pin/unpin server actions.
4. Add notes count indicator on merchant list.
5. Ensure note create/delete/pin/edit are audit logged.

---

## Implementation Order (Locked)

1. **Ticket 1 (RBAC foundation)**
2. **Ticket 3 (audit abstraction + catalog)**
3. **Ticket 2 (invites cleanup + direct create)**
4. **Ticket 4 (merchant notes)**

Reason: Tickets 2 and 4 depend on clean permission and logging foundations.

## Technical Design Plan

## Execution Map (Initial File Targets)

Use this as the first-pass implementation map so changes stay contained.

## Ticket 1: RBAC

1. Core permission state and helpers:
- `lib/hooks/useAdminAuth.ts` (or split into `lib/hooks/useAdminPermissions.ts`)
- `types/admin.ts`
- `components/admin/PermissionGate.tsx`

2. Navigation and route protection:
- `app/manage/layout.tsx`
- `lib/admin/auth.ts`
- protected pages under `app/manage/**/page.tsx` (users/roles/audit areas first)

3. Merchant scoping for manager role:
- `app/manage/actions/merchants.ts`
- `app/manage/hooks/useAdminMerchantAccess.ts`
- any merchant list loaders used by `/manage/merchants`

## Ticket 3: Audit Logging Foundation

1. Action catalog and typed wrapper:
- `lib/admin/audit-actions.ts` (new)
- `lib/admin/log-admin-action.ts` (new or colocated helper)
- reuse `app/dashboard/actions/audit-logs.ts` as backend bridge

2. Instrumentation touchpoints:
- admin user management actions (`app/manage/organizations/actions/*.ts`)
- merchant actions (`app/manage/actions/merchants.ts`)
- device/staff actions in merchant detail actions/components

3. Audit UI alignment:
- `app/manage/audit-logs/page.tsx`
- `app/manage/merchants/[merchantId]/components/AuditLogsTab.tsx`

## Ticket 2: Admin Invite Cleanup

1. Invite wizard and flow:
- `app/manage/organizations/[organizationId]/components/AdminInviteWizard.tsx`
- `app/manage/organizations/actions/clerk-create-invitation-admin.ts`
- `app/manage/organizations/actions/clerk-resend-invitation-admin.ts`
- `app/manage/organizations/actions/clerk-revoke-invitation.ts`

2. Direct create path:
- add new server action in `app/manage/organizations/actions/` (new file)
- integrate with existing Clerk patterns from `app/dashboard/actions/unified-staff.ts`

3. Pending + active users surfaces:
- `app/manage/users/page.tsx`
- webhook reconciliation in `supabase/functions/clerk-webhooks/index.ts`

## Ticket 4: Merchant Notes

1. Schema:
- `supabase/migrations/` (new migration for `merchant_notes`)

2. Server actions + logging:
- `app/manage/actions/merchants.ts` (or dedicated notes action file)
- `lib/admin/log-admin-action.ts` calls for create/update/delete/pin

3. UI:
- `app/manage/merchants/[merchantId]/components/OverviewTab.tsx` (or dedicated notes component)
- `app/manage/merchants/[merchantId]/components/` (new notes component file)
- `app/manage/merchants/page.tsx` for notes count badge

## Ticket 1 Plan

1. Extend/replace `useAdminAuth` with `useAdminPermissions` shape:
- `role_code`
- `role_level`
- `permissions: Set<string>`
- `hasPermission(code)`
- `hasAnyPermission(codes[])`
- `isAtLeast(level)`

2. Add local cache store (Zustand or context) with controlled invalidation.

3. Add centralized permission mapping layer for sprint requirement labels vs existing codes.

4. Harden sidebar gating in `app/manage/layout.tsx` using centralized rule table.

5. Add route guards for protected pages:
- redirect to `/manage` with toast when unauthorized
- enforce at layout/page boundary

6. Enforce manager merchant scoping in merchant list/actions by deriving accessible merchant IDs from `admin_merchant_access` automatically.

## Ticket 2 Plan

1. Validate + fix pending invite state transitions:
- sent -> pending row visible
- accepted -> moved out of pending
- revoked -> clerk revoke + local status update

2. Add direct-create branch in admin invite wizard:
- UI choice: email invite vs direct create
- server action creates Clerk user + temp password + org membership
- persist invite record with `direct_created`

3. Wizard validation gates on each step.

4. Persist merchant assignments for both paths.

5. Super admin flow skips merchant assignment by design.

## Ticket 3 Plan

1. Add `ADMIN_ACTIONS` constants map for sprint-required actions.

2. Add `logAdminAction(...)` typed helper wrapping `log_audit_event`.

3. Instrument all required admin actions in manage domain:
- merchant updates
- admin invite/create/deactivate/role change
- device actions
- staff actions done by admin
- notes actions

4. Standardize `changes` payload (before/after).

5. Validate audit UI capabilities and patch gaps:
- filters, search, expandable JSON, pagination (50), severity badges, CSV export
- merchant-scoped audit tab parity

## Ticket 4 Plan

1. Create migration for `merchant_notes` table + RLS + indexes.
2. Add server actions:
- add/list/update/delete/toggle pin

3. Add merchant details notes card/section:
- input + add
- list newest-first with pinned on top
- role badge + timestamp
- author-only edit window (24h)
- delete by super admin or author

4. Add notes count indicator in merchant list.

5. Add audit calls for note actions via `logAdminAction`.

## Data/Migration Plan

Expected new migrations for this sprint:

1. Merchant notes schema migration (Ticket 4).
2. Optional helper/index migrations if needed for:
- role/permission fetch performance
- invite direct-create metadata

Do not alter ADM-019 migration behavior; keep payment audit logging separate from general `audit_logs`.

## QA Plan (Per Ticket)

## Ticket 1 QA

1. Manager sees only allowed nav items.
2. Manager direct URL to restricted pages redirects to dashboard with message.
3. Platform admin sees all except Roles & Permissions (per sprint brief).
4. Super admin sees all.
5. Create Merchant button visibility is role-correct.
6. Manager sees only assigned merchants.

## Ticket 2 QA

1. Email invite appears immediately in pending tab.
2. Resend and revoke actions update Clerk + local status.
3. Acceptance webhook updates pending status to accepted.
4. Direct create produces usable account and one-time temp password display.
5. Merchant assignments persisted correctly for both invite paths.

## Ticket 3 QA

1. Every action in catalog produces an audit entry.
2. Entry includes actor, role, action, timestamp, resource, changes.
3. Global audit filters/search/expand/pagination/export function.
4. Merchant audit tab shows only merchant-scoped logs.

## Ticket 4 QA

1. Notes CRUD works with permission rules.
2. Pinned notes sorted above non-pinned.
3. Edit/delete constraints enforced correctly.
4. Merchant never sees internal notes.
5. Note actions are present in audit logs.

## Risks and Mitigations

1. Permission-code mismatch between brief and existing enums.
- Mitigation: add mapping layer, avoid widespread schema rename unless approved.

2. Invite flow complexity with Clerk + webhook timing.
- Mitigation: idempotent writes, explicit status transitions, fallback reconciliation query.

3. Audit log noise/inconsistency.
- Mitigation: centralize through `logAdminAction` and action catalog.

4. Notes permissions edge cases.
- Mitigation: enforce in server actions + RLS + UI.

## Definition of Done (Sprint)

1. All acceptance criteria for Tickets 1-4 validated on Appflow Studio Cafe.
2. No unauthorized route leakage for manager role.
3. Direct-create and email-invite flows both production-ready.
4. Audit coverage complete for catalog actions.
5. Merchant notes delivered with audit and permission protections.

## Deliverables

1. Code + migrations for Tickets 1-4.
2. Updated runbooks for migration/apply/QA.
3. Updated tracker doc with execution evidence:
- `.planning/SPRINT-2026-02-15-ADMIN-ONBOARDING-RBAC-AUDIT-NOTES-TRACKER.md`
4. User-facing status/notes doc:
- `ADMIN-ONBOARDING-RBAC-AUDIT-NOTES-STATUS.md`
