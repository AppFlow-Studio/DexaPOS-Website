# Design — `pos_staff_login_v2` PIN-verification speedup (deferred)

**Status:** Design only. Implementation **gated by the per-order-PIN feature** (per DB Perf Phase 6
ticket). No code changes shipped yet.
**Related:** [db-perf-phase6-order-broadcast-hot-rpc.md](db-perf-phase6-order-broadcast-hot-rpc.md) (Lever 4).

## Problem (measured, not theoretical)

`pos_staff_login_v2` verifies a PIN with no user identifier, so it must compare the typed PIN
against **every candidate PIN at the location**. The current predicate (latest def in
`supabase/migrations/20260413215901_remote_schema.sql`):

```sql
WHERE lm.location_id = p_location_id
  AND lm.is_active = true
  AND (
    (lm.pin_plain IS NOT NULL AND lm.pin_plain = p_pin_code)
    OR
    (lm.pin_plain IS NULL AND lm.pin_code IS NOT NULL
     AND replace(lm.pin_code,'$2b$','$2a$') = extensions.crypt(p_pin_code, replace(lm.pin_code,'$2b$','$2a$')))
  );
```

`crypt()` (bcrypt) only runs for rows where `pin_plain IS NULL AND pin_code IS NOT NULL`, so cost
scales with the number of **bcrypt-pin** staff at the location, not total staff.

**Measured on staging (`EXPLAIN ANALYZE`, location `8835e749…`, 5 bcrypt pins):**
- Execution time **375 ms** (369 ms inside the `location_members` seq scan).
- `Buffers: shared hit=3` — the scan is trivial; the time is **pure bcrypt CPU** (~70 ms/hash).
- Linear: ~70 ms × bcrypt-pin count. ~10 pins ≈ 700 ms (matches the ticket's stale 703 ms);
  a 20-staff location ≈ 1.4 s **per login**.

Acceptable today (logins are occasional). **Not** acceptable if the per-order-PIN feature calls
this verification per order during service.

## Recommended fix — indexed keyed-hash lookup, single bcrypt verify

Turn the N-bcrypt scan into a 1-bcrypt verify by finding the candidate row with an **indexed
equality** first.

1. **Add a deterministic lookup column** on `location_members`:
   `pin_lookup_hash bytea` = `hmac(p_pin_code, <key>, 'sha256')`, where `<key>` is a
   per-location (or per-merchant) secret salt — **not** derived from the PIN. Store the salt in a
   server-only table or Vault, never client-reachable.
   - Index it: `CREATE INDEX CONCURRENTLY idx_location_members_pin_lookup ON public.location_members (location_id, pin_lookup_hash) WHERE is_active;` (CONCURRENTLY → not in a txn).
2. **Lookup path in the RPC:** compute `hmac(p_pin_code, key)` once, fetch the (normally single)
   active member at the location with that `pin_lookup_hash`, then run bcrypt `crypt()` on **that
   one row** to confirm. → 1 bcrypt call instead of N.
3. **Keep bcrypt** (`pin_code`) as the verification of record — the HMAC is only a fast index
   probe (defense-in-depth if the HMAC key leaks; bcrypt still gates).
4. **Backfill:** one-time migration computing `pin_lookup_hash` for all existing
   `pin_plain`/`pin_code` rows. PIN-set/PIN-change code paths must also write `pin_lookup_hash`.
5. **Collisions:** within a location PINs are effectively unique; if the lookup returns >1 active
   row, bcrypt-verify each candidate (rare, still ≪ N).

## Security considerations (require review before implementation)

- HMAC key management: must be server-only, rotatable; rotation requires recompute of all
  `pin_lookup_hash`. Prefer a per-merchant key so a single leak isn't global.
- Do **not** drop bcrypt or `pin_plain` handling without a separate decision — `pin_plain` rows
  (28/47 on staging) are a separate cleanup.
- Timing side-channels: indexed lookup makes "PIN exists" timing more uniform than the current
  scan — neutral-to-better, but confirm with security.
- RLS / `SECURITY DEFINER` + pinned `search_path` must be preserved on the RPC.

## Cheaper interim alternative (if speed needed before the full fix)

Re-hash PINs at a **lower bcrypt cost factor** (e.g. 8 vs current ~12 → ~70 ms to ~5 ms/hash).
Less code, no schema change, but: (a) still scans all bcrypt pins, (b) it's a security-policy
tradeoff (4-digit PINs derive most protection from rate-limiting/lockout, not hash cost, so this
is defensible — but it's a policy call, not an engineering one).

## Verification plan (when implemented)

- `EXPLAIN (ANALYZE, BUFFERS)` the new lookup: expect an Index Scan on
  `idx_location_members_pin_lookup` and exactly **1** `crypt()` evaluation; total well under the
  ~250 ms p95 target regardless of staff count.
- Correctness: every existing PIN that logs in today must still log in (backfill parity test
  across all active members on staging before/after).
- Confirm station-claim (`FOR UPDATE`), session teardown, and auto-clock-in writes are unchanged.
