# [POS-KDS - P0] KDS Routing Traceability

## Source

- Notion title: `[POS-KDS - P0] KDS Routing Traceability - immutable kds_routing_log + send-attempt ledger + order routing trace RPC`
- Notion page ID: `3b98280c-1b1d-8194-9732-f2ee39d3004a`
- Notion URL: <https://app.notion.com/p/3b98280c1b1d81949732f2ee39d3004a>
- Owner: Ali Dika, database/schema/RPC
- Reviewers: Abubeckr for sign-off; Temur for production DDL
- Live-merchant context: Charcoal Gardenia, `5afc6641-e98f-4c81-8d9d-d9691b5c28dc`

The full Notion page and discussions were fetched before implementation. This
repository pass covers the shared Supabase contract only. It does not implement
Haidar's Routing Trace UI or the POS client handoff.

## Problem

`kds_item_status` records the final routing result but not the decision that
produced it. Support cannot prove which displays were evaluated, which rule
matched, which prep station resolved, whether the POS sent a partial list, or
whether an item silently reached zero displays. The existing bulk update RPC
also reports the requested array size as `updated_count`, hiding missing IDs.

## Scope

### Website/shared-database work

- Add an immutable, tenant-scoped `kds_routing_log` decision ledger.
- Add an immutable, tenant-scoped `kds_send_attempts` request ledger.
- Instrument `route_items_to_kds()` without removing existing routing or
  fallback behavior.
- Persist the resolved prep-station name when the order item has none.
- Normalize category-name rule comparisons with `btrim()`.
- Return true `ROW_COUNT` as `updated_count` and add `requested_count`.
- Instrument initial and replayed `send_order_to_kitchen_v1` calls.
- Add optional station/device context while retaining compatibility with old
  named-argument callers and falling back to `orders.station_id/device_id`.
- Add tenant-scoped `get_order_routing_trace(order_id)`.
- Add security-invoker `v_kds_routing_health` rolling seven-day metrics.
- Backfill only existing, derivable `kds_item_status` routes as
  `backfill_unknown`.
- Retain normal traces/send attempts for 180 days and dropped incidents for two
  years through a private scheduled cleanup function.
- Update both checked-in Supabase TypeScript type surfaces.

### Explicitly out of scope

- Changing `show_all_items` broadcast semantics.
- Repairing KDS/item status divergence.
- Migrating prep-station names to foreign keys.
- Building the Routing Trace UI.
- Editing or releasing the POS application.
- Executing this migration against staging or production.

## Implementation

### Migration

`supabase/migrations/20260814120000_kds_routing_traceability.sql`

The migration creates:

- `kds_routing_log`
- `kds_send_attempts`
- `protect_kds_trace_ledger()`
- instrumented `route_items_to_kds()`
- corrected `bulk_update_order_item_status_v2(...)`
- instrumented `send_order_to_kitchen_v1(...)`
- `get_order_routing_trace(uuid)`
- `v_kds_routing_health`
- `purge_kds_trace_ledgers()` and its guarded cron schedule

The bulk-status patch consolidates the conflicting four- and five-argument
overloads into the five-argument signature with an optional expected version.
It retains the newer POS recall/refund-aware KDS state behavior while adding
`requested_count` and a true `ROW_COUNT`-based `updated_count`.

Both ledgers use SELECT-only merchant/HQ RLS. Direct client insert, update, and
delete grants are absent. A trigger rejects direct UPDATE/DELETE while allowing
parent-order cascades, routing-rule/display `ON DELETE SET NULL`, and the private
retention function.

### Routing preservation

The trigger keeps the existing precedence and outputs:

1. `routing_mode='all'`
2. first matching prep-station/category/order-type rule
3. `show_all_items`
4. blast to every active display when no display matched
5. one synthetic dropped row when no active display exists

Each active display gets exactly one final decision row. The log write is one
set-based `INSERT ... SELECT` per fired item and shares the routing transaction.

### Historical honesty

The backfill creates rows only where an existing `kds_item_status` row proves a
route happened. It uses `match_reason='backfill_unknown'`. It does not infer a
historical rule, fallback, skipped display, or dropped item.

## Files

- `AGENTS.md`
- `supabase/migrations/20260814120000_kds_routing_traceability.sql`
- `app/database.types.ts`
- `database.types.ts`
- `tests/kds-routing-traceability-migration.test.ts`
- `docs/features/kds/README.md`
- `docs/features/kds/PLAN-2026-08-14-KDS-ROUTING-TRACEABILITY.md`
- `docs/features/README.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Verification

### Automated

- Migration contract test checks tables, RLS, immutability, routing reasons,
  true row counts, replay evidence, trace RPC, health view, and honest backfill.
- TypeScript/build verification is required before handoff.

### Staging DDL preflight

Before applying the migration, Temur must compare the deployed definitions of:

```sql
select
  p.oid::regprocedure::text as signature,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'route_items_to_kds',
    'bulk_update_order_item_status_v2',
    'send_order_to_kitchen_v1'
  )
order by signature;
```

Do not apply if the deployed bodies are newer than the migration's source
definitions. Rebase the instrumentation onto those bodies first.

### Manual QA

Apply on staging only after DDL review. Never use `db push` for production.

1. Record baseline KDS rows for a six-item, multi-category staging order.
2. Apply the migration in the staging SQL editor.
3. Repair migration history as required by the source ticket.
4. Fire an equivalent six-item order.
5. Confirm physical KDS destinations match the baseline.
6. Call `get_order_routing_trace(order_id)` and compare every routed display to
   the physical screens.
7. Exercise prep-station, category-ID, category-name, order-type,
   `routing_mode_all`, show-all/expo, and blast paths.
8. Deactivate all displays, fire a disposable order, and verify exactly one
   `dropped/no_active_display` row.
9. Call the bulk RPC with one valid and one nonexistent item UUID; verify
   `requested_count=2` and `updated_count=1`.
10. Replay one composite send with the same idempotency key; verify a second
    send-attempt row has `was_replay=true` and no duplicate routing side effect.
11. Attempt a direct ledger update as an authenticated merchant and verify the
    append-only exception.
12. Verify another merchant cannot read the order trace or either ledger.
13. Measure 20 comparable kitchen sends before/after and compare p95 latency.

Post-deploy coverage query:

```sql
select count(*) as fired_items_without_trace
from public.order_items oi
where oi.sent_to_kitchen_at > '<deploy_ts>'::timestamptz
  and coalesce(oi.is_voided, false) = false
  and not exists (
    select 1
    from public.kds_routing_log l
    where l.order_item_id = oi.id
  );
-- expected: 0
```

Route reconciliation query:

```sql
select count(*) as routed_logs_without_kds_row
from public.kds_routing_log l
where l.outcome = 'routed'
  and l.fired_at > '<deploy_ts>'::timestamptz
  and not exists (
    select 1
    from public.kds_item_status kis
    where kis.order_item_id = l.order_item_id
      and kis.kds_display_id = l.kds_display_id
  );
-- expected: 0
```

## Remaining POS Work

The POS repository still needs a separate branch/PR to:

1. Acknowledge that `bulk_update_order_item_status_v2.updated_count` now means
   actual changed rows and consume `requested_count` for mismatch handling.
2. Regenerate/update POS database types for the optional `p_station_id` and
   `p_device_id` send arguments.
3. Pass the active station/device identifiers on online sends and preserve them
   in offline queued/replay payloads. Legacy builds remain traceable from the
   order fallback, but explicit context is more reliable.
4. Surface or log a requested-versus-updated mismatch rather than treating it
   as an unconditional success.
5. Verify send, retry, offline replay, mixed-category routing, all-display
   disabled, and physical KDS-screen parity.
6. Record before/after p95 over 20 sends and provide the sign-off video.

The separate `show_all_items` semantics ticket and KDS state-machine divergence
ticket remain out of scope.

## Contract Questions Requiring Senior Decision

1. The health view is explicitly rolling seven days, so in August it cannot
   return May 9 drops. The acceptance criterion expecting non-zero May drops in
   that view after backfill is impossible without changing the time window or
   fabricating historical dropped rows. This implementation does neither.
2. The ticket requires byte-identical routing and also requires `btrim()` to fix
   dirty category-name matches. This implementation prioritizes the explicit
   instrumentation-only constraint and preserves exact category-name equality.
   Whitespace normalization remains deferred to a separately approved routing
   behavior ticket.

## Status

- Code: implemented locally, not committed, not pushed.
- Migration: not executed.
- Automated verification: targeted migration contract suite passes. The
  repository-wide TypeScript check remains blocked by unrelated baseline
  errors; no reported error references a KDS change file.
- Staging QA: pending Temur DDL review and migration approval.
- POS client handoff: pending.
- Final verification: Abubeckr; implementer must not self-sign off.
