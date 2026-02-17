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
| ADM-013 | Implemented (Pending Migration Apply + QA) | After QA | Added summary RPC migration + 6 dynamic cards with prior-period deltas and card-click filter actions. |
| ADM-014 | Not Started | No | Needs merchant breakdown RPC + collapsible sortable mini-table + sparklines. |
| ADM-015 | Done (User-confirmed) | Yes | CSV/XLSX export verified after migration fix and function type alignment patch. |
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

1. ADM-013 Enhanced summary cards
- Added lightweight aggregate RPC migration `get_admin_transaction_summary(...)` with prior-equivalent-period output.
- Replaced top section with 6 filter-reactive cards:
  - Total Transactions
  - Card Revenue
  - Cash Revenue
  - Total Revenue
  - Avg Tip
  - Voided/Returned
- Added card-click URL filter actions (method/status toggles) while preserving other active filters.
- Added fallback state when summary RPC is unavailable: `Summary unavailable (apply migration 026)`.

2. ADM-014 Merchant comparison mini-table
- Add breakdown RPC with merchant-level metrics for selected period.
- Add collapsible section with sortable table and daily revenue sparkline.

3. ADM-019 Audit logging foundation (backend)
- Log list/detail/export/search sensitive access paths asynchronously to `payment_audit_log`.

4. ADM-018 Audit log viewer (frontend)
- Add audit tab with filters, search, and failed-row highlighting.

5. ADM-016 Batch reconciliation
- Add batch section with discrepancy checks and batch detail export.

6. ADM-017 Chargeback dashboard
- Add chargeback table, urgent deadline indicators, and nav badge.

---

## ADM-013 Decision Log (Locked)

These were explicitly decided during planning, and implementation follows them:

1. Prior-period delta base
- Chosen: compare to the **immediately previous equivalent window**.
- Example: Jan 10-16 compares to Jan 3-9.

2. No date selected behavior
- Chosen: default summary comparison to **rolling last 30 days vs previous 30 days**.

3. Card click behavior
- Chosen: **toggle and preserve other filters** (do not wipe existing filters/search).

4. Revenue inclusion rule
- Chosen: **captured only** for Card Revenue, Cash Revenue, and Total Revenue.

5. Avg tip percent formula
- Chosen: **`tip_amount / amount`** for captured card-family payments (ignore zero/NULL base amount).

6. Voided/Returned aggregation
- Chosen: combined unique payments where `is_voided OR is_returned`.
- Amount rule: use `return_amount` when returned, else `total_amount` when voided.

7. Total Transactions card click
- Chosen: reset payment `method` filter to all, preserve all other filters.

8. ADM-015 tracker status
- Chosen: mark as **Done (User-confirmed)**.

---

## UX Fix Logged Today

- `Apply Filters` now closes the filter sheet even when URL params are unchanged (previously it stayed open in no-change apply cases).

---

## Remaining Immediate QA (Before Scratch ADM-011/012)

1. Expand transaction and verify timeline events render (`old -> new` status, relative timestamp, absolute hover value).
2. Expand raw event JSON and verify collapse/expand behavior.
3. In order breakdown, verify item/modifier/totals values against known POS order sample.
4. Verify void/open-item/tax-exempt badges on sample data where available.
