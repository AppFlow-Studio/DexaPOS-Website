# HQ KDS Device Truth — Capture & Replay (Architecture B)

## Summary

The [board mirror](./FEATURE-2026-08-27-HQ-KDS-BOARD-MIRROR.md) reconstructs
what the **server** says a kitchen display should be showing. It cannot see the
screen: a tablet whose socket dropped, whose app crashed, or whose cache went
stale still produces a perfect mirror while the kitchen sees nothing. Device
truth is the other half — the tablet reports what it actually **received and
painted**, and HQ diffs that against `kds_routing_log` to classify every
complaint into one of five verdicts.

| Server (`kds_routing_log`) | Device (`kds_device_events`) | Verdict |
| --- | --- | --- |
| routed | ack present | **CONFIRMED** — device really showed it |
| routed | arrived, no ack | **RENDER_SUSPECT** — received, maybe never painted |
| routed | neither; item active + device online | **NEVER_SHOWED** — the real bug |
| routed | neither; device offline at fire | **OFFLINE** — expected, not a bug |
| no routing log | device event exists | **GHOST** — stale cache on device |

Triggered by Charcoal Gardenia, as the second half of the KDS mirror work. The
read-only investigation established the routing side was healthy; this is the
instrumentation that would have proven (or disproven) the display-side theory
from inside the fleet instead of from the outside.

## Scope

Architecture B of the two-part design: **device-attested capture**. Architecture
A (server reconstruction) is applied and verified. B is **inert on deploy** —
nothing calls `report_kds_device_events` until the POS fleet ships the emitter,
and until then every diff reports `NO_DEVICE_DATA`, which is honest: absence of
device evidence is not evidence of a device fault.

## What shipped

### P0 — ledgers and the device → server contract

- [x] `kds_device_events` — append-only event ledger, cloning the
      `kds_routing_log` RLS / `protect_kds_trace_ledger` guard / retention
      pattern. Idempotent via unique
      `(kds_display_id, order_item_id, event_type, client_event_at)`.
- [x] `kds_device_snapshots` — append-only snapshot ledger (hash-deduped
      against the display's previous snapshot). The POS emitter ships
      arrived/ack only (the 80/20); snapshots stay empty until a later build.
- [x] `report_kds_device_events(p_kds_display_id, p_events, p_device_origin_id,
      p_app_version, p_client_clock_at, p_snapshot, p_idempotency_key)` —
      SECURITY DEFINER; tenancy derived from `kds_display_id`, never accepted
      from the device; anon-tolerant in the same shape as
      `send_order_to_kitchen_v1`; set-based insert; drops malformed rows
      (including non-existent `order_id`s) instead of failing the batch;
      records `clock_skew_ms` once per call.
- [x] Event types: `arrived`, `ack`, `start_preparing`, `mark_ready`,
      `bump_done`, `recalled`, `void_shown`, `void_cleared`.

### P1 — the diff

- [x] `get_kds_device_truth_for_order(order_id)` — per item and display: what
      the server routed, what the device reported, and the verdict. Powers the
      order sheet's **Device view** tab.
- [x] `get_kds_display_truth_window(display_id, from, to)` — per display over a
      window: FULL OUTER JOIN of routing log vs device events (so GHOST rows
      appear), an aggregated verdict summary, the raw device-event timeline and
      snapshot metadata. Powers the HQ Device truth tab.
- [x] `v_kds_device_truth_health` — rolling 7-day per-display
      routed/arrived/acked counts and ack rate, with `device_reporting` so a
      never-reported display is not mistaken for a broken one.

### P2 — HQ surface

- [x] Merged into the KDS Kitchen page (`app/manage/support/kds-mirror/`) as a
      fourth **Device truth** tab alongside Board / Send ledger / Unsent items:
      `KdsDisplayHealthCards`, `KdsDeviceTruthTimeline` (server lane vs device
      lane) and `KdsDivergenceList` (NEVER_SHOWED / RENDER_SUSPECT / GHOST by
      default, all items on toggle). One sidebar entry — "KDS" — under
      Support; the old `/manage/support/kds-truth` route redirects to
      `kds-mirror?tab=device-truth`.
- [x] **Device view** tab on the existing order sheet (`KDSRoutingTraceSection`)
      and order page — merchant-facing, backed by the tenancy-scoped RPC.
- [x] Server actions in `app/manage/actions/kds-device-truth.ts`, each asserting
      `hq.support.view` (the RPC enforces the database-side gate).

### P3 — POS emitter (the 80/20)

- [x] `services/kds/kdsDeviceTruth.ts` — collects `arrived` (ticket reached the
      store) and `ack` (ticket painted on the active tab) per item.
- [x] Piggybacked on the existing 60s heartbeat: one set-based
      `report_kds_device_events` call per tick. At-least-once with
      server-side dedupe (a failed flush retries with the original
      `client_event_at`); each item emitted at most once per session; batch
      capped at 500 so an offline backlog stays bounded.
- [x] Wired in `app/(main)/kds.tsx`; `__tests__/kdsDeviceTruth.test.ts` (7 tests).
- [x] POS `database.types.ts` updated with the RPC signature.

## Design decisions worth knowing

### Tenancy is derived, never accepted

A KDS tablet is a physically accessible device in a kitchen; its payload is not
a trust boundary. `report_kds_device_events` looks `merchant_id` /
`location_id` up **from** `kds_display_id`. A device-claimed merchant is
ignored (and rejected when the caller carries a conflicting one). Closing the
device-auth gap with a real device JWT is B P2.

### Clocks

Kitchen tablets drift, sleep, and come back with wrong clocks. Every event
carries the device's own timestamp (`client_event_at`) AND the server's receipt
time (`received_at`), with `clock_skew_ms` computed once per call. Ordering and
retention use `received_at`; `client_event_at` is the idempotency key, not an
index. A diff that trusted device clocks would mis-order the very timeline it
exists to prove.

### `acknowledged_*` is NOT reused

`kds_item_status.acknowledged_at` already means "the void notice was
acknowledged" (20260606040300). It has nothing to do with paint. Reusing it
would corrupt the void flow and make both signals unreadable.

### Volume and retention

Two events per item per display ≈ ~12k rows/day on a busy store. Events are
kept 30 days (long enough to investigate a complaint that took a fortnight to
reach support); snapshots 7 days (far heavier). Purge runs via pg_cron
(`kds-device-truth-purge`, 03:50 daily).

### The ack is honest by construction

The KDS renders one status tab at a time, so an item is only acked once its
ticket appears on the active tab — an item that arrived while the kitchen was
on another tab is RENDER_SUSPECT until someone actually switches to its tab.
That is the truth, not a bug.

## Landmines

- Do **not** reuse `kds_item_status.acknowledged_*` (void-notice semantics).
- `kds_item_status` is not in the realtime publication — device liveness in the
  diff rides `device_heartbeats`, not the order broadcast.
- `get_kds_tickets` has documented staging/prod `ticket_id` drift (ms vs
  seconds) — correlate on `order_item_id`, never `ticket_id`.
- Keep the mirror byte-identical by always calling `get_kds_tickets_v3` via the
  wrapper with pinned params — never re-implement ticket grouping.

## Verification runbook

### Synthetic device check (before/independent of the RN cutover)

```sql
-- 1. Report an arrived event for a known order item.
SELECT public.report_kds_device_events(
  '<kds_display_id>'::uuid,
  jsonb_build_array(jsonb_build_object(
    'order_item_id', '<order_item_id>',
    'order_id',      '<order_id>',
    'event_type',    'arrived',
    'client_event_at', now()
  )),
  'synthetic-device', '0.0.0-test', now()
);

-- 2. The order diff must now move that item NO_DEVICE_DATA -> RENDER_SUSPECT.
SELECT public.get_kds_device_truth_for_order('<order_id>');

-- 3. Report the ack for the same item; the verdict must move to CONFIRMED.
SELECT public.report_kds_device_events(
  '<kds_display_id>'::uuid,
  jsonb_build_array(jsonb_build_object(
    'order_item_id', '<order_item_id>',
    'order_id',      '<order_id>',
    'event_type',    'ack',
    'client_event_at', now()
  )),
  'synthetic-device', '0.0.0-test', now()
);
SELECT public.get_kds_device_truth_for_order('<order_id>');

-- 4. Window diff + health view.
SELECT public.get_kds_display_truth_window(
  '<kds_display_id>'::uuid, now() - interval '1 hour', now()
);
SELECT * FROM public.v_kds_device_truth_health;
```

### Idempotency check

Re-run the exact same `report_kds_device_events` call (same
`client_event_at`) and confirm `events_recorded` is 0 — a replayed offline
buffer must be a no-op, not a duplicate.

### Rollback

See the `ROLLBACK` block at the bottom of
`supabase/migrations/20260827151000_kds_device_truth.sql`.

## Files

- `supabase/migrations/20260827151000_kds_device_truth.sql` (was quarantined as
  `.deferred-architecture-b`; picked up and finalized — added
  `get_kds_display_truth_window`, hardened the report RPC).
- `supabase/migrations/_pending_review/README.md` (updated).
- `database.types.ts` (view + functions).
- `app/manage/actions/kds-device-truth.ts`.
- `app/manage/support/kds-mirror/page.tsx` (the Device truth tab) and
  `hooks/useKdsDeviceTruth.ts` +
  `components/{KdsDisplayHealthCards,KdsDivergenceList,KdsDeviceTruthTimeline,verdictMeta}`
  (moved from the old `kds-truth/` route).
- `app/manage/support/kds-truth/page.tsx` (redirect to `kds-mirror?tab=device-truth`).
- `app/manage/layout.tsx` (single "KDS" sidebar entry).
- `components/dashboard/orders/{KDSRoutingTraceSection,KDSDeviceTruthBody}.tsx`.
- `app/dashboard/actions/order-device-truth.ts`.
- POS: `services/kds/kdsDeviceTruth.ts`, `services/hardware/heartbeat.ts`,
  `app/(main)/kds.tsx`, `__tests__/kdsDeviceTruth.test.ts`,
  `database.types.ts`.
