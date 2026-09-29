# Location-Wide Order Number Counter

Per-location toggle to switch guest-facing order numbering between:

- **`per_station`** (default) — each register keeps its own daily counter, shown as `#S1-0042`.
- **`location_wide`** — one shared daily counter across every register at the location, shown as `#0042`.

Setting lives at `locations.pos_config.ordering.orderNumberScope` and reaches the POS tablet through the existing `get_effective_pos_config(station_id)` merge (defaults ← location ← station overrides). It is **location-level only** — not a per-station override.

> **Status (2026-09-29): the DB half must be rebuilt before it ships.** The original migration now lives in `reference-sql/` so it can't be applied by accident. Since it was written, `20260927121500_order_number_xact_lock` replaced `generate_order_number`, and the `idx_unique_order_number_per_merchant` fix replaced `create_order_v4`. Applying the old file as-is would undo both. Write a new, later-versioned migration that ports only the scope logic onto the current function bodies. The POS client half is not built yet.

---

## Web dashboard (this repo) — DONE

| Layer | File | Change |
|-------|------|--------|
| Config model | `lib/pos/pos-config.ts` | `PosOrderNumberScope`, `PosOrderingConfig`, `ordering` on `PosConfig` + `DEFAULT_POS_CONFIG` (default `per_station`), `normalizeOrderNumberScope`, coercion in `normalizePosConfig`. |
| Tests | `lib/pos/__tests__/pos-config.test.ts` | Coercion, garbage→`per_station`, effective-merge keeps location value. |
| UI | `app/dashboard/settings/pos/page.tsx` | "Order Numbering" radio card, bound to `locationConfig.ordering.orderNumberScope`; saved by the existing **Save Location Defaults** button. |
| Persistence | `app/dashboard/actions/pos-settings.ts` | Unchanged — `saveLocationPosConfig` → `set_location_pos_config_v1` already merges + audits the whole config. |
| DB (reference only, see Status) | `docs/features/order-number-scope/reference-sql/20260925120000_order_number_scope.sql` (+ rollback) | `default_pos_config_v1()` ships the key; `generate_order_number()` keys sequences by **location** and bootstraps the location-wide counter above today's max across all stations; `create_order_v4()` honors the scope and reassigns provisional station numbers. |

Display surfaces (receipts, orders, payments, KDS mirror, CFD) render `display_number ?? '#'+order_number` and adapt automatically — no changes.

### Server behavior (the online-authoritative half)
- `generate_order_number(location, NULL)` → `ORD-<date>-NNNN` (display `#NNNN`), location-keyed sequence.
- `generate_order_number(location, station)` → `ORD-<date>-S{n}-NNNN` (display `#S{n}-NNNN`).
- `create_order_v4`: reads the location scope. In `location_wide` mode, a **station-partitioned client number** (`…-S{n}-NNNN`, i.e. a provisional offline mint) is reassigned to the shared location counter and `order_number_reassigned=true` is returned; a **station-less client number** (from the online path) is kept as-is. `process_online_order` already mints station-less, so online orders are location-wide for free.

---

## POS tablet (`../Dexa-POS`) — SEPARATE PR (not yet built)

Numbering is minted on the tablet (offline-first); nothing is end-to-end until this ships. Strategy: **online-authoritative + offline fallback**.

1. **Read scope** from the cached `get_effective_pos_config(station_id)` result (`ordering.orderNumberScope`; missing → `per_station`).
2. **`lib/localOrderSequence.ts`** — when `location_wide`: use the `:global` (location-keyed, no-station) sequence key and emit `#NNNN` / `ORD-<date>-NNNN` (drop the `S{n}` prefix). Otherwise unchanged.
3. **Allocation** — when `location_wide` **and online**, get the number from the server (`generate_order_number(location, NULL)`) and pass it to `create_order_v4` as `p_order_number` (no double-increment). When **offline**, mint a provisional station-partitioned number (`…-S{n}-…`) so the server can detect + reassign it on sync; on `order_number_reassigned=true`, update local `order_number`/`display_number` and re-push to CFD (`CFDProvider`) + reprint per existing rules.
4. **Mid-shift switch** — apply the new scheme to **new** orders only; never renumber open orders. "Continue from max" is enforced server-side; when back online, `seedLocalSequence(...)` from the server high-water mark.
5. **CFD (`../Dexa-POS-CFD`)** — no change; it renders whatever the tablet sends.

> The block between `-- BEGIN_VERBATIM` / `-- END_VERBATIM` in `create_order_v4` is mirrored by the tablet's local order-creation logic. The mirror sets scope from cached config (not a DB read) and, offline, keeps the provisional number rather than reassigning.

---

## Edge cases

1. **Multi-tablet offline, location-wide** → provisional `S{n}` numbers, server reassigns on sync. Online avoids collisions.
2. **Mid-shift flip** → new scheme immediately; counter bootstraps at `max(all stations today)+1`; open orders keep their number; the day is mixed-scheme, next day clean.
3. **Multi-location merchant** → sequences now location-keyed, so `#0042` at Location A never collides with Location B under `(merchant_id, order_number)`. (Also fixes a latent collision when two locations shared a `station_number`.)
4. **Receipt printed then reassigned** → only for offline orders in location-wide mode; online gets the real number at open. Tablet reprints on reassignment.
5. **KDS/expo** → number loses station context, but `orders.station_id` is still set for separate display.
6. **Voided/abandoned** → `nextval` reserves numbers → gaps. Acceptable; matches current behavior.
7. **Old tablet build** → ignores the key → `per_station`; fully backward compatible.

---

## Verification

- **Unit:** `npm run test` → `lib/pos/__tests__/pos-config.test.ts` (9 tests). ✅
- **Typecheck:** no new errors in touched files (project sets `ignoreBuildErrors`). ✅
- **SQL on staging** (after `db push`, via `execute_sql`):
  - `per_station`: `generate_order_number(loc, station1)` → `ORD-<date>-S1-0001` → `#S1-0001`.
  - `location_wide` fresh day: `generate_order_number(loc, NULL)` twice → `…-0001`, `…-0002`.
  - **Mid-shift:** seed `ORD-<date>-S1-0042` + `ORD-<date>-S2-0037` at a location, then create the location-wide sequence → first number `…-0043`.
  - **Multi-location:** two locations of one merchant both `location_wide` → both hold `…-0001`, no `(merchant_id, order_number)` violation.
  - `create_order_v4` with `p_order_number` = `ORD-<date>-S1-0007` under `location_wide` → returns a station-less number + `order_number_reassigned=true`.
- **Web UI:** `/dashboard/settings/pos`, flip radio, Save Location Defaults → toast, audit `Updated Location POS Settings`, refetch shows new value.
- **Rollout:** staging-first (`db push`, **not** MCP `apply_migration` — ledger drift), validate, promote to prod with out-of-band ledger reconciliation. Default `per_station` = zero change until opt-in.
