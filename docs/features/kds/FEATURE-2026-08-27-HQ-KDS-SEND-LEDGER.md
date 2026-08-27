# HQ KDS Send Ledger

## Summary

A chronological, per-order log of every order-to-kitchen send attempt the
server received from a POS — "order #3, 4 items, sent at 1:00 PM from Station
A" — surfaced as a **Send ledger** tab on the HQ KDS mirror page.

This exists to split a "items are not showing in KDS" merchant report into its
three cases before anyone argues about screens:

1. **No ledger row** for an order the merchant says they fired
   → the POS never reached the server (offline, API error, client bug).
2. **A partial send** (`applied 3 / requested 4`)
   → a sync/idempotency problem; the row lists exactly which items did not
   apply.
3. **Items routed but the kitchen screen is blank**
   → routing worked (the row shows which display each item landed on); the
   fault is on the KDS device, and the Board tab confirms it.

Companion to [FEATURE-2026-08-27-HQ-KDS-BOARD-MIRROR.md](./FEATURE-2026-08-27-HQ-KDS-BOARD-MIRROR.md),
which answers "what does the server say a station should show". This answers
the earlier question "did the server ever receive the send at all?" The data
was already being recorded by the
[KDS routing traceability migration](./PLAN-2026-08-14-KDS-ROUTING-TRACEABILITY.md)
(`kds_send_attempts` + `kds_routing_log`) — it just had no UI.

## What shipped

- [x] `hq_get_kds_send_ledger_v1(p_location_id, p_from, p_to, p_limit, p_order_id)` —
      SECURITY DEFINER, gated on `is_dexapos_admin()`. Reads the append-only
      `kds_send_attempts` ledger, joins order + station + staff identity, and
      resolves per-item routing outcomes (which displays each item routed to,
      or that it was dropped) from `kds_routing_log`.
- [x] `hqGetKdsSendLedger` server action in `app/manage/actions/kds-mirror.ts`
      (asserts `hq.support.view`), plus the `useKdsSendLedger` query hook.
- [x] `KdsSendLedger` component rendered as a **Send ledger** tab on
      `app/manage/support/kds-mirror/`:
  - Window picker (1h / 6h / 24h / 7d), default 24h.
  - Summary cards: sends, partial sends, sends with dropped items, replays.
  - One shared Refresh (in the header controls, never a second one on this
    tab). Clicking it re-anchors the ledger window to "now" and refetches —
    a plain refetch of the old key would keep serving the fixed window the
    component mounted with, so new sends would never appear.
  - A table — time, order number, `applied / requested` counts, item status,
    originating station + device, and anomaly badges (Partial, Dropped,
    Replay, No route) — with expandable rows down to per-item routing.
  - Pagination at 100 rows per page over the fetched window (up to 500 rows
    fetched, so up to 5 pages); summary cards always cover the whole window.
  - "Anomalies only" toggle, and a "Show on board" jump that deep-links the
    same order on the Board tab.
  - An empty state that states the diagnosis outright: no rows in the window
    while the merchant reports sends means the POS never reached the server.
- [x] Deep link support: `?order=<id>` opens directly on the ledger, and the
      page highlights that order's send history.
- [x] Migration contract test `tests/kds-send-ledger-migration.test.ts`.

## Unsent items tab (companion view)

The same mirror page also has an **Unsent items** tab (`hq_get_kds_unsent_items_v1`,
`20260827153000_hq_kds_unsent_items.sql`): the mirror image of the ledger. It
lists orders whose non-voided items never fired to the kitchen
(`order_items.sent_to_kitchen_at IS NULL`), with per-order sent/unsent counts
and the exact items still sitting unsent. Cancelled/void/refunded/declined
orders are excluded (an unsent item there is expected).

- `fully_unsent` order + no ledger row = the send never reached the server.
- `sent_item_count > 0` alongside unsent items = a partial fire; the listed
  items are the ones that did not apply.
- Draft/pending fully-unsent orders = nobody fired the order yet.

Both tables paginate at 100 rows per page (client-side over the fetched
window, which is capped at 500 rows by the RPCs), so the summary cards always
reflect the full window rather than just the visible page.

One caution the migration documents: `orders.status` is the `order_status`
enum, so the status filter must be a plain `NOT IN ('cancelled', ...)` — never
`COALESCE(status, '')`, since `''` is not a valid enum label and Postgres
rejects the call with `invalid input value for enum order_status`.

## Design decisions

### It is a projection of server truth, and says so

The ledger shows what reached the server, not what the POS intended. A dropped
realtime socket on the POS still produces a complete ledger if the RPC call
arrived; a crashed POS produces no row at all. That asymmetry is the feature:
it cleanly separates "our problem" from "their device problem".

### One RPC, not a pile of joins

Item names, kitchen status, prep station and per-display routing outcomes are
resolved server-side so the web layer stays a thin renderer. The per-attempt
item subquery hits `kds_routing_log` through `idx_krl_order_item`.

### Timezone-safe ordering

`timestamptz -> jsonb` renders in the session timezone, so ordering rows by the
ISO string would be unstable across sessions. The RPC emits an epoch-ms sort
key and orders on that.

### `kds_send_attempts` is the right source

Every `send_order_to_kitchen_v1` call already writes an append-only row with
requested vs actually-updated counts, station/device context, idempotency key
and replay flag. No new write path, no new instrumentation on the POS send hot
path — this change only reads what the routing-traceability migration already
records.

## Not in scope

- Device-truth capture (what the POS tablet actually attempted locally) — that
  is Architecture B from the board-mirror plan and needs a POS change.
- Surfacing the ledger to merchants in the customer dashboard — HQ support
  only for now; the RPC could be re-gated to a merchant-scoped projection
  later.
- KDS board / snapshot changes.

## Verification

- `npx vitest run --config vitest.config.mts tests/kds-send-ledger-migration.test.ts`
- Manual: apply the migration on staging, fire an order from a POS, open the
  Send ledger for that location and confirm the row shows the correct counts,
  station/device, and per-item display chips; toggle Anomalies only; deactivate
  all displays, fire again, and confirm a Dropped badge.
