# `_pending_review/` — NOT APPLIED, NOT VERIFIED, DO NOT PUSH

Files here are deliberately kept **out of `supabase/migrations/`** so that
`supabase db push` cannot pick them up. Move a file up one directory only after it has been
verified.

## Why these are quarantined

They were authored by subagents in a workflow that **failed: 0 of 4 agents completed.** The
machine slept mid-run and three agents stalled through all six retries. **No adversarial
verification pass ever ran.** What is on disk is pre-failure output.

## What HAS been verified (by hand, on staging, 2026-08-13)

- Not truncated — all end with complete rollback blocks.
- Syntax + semantics: each was dry-applied on staging inside `BEGIN … ROLLBACK` with **zero
  errors**, proving every referenced object exists and every type checks.
- Rollback hygiene confirmed — nothing leaked into staging.

## What has NOT been verified

- **`20260815140000_wave3_get_pos_bootstrap_v1.sql`** — the five-level price cascade
  (`effective_price` / `effective_cash_price` / `effective_delivery_price`, `price_source`,
  `effective_availability`) has **not** been proven equivalent to `get_pos_full_sync` +
  `get_menu_with_categories`. Run `supabase/validation/052_wave3_bootstrap_equivalence.sql`
  first. Getting this wrong charges customers the wrong price.
- **`20260815150000_wave4_get_floor_snapshot_v1.sql`** — snapshot output not compared against
  `get_location_floor_plans`; the `geometry_version` bump triggers are untested.
- **`20260815160000_wave5_index_cleanup.sql`** — the 8 drops were adjudicated sound (2 proven
  duplicates + 6 lifetime-zero-scan; no unique or constraint-backed index touched), but see
  the duplicate-revision warning below.

## ⚠️ Duplicate revisions — reconcile before shipping

The stalled agents kept writing **after** these were quarantined, re-creating files in
`supabase/migrations/` where `db push` would have applied them unvalidated. Those later
copies are preserved here with an `.agent-revB` suffix. They **differ** from the validated
copies:

| File | validated copy | `.agent-revB` |
|---|---|---|
| wave3 bootstrap | 54,547 B (20:27) | 54,119 B (20:45) |
| wave5 index cleanup | 29,950 B (20:38) | 32,295 B (21:41) |

Neither revision is authoritative — both are mid-edit states from agents that never finished.
Diff them and decide deliberately; do not assume the newer one is better.

## `20260815160000_wave5_index_cleanup.sql` can never be `db push`ed

`DROP INDEX CONCURRENTLY` cannot run inside a transaction block, and `db push` wraps every
migration in one. It needs a SQL-editor runbook, one statement at a time. This is also why the
security fix was split out of Wave 5 and shipped separately as
`20260815161000_secfix_secdef_authz_and_search_path.sql`.

## Context

Program doc: `Dexa-POS/docs/engineering/performance/db-perf-waves-2026-08-13.md`.

Before trusting any prod-derived definition, run the cross-environment `md5(pg_get_functiondef())`
comparison in that doc. Wave 2 was drafted from prod and would have silently reverted the
staging-only #S1-0013 floor-millisecond `ticket_id` fix.

---

## `20260827130000_kds_device_truth.sql` — picked up 2026-08-27

Architecture B (KDS device-truth capture) was picked back up and is no longer
quarantined. It now lives at `supabase/migrations/20260827130000_kds_device_truth.sql`
and is ready to be applied ahead of the POS emitter landing in the fleet.

- Finalized from the deferred draft: added the missing
  `get_kds_display_truth_window(display_id, from, to)` diff RPC and hardened
  `report_kds_device_events` against non-existent `order_id` values aborting a
  whole batch.
- Inert by design until the POS app ships an `arrived`/`ack` emitter — until
  then `kds_device_events` stays empty and every diff reports `NO_DEVICE_DATA`,
  which is honest.
- Companion to `20260827120000_hq_kds_board_mirror.sql` (Architecture A), which
  is applied and verified on staging. A stands alone and does not depend on
  this.

The POS emitter work lives in the Dexa-POS repo (`services/kds/kdsDeviceTruth.ts`
plus the KDS screen and heartbeat hooks). See
`docs/features/kds/FEATURE-2026-08-27-HQ-KDS-DEVICE-TRUTH.md`.
