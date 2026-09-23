# Investigation — stuck table sessions and never-bumped KDS tickets

**Date:** 2026-09-23
**Status:** Diagnosed, not fixed. Decisions needed before any remediation.
**Origin:** Fallout from the analytics duration migrations
(`20260923120000_analytics_duration_plausibility.sql`), whose new
`excluded_count` column made the scale of this visible for the first time.

---

## Summary

Two distinct problems were found. They look alike in the analytics output — both
show up as "abandoned records" — but they have different causes, different
blast radii, and only one of them is hurting anybody today.

| | KDS tickets | Table sessions |
|---|---|---|
| Symptom | 48% excluded from kitchen-time stats | 36% excluded from turn-time stats |
| Cause | **Bulk backfill**, not kitchen behaviour | Sessions genuinely never closed |
| Live impact | None — analytics only | **30% of one location's floor held** |
| Urgency | Low (data hygiene) | High (operational) |

---

## Problem 1 — KDS tickets were bumped by a bulk operation, not by staff

### What the data says

Of 1,000 recently-bumped `kds_item_status` rows, 891 took longer than the
180-minute plausibility ceiling. That looked like a kitchen problem. It is not.

```
bumped_by on late rows:  NULL on 891 of 891   (no staff member did this)
single-minute bursts:    467 tickets bumped in one minute (2026-09-08T15:59Z)
                         250 tickets bumped in one minute (2026-09-10T13:37Z)
in bursts of >=10/min:   888 of 891  (100%)
median bumped_at - completed_at: 0.0 min
```

Every late bump happened in a burst, with no user attached, and `bumped_at`
equal to `completed_at` to the minute. That is the signature of an `UPDATE ...
SET bumped_at = now()` run across a backlog — a migration, a seed, or a manual
cleanup — not of cooks clearing tickets.

### Why it does not need fixing

The affected tickets are overwhelmingly not real trade:

```
late-bumped tickets  -> 129 distinct orders, 11% recognized (paid)
on-time tickets      ->  23 distinct orders, 30% recognized (paid)
order status mix on late: {ready: 103, preparing: 26}
```

Only 48 of 891 sampled late tickets belong to a paid order. The 180-minute
ceiling in the analytics migration is therefore doing exactly the right thing:
it is filtering out backfill noise, and the ~2.4 min median it reports is the
real kitchen time.

**Recommendation: no remediation.** Rewriting `bumped_at` on historical rows
would be inventing data. The analytics layer already excludes them and reports
how many via `excluded_count`. If the count starts climbing on *new* tickets,
that is a genuine signal worth alerting on — see "Monitoring" below.

**Caveat:** `1,746 of 9,716` KDS rows (18%) have `bumped_at IS NULL` entirely.
Those are invisible to the analytics (which requires `bumped_at IS NOT NULL`)
and were not investigated. Whether they represent an unbounded queue on a live
display is a separate question, and the one most worth asking next.

---

## Problem 2 — 87 sessions never closed, holding 30% of a floor

### What the data says

```
table_sessions total:              1,465
closed_at IS NULL:                   119
  of those, is_active = true:         95
  of those, older than 7 days:        87   <-- the problem
oldest still-open session:       279.5 days
median age of open sessions:      71.0 days
sessions aged under 1 day:             0   <-- none of these are live service
```

Status mix of the 87: `ordered 44, seated 36, served 3, check_presented 2,
paid 2`. These are mid-service states that were never advanced.

### Why this one matters

Table status is **derived from live sessions at read time**
(`get_floor_snapshot_v1`), not stored on `floor_plan_objects`. An open
`is_active` session therefore makes its table render as occupied, indefinitely.

```
active table links held by stale sessions:  70
location 8835e749:  70 of 231 active tables held   (30% of the floor)
location 657a703d:   0 of   9 active tables held
merchants affected: 1     locations affected: 2
```

**Nearly a third of one location's floor plan shows occupied by parties that sat
down weeks or months ago.** Staff cannot seat those tables from the floor view
without manually clearing each one.

### Inconsistent states also present

```
status = 'available' but closed_at IS NULL:   8
is_active = false    but closed_at IS NULL:  24
paid_at set          but closed_at IS NULL:   1   <- guest paid and left
```

The 24 `is_active = false, closed_at NULL` rows are the informative ones: some
path sets `is_active` without setting `closed_at`. `close_and_free_session`
(20260729120002) sets both together, so at least one other writer — or an
interrupted call — is leaving sessions half-closed. **Finding that writer
matters more than sweeping the rows**, or the sweep will be re-running for ever.

---

## What a fix would need to decide

A sweep is straightforward to write and follows an established house pattern
(`20260830131000_expire_stale_reservation_requests.sql` + its pg_cron companion).
The hard parts are policy, not SQL:

1. **What is the cutoff?** No open session is younger than 1 day, so anything
   from 24h to 7d cleanly separates stale from live *today*. A restaurant with
   genuine overnight service would need longer. 7 days is the safe default; 24h
   is the useful one.

2. **Close, or void?** Closing sets `closed_at = now()`, which would then feed
   the turn-time analytics a session that "lasted" 279 days. That must not
   happen. Either the sweep sets `closed_at` to a defensible proxy
   (`paid_at`/`cleared_at`/last event) or it marks the row abandoned so
   analytics keeps excluding it. **Recommended: the latter** — the duration is
   genuinely unknown, and the analytics migration already argues at length that
   unknown values must not be folded into averages.

3. **What happens to the attached orders?** This is the sharpest constraint.
   77 orders hang off the 87 stale sessions:

   ```
   draft/pending      34        ready/paid         1
   ready/pending      38        completed/paid     1
   preparing/pending   2        ready/partial      1
   ```

   **41 of them are unpaid and not cancelled, totalling $12,408.11.** A sweep
   that closes sessions without deciding what these orders mean would either
   bury $12k of potentially-collectable trade or, worse, cancel orders a
   merchant believes are still open. Note also that these unpaid orders are
   precisely the ones excluded from GMV by
   `20260923120100_analytics_recognized_order_gate.sql` — the same records
   causing the 36% GMV overstatement. Resolving them fixes two problems, but
   only a human can decide whether each is owed, comped, or abandoned.

4. **Is this production or staging-only?** All 87 belong to a single merchant,
   **"Joes Coffee Shop"**, across two locations. That is one of only two
   merchants in this database with any trading history at all, which strongly
   suggests a staging artifact rather than a platform-wide fault. Confirm
   against production before building a scheduled job — if production is clean,
   steps 2–4 of the sequence below are not worth doing.

---

## Recommended sequence

1. **Confirm the blast radius on production.** If production is clean, this is
   a staging cleanup, not a feature. (Question 4 above — do this first; it
   determines whether the rest is worth building.)
2. **Find the writer** that sets `is_active = false` without `closed_at`
   (24 rows). A sweep without this fix runs for ever.
3. **One-off cleanup** of the 87 stale rows, marking them abandoned rather than
   closed, so the floor frees up and analytics keeps excluding them.
4. **Only then** consider a scheduled sweep, following the reservation-expiry
   pattern.

## Monitoring

The analytics RPCs now return `excluded_count` per day. That is a ready-made
health signal: a sustained rise in excluded sessions or tickets means records
are being abandoned faster than they are being closed. Worth surfacing on the
HQ dashboard next to the metric it qualifies, rather than leaving it as a
column nobody reads.

---

## Method note

All figures were measured against the staging database on 2026-09-23 via the
service-role client, sampling up to 1,000–2,000 rows per query (PostgREST's
default cap) except where an exact `count` is quoted. Two schema assumptions
were wrong on the first attempt and are recorded here so the next reader does
not repeat them:

- There is **no `public.tables` table**. Table geometry lives in
  `floor_plan_objects`, linked to sessions through `table_session_tables`.
- `floor_plan_objects` has **no `status` column**. Occupancy is derived at read
  time by `get_floor_snapshot_v1`, which is precisely why an unclosed session
  keeps a table looking busy.
