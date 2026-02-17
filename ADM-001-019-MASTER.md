# ADM Master Reference (001-019)
> Last updated: 2026-02-17  
> Purpose: one consolidated ADM document with per-ticket explanation, current status, and runbook/checklist details.

## Source Documents Included
- `ADM-006-007-STATUS.md`
- `ADM-002-004-005-APPLY-QA.md`
- `ADM-013-APPLY-QA.md`
- `ADM-014-APPLY-QA.md`
- `ADM-016-APPLY-QA.md`
- `ADM-019-APPLY-QA.md`
- `ADM-RLS-AUDIT-CHECKLIST.md`

---

## ADM-001: Admin-Merchant Assignment Table & Scoped Access
- Status: Done (User-confirmed)
- What this ticket is about:
- Build assignment-based scoping so HQ admins only see merchants they are assigned to, with super-admin bypass.
- What is done:
- Tracked as complete by user.
- Foundation function `get_admin_merchant_ids()` exists and is used by later admin-scoped RPC/RLS work.
- Runbook:
- No standalone ADM-001 runbook file exists in repo.
- Verification is covered through downstream smoke checks in ADM-002/004/005 (`get_admin_merchant_ids` existence and behavior).

---

## ADM-002: RLS Policies for Admin Access on Orders & Payments
- Status: Implemented (Pending Migration Apply + QA)
- What this ticket is about:
- Enforce admin read access through RLS while preserving merchant-side access.
- What is done:
- Admin SELECT policy set added across payment/order scope tables.
- RLS scoping tied to `get_admin_merchant_ids()`.
- Runbook file:
- `ADM-002-004-005-APPLY-QA.md`
- Migration to apply:
- `supabase/migrations/022_adm_002_admin_rls.sql`
- DB smoke checks:
1. Confirm functions:
```sql
select proname
from pg_proc
where proname in (
  'get_admin_merchant_ids',
  'get_admin_transactions',
  'get_admin_transaction_detail'
)
order by proname;
```
2. Confirm admin policies:
```sql
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and policyname like 'hq_admin_select_%'
order by tablename, policyname;
```
- Expected admin policies:
- `hq_admin_select_orders`
- `hq_admin_select_order_payments`
- `hq_admin_select_order_items`
- `hq_admin_select_order_payment_items`
- `hq_admin_select_payment_events`
- Important safety checklist:
- `ADM-RLS-AUDIT-CHECKLIST.md` (pre/post policy snapshot, guardrails, merchant-policy preservation).

---

## ADM-003: Denormalize `merchant_id` and `location_id` on `order_payments`
- Status: Done (User-confirmed)
- What this ticket is about:
- Improve RLS/admin-query performance by storing merchant/location directly on `order_payments`.
- What is done:
- Tracked as complete by user.
- Used as prerequisite for ADM-002/ADM-004/ADM-006 behavior.
- Runbook:
- No standalone ADM-003 runbook file exists in repo.

---

## ADM-004: Admin Transactions RPC (Paginated + Filterable)
- Status: Implemented (Pending Migration Apply + QA)
- What this ticket is about:
- Provide a scalable server-side transaction query with filters/search/sort/pagination.
- What is done:
- `get_admin_transactions(...)` RPC added and wired as RPC-first path with fallbacks.
- Runbook file:
- `ADM-002-004-005-APPLY-QA.md`
- Migration to apply:
- `supabase/migrations/023_adm_004_admin_transactions_rpc.sql`
- App QA (from runbook):
1. Test with HQ user assigned to one merchant.
2. Confirm `/manage/transactions` shows only assigned merchant data.
3. Force URL merchant filter for unassigned merchant and confirm data remains scoped.
4. Confirm filters/search/sort/pagination still work.
5. Test with `hq.super_admin` and confirm cross-merchant visibility.

---

## ADM-005: Admin Transaction Detail RPC
- Status: Implemented (Pending Migration Apply + QA)
- What this ticket is about:
- Return full transaction detail payload for expanded row: payment segments, events, EMV, items, settlement context.
- What is done:
- `get_admin_transaction_detail(p_order_id)` RPC added and wired with fallback path.
- Runbook file:
- `ADM-002-004-005-APPLY-QA.md`
- Migration to apply:
- `supabase/migrations/024_adm_005_admin_transaction_detail_rpc.sql`
- App QA (from runbook):
1. Expand row in `/manage/transactions`.
2. Validate sections:
- payment segments
- transaction details
- terminal info
- items paid
- EMV (when available)
- adjustments/reversals
- payment timeline
- full order breakdown + discounts
3. Validate sample cases:
- captured card
- cash
- split payment
- refunded/voided

---

## ADM-006: Advanced Filter Panel
- Status: Done
- What this ticket is about:
- Replace basic filter UX with full panel + URL-synced filters + debounced refetch.
- What is done:
- Filter sheet implemented with URL sync and debounce behavior.
- Filter apply-close UX fixed (sheet closes even when URL params do not change).
- Runbook:
- No standalone ADM-006 runbook file exists in repo.

---

## ADM-007: Global Transaction Search Bar
- Status: Done
- What this ticket is about:
- Global search across order/auth/customer/card fields with debounce and keyboard focus.
- What is done:
- Debounced server-side search, clear behavior, highlight behavior, and shortcut support are completed.
- Runbook:
- No standalone ADM-007 runbook file exists in repo.

---

## ADM-008: Enhanced Transaction Table Columns
- Status: Done (User-confirmed)
- What this ticket is about:
- Improve at-a-glance transaction scanning with richer columns and table UX improvements.
- What is done:
- Remaining column/row UX tasks were completed and user scratched this ticket.
- Includes sticky header and alternating row readability improvements.
- Runbook:
- No standalone ADM-008 runbook file exists in repo.

---

## ADM-009: Server-Side Sorting & Pagination
- Status: Done
- What this ticket is about:
- Keep transaction browsing fast and consistent with server-side sort/pagination + URL state.
- What is done:
- Server-side pagination/sort fully wired with URL state persistence.
- Runbook:
- No standalone ADM-009 runbook file exists in repo.

---

## ADM-010: Expandable Row with Full Payment Detail
- Status: Done (User-confirmed)
- What this ticket is about:
- Rich inline expanded view for payment diagnostics and reconciliation.
- What is done:
- Expandable detail row completed, including split segments and copy actions.
- User confirmed functionality.
- Runbook:
- No standalone ADM-010 runbook file exists in repo.

---

## ADM-011: Payment Event Timeline
- Status: Done (Ready for QA)
- What this ticket is about:
- Visual timeline of payment lifecycle and event payloads.
- What is done:
- Timeline section implemented.
- QA items still tracked:
1. Verify event status transition rendering (`old -> new`) and relative timestamps.
2. Verify raw JSON expand/collapse behavior.
- Runbook:
- No standalone ADM-011 runbook file exists in repo.

---

## ADM-012: Order Items Detail + Modifier Breakdown
- Status: Done (Ready for QA)
- What this ticket is about:
- Full order-item breakdown with modifiers, flags, discounts, and totals.
- What is done:
- Full item/modifier/totals rendering implemented.
- QA items still tracked:
1. Compare item/modifier/totals values with known sample.
2. Verify badge conditions: void/open-item/tax-exempt when sample data exists.
- Runbook:
- No standalone ADM-012 runbook file exists in repo.

---

## ADM-013: Enhanced Summary Cards with Live Metrics
- Status: Implemented (Pending Migration Apply + QA)
- What this ticket is about:
- Replace simple stats with filter-reactive summary cards using aggregate RPC.
- What is done:
- Added 6-card summary block:
- Total Transactions
- Card Revenue
- Cash Revenue
- Total Revenue
- Avg Tip
- Voided/Returned
- Added prior-equivalent-period comparisons.
- Added card-click filter behavior.
- Runbook file:
- `ADM-013-APPLY-QA.md`
- Migration to apply:
- `supabase/migrations/026_adm_013_admin_transaction_summary_rpc.sql`
- DB smoke check:
```sql
select proname
from pg_proc
where proname = 'get_admin_transaction_summary';
```
- Key QA checks:
1. Cards respond to filters/search/date changes.
2. Card/cash revenue use captured payments only.
3. Card click actions mutate URL params correctly and reset `page=1`.
4. Missing migration fallback text appears: `Summary unavailable (apply migration 026)`.
- Decision log (locked):
- prior-period comparison = immediate previous equivalent window
- no-date default = rolling last 30 days vs previous 30 days
- revenue = captured only
- total-transactions click clears only method filter

---

## ADM-014: Merchant Comparison Mini-Table
- Status: Implemented (Pending Migration Approval + QA)
- What this ticket is about:
- Show per-merchant comparative metrics with sortable table and trend sparkline.
- What is done:
- Collapsible merchant breakdown section implemented with sorting + sparkline.
- Runbook file:
- `ADM-014-APPLY-QA.md`
- Baseline migration to apply:
- `supabase/migrations/028_adm_014_merchant_breakdown_rpc.sql`
- DB smoke check:
```sql
select proname
from pg_proc
where proname = 'get_admin_merchant_breakdown';
```
- QA checks include:
1. Hidden-by-default toggle behavior.
2. Sortable column behavior.
3. Filter responsiveness (date/merchant/location/payment status).
4. Empty state behavior.
- Approval note:
- Team-proposed v2 SQL is intentionally pending approval.
- Reason: it changes metric/output semantics vs current UI/type mapping and may alter counts without coordinated updates.

---

## ADM-015: CSV/Excel Export with All Columns
- Status: QA Awaiting
- What this ticket is about:
- Export filtered transactions to CSV/XLSX with full reconciliation fields and row cap behavior.
- What is done:
- Export dropdown wired (`CSV`, `Excel (.xlsx)`).
- Export respects active filters/search.
- Row cap handling and file naming logic implemented.
- Current tracker note:
- Export flow verified after migration/function-type alignment fix.
- Runbook:
- No dedicated `ADM-015-APPLY-QA.md` file currently exists in repo.
- Operational migration associated with this ticket:
- `supabase/migrations/025_adm_015_admin_transactions_export_rpc.sql`

---

## ADM-016: Batch Reconciliation Report
- Status: Implemented (Pending Migration Apply + QA)
- What this ticket is about:
- Reconcile settlement batches with linked payments and identify discrepancies.
- What is done:
- Batch section added with merchant/date/status filters.
- Linked payment drill-down and discrepancy flags implemented.
- CSV export for selected batch implemented.
- Runbook file:
- `ADM-016-APPLY-QA.md`
- Migration to apply:
- `supabase/migrations/027_adm_016_batch_reconciliation_rpc.sql`
- DB smoke checks:
```sql
select proname
from pg_proc
where proname in ('get_admin_settlement_batches', 'get_admin_settlement_batch_payments')
order by proname;
```
- Optional data check:
```sql
select *
from public.get_admin_settlement_batches(null, null, null, null, 10);
```
- Key QA checks:
1. Batch list renders expected columns.
2. Batch row click loads linked payments.
3. Discrepancy badge logic works.
4. Export selected batch works.

---

## ADM-017: Chargeback Dashboard
- Status: Implemented (Pending QA)
- What this ticket is about:
- Central chargeback/dispute management with deadline urgency and workflow visibility.
- What is done:
- Added section component:
- `app/manage/transactions/components/ChargebacksSection.tsx`
- Added server action:
- `getPlatformChargebacks(filters, limit, offset)`
- Added query hook:
- `usePlatformChargebacks(filters, limit, offset)`
- Added UI behavior:
- filters for status/merchant/date/card network
- defense-deadline-first ordering
- pending/notified count badge
- 72-hour urgency alert banner
- expandable detail with original payment info, defense docs, and resolution details
- Runbook:
- No runbook file exists yet.

---

## ADM-018: Payment Audit Log Viewer
- Status: Implemented (Pending ADM-019 Migration Approval + QA)
- What this ticket is about:
- Frontend viewer for payment audit trail, filters, search, and failed-action highlighting.
- What is done:
- Added section component:
- `app/manage/transactions/components/AuditLogSection.tsx`
- Added server action:
- `getPlatformPaymentAuditLogs(filters, limit, offset)`
- Added query hook:
- `usePlatformPaymentAuditLogs(filters, limit, offset)`
- Added UI behavior:
- filter by user, action, merchant, outcome, and date range
- search by user email or resource id
- failed rows highlighted in red
- required ticket columns + `fields_accessed` shown
- Runbook:
- No runbook file exists yet.
- Dependency note:
- ADM-019 backend audit logging is implemented and is the data source for this UI.

---

## ADM-019: Audit Logging for Admin Data Access
- Status: Implemented (Pending Migration Approval + QA)
- What this ticket is about:
- Automatically log sensitive admin payment data access (list/detail/export/search) for compliance trail.
- What is done:
- Added audit logging RPC and table/index support.
- Added non-blocking hooks in transactions server actions for:
- list views
- detail views
- exports
- card-last-four searches
- `fields_accessed` is populated by action context.
- Runbook file:
- `ADM-019-APPLY-QA.md`
- Migration to apply:
- `supabase/migrations/029_adm_019_admin_payment_audit_logging.sql`
- Current state:
- Pending team approval before apply in shared/prod-like environments.
- DB smoke check:
```sql
select proname
from pg_proc
where proname = 'log_admin_payment_audit_event';
```
- Verification query:
```sql
select
  action,
  success,
  fields_accessed,
  merchant_id,
  location_id,
  user_id,
  user_email,
  user_role,
  event_timestamp
from public.payment_audit_log
order by event_timestamp desc
limit 50;
```
- QA checks:
1. `view_transaction_list` log on load.
2. `search_card_last_four` log when search is 4 digits.
3. `view_payment_detail` log on expand.
4. `export_data` log on export.

---

## Cross-Ticket RLS Safety (Reference)
- Document:
- `ADM-RLS-AUDIT-CHECKLIST.md`
- Why this exists:
- To prevent merchant-access regressions when changing HQ/admin RLS policies.
- When to use:
- Before and after any RLS migration touching `orders`, `order_payments`, `order_items`, `order_payment_items`, `payment_events`.

---

## Current Open Items Summary
1. Apply + QA pending:
- ADM-002, ADM-004, ADM-005
- ADM-013
- ADM-014 (approval first, then migration apply + QA)
- ADM-016
- ADM-019 (approval first, then migration apply + QA)
2. QA awaiting:
- ADM-015
3. Implemented but dependency-gated QA:
- ADM-018 (depends on ADM-019 migration approval/apply for data)
4. Implemented pending QA:
- ADM-017
