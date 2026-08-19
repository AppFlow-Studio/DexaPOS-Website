# All Tickets Reference

## Purpose

Single index for active ticket streams and their source trackers.

## Stream A: ADM-001 to ADM-019 (Transactions/Admin Platform)

1. Continuation state:
- `.planning/.continue-here.md`

2. Sprint tracker:
- `.planning/SPRINT-2026-02-15-ADMIN-ONBOARDING-RBAC-AUDIT-NOTES-TRACKER.md`

3. Plan:
- `docs/features/identity-access/SPRINT-2026-02-15-ADMIN-ONBOARDING-RBAC-AUDIT-NOTES-PLAN.md`

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
- `docs/features/device-management/SPRINT-2026-03-14-DEVICE-REGISTRY-FOUNDATION-PLAN.md`

3. Continuation state:
- `.planning/.continue-here.md`

## Stream D: Device Registry Admin UI

1. Internal execution tracker:
- `.planning/SPRINT-2026-03-16-DEVICE-REGISTRY-ADMIN-UI-TRACKER.md`

2. Plan:
- `docs/features/device-management/SPRINT-2026-03-16-DEVICE-REGISTRY-ADMIN-UI-PLAN.md`

3. Continuation state:
- `.planning/.continue-here.md`

## Stream E: Bunny CDN Migration

1. Internal execution tracker:
- `.planning/SPRINT-2026-03-21-BUNNY-CDN-MIGRATION-TRACKER.md`

2. Plan:
- `docs/features/cdn-assets/SPRINT-2026-03-21-BUNNY-CDN-MIGRATION-PLAN.md`

3. Continuation state:
- `.planning/.continue-here.md`

## Stream F: Online Ordering Payments Hard Cut (NMI)

1. Current implementation handoff:
- `docs/features/online-ordering/HANDOFF-2026-05-04-NMI-ONLINE-ORDERING-HARD-CUT.md`

2. Previous Dejavoo payment handoff:
- `docs/features/online-ordering/SPRINT-2026-04-08-ONLINE-ORDERING-PAYMENTS-HANDOFF.md`

3. Continuation state:
- `.planning/.continue-here.md`

4. Scope notes:
- Online storefront checkout is now migrating to merchant-scoped NMI credentials.
- In-store POS terminal payments remain separate and are not part of this hard cut.
- Reconciliation exists as an on-demand admin action; scheduled reconciliation is still pending.

## Stream G: Dashboard Staff + Sidebar Polish

1. Plan:
- `docs/features/staff/PLAN-2026-06-02-DASHBOARD-STAFF-SIDEBAR-POLISH.md`

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
- `docs/features/menu-management/PLAN-2026-06-02-MODIFIER-REORDERING-SAFETY.md`

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
- `docs/features/menu-management/PLAN-2026-06-04-MODIFIER-DISPLAY-ORDER-ALIGNMENT.md`

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
- `docs/features/reporting/PLAN-2026-06-04-REPORTING-DATE-RANGE-BOUNDARIES.md`

2. Continuation state:
- `.planning/.continue-here.md`

3. Scope notes:
- Cross-cutting reporting stream.
- Backend + frontend work.
- Not a quick-fix ticket and not mixed into modifier work.

## Stream K: Single-Location Global Modifier And Recipe RPCs

1. Plan:
- `docs/features/menu-management/PLAN-2026-06-06-SINGLE-LOCATION-GLOBAL-MODIFIER-RECIPE-RPCS.md`

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
- `docs/features/qr-dine-in/PLAN-2026-05-27-QR-DINE-IN-UNIFIED.md`

2. Ops runbook:
- `docs/features/online-ordering/RUNBOOK-PAYMENT-WHITELIST-SYNC.md`

3. Continuation state:
- `.planning/.continue-here.md`

4. Scope notes:
- Website repo only for this stream.
- QR storefront, dashboard QR manager, QR analytics, and guest-alert validation surfaces are implemented here.
- Remaining open items are primarily deploy, payment-origin registration, POS follow-up, and end-to-end QA.
- Do not mark QR payment or realtime items complete without staging or hosted-environment verification.

## Stream M: Bay Ridge Owner Identity Relink

1. Plan:
- `docs/features/identity-access/PLAN-2026-06-22-BAY-RIDGE-OWNER-IDENTITY-RELINK.md`

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
- `docs/features/staff/PLAN-2026-06-29-TIMESHEETS-MANUAL-ADJUSTMENT-AUTO-CLOCKOUT.md`

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
- `docs/features/orders/PLAN-2026-06-29-DELIVERY-PLATFORM-LOGOS-WEB.md`

2. Scope notes:
- Website repo only.
- Parent ticket also includes POS/KDS, but this stream implements web surfaces only.
- Shared resolver lives at `lib/orders/delivery-platform.ts`.
- Merchant dashboard and HQ merchant order list/detail surfaces render the same platform badge.
- Existing public logo assets are used for Grubhub, DoorDash, and Uber Eats.
- POS/KDS state rendering still belongs in the POS repo.

## Stream P: [POS/Web] Location-level POS Settings surface + per-station overrides

1. Plan:
- `docs/features/pos-settings/PLAN-2026-06-30-LOCATION-POS-CONFIG-STATION-OVERRIDES-WEB.md`

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
- `docs/quality/qa-tracking/QA-2026-07-02-IN-PROGRESS-TICKETS-CLOSURE-MATRIX.md`

2. Scope notes:
- Built from the July 2 board screenshots.
- Covers the 13 visible in-progress tickets only.
- Separates website/dashboard work, POS work, Supabase/data repair, and tickets not ready to claim done.
- Use this before moving those tickets from In Progress to Done.

## Stream R: [BILLING][HIGH] DEXA HQ Self-Service Billing Control

1. Plan:
- `docs/features/billing/PLAN-2026-07-12-HQ-SELF-SERVICE-BILLING-CONTROL.md`

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
- `docs/features/support-messaging/FEATURE-2026-07-28-HQ-SUPPORT-TICKET-CREATION-NOTIFICATIONS.md`

2. Scope notes:
- Authorized HQ support admins can create developer tickets from `/manage/support`.
- HQ-created tickets use `ticket_scope = hq_internal` and have no merchant,
  location, or carrier ownership.
- `DEXA_HQ_SUPPORT_LOCATION_ID` is obsolete; HQ identity comes from the Clerk
  org already enforced through `DEXA_POS_INTERNAL_TEAM_ID`.
- The corrective append-only migration is
  `supabase/migrations/20260729120000_hq_internal_support_ticket_scope.sql`.
- Existing HQ-created rows are converted away from the previous fake-location
  model while merchant and POS tickets retain tenant ownership.
- HQ-created tickets accept up to 3 initial image/PDF attachments, linked to
  the first admin message.
- HQ creation exposes a multi-select assignee dropdown sourced exclusively
  from `SUPPORT_TICKET_NOTIFICATION_EMAILS`.
- Selected developer emails persist in
  `support_tickets.assigned_to_emails`; server validation rejects values not
  present in the environment list.
- Assignment is optional and does not change notification recipients: the
  complete configured list still receives every ticket, reply, and private
  note.
- Every `support_tickets` insert, including POS and merchant-dashboard tickets,
  triggers the same asynchronous notification path.
- Every later support-ticket reply or private note triggers that same endpoint;
  the initial description message is suppressed to prevent duplicate creation
  emails.
- Resend recipients are configured through `SUPPORT_TICKET_NOTIFICATION_EMAILS`.
- Website-created support tickets immediately request the same idempotent
  notification endpoint used by the Supabase trigger; POS and direct inserts
  remain covered by `pg_net`.
- `20260806160000_support_ticket_email_assignment_consistency.sql` aligns the
  dashboard unassigned metric with HQ email assignees.
- New-ticket attempts are recorded in
  `support_ticket_notification_deliveries`; reply/note attempts are recorded in
  `support_ticket_message_notification_deliveries`. Email failure never rolls
  back the ticket or message.
- The thread-notification migration is
  `supabase/migrations/20260729130000_support_ticket_thread_notifications.sql`.
- The multi-assignee migration is
  `supabase/migrations/20260729140000_hq_support_ticket_email_assignees.sql`.
- Platform Admin receives `hq.support.view` and `hq.support.manage` through the
  companion role-permission migration.
- Local implementation is complete. Migration/Vault configuration,
  cross-scope RLS checks, cross-source ticket/reply/private-note email checks,
  and staging QA remain.

## Stream T: [Reporting - Kiosk] Website Channel-Segmented Reports

1. Plan and QA tracker:
- `docs/features/reporting/PLAN-2026-07-30-KIOSK-CHANNEL-REPORTING-WEB.md`

2. Scope notes:
- Website/dashboard portion of the shared POS/backend reporting ticket.
- Canonical sources are `pos`, `kiosk`, `online_store`, and `orderout`.
- Merchant Reports scope includes Sales Summary channel cards and compatible
  channel filters.
- HQ Payments & Banking must render the channel dimension from
  `get_admin_transaction_summary_v2(...)`.
- Revenue-by-Platform must exclude kiosk even if legacy routing metadata uses
  a kiosk-like provider value.
- The corrected shared migration was applied from the POS repository; the
  website duplicate is synchronization-only and must not be executed again.
- `get_payment_summary_stats_v2(...)` is HQ-only and must not be called by the
  merchant Payment Summary tab without a new tenant-scoped backend contract.
- Website code is complete and targeted automated verification passes.
- Remaining closure work is staging/manual QA, SQL/screenshots, the merchant
  Payment Summary backend contract follow-up, and Temur sign-off.

## Stream U: Shared Supabase/Postgres Performance and Architecture Audit

1. Canonical combined POS and website principal-level audit:
- `docs/engineering/database-performance/AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-COMBINED.md`

2. Website source/query-pattern audit:
- `docs/engineering/database-performance/AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-WEBSITE.md`

3. Senior decision summary:
- `docs/engineering/database-performance/SENIOR-SUMMARY-2026-07-31-SHARED-DATABASE-PERFORMANCE.md`

4. Prioritized implementation and ownership backlog:
- `docs/engineering/database-performance/IMPLEMENTATION-BACKLOG-2026-08-01-SHARED-DATABASE-PERFORMANCE.md`

5. Read-only Supabase statistics and catalog queries:
- `docs/engineering/database-performance/SQL-READONLY-2026-07-31-DATABASE-PERFORMANCE-AUDIT.sql`

6. Scope notes:
- Investigation and documentation only; no fixes or database changes are part
  of this phase.
- The website static audit confirms high-impact request fan-out, unbounded
  nested list reads, repeated raw report scans, HQ raw-row aggregation, and
  unbounded recurring-job batches.
- The sibling POS audit's staging statistics were incorporated: nested
  order/item payloads dominate captured statement cost, Realtime is a
  high-frequency workload, and the relevant modifier/discount indexes already
  exist.
- Existing repository indexes are extensive and historically duplicated, so
  no index migration should be created until live catalog and
  `pg_stat_statements` results are reviewed.
- Redis is not recommended as the first remediation. Pagination, narrow
  projections, aggregate RPCs, batching, polling reduction, and measured
  Postgres/index improvements come first.
- Shared RPC, business-day, reportability, and payment changes require POS and
  website coordination.
- The audit now records exact POS/website revisions, staging evidence lineage,
  normalized workload context, consistent priorities, and provisional targets.
- The 2026-08-02 principal-review expansion adds strict executive/critical
  sections, specialist lenses, advanced architecture options, industry-pattern
  comparisons, a 10x/100x model, and confidence-bounded gain estimates.
- A read-only OpenAPI refresh reconfirmed 541 RPC paths, 239 exposed
  relation/view definitions, and 3,855 documented properties without reading
  table rows or executing an RPC.
- Remaining work is to revalidate source references after the POS rollback,
  run controlled workload deltas and approved production read-only statistics,
  obtain the listed senior decisions, and open separately reviewed tickets
  from the implementation backlog.
- The 2026-08-03 current-branch pass revalidated the major static findings and
  found six migration roots, 35 duplicate SQL basenames, and 13 same-named
  files with different contents across the two repositories.
- The read-only evidence pack now also covers connections/waits, locks,
  function timing, Realtime publications, triggers, materialized views,
  relevant server settings, applied migration history, replication slots,
  churn, pg_cron metadata, and partition inventory.
- Query 39 confirms a P0 shared-database authorization ticket: PUBLIC/`anon`
  can execute `get_unified_staff_view`, `close_check`, `reopen_check`,
  `record_cash_operation`, and `delete_floor_plan_cascade`, while the live
  bodies do not validate caller, tenant, location, or permission scope.
- `get_unified_staff_view` also returns staff contact data and raw/hashed/legacy
  PIN material. The remediation must remove PIN material, add caller-derived
  authorization, pin `search_path`, narrow grants, and preserve POS online and
  offline-replay behavior.
- The implementation backlog tracks this as `DB-P0-04`; no runtime or database
  fix was applied during the audit.
- Query 40 confirms a separate P0 table-access ticket: RLS is disabled on
  `kiosk_pickup_sequences` and `luqra_sync_runs`, while `anon` and
  `authenticated` have full privileges including `TRUNCATE`, `DELETE`, and
  `UPDATE`.
- The backlog tracks that containment as `DB-P0-05`. It must preserve an
  authorized atomic kiosk-number allocator and HQ/service-role Luqra sync
  access while removing direct anonymous/general-client access.
- Query 41 confirms client roles have schema usage but no object-creation
  privilege in `public` or `extensions`. The unpinned `search_path` work remains
  required hardening, but no client-role object-shadowing path is currently
  evidenced on staging.
- Query 42 returned no live function dependency on either exposed table. No
  direct application caller was found for `kiosk_pickup_sequences`; observed
  `luqra_sync_runs` access uses HQ/service-role website actions.
- Query 13 is now complete across six pages: 511 live, unique
  `SECURITY DEFINER` signatures, all owned by `postgres`. Effective execute is
  available to `anon` on 465 (91.0%), `authenticated` on 495 (96.9%), and
  `service_role` on all 511; 396 ACLs explicitly include PUBLIC execute and
  463 explicitly include `anon`.
- Search paths are pinned on 500 signatures; the 11 unpinned signatures match
  the body-reviewed Query 39 set. The broad execute inventory is not proof
  that every body is exploitable, but it requires a signature-level
  authorization/caller allowlist. The backlog tracks this as `DB-P0-06`, with
  payment, secret/device, NMI, billing, staff, order, and platform mutations
  reviewed before lower-consequence contracts.
- The dedicated POS current-staging audit is complete at `a1c7a032`, matching
  `origin/staging` at audit start. Its detailed and senior artifacts live under
  `Dexa-POS/docs/engineering/database/` in the
  `audit/pos-database-refresh` worktree.
- POS source verification adds four shared/release blockers: nested conflict
  markers in the station-status RPC reference; incomplete station/location
  binding plus plaintext PIN persistence in canonical `pos_staff_login_v2`;
  v16/v17 payment routing divergence across direct/service/replay paths; and a
  reconnect fingerprint capable of skipping fresh active-order hydration.
- End-of-Day date/state/query correctness, Previous Orders fan-out, KDS
  convergence, raw analytics, and refund `2N` reads are also incorporated into
  the combined audit and backlog. The POS collector's one standalone export is
  cumulative only; paired workflow deltas remain open.

## Stream V: [DevEx] Feature-Based Documentation Restructure

1. Website implementation and approval tracker:
- `docs/engineering/developer-experience/FEATURE-2026-08-02-FEATURE-BASED-DOCUMENTATION-RESTRUCTURE.md`

2. Migration manifest:
- `docs/engineering/developer-experience/DOCUMENT-MIGRATION-MANIFEST.md`

3. AI documentation guide:
- `docs/engineering/developer-experience/AI-DOCUMENTATION-GUIDE.md`

4. Scope notes:
- Website repository only in this implementation pass.
- Existing tracked documentation is relocated by feature without rewriting its
  technical content.
- Root `README.md`, `CLAUDE.md`, and tool-managed `.planning/` state remain in
  place and point to the canonical documentation hierarchy.
- Temur and Abubeckr must approve the structure before publish or merge.
- The engineering group message and POS repository restructure remain manual,
  separately verified follow-ups.

## Stream W: Merchant Backend Pagination

1. Website implementation and QA tracker:
- `docs/features/orders/FEATURE-2026-08-14-MERCHANT-BACKEND-PAGINATION.md`

2. Implemented scope:
- Shared pagination metadata and responsive controls.
- Backend pagination, exact totals, server search, and stable ordering for the
  merchant Customers directory.
- Backend pagination, exact totals, server filtering/search/sorting, and a
  narrow KPI query for the merchant Orders page.
- Backend pagination and exact totals for merchant Invoices while preserving
  the existing database-authoritative KPI RPC.
- Backend pagination and exact totals for merchant Discounts, with independent
  location-scoped KPI data so summary tiles remain page-independent.

3. Scope decisions:
- Existing paginated pages remain unchanged.
- Reorder-sensitive menu-management lists are intentionally not paginated.
- Payments, Transactions, and Timesheets need separate aggregate
  contracts before their visible rows can be safely paginated.
- Authenticated manual QA remains required; no Playwright dependency was added.

## Stream X: Single-Location Menu - Admin Web Core Scope

1. Website implementation and QA plan:
- `docs/features/menu-management/PLAN-2026-08-13-SINGLE-LOCATION-MENU-WEBSITE.md`

2. Backend/RPC companion:
- `docs/features/menu-management/PLAN-2026-06-06-SINGLE-LOCATION-GLOBAL-MODIFIER-RECIPE-RPCS.md`

3. Scope notes:
- Website repository only in this pass.
- Exactly one active accessible location removes global/location framing from
  menu-management UI while writes continue to target the core/base contract.
- Physical-location controls use the gated concrete location.
- Multi-location scope and override behavior remains unchanged.
- POS framing is a separate ticket and was not changed in this repository.
- No new migration is introduced or executed by this branch.
- Website code is complete; single- and multi-location manual QA is pending.

## Stream X: [POS-KDS - P0] KDS Routing Traceability

1. Website/shared-database implementation and QA tracker:
- `docs/features/kds/PLAN-2026-08-14-KDS-ROUTING-TRACEABILITY.md`

2. Scope notes:
- This repository owns the shared Supabase instrumentation: immutable routing
  and send-attempt ledgers, actual-versus-requested send counts, the
  tenant-scoped trace RPC, rolling seven-day health metrics, and honest
  historical backfill.
- Routing behavior, merchant-facing trace UI, and POS application changes are
  outside this implementation pass.
- The migration has not been executed. Temur's DDL review, deployed-signature
  preflight, staging application, and physical KDS validation remain required.
- The POS follow-up must consume count mismatches, pass station/device context,
  preserve offline-replay idempotency, and complete the physical KDS QA matrix.
- Two source-contract inconsistencies are documented: rolling seven-day
  visibility cannot reconstruct old dropped rows, and category-name trimming
  is deferred because it changes routing despite the instrumentation-only scope.

## Notes

1. Keep this file updated whenever a new ticket stream starts.
2. Keep links here PR-safe (planning/internal tracker files only).
3. Keep `.planning/.continue-here.md` as the primary technical handoff state.
4. Recent senior-review bundle:
- `docs/handoffs/HANDOFF-2026-06-10-SENIOR-RECENT-THREE-TICKETS.md`

5. Latest senior handoff:
- `docs/handoffs/HANDOFF-2026-06-30-LATEST-TICKETS-SENIOR-REVIEW.md`

6. Latest billing-control handoff:
- `docs/features/billing/HANDOFF-2026-07-13-HQ-BILLING-CONTROL-FINAL.md`
- `docs/features/billing/HANDOFF-2026-07-13-BILLING-CONTROL-REMAINING-POS-ITEMS.md`

7. Next 16 upgrade handoff:
- `docs/engineering/framework-upgrades/HANDOFF-2026-07-13-NEXT-16-UPGRADE.md`
