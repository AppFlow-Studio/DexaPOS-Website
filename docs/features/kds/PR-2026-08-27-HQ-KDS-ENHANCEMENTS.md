# PR — HQ KDS Enhancements: Board Mirror, Send Ledger, Unsent Items & Device Truth

**Branch:** `kds-mirror` → `main`
**Type:** Feature (HQ support tooling for KDS "orders not reaching the kitchen" investigations)

---

## Summary

When a merchant reports "orders are not reaching the KDS", support currently has
no way to tell whether the problem is on the server (routing), on the POS (the
send never happened), or on the physical kitchen screen (received but never
painted). This PR gives HQ a single page that answers all three questions
instead of arguing about screens.

It ships four related pieces on the HQ KDS support surface:

1. **Board mirror (Architecture A — server reconstruction).** A live, faithful
   reconstruction of exactly what any station's KDS *should* be showing, drawn
   by calling the same RPC the tablet calls (`get_kds_tickets_v3`) with the
   same pinned parameters. The layout is ported from the POS tablet (status
   tabs + N-column masonry grid, one status at a time), not approximated.
   Includes a timeline scrubber (1h / 6h / 24h windows) that replays
   `kds_board_snapshots` — an append-only ledger captured at each arrival /
   ready / served event — plus a 7-day routing-health hint and a
   `show_all_items` warning.

2. **Send ledger.** A chronological, per-order log of every order→kitchen send
   attempt the server received (`kds_send_attempts`), with `applied / requested`
   counts, originating station/device, per-item routing outcomes, and anomaly
   badges (Partial, Dropped, Replay, No route). No new write path — it reads
   data the routing-traceability migration already records. Deep-links via
   `?order=<id>` and jumps to the same order on the Board tab.

3. **Unsent items.** The mirror image of the ledger: orders whose non-voided
   items never fired to the kitchen (`sent_to_kitchen_at IS NULL`), with
   per-order sent/unsent counts and the exact unsent items. Together with the
   ledger this splits any complaint into "send never reached the server",
   "partial fire", or "routed but device-side fault".

4. **Device truth (Architecture B — device-attested capture, server side).** The
   other half of the answer: an append-only `kds_device_events` ledger that the
   POS tablet reports into, diffs against `kds_routing_log`, and classifies
   every item into **CONFIRMED / RENDER_SUSPECT / NEVER_SHOWED / OFFLINE /
   GHOST**. Surfaced as a fourth "Device truth" tab on the mirror page plus a
   merchant-facing **Device view** tab on the order sheet. **Inert on deploy** —
   nothing calls `report_kds_device_events` until the POS fleet ships the
   emitter (POS work is tracked separately), so diffs honestly report
   `NO_DEVICE_DATA` until then.

### What the mirror deliberately cannot tell you

The mirror reconstructs what the **server** says a station should show. It
cannot see the physical screen — a tablet whose socket dropped, whose app
crashed, or whose cache went stale still renders a perfect mirror while the
kitchen sees nothing. This limitation is stated on the page itself. Use it to
decide **server-side or device-side**, not to confirm what was rendered. That
is precisely the gap Architecture B (device truth) is designed to close.

## Changes

### Frontend / web

- New route `app/manage/support/kds-mirror/` with four tabs:
  **Board** (station mirror + timeline scrubber), **Send ledger**, **Unsent
  items**, **Device truth**.
- New components: `KdsStationBoard`, `KdsMirrorControls`, `KdsMirrorTimeline`,
  `MerchantPicker`, `KdsSendLedger`, `KdsUnsentItems`, `TablePagination`,
  `KdsDisplayHealthCards`, `KdsDeviceTruthTimeline`, `KdsDivergenceList`,
  `verdictMeta`.
- New hooks: `useKdsMirror` (5s polling backstop, enhanced `useWindowAnchor` for
  timeline scrubbing), `useKdsMirrorRealtime` (`location:<id>:orders` broadcast
  → invalidate → refetch), `useKdsSendLedger`, `useKdsDeviceTruth`.
- Server actions: `app/manage/actions/kds-mirror.ts`,
  `app/manage/actions/kds-device-truth.ts`,
  `app/dashboard/actions/order-device-truth.ts` — every action asserts
  `hq.support.view`.
- **Device view** tab on the order sheet (`KDSRoutingTraceSection` / new
  `KDSDeviceTruthBody`) plus cross-link from the routing trace into the mirror.
- Old `/manage/support/kds-truth` route redirects to
  `kds-mirror?tab=device-truth`.
- Sidebar entry "KDS" under the Support group.
- `database.types.ts` updated with new RPC signatures.

### Database (see migrations below)

Board-mirror RPCs + snapshot ledger + capture triggers, device-truth ledgers +
report/diff RPCs + health view, send-ledger and unsent-items RPCs.

### Docs & tests

- Feature docs: `docs/features/kds/FEATURE-2026-08-27-HQ-KDS-BOARD-MIRROR.md`,
  `FEATURE-2026-08-27-HQ-KDS-SEND-LEDGER.md`,
  `FEATURE-2026-08-27-HQ-KDS-DEVICE-TRUTH.md`, `README.md` updated.
- Migration contract tests: `tests/kds-send-ledger-migration.test.ts`,
  `tests/kds-unsent-items-migration.test.ts`.

## Access control

Two independent gates, both required:

1. `assertHQPermission("hq.support.view")` in every server action.
2. `is_dexapos_admin()` inside every `hq_*` RPC — this is the gate that actually
   stops a non-HQ session reading an arbitrary merchant's board, because
   `get_kds_tickets_v3` is SECURITY DEFINER with no tenancy predicate of its own.

Device-truth tenancy is **derived, never accepted**: `report_kds_device_events`
looks `merchant_id` / `location_id` up from `kds_display_id`, and ignores any
device-claimed merchant.

## Migrations to apply (in order)

> Apply via `supabase db push` on staging first, then production.

| # | Migration | What it adds |
| --- | --- | --- |
| 1 | `supabase/migrations/20260827150000_hq_kds_board_mirror.sql` | `hq_get_kds_board_mirror_v1`, `hq_get_location_kds_displays_v1`, `kds_board_snapshots` (append-only, RLS + `protect_kds_trace_ledger` guard), deferred-constraint arrival-capture triggers, ready/served capture in `bulk_update_order_item_status_v2`, `capture_kds_board_snapshot(s)`, `hq_get_kds_board_snapshots_v1` / `_snapshot_v1`, pg_cron retention. **Redeclares `bulk_update_order_item_status_v2`** (POS calls this — body copied verbatim from `20260814130000`; must stay behaviour-neutral). Full rollback SQL included at the bottom of the file. |
| 2 | `supabase/migrations/20260827151000_kds_device_truth.sql` | `kds_device_events` + `kds_device_snapshots` (append-only ledgers, hash-deduped), `report_kds_device_events(...)`, `get_kds_device_truth_for_order`, `get_kds_display_truth_window`, `v_kds_device_truth_health`, `purge_kds_device_truth` + scheduled retention. **Inert on deploy** — no caller until the POS emitter ships. |
| 3 | `supabase/migrations/20260827152000_hq_kds_send_ledger.sql` | `hq_get_kds_send_ledger_v1(p_location_id, p_from, p_to, p_limit, p_order_id)` — read-only HQ projection of `kds_send_attempts` + `kds_routing_log`, `is_dexapos_admin` gated. |
| 4 | `supabase/migrations/20260827153000_hq_kds_unsent_items.sql` | `hq_get_kds_unsent_items_v1(...)` — HQ-only view of orders with unsent (non-voided, `sent_to_kitchen_at IS NULL`) items, `is_dexapos_admin` gated. |

### Migration notes / caveats

- **`20260827150000` is the only migration with POS-visible blast radius**
  (the `bulk_update_order_item_status_v2` redeclaration). Everything else is
  additive and HQ-gated.
- Snapshot capture is wrapped in `BEGIN ... EXCEPTION WHEN OTHERS` downgraded to
  `WARNING` — a lost snapshot can never fail a send or a bump.
- `20260827151000` was moved out of `supabase/migrations/_pending_review/`
  (previously `...deferred-architecture-b`). It has been re-homed to
  `supabase/migrations/` so it ships with this PR — verify it as part of the
  apply, per the `_pending_review/README.md` notes.
- `orders.status` is the `order_status` enum — the unsent-items RPC filters with
  a plain `NOT IN ('cancelled', ...)`, never `COALESCE(status, '')`.

## Testing & verification

- Migration contract tests:
  `npx vitest run --config vitest.config.mts tests/kds-send-ledger-migration.test.ts`
  `npx vitest run --config vitest.config.mts tests/kds-unsent-items-migration.test.ts`
- **Staging verification for the board mirror is not yet run** — see the
  checklist in `docs/features/kds/FEATURE-2026-08-27-HQ-KDS-BOARD-MIRROR.md`
  (key items: one snapshot per display per multi-item send containing **all**
  items; capture failure degrades to WARNING without failing the send;
  append-only guard rejects UPDATE/DELETE; side-by-side diff against a physical
  tablet).
- Manual: apply migrations on staging, fire an order from a POS, open the Send
  ledger for that location and confirm counts/station/device/per-item display
  chips; deactivate all displays and re-fire to confirm a **Dropped** badge.
- POS-side device-truth emitter is out of scope for this PR (separate change in
  the POS repo: `services/kds/kdsDeviceTruth.ts`).

## Rollout

Staging-first, no feature flags. Web surface is additive. The only cross-repo
piece is the `bulk_update_order_item_status_v2` redeclaration (must remain
behaviour-neutral for the POS), and the device-truth emitter which ships later
and activates Architecture B.

---

*Docs: `docs/features/kds/` — see `PLAN-2026-08-14-KDS-ROUTING-TRACEABILITY.md`,
`FEATURE-2026-08-27-HQ-KDS-BOARD-MIRROR.md`,
`FEATURE-2026-08-27-HQ-KDS-SEND-LEDGER.md`,
`FEATURE-2026-08-27-HQ-KDS-DEVICE-TRUTH.md`.*
