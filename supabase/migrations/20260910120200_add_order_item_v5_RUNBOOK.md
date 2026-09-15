# `add_order_item_v5` — provenance and the pre-deploy check. Read before deploying.

> **This runbook and its migration were authored in the POS repo (Dexa-POS PR #201) and
> copied here** — the shared database's migrations live in this repo. Apply order is
> `20260910120000_create_order_v4` → `20260910120100_seat_guests_v4` →
> `20260910120200_add_order_item_v5`. Apply to **staging** (`dfwqakoyittmrwbqvxgw`) only; the
> user promotes to production (`hifouuofcaytijrkbvcy`) manually.
>
> **⚠️ Do NOT apply `20260910120200_add_order_item_v5.sql` until Step 1 below is done.** The other
> two (`create_order_v4`, `seat_guests_v4`) forked from in-repo v3 files and can go straight to
> staging; v5 did not, and shipping it without the diff risks dropping `p_origin_id`.

**Status:** `add_order_item_v5.sql` is WRITTEN, forked from the in-repo station-guard v3 with
`p_origin_id` reconstructed from the contract documented in `lib/realtime/mutationOrigin.ts` (POS repo).
**Step 1 below is still required before deploying it** — dump the live v4 and diff.
**Blocks:** Phase 3 (`EXPO_PUBLIC_LOCAL_WRITES_ITEMS`) — item writes cannot be local-first until
items carry client-minted ids.
**Plan:** POS repo `docs/engineering/architecture/local-first-orders-seating.md` §6.1

## Why this file exists

`create_order_v4` and `seat_guests_v4` were written by forking `create_order_v3` and
`seat_guests_v3`, both of which are in the POS repo. **`add_order_item_v4` is not.**

```
$ grep -rl "add_order_item_v4" --include=*.sql .
(nothing)

$ ls utils/supabase/migrations/add_order_item_v*.sql    # POS repo
add_order_item_v3.sql            ← the newest one we have
add_order_item_v3_station_guard.sql
```

But the deployed database has `add_order_item_v4` — `database.types.ts` lists it, and
`services/orderService.ts:486-488` (POS repo) calls it.

Comparing the deployed v4 signature against the in-repo v3 body, **v4 added at least two
parameters that v3 has no trace of**:

| Param | In v3 body? | What it does |
| --- | :---: | --- |
| `p_station_id` | ✗ (0 occurrences) | Station attribution / the station guard |
| `p_origin_id` | ✗ (0 occurrences) | Broadcast echo suppression — pairs with `lib/realtime/mutationOrigin.ts` |

**Forking v3 blindly would have shipped a v5 that silently dropped both.** Losing `p_origin_id` means
every station reprocesses its own broadcasts, which looks like phantom duplicate items — the exact
symptom class this whole project exists to remove. That is a worse outcome than not shipping.

> The repo's `migrations/` directory is **not** a complete mirror of the deployed schema, and
> `database.types.ts` is stale in the other direction (it has `add_order_item_v4` but not
> `seat_guests_v3`, which shipped later). Neither artifact alone is authoritative. Assume this
> for any future RPC fork, not just this one.

## Step 1 — dump the live definition

Against **staging** (`dfwqakoyittmrwbqvxgw`), then diff against production
(`hifouuofcaytijrkbvcy`) to confirm they match before forking:

```sql
SELECT p.oid::regprocedure AS signature, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_order_item_v4';
```

From this (website) repo, linked to staging:

```
supabase db query --linked --file /tmp/dump_add_order_item_v4.sql
```

Save the output verbatim as `supabase/migrations/add_order_item_v4.sql` (in this repo) with a header
noting it was recovered from the live DB rather than authored here. **Do this regardless of whether
v5 gets deployed** — an RPC on the hot path with no definition in version control is a standing risk.

## Step 2 — reconcile v5 against the live v4

`20260910120200_add_order_item_v5.sql` already reproduces v4's `p_station_id` guard and `p_origin_id`
echo suppression on top of station-guard v3. Diff the recovered live v4 against it:

1. `p_item_id uuid DEFAULT NULL` is the **last** parameter (keeps positional callers working).
2. Row-level idempotency runs **before any work**, scoped by `order_id` so a client cannot probe for
   another order's item ids.
3. `v_item_id := COALESCE(p_item_id, gen_random_uuid());` and `id` is inserted explicitly.
4. `unique_violation` on `order_items_pkey` returns the existing row (racing-retry path); anything
   else `RAISE`s.
5. **If the live v4 gained anything beyond `p_origin_id` / `p_station_id`** — extra params, changed
   pricing/tax/modifier logic, a new side effect — port it into the v5 file before applying.

## Step 3 — verify before wiring the client

- Call twice with the same `p_item_id` → one row, two identical responses.
- Call with `p_item_id => NULL` → behaves exactly like v4 (this is the rollback path).
- Confirm `p_origin_id` still suppresses the caller's own broadcast — add an item on station A and
  assert station A does not reprocess it.
- Confirm the station guard still rejects what v4 rejected.

## Why not just insert into `order_items` directly from the client?

`order_items.Insert.id` is optional, so a direct PostgREST insert *would* accept a client id. It
would also skip tax-category resolution, modifier price rollup, dual-price lookup, the station
guard and the broadcast — all of which live inside the RPC. The RPC fork is the smaller change.
