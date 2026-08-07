# Senior Summary - Shared Database Performance Audit

- **Date:** 2026-07-31
- **Current-branch revalidation:** 2026-08-03
- **Scope:** Dexa-POS and DexaPOS-Website query patterns against their shared Supabase database
- **POS current-staging revision:** `audit/pos-database-refresh` at `a1c7a032479bdfc533f28e29eb983824077742c1` (equal to `origin/staging` at audit start)
- **POS prior evidence revision:** `databse-audit` at `7a6ab3069840de5da926e71a3b05caca3f2700ff`
- **Website evidence revision:** `dika-dev` at `a2473d88933a90f8fcd46ddd8d4b11a1d1801e29`
- **Database evidence:** staging `dfwqakoyittmrwbqvxgw`; follow-up captured `2026-07-31 10:22:56 UTC`; OpenAPI contract refreshed read-only `2026-08-01 21:15:50 UTC`
- **August 3 refresh:** staging read-only statistics observed `2026-08-03 08:20:01 UTC`
- **Status:** Combined current-source audit complete; shared staging statistics and one standalone POS collector export integrated; controlled workflow deltas and production statistics pending
- **Canonical detailed audit:** `docs/engineering/database-performance/AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-COMBINED.md`

## Decision Summary

Redis should not be the first investment. POS and website query paths create
unnecessary database and network work that must be removed first. Shared
staging evidence shows nested order/item payloads consumed 64.7% of the
captured top-25 statement time, while high-frequency Realtime statements
consumed another 21.1%. Dominant nested queries were cache-hot, which supports
query-shape reduction rather than a Redis-first response.

One security exception now precedes that performance sequence. Query 39
confirmed five PUBLIC/`anon` executable `SECURITY DEFINER` RPCs with no caller
or tenant authorization. They expose staff/PIN data or mutate checks, cash
operations, and floor plans. This is a P0 shared-database contract issue; it
must be contained with a POS-compatible authorization design before general
performance migrations proceed.

Query 40 confirms a second P0 issue: `kiosk_pickup_sequences` and
`luqra_sync_runs` have RLS disabled, while anonymous and authenticated roles
hold full table privileges, including destructive operations. The former is a
per-location operational counter; the latter is an HQ/service-role processor
sync log. They require a separate focused containment migration.

The complete staging function inventory contains 511 unique live
`SECURITY DEFINER` signatures, all owned by `postgres`. Effective execute
access includes 465 signatures for `anon` (91.0%), 495 for `authenticated`
(96.9%), and all 511 for `service_role`; 396 ACLs explicitly grant PUBLIC and
463 explicitly grant `anon`. This does not establish 465 exploitable functions
without body review, but it is a confirmed systemic least-privilege risk. The
five Query 39 functions are the proven P0 subset; payment, void/refund,
payment-device secret, NMI, billing, staff, order, and platform functions are
the next review queue.

The current-staging POS pass adds four concrete release risks. The committed
station-status RPC reference contains nested conflict markers; canonical
`pos_staff_login_v2` does not consistently bind staff/location/merchant to the
selected station and persists submitted PIN input; payment paths disagree
between `process_payment_v16` and v17; and reconnect hydration can reject a
fresh active-order snapshot because its fingerprint uses only row count and
the first `opened_at`. End-of-Day also has source-confirmed date/state/query
correctness defects. These require contract and correctness work before their
performance improvements can be evaluated.

The top-25 total normalizes to approximately 8.87 execution minutes/day over
the 84.87-day statement window. This identifies expensive and frequent query
families but does not prove that PostgreSQL capacity is saturated.

The August 3 top-100 refresh spans 87.37 days and contains 15.65 database-hours.
Nested orders, nested item/modifier payloads, and Realtime account for 84.14%
of that retained time. The exact database cache-hit ratio is approximately
99.9999%, reinforcing query-shape and call-amplification remediation over a
Redis-first response.

## Shared Measured Evidence

- The current `pg_stat_database.stats_reset` value is `NULL`, so the cumulative
  relation totals have no known measurement start boundary and must not be
  presented as daily rates or as impact from a specific release.
- `pg_stat_statements` was reset on 2026-05-07 and has a known 84.87-day window
  through the 2026-07-31 observation. Its top 25 statements consumed 12.54
  database-hours during that window.
- Nine statement-entry deallocation events occurred, so low-frequency query
  history may be incomplete even though the retained dominant-query ranking is
  actionable.
- Nested order payloads: 4.63 hours, 36.9%.
- Nested item/modifier payloads: 3.49 hours, 27.8%.
- Realtime change feed: about 1.1 million calls, 2.64 hours, 21.1%.
- Slowest nested order shape: 8.45-second mean across 1,066 calls.
- Nested single-order item/modifier shape: 1.20-second mean across 7,421 calls.
- Relevant modifier/discount indexes already exist; adding more indexes is not the first fix.
- Statistics are cumulative and not client-attributed. A controlled website workload delta remains required.
- The database-level 1.36 TB temporary-I/O counter has no reset boundary. Four
  of the five largest identified temp-block statements are catalog/audit
  introspection, so the cumulative value cannot currently be attributed to
  application reports.
- `members` has only 15 estimated live rows but approximately 685 million index
  scans; the next evidence priority is live RLS/membership policy review. This
  is an investigation lead, not yet a confirmed policy defect.
- The largest 100 public staging relations total approximately 74 MB; the
  largest is `orders` at 14 MB including indexes. Current staging size does not
  justify partitioning, sharding, replicas, or Redis.
- The duplicate-index query found 25 exact structural groups. Constraint
  ownership and usage must be checked before any removal.
- Ownership review splits them into 13 constraint-plus-index pairs, five
  duplicate-constraint pairs, four duplicate non-unique pairs, and three
  standalone-unique pairs with redundant non-unique copies. The 20
  preliminary non-constraint candidates total only about 1.53 MB; cleanup is
  for write amplification and migration hygiene, not storage capacity.
- Foreign-key review returned 206 conservative candidates, but the collection
  excludes partial indexes and therefore contains known false positives. It is
  a reconciliation set, not an index-creation backlog.
- `orders` has 35 indexes (about 9.5 MB) against a 4.96 MB table, while
  `order_payments` has 31 indexes (about 4.3 MB) against a 3.04 MB table.
  Several exact duplicates are actively used, so consolidation requires
  constraint ownership and workload review rather than zero-scan deletion.
- Eleven `SECURITY DEFINER` functions have no pinned `search_path`. Complete
  body review confirms five authless P0 functions:
  `get_unified_staff_view`, `close_check`, `reopen_check`,
  `record_cash_operation`, and `delete_floor_plan_cascade`.
  `get_unified_staff_view` returns email, phone, and raw/hashed/legacy PIN
  material. The four mutation functions trust caller-supplied object and actor
  identifiers without tenant or permission checks.
- Query 13 is complete: 511 rows and 511 unique signatures, with no duplicate
  signatures. All are `postgres`-owned; 500 have a pinned `search_path`, while
  the 11 unpinned functions match the Query 12/39 set. Volatility is 444
  volatile, 66 stable, and one immutable.
- Anonymous execution is effective on 465 signatures. Do not revoke it
  globally: public storefront, QR, OTP, customer self-service, authenticated
  station, and offline flows require signature-by-signature caller and body
  review. Establish an explicit allowlist and version incompatible changes.
- `admin_get_unified_staff_view` has an HQ check, while
  `update_order_item_v2` and the refund-status functions apply merchant and
  location helpers. These lower-risk functions still need pinned paths,
  qualified references, minimized output, and narrower grants.
- Query 41 found no schema `CREATE` privilege for PUBLIC, `anon`,
  `authenticated`, or `service_role` in `public` or `extensions`. This reduces
  immediate object-shadowing risk from the missing `search_path` pins, but does
  not mitigate the direct function/table authorization defects.
- Only `kiosk_pickup_sequences` and `luqra_sync_runs` appeared with RLS
  disabled. Query 40 confirms full `anon` and `authenticated` privileges on
  both, including `DELETE`, `TRUNCATE`, and `UPDATE`; this is confirmed direct
  exposure rather than a pending grant review.
- Query 42 returned no live database function referencing either table. No
  direct website/POS caller was found for `kiosk_pickup_sequences`; observed
  `luqra_sync_runs` access is confined to HQ/service-role website actions.
  This lowers containment compatibility risk but does not reduce exposure.
- The current POS staging source has 370 literal relation calls across 70
  distinct relations, 214 literal RPC calls across 151 RPC names, 25 exact
  `select('*')` sites, four `.range(...)` calls, and 35 `.limit(...)` calls.
  These are static review counts, not runtime volume.
- Four confirmed authless definer functions have current POS callers:
  `close_check`, `reopen_check`, `record_cash_operation`, and
  `delete_floor_plan_cascade`. Blanket revocation would break current tablet
  workflows; versioned caller/station/tenant authorization must precede grant
  retirement.
- The restored POS collector's standalone export has 945 raw rows and 925
  normalized query IDs. Without an after-export it remains cumulative shared
  evidence and cannot produce POS workflow deltas or performance claims.
- The completed RLS inventory contains 436 policies across 204 tables. The
  direct heuristic flags 187, while authorization helpers appear in many more:
  `is_merchant_admin` in 142 policies and `is_dexapos_admin` in 133. This makes
  role-realistic RLS-plan measurement a priority.
- 264 policies target `{public}`, including 173 mutation policies. This does
  not establish exposure without corresponding table grants, which remain a
  required evidence step.
- The refreshed deployed OpenAPI contract contains 541 RPC paths, 239 exposed
  relation/view definitions, and 3,855 documented properties. Private catalog,
  RLS-plan, and execution-plan evidence still requires the read-only SQL pack.
- The August 3 static revalidation found six migration roots and 999 unique
  SQL files across both repositories. Thirty-five basenames are duplicated and 13
  same-named files differ in content. This makes canonical migration ownership
  an immediate correctness and operability decision.
- Current literal application inventory still contains 2,580 website table
  calls plus 328 website RPC calls, and 374 POS table calls plus 215 POS RPC
  calls. The major fan-out, unbounded-list, raw-report, and polling findings
  remain present.

## Highest-Impact Findings

1. **P0 definer-RPC authorization gap:** five shared functions bypass RLS,
   allow PUBLIC/`anon` execution, and do not authenticate or scope sensitive
   staff/order/cash/floor-plan operations.
2. **P0 RLS/grant gap:** two public tables allow anonymous reads and destructive
   writes with RLS disabled, exposing kiosk counters and Luqra sync metadata.
3. **POS nested order hydration:** retained active-order and detail shapes
   average approximately 1.20 to 8.45 seconds and dominate measured cost.
4. **Migration ownership gap:** deployed critical RPCs are not reproducible
   from one canonical migration root.
5. **KDS/floor payload shape:** operational state is coupled to repeated nested
   aggregation or stable geometry that should be bounded and separated.
6. **Checkout pricing fan-out:** Online checkout calls `get_effective_price` once per cart item at `supabase/functions/create-online-order/index.ts:741`.
7. **Five duplicate report scans:** Location Comparison starts five queries at `app/dashboard/reports/comparison/hooks/useComparisonData.ts:273`, `:293`, `:313`, `:333`, and `:353`; each repeats merchant resolution and a raw `orders` scan.
8. **Unbounded website lists:** Orders and Payments return nested historical
   graphs without pagination and apply some filters in JavaScript.
9. **HQ raw-row aggregation:** HQ actions download raw rows for sums, counts,
   charts, and alerts, then repeat them through 30-60 second polling.
10. **Unbounded scheduled work:** abandoned-cart and billing jobs fetch all eligible rows and perform per-record work.
11. **Broad RLS-bypass review surface:** 285 static website
   `createServiceRoleClient()` helper-call occurrences across 89 files require
   explicit tenant-scope review; this is not measured production call volume.

## Recommended First Actions

1. Assign a security/database owner and design a forward-only P0 remediation
   for the five authless definer RPCs. Preserve Clerk-authenticated POS and
   offline replay; do not simply revoke grants or probe production.
2. Prepare a separate forward-only P0 migration for the two exposed tables:
   revoke unintended grants, enable suitable RLS, preserve HQ/service-role
   Luqra work, and route kiosk allocation through an authorized atomic path.
3. Begin application-only quick wins: bounded Orders/Payments pagination,
   explicit projections, database-side filters, and reduced duplicate polling.
4. Declare one canonical migration root and reconcile critical live RPC
   definitions before replacing any shared function.
5. Run controlled POS and website workload deltas and collect production
   read-only statistics.
6. Version and reshape active-order, order-detail, KDS, and floor-plan RPCs.
7. Batch checkout price resolution and replace Location Comparison/HQ raw scans with aggregate RPCs.
8. Add durable batch claiming and limits to abandoned-cart and billing jobs.
9. Complete lower-risk RLS, definer-function, grant, and index review before
   creating any broad database-hardening migration.

## Expected Benefit

These are structural estimates, not measured latency claims:

- Location Comparison can drop from five merchant lookups plus five order scans to one aggregate request, eliminating roughly 90% of that page's database round trips.
- Checkout pricing can change from O(cart items) RPC calls to one request.
- Orders/Payments payload becomes bounded by page size rather than merchant history; a 50-row page can avoid transferring most historical detail rows.
- HQ dashboard latency can move from the sum of sequential waits toward one aggregate call, with substantially fewer database-to-application rows.
- Batched jobs become predictable and restartable instead of scaling with the complete backlog.

## Redis Position

**Not justified yet as a general database cache.**

Use the existing layers first:

- Request-local React/Next cache for duplicate work in one request.
- React Query for browser navigation and mutation invalidation.
- CDN/Next.js caching for public storefront responses with a versioned freshness contract.
- Postgres indexes, aggregate RPCs, summary tables, or materialized views for repeated SQL work.

Redis may be justified later for:

- Versioned public storefront menu read models.
- Short-lived stale-tolerant report or HQ analytics snapshots.
- Distributed rate limits, leases, or ephemeral coordination.

Never serve stale payment, active order/KDS, staff shift, inventory acceptance, or subscription entitlement state from a generic Redis result cache.

## Ownership Split

### Website Changes

- Orders/Payments pagination and narrow projections.
- Database-side filters and separate detail loading.
- Consolidated report hooks and query keys.
- Reduced polling where realtime or user refresh is sufficient.
- Request-local, React Query, and Next.js cache discipline.
- Payload and action-duration telemetry.

### Shared Database Migrations

- Batch effective-price/order creation contract.
- Consolidated Location Comparison and HQ dashboard/report RPCs.
- Business-day/timezone standardization.
- Statistics-confirmed indexes only.
- Live RLS and `SECURITY DEFINER` hardening.
- Optional summary tables/materialized views with explicit refresh ownership.

### Shared POS Coordination

- Replace whole-row active-order/order-detail serialization with versioned,
  pre-aggregated explicit payloads.
- Reshape KDS after early location bounding and split floor geometry from
  volatile session status.
- Preserve existing price, order-source, reportability, payment, and business-day contracts.
- Version RPC response changes instead of silently replacing shared payloads.
- Validate report totals across POS and website before rollout.

## Senior Decisions Needed

1. Immediate owner and rollout sequence for the P0 definer-RPC authorization
   remediation, including POS station/user identity and offline compatibility.
2. Immediate owner and rollout sequence for the exposed-table RLS/grant
   containment, including the kiosk number-allocation contract.
3. Owner and review deadline for the 511-signature definer authorization and
   role allowlist, starting with the 465 anonymous-executable signatures.
4. Owner and rollout design for station/PIN-login authorization and plaintext
   PIN removal.
5. One payment/preauthorization version-routing policy across direct, service,
   and offline replay clients.
6. Shared RPC ownership and versioning policy.
7. Authoritative business-day/timezone implementation.
8. Allowed freshness for merchant reports and HQ analytics.
9. Orders/Payments pagination contract and export behavior.
10. Service-role reduction/authorization owner.
11. Background-job batch and retry SLOs.
12. Production statistics retention and access.
13. Canonical shared migration root and owner.
14. RPC retirement and offline-client compatibility window.

## Status

The website source pass executed no SQL. This summary incorporates read-only
staging SQL results manually collected during the POS audit. No fixes,
migrations, or database writes were made. Application-only bounding work may
start after ticket approval; shared RPC replacement requires canonical
migration ownership, controlled workload evidence, and POS/website contract
approval. All stated latency targets remain provisional until Phase 0 records
repeatable p95 baselines.

The 2026-08-03 pass made no application or database changes. The companion
read-only SQL pack now includes additional runtime, Realtime, trigger,
materialized-view, migration-history, connection, lock, and pg_cron evidence
queries. Fresh production exports and controlled client-attributed workload
deltas remain the closure gate for live database recommendations.
