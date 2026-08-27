# HQ KDS Board Mirror and Board Snapshots

## Summary

HQ support can now open a live, faithful reconstruction of any kitchen display
at any location, and scrub back through its recent history. The mirror calls
the same RPC the tablet calls, with the same parameters, so the board it draws
is the board the server says that station should be showing.

This exists to answer one question quickly: when a merchant says "orders are
not reaching the KDS", is that a server/routing problem or a device problem?

It is deliberately only half of the answer. See
[What this cannot tell you](#what-this-cannot-tell-you).

Triggered by Charcoal Gardenia. The prior read-only investigation established
that routing at that location is healthy (963 items fired, 0 with no KDS row,
0 `no_active_display` drops in 30 days, 150 "partial" sends all explained by
coursing / add-and-fire), and that the anomaly is display-side: items marked
ready leave the KDS ticket `pending`, and both displays have `show_all_items`
enabled so everything floods both screens.

Companion to [PLAN-2026-08-14-KDS-ROUTING-TRACEABILITY.md](./PLAN-2026-08-14-KDS-ROUTING-TRACEABILITY.md),
which records *where each item was routed*. This records *what the board looked
like*.

## Scope

This is Architecture A of the two-part design: **server reconstruction**.
Architecture B (device-truth capture, requiring a POS/React Native change) is
implemented in [FEATURE-2026-08-27-HQ-KDS-DEVICE-TRUTH.md](./FEATURE-2026-08-27-HQ-KDS-DEVICE-TRUTH.md)
and is inert until the fleet ships the POS emitter.

## What shipped

### P0 - live mirror

- [x] `hq_get_kds_board_mirror_v1(p_location_id, p_kds_display_id)` -
      SECURITY DEFINER, gated on `is_dexapos_admin()`, pass-through to
      `get_kds_tickets_v3` with a pinned status array.
- [x] `hq_get_location_kds_displays_v1(p_location_id)` - the display picker,
      including `show_all_items` and `routing_mode`.
- [x] Server actions in `app/manage/actions/kds-mirror.ts`, each asserting
      `hq.support.view`.
- [x] Route `app/manage/support/kds-mirror/` with the station board, ticket
      cards and pickers. The board is the tablet's layout and nothing else:
      status tabs (Pending / Cooking / Served / Done) plus order-type tabs,
      one status rendered at a time in that display's own N-column grid.
      There is no second "all statuses at once" view - the kitchen never sees
      one, so neither does the mirror.
- [x] `useKdsMirror` (5s polling backstop) and `useKdsMirrorRealtime`
      (`location:<id>:orders` broadcast -> invalidate -> refetch).
- [x] HQ sidebar entry "KDS" under the Support group, same permission.

### P1 - on-arrival snapshots and replay

- [x] `kds_board_snapshots` append-only table, cloning the routing-ledger
      pattern: RLS + FORCE RLS, `protect_kds_trace_ledger` guard, pg_cron
      retention.
- [x] `capture_kds_board_snapshot(...)` and
      `capture_kds_board_snapshots_for_items(...)`, batched per
      (location, display) and hash-deduped against that display's previous
      snapshot.
- [x] Arrival capture via deferred constraint triggers on `order_items`,
      firing once per (location, display) at COMMIT.
- [x] Ready/served capture wired into `bulk_update_order_item_status_v2`.
- [x] `hq_get_kds_board_snapshots_v1` (index) and
      `hq_get_kds_board_snapshot_v1` (one full board).
- [x] Timeline scrubber with 1h / 6h / 24h windows and a return-to-live control.

### P2 - cross-linking and health hinting

- [x] "Open this order on the KDS station mirror" link in
      `KDSRoutingTraceSection`, deep-linking merchant + location + order, and
      the display when every routed decision agrees on one.
- [x] Seven-day routing-health hint on the mirror page, read from
      `v_kds_routing_health`.
- [x] `show_all_items` warning on the selected display, since that setting
      alone explains a flooded-looking board.

## Design decisions worth knowing

### The layout is mirrored, not approximated

A four-column Sent/Preparing/Ready/Done board is an analytical view. It is not
what a KDS looks like. The tablet renders **status tabs plus an N-column
masonry grid**, one status at a time, so the mirror has a Station layout view
ported from `app/(main)/kds.tsx` in the POS repo.

What is ported, with the tablet as the source of truth:

| Behaviour | Detail |
| --- | --- |
| Status tabs | `Pending / Cooking / Served / Done`. Note `ready` is labelled **Served**, not Ready. |
| Workflow mode | `locations.kds_workflow_mode = '2-step'` hides the Pending tab and starts on Cooking. |
| Type tabs | `All / Delivery / To Go / Dine-In`, via a verbatim port of `matchesTypeFilter` (empty/NULL `order_type` falls through to Dine-In). |
| Columns | `kds_displays.columns`, default 4. |
| Column packing | Round-robin (`i % n`), because `MasonryFlashList` is mounted without `optimizeItemArrangement`. CSS multi-column was rejected: it flows top-to-bottom down column one first, which silently reorders the board. |
| Type scale | `kds_displays.font_scale`, applied once on the grid with cards sized in `em`. |
| Order notes | `show_order_notes` is gated client-side on the tablet, so the mirror gates it too. |
| Allergen flags | Detected on **modifier names** and rendered unconditionally - the tablet does *not* gate this on `show_allergy_flags`, despite that column existing. |

Deliberately **not** ported:

- `alert_minutes` / `warning_minutes` - stored, and plumbed into the POS
  `KDSDisplayConfig`, but consumed by no tablet rendering today. Colouring
  tickets by them would show HQ something the kitchen cannot see, which is the
  one thing this tool must never do. They appear in the config readout only.
- The done-tab 60-minute window - the tablet re-filters, but that window is
  exactly `get_kds_tickets_v3`'s own `done_retention`, so the RPC has applied
  it already.
- Ticket sort - v3 returns rush/prioritised first then oldest first, which is
  the order the tablet renders. Re-sorting could only introduce drift.

`show_server_name` needs no client handling at all: `get_kds_tickets_v3` nulls
`server_name` server-side when it is off, so the mirror inherits it through the
RPC.

The two views also disagree on vocabulary by design, so the "All states" column
headers now carry the station's own label alongside
(`Ready (KDS: Served)`). Support staff reading one and describing the other to a
merchant was an obvious way to waste a call.

### The status array is pinned, not inherited

`stores/useKDSStore.ts` in the POS repo sends only `p_location_id` and an
optional `p_kds_display_id`, so the tablet runs on `get_kds_tickets_v3`'s
default `ARRAY['sent','preparing','ready']`. The mirror pins that array
literally rather than relying on the default, so a future change to the default
cannot silently desynchronise HQ from the kitchen.

The Done column is **not** a fourth status. `get_kds_tickets_v3` derives done
tickets from `kitchen_status = 'served'` inside its one-hour done-retention
window.

### Arrival capture runs at COMMIT, not inside `route_items_to_kds()`

`trg_route_items_to_kds` is `FOR EACH ROW`. Capturing the board from inside it
would snapshot after the *first* item of a send is routed, so every other item
in the same statement would be missing from its own "on arrival" snapshot -
exactly the evidence the snapshot exists to preserve. It would also write one
board per item per display.

The obvious alternative, an AFTER STATEMENT trigger with transition tables, is
not available. Postgres rejects it outright:

```
ERROR: 0A000: transition tables cannot be specified for triggers with column lists
```

and dropping `UPDATE OF sent_to_kitchen_at` to obtain transition tables would
make *every* update statement on `order_items` - the hottest write path in the
system - materialise OLD and NEW tuplestores whether or not anything fired.

So arrival capture is a `DEFERRABLE INITIALLY DEFERRED` constraint trigger. Its
`WHEN` clause still filters per row at modification time (constraint triggers
explicitly do **not** defer `WHEN` evaluation, so the cheap filter stays cheap),
while the body runs once at COMMIT. That is strictly more accurate than
end-of-statement: a send spread across several statements yields one complete
final board rather than one partial board per statement. A transaction-local
GUC (`app.kds_snapshot_seen`) collapses the per-row firings to one capture per
(location, display).

The UPDATE trigger's `WHEN` keeps the row trigger's own NULL -> NOT NULL guard.
That is load-bearing: `bulk_update_order_item_status_v2` lists
`sent_to_kitchen_at` in its SET clause on *every* status change, so without it
a ready/served update would be recorded as an arrival.

### Capture failures can never fail a send or a bump

Both capture paths wrap the snapshot in a `BEGIN ... EXCEPTION WHEN OTHERS`
block that downgrades any failure to a `WARNING`. A lost snapshot is a support
inconvenience; an exception escaping the deferred trigger would abort the whole
order transaction at COMMIT - the worst moment to fail and the hardest place to
diagnose. The same guard protects the ready/served path, which runs on the
cook's bump.

### Cost on the send hot path

Each snapshot is one `get_kds_tickets_v3` call. v3 is the location-scoped
projection from AUD-8, which eliminated 94-99% of v2's work, so this is single
-digit milliseconds per active display - not v2's 42.75 ms platform-wide
figure. Snapshots are additionally hash-deduped, so no-op re-fires do not
accumulate rows.

### Correlate on `order_item_id`, never `ticket_id`

`get_kds_tickets` has documented staging/prod `ticket_id` drift (floor-ms vs
seconds). Snapshots store boards verbatim and therefore inherit whichever form
the environment produces.

### `acknowledged_*` was not reused

`kds_item_status.acknowledged_at` already means "void-notice acknowledged"
(migration `20260606040300`). Nothing here touches it.

## What this cannot tell you

The mirror reconstructs what the **server** says a station should show. It
cannot see the physical screen. If the tablet's realtime socket dropped, the
app crashed, or its cache is stale, this board still renders perfectly while
the kitchen sees nothing.

This is stated on the page itself, above the pickers, because a support
engineer looking at a healthy-looking mirror will otherwise draw the wrong
conclusion. Use it to decide **server-side or device-side**, not to confirm
what was rendered.

## Files

| Path | Role |
| --- | --- |
| `supabase/migrations/20260827120000_hq_kds_board_mirror.sql` | RPCs, snapshot table, capture triggers, retention |
| `app/manage/actions/kds-mirror.ts` | Server actions, all gated on `hq.support.view` |
| `app/manage/support/kds-mirror/page.tsx` | Route |
| `app/manage/support/kds-mirror/components/` | Board, ticket card, controls, timeline |
| `app/manage/support/kds-mirror/hooks/` | `useKdsMirror`, `useKdsMirrorRealtime` |
| `components/dashboard/orders/KDSRoutingTraceSection.tsx` | HQ-only cross-link into the mirror |
| `app/manage/layout.tsx` | Sidebar entry |

## Access control

Two independent gates, both required:

1. `assertHQPermission("hq.support.view")` in every server action.
2. `is_dexapos_admin()` inside every `hq_*` RPC.

The second is not belt-and-braces. `get_kds_tickets_v3` is SECURITY DEFINER
with **no tenancy predicate of its own** - it will project any location it is
handed - so the database-side gate is what actually stops a non-HQ session
reading an arbitrary merchant's board.

`kds_board_snapshots` RLS exposes rows to `is_dexapos_admin()` or to the owning
merchant scoped by `user_location_ids()`, matching `kds_routing_log`.

## Staging verification

Not yet run. Steps:

- [ ] Apply the migration to staging.
- [ ] Confirm `hq_get_kds_board_mirror_v1` raises `insufficient_privilege` for
      a non-HQ session and returns a board for an HQ session.
- [ ] Fire a multi-item order and confirm **one** `kds_board_snapshots` row per
      active display, containing **all** items from that send (this is the
      regression the commit-time design exists to prevent).
- [ ] Fire two orders inside one explicit transaction and confirm still one
      snapshot per display, carrying both orders' tickets.
- [ ] Force a capture failure (e.g. temporarily break the snapshot insert) and
      confirm the send still commits, with a WARNING in the logs.
- [ ] Mark items ready, then served; confirm `item_ready` / `item_served` rows
      and that neither is mislabelled `item_arrived`.
- [ ] Re-fire with no board change and confirm the hash dedupe suppresses the
      write.
- [ ] Diff the mirror against a physical KDS tablet on the same display id and
      confirm the ticket sets match.
- [ ] Side-by-side the Station layout view against that same tablet: column
      count, tab set, tab labels, type filters, and per-column ticket order.
- [ ] Set a display to `columns = 2` and `font_scale = 1.25` and confirm the
      mirror follows both.
- [ ] Set the location to `kds_workflow_mode = '2-step'` and confirm the
      Pending tab disappears from both tablet and mirror.
- [ ] Confirm `bulk_update_order_item_status_v2` still returns its original
      payload shape to the POS (the redeclaration must be behaviour-neutral).
- [ ] Measure send-path latency before/after on a two-display location.
- [ ] Confirm the append-only guard rejects a direct UPDATE/DELETE on
      `kds_board_snapshots`, and that `purge_kds_board_snapshots()` succeeds.

## Rollout

Staging-first, no feature flags. The web surface is additive. The migration
redeclares `bulk_update_order_item_status_v2`, which the POS calls, so that
function is the only piece with POS-visible blast radius - its body is copied
verbatim from `20260814130000_kds_routing_traceability.sql` (the current
definition; no later migration touches it) with the capture call added after
the order roll-up.

Full rollback SQL is at the bottom of the migration file.

## Not in this change

Architecture B — device-truth capture — is implemented in
[FEATURE-2026-08-27-HQ-KDS-DEVICE-TRUTH.md](./FEATURE-2026-08-27-HQ-KDS-DEVICE-TRUTH.md):
`kds_device_events` / `kds_device_snapshots` append-only ledgers,
`report_kds_device_events(...)` (tenancy derived from `kds_display_id`, never
trusting device-claimed merchant/location for RLS), the diff RPCs
(`get_kds_device_truth_for_order`, `get_kds_display_truth_window`,
`v_kds_device_truth_health`) and the routed-vs-seen classification
(CONFIRMED / RENDER_SUSPECT / NEVER_SHOWED / OFFLINE / GHOST). The 80/20 —
`arrived` + `ack` per item, piggybacked on the existing heartbeat — is wired in
the POS repo (`services/kds/kdsDeviceTruth.ts`) and is inert until the fleet
ships it. That alone settles "routed but never seen", which is the question
this mirror can raise but cannot close.

The one part of the original B plan that did not ship: the POS does not emit
`kds_device_snapshots` payloads yet (the RPC supports them; the ledger stays
empty until a later build chooses to).
