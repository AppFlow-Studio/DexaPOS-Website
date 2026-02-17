# ADM Tasks Status (001-019)
> Last updated: 2026-02-17
> Baseline: compared against your official acceptance criteria list in chat.

---

## Summary Table

| Ticket | Status | Scratch Now? | Notes |
|--------|--------|--------------|-------|
| ADM-001 | Done (User-confirmed) | Yes | User marked it crossed out. |
| ADM-002 | Implemented (Pending Migration Apply + QA) | After QA | Migration includes `get_admin_merchant_ids()` and admin SELECT RLS policies. |
| ADM-003 | Done (User-confirmed) | Yes | User marked it crossed out. |
| ADM-004 | Implemented (Pending Migration Apply + QA) | After QA | `get_admin_transactions(...)` RPC added and wired RPC-first with fallback. |
| ADM-005 | Implemented (Pending Migration Apply + QA) | After QA | `get_admin_transaction_detail(p_order_id)` RPC added and wired RPC-first with fallback. |
| ADM-006 | Done | Yes | Filter sheet + URL sync + debounce complete. |
| ADM-007 | Done | Yes | Global search complete (debounce, highlight, clear, shortcut). |
| ADM-008 | Done (User-confirmed) | Yes | Remaining table/column UX completed and user scratched it. |
| ADM-009 | Done | Yes | Server-side sort + pagination + URL state complete. |
| ADM-010 | Done (User-confirmed) | Yes | Expandable detail view complete, including split segments and copy actions. |
| ADM-011 | Done (Ready for QA) | After QA | Payment timeline section implemented. |
| ADM-012 | Done (Ready for QA) | After QA | Full order breakdown with modifiers/flags/totals implemented. |
| ADM-013 | Not Started | No | Needs new summary RPC + richer live metric cards + clickable card filters. |
| ADM-014 | Not Started | No | Needs merchant breakdown RPC + collapsible sortable mini-table + sparklines. |
| ADM-015 | Implemented (Pending Migration Apply + QA) | After QA | Added export RPC migration + frontend export dropdown (CSV/XLSX), all required columns, 10k cap warning, and ticket filename format. |
| ADM-016 | Not Started | No | Batch reconciliation section with discrepancy detection and export. |
| ADM-017 | Not Started | No | Chargeback dashboard with deadline urgency, badge, and alert banner. |
| ADM-018 | Not Started | No | Audit log viewer UI and filters/search. |
| ADM-019 | Not Started | No | Backend audit logging for list/detail/export/search events. |

---

## Data Volume Note (1119 -> 200)

Date recorded: 2026-02-17

Observed change:
- Transaction total shown in manage transactions dropped from `1119` to `200`.

Why this happened:
1. ADM-002 scoping is active:
- Results are restricted to merchants returned by `get_admin_merchant_ids()` (via `admin_merchant_access`) unless user is `hq.super_admin`.
2. ADM-004 default payment-status behavior:
- When no `paymentStatus` filter is selected, query excludes `pending` and `failed`.

Net effect:
- The new total (`200`) is scoped/filtered output, not deleted records.

---

## New Plan (013-019)

1. ADM-015 Export and reconciliation export baseline
- Added dedicated export RPC with full dataset fields and 10k hard cap.
- Added export dropdown: CSV and Excel.
- Export respects active filters/search and shows loading state.
- Added filename format: `DEXA_Transactions_{merchant}_{date_from}_to_{date_to}.{ext}`.

2. ADM-013 Enhanced summary cards
- Add lightweight aggregate RPC `get_admin_transaction_summary(...)`.
- Return totals, averages, splits, void/return rates, and prior-period deltas.
- Make cards clickable to apply related filters.

3. ADM-014 Merchant comparison mini-table
- Add breakdown RPC with merchant-level metrics for selected period.
- Add collapsible section with sortable table and daily revenue sparkline.

4. ADM-019 Audit logging foundation (backend)
- Log list/detail/export/search sensitive access paths asynchronously to `payment_audit_log`.

5. ADM-018 Audit log viewer (frontend)
- Add audit tab with filters, search, and failed-row highlighting.

6. ADM-016 Batch reconciliation
- Add batch section with discrepancy checks and batch detail export.

7. ADM-017 Chargeback dashboard
- Add chargeback table, urgent deadline indicators, and nav badge.

---

## UX Fix Logged Today

- `Apply Filters` now closes the filter sheet even when URL params are unchanged (previously it stayed open in no-change apply cases).

---

## Remaining Immediate QA (Before Scratch ADM-011/012)

1. Expand transaction and verify timeline events render (`old -> new` status, relative timestamp, absolute hover value).
2. Expand raw event JSON and verify collapse/expand behavior.
3. In order breakdown, verify item/modifier/totals values against known POS order sample.
4. Verify void/open-item/tax-exempt badges on sample data where available.
