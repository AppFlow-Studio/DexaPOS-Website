# Recognized-Order Predicate — Work & Test Summary

**Branch:** `Haydar-Dev` · **Status:** implemented & verified on staging; prod verification of the online-channel repro still pending.

---

## The problem

Across the app, every reporting screen had invented its own rule for "which orders
count as a sale," and the rules disagreed with each other — so the same merchant
and date showed different revenue and order counts depending on which screen you
looked at. None of them reflected real sales.

Two opposite failures existed at once:

- **Undercounting.** Screens gating on `status = 'completed'` missed every order
  that was already paid and fulfilled but never *manually* tapped "complete."
  That manual tap often never happens, so real, collected money stayed invisible.
  On staging this hid **264 paid orders (~$48K)** for a single merchant.
- **Overcounting.** The analytics functions did the opposite — they counted every
  order that wasn't draft/cancelled/void, with **no check that the customer had
  paid**. Unpaid open checks were reported as revenue (~$116K of phantom revenue
  in the same dataset).

## The fix

One rule, used everywhere. An order is "recognized" (counts in reporting) when the
money was actually collected, regardless of the manual "complete" tap:

```
RECOGNIZED ORDER ==
  payment_status IN ('paid','captured')
  AND status NOT IN ('draft','cancelled','void','refunded')
```

- "Ready & Paid" and "Preparing & Paid" count immediately (the money is in).
- Unpaid, draft, cancelled, void, refunded, and partially-paid orders do not.
- `completed` is now a cosmetic operational label — it affects no number.
- Kitchen / live-order views are intentionally left alone (they *should* show
  unpaid in-progress orders).

Implemented in exactly one place per layer so no screen can drift again:

- **Database:** `is_order_reportable(status, payment_status)` helper + a matching
  partial index; the three analytics functions (`get_financial_kpis`,
  `get_sales_by_item_report`, `get_top_performing_merchants`) rewritten to use it.
- **App code:** `lib/reporting/recognized-order.ts` — one shared predicate imported
  by every reporting surface (merchant dashboard, reports, all HQ/admin analytics).

We also fixed the **Online Ordering report**, which showed **$0** for merchants
who take orders on their own site — it only looked at third-party delivery
platforms. It now also includes first-party (`order_type='online'`) orders.

## What we tested and confirmed (staging — "Joes Coffee Shop", 741 recognized orders)

| Check | Result |
| --- | --- |
| Paid-but-not-completed orders now count | ✅ 264 "Ready & Paid" (+4 preparing) surfaced (~$48K previously hidden) |
| Unpaid / draft / cancelled / void / refunded / partial excluded | ✅ every combination verified via a full status × payment truth table |
| Marking a paid order `completed` changes nothing | ✅ flipped one order ready→completed; totals moved by $0 |
| Every screen agrees | ✅ analytics function == hand-written query, to the cent ($24,415.08 / 271 orders) |
| Index is used | ✅ EXPLAIN shows index scan, no rows removed by filter |
| UI matches data | ✅ admin merchant cards, dashboard tiles, revenue-trend chart all match |
| QA matrix (all 11 rows) | ✅ including channel filter (dine-in/takeout excluded from online report) |

## Bugs caught during QA (pre-existing, fixed here)

Because we tested the actual screens, not just the database, we found and fixed:

1. Dashboard "Orders Today" tile showed **yesterday's** count (stale date + UTC/local-day mismatch).
2. Merchant-detail "Today" tiles showed **30-day** totals under a "Today" label.
3. A duplicate migration file caused a version collision that **blocked `db push`** entirely; removed it.

## What's still open

- **The original $0 bug needs a final check on production.** Staging has no
  first-party online orders, so that specific fix must be confirmed on prod
  (e.g. the Charcoal Gardenia account that reported it).
- **The location-switching UI path wasn't exercised** — the test merchant has a
  single active location.
- **Analytics totals will visibly shift** once live: roughly **+$104K** appears
  (paid orders that were hidden) and **−$116K** disappears (unpaid checks wrongly
  counted). **Temur should be looped** — these feed billing/decisions.
- **Separate ticket:** `process_order_payment()`'s already-paid guard checks the
  retired `'captured'` value, leaving a narrow double-charge window.

## Rollout note

The **function/RPC migration** applies normally via `db push`. The **index
migration** must be applied out-of-band (SQL Editor + `migration repair`) because
`CREATE INDEX CONCURRENTLY` cannot run inside `db push`'s transaction pipeline.
This is documented in the migration file header.
