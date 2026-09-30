# Location-Wide Order Number Counter

Per-location toggle to switch guest-facing order numbering between:

- **`per_station`** (default) — each register keeps its own daily counter, shown as `#S1-0042`.
- **`location_wide`** — one shared daily counter across every register at the location, shown as `#0042`.

Setting lives at `locations.pos_config.ordering.orderNumberScope` and reaches the POS tablet through the existing `get_effective_pos_config(station_id)` merge (defaults ← location ← station overrides). It is **location-level only**, with no per-station override. The server reads it straight off the location row.

> **Status (2026-09-30):** DB half rebuilt as `supabase/migrations/20260930170000_order_number_scope_per_location.sql` on top of `20260927121500_order_number_xact_lock` and the `create_order_v4` index-name fix (Dexa-POS `bdf1ee9b`). The original `20260925120000` migration stays in `reference-sql/` for history only. POS half on Dexa-POS `shared-location-order-nb`. Not yet applied to staging.

---

## Design decisions

1. **Counters and uniqueness are per location.** Uniqueness moves from `(merchant_id, order_number)` to `(location_id, order_number)` (`orders_order_number_location_key`). Two locations of one merchant can both hold `ORD-<date>-0001`. The old `(merchant_id, order_number)` guards (`orders_order_number_merchant_key`, `idx_unique_order_number_per_merchant`) are dropped: keeping them while keying counters by location would make those locations collide.
2. **The server owns the shared counter; the tablet never mints a location-wide number.** In `location_wide` mode the tablet keeps minting a provisional station number (`#S1-0043`). `create_order_v4` replaces it from the shared counter when the create syncs, which is well under a second online. Registers can't mint the same provisional number, because `station_number` is unique per location, and every final number comes from one sequence. So two registers ringing at the same moment get different numbers, and an offline tablet can't produce a second `#0001`.
3. **A collision heals on the first try.** Numbers minted on the device never advance the server sequence. The old handler retried once from that lagging sequence, could land on another taken number, and failed the outbox op forever. Now the replacement comes from a counter moved past the location's highest number, and the tablet moves its own counter past the assigned number.

## Server behaviour

| Call | Result |
|------|--------|
| `generate_order_number(loc, station)`, `per_station` | `ORD-<date>-S{n}-NNNN` from `ord_seq_l<loc>_<date>_s<n>` |
| `generate_order_number(loc, station)`, `location_wide` | station ignored → `ORD-<date>-NNNN` from `ord_seq_l<loc>_<date>` |
| `generate_order_number(loc, NULL)` / `generate_order_number_internal` | `ORD-<date>-NNNN`, same station-less counter (online orders share it) |
| `create_order_v4` with `…-S{n}-NNNN` in `location_wide` | replaced from the shared counter, `order_number_reassigned = true` |
| `create_order_v4` with a station-less client number | kept |
| `create_order_v4` number collision | renumbered via `_unused_order_number` (up to 3 attempts), `order_number_reassigned = true` |

- The date comes from the location timezone. The lock is transaction-scoped and taken only when creating the day's sequence, both unchanged from `20260927121500`.
- A new sequence starts above today's highest number at the location for its format. In `location_wide` mode the shared counter starts above every register's number.
- **Mid-shift switch:** `trg_locations_order_number_scope_switched` fires when a location's scope changes to `location_wide`. It moves an existing shared counter past today's highest register number, so after `S1-0042` and `S2-0037` the next order is `0043`. Open orders keep their numbers.
- The reply and the `order_created` audit row carry `order_number_scope`. The audit row also keeps `client_order_number` when the number was replaced, so a guest's receipt can be traced.
- `seat_guests_v4` creates its order through `create_order_v4`, so it inherits all of this.
- Legacy RPCs (`create_order_v2/v3`, `seat_guests_v3`) mint through `generate_order_number`, so they follow the scope too.

## Web dashboard (this repo)

| Layer | File | Change |
|-------|------|--------|
| Config model | `lib/pos/pos-config.ts` | `PosOrderNumberScope`, `ordering` on `PosConfig` + `DEFAULT_POS_CONFIG` (default `per_station`), `normalizeOrderNumberScope`. |
| Tests | `lib/pos/__tests__/pos-config.test.ts` | Coercion, garbage→`per_station`, effective-merge keeps location value. |
| UI | `app/dashboard/settings/pos/page.tsx` | "Order Numbering" radio card, saved by **Save Location Defaults** → `set_location_pos_config_v1` (merges and audits the whole config). |
| DB | `supabase/migrations/20260930170000_order_number_scope_per_location.sql` (+ `rollback/`) | Everything under *Server behaviour*. |

Display surfaces (receipts, orders, payments, KDS mirror, CFD) render `display_number ?? '#'+order_number` and need no changes.

## POS tablet (Dexa-POS)

- `services/localFirst/opHandlers.ts`: `create_order` already adopted `order_number_reassigned`. `seat_guests` now does the same; before, a seated order kept its provisional number on the device. Adoption updates the SQLite row and the store. The CFD re-pushes because its payload fingerprint includes the display number.
- `lib/localOrderSequence.ts`: `seedFromAssignedOrderNumber` moves the device counter past an assigned number, so a device that collided (cleared MMKV, two devices on one station) stops colliding after one renumber.
- No change to minting. In `location_wide` mode the tablet does not need to read the scope, because the server replaces its provisional numbers. Old tablet builds behave the same way and are renumbered on sync.
- No automatic reprint on renumber. A reprint (receipt or KDS ticket) renders the new number. An automatic second kitchen ticket for the same food was judged riskier than the stale number.

## Edge cases

1. **Offline, location-wide** → provisional `#S{n}-NNNN`, replaced on sync. A ticket printed offline shows the provisional number (see open questions).
2. **Mid-shift flip** → new orders only; the counter jumps above today's register numbers; the day is mixed-scheme, the next day clean.
3. **Deploy day** → sequence names change, so each counter restarts once from today's max at the location. No number is reused. Deploy at close anyway.
4. **Multi-location merchant** → each location counts from `0001`. Searches by number (dashboard, admin, kiosk) are list searches and show one result per location.
5. **KDS/expo** → location-wide numbers have no station prefix; `orders.station_id` is still set.
6. **Voided/abandoned** → `nextval` reserves numbers → gaps, as today. A mid-shift jump or a collision heal also skips numbers.
7. **Old tablet build** → ignores the key; the server still applies the location's scope.

## Open questions / follow-ups

- **Receipt printed with a provisional number** (offline, location-wide): is a manual reprint enough, or should the tablet prompt staff when an order that already printed is renumbered?
- **OrderOut direct delivery** matches webhooks on `orderout_delivery_dispatches.oo_order_number` (our `order_number`) with `.maybeSingle()` and no merchant or location scope (`orderout-delivery-webhook`, `orderout-orders-webhook` `handleDirectEcho`). Numbers have been unique only per merchant since June, so this is already ambiguous between merchants; per-location numbering adds same-merchant ambiguity. Scope those lookups by location, or match on ids first.
- `cleanup_old_order_sequences` was never scheduled as a cron job when `docs/quality/load-testing/load-001-order-throughput.md` was written. Per-location keying creates more day sequences than before, so check `cron.job` on staging.

## Rollout

1. **Staging ledger:** `20260925120000` is recorded but its bodies were replaced and its file lives in `reference-sql/`. Run `supabase migration repair --status reverted 20260925120000`. Check whether `bdf1ee9b`'s fix is also in the ledger under a version with no file here:
   `select version, name from supabase_migrations.schema_migrations where version >= '20260925' order by version;`
2. **Staging:** `supabase db push`, then run `verify-staging.sql` and the tablet checks below.
3. **Prod (by hand, at close):** apply `20260927121500` first. Build `orders_order_number_location_key` with `CREATE UNIQUE INDEX CONCURRENTLY` (see the migration header), then apply `20260930170000`. Do **not** apply `bdf1ee9b`'s file: this migration contains its fix, and applying it afterwards would remove the scope logic.

## Verification

- **Unit (web):** `npm run test` → `lib/pos/__tests__/pos-config.test.ts`.
- **Migration (local):** run against PGlite (Postgres 18) on a minimal schema seeded with today's staging bodies. All acceptance cases passed, plus rollback → re-apply. Concurrency is covered by the locking design, not by that run.
- **Staging SQL:** `verify-staging.sql` (read-only structure checks, plus generator checks inside a rolled-back transaction).
- **Tablet (Dexa-POS):** `__tests__/db/localWritesEndToEnd.test.ts` → "the server renumbers an order".
- **On devices (staging):** two registers in `location_wide` → `#0001`, `#0002`; an offline order → provisional `#S1-…`, then the new number on the tablet, the CFD and a reprint after sync; flip mid-shift after `S1-0042`/`S2-0037` → `#0043`; web toggle saves and shows in the audit log.
