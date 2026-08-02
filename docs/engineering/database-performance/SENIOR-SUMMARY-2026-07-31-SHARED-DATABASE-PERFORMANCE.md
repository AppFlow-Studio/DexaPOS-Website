# Senior Summary - Shared Database Performance Audit

- **Date:** 2026-07-31
- **Scope:** Dexa-POS and DexaPOS-Website query patterns against their shared Supabase database
- **POS evidence revision:** `databse-audit` at `7a6ab3069840de5da926e71a3b05caca3f2700ff`
- **Website evidence revision:** `dika-dev` at `1b53bc0846c149ce4d4b3008b23380a54d3a398b`
- **Database evidence:** staging `dfwqakoyittmrwbqvxgw`; follow-up captured `2026-07-31 10:22:56 UTC`; OpenAPI contract refreshed read-only `2026-08-01 21:15:50 UTC`
- **Status:** Combined static audit complete; staging statistics integrated; controlled workload deltas and production statistics pending
- **Canonical detailed audit:** `docs/engineering/database-performance/AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-COMBINED.md`

## Decision Summary

Redis should not be the first investment. POS and website query paths create
unnecessary database and network work that must be removed first. Shared
staging evidence shows nested order/item payloads consumed 64.7% of the
captured top-25 statement time, while high-frequency Realtime statements
consumed another 21.1%. Dominant nested queries were cache-hot, which supports
query-shape reduction rather than a Redis-first response.

The top-25 total normalizes to approximately 8.87 execution minutes/day over
the 84.87-day statement window. This identifies expensive and frequent query
families but does not prove that PostgreSQL capacity is saturated.

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
- The refreshed deployed OpenAPI contract contains 541 RPC paths, 239 exposed
  relation/view definitions, and 3,855 documented properties. Private catalog,
  RLS-plan, and execution-plan evidence still requires the read-only SQL pack.

## Highest-Impact Findings

1. **POS nested order hydration:** retained active-order and detail shapes
   average approximately 1.20 to 8.45 seconds and dominate measured cost.
2. **Migration ownership gap:** deployed critical RPCs are not reproducible
   from one canonical migration root.
3. **KDS/floor payload shape:** operational state is coupled to repeated nested
   aggregation or stable geometry that should be bounded and separated.
4. **Checkout pricing fan-out:** Online checkout calls `get_effective_price` once per cart item at `supabase/functions/create-online-order/index.ts:741`.
5. **Five duplicate report scans:** Location Comparison starts five queries at `app/dashboard/reports/comparison/hooks/useComparisonData.ts:273`, `:293`, `:313`, `:333`, and `:353`; each repeats merchant resolution and a raw `orders` scan.
6. **Unbounded website lists:** Orders and Payments return nested historical
   graphs without pagination and apply some filters in JavaScript.
7. **HQ raw-row aggregation:** HQ actions download raw rows for sums, counts,
   charts, and alerts, then repeat them through 30-60 second polling.
8. **Unbounded scheduled work:** abandoned-cart and billing jobs fetch all eligible rows and perform per-record work.
9. **Broad RLS-bypass review surface:** 285 static website
   `createServiceRoleClient()` helper-call occurrences across 89 files require
   explicit tenant-scope review; this is not measured production call volume.

## Recommended First Actions

1. Begin application-only quick wins: bounded Orders/Payments pagination,
   explicit projections, database-side filters, and reduced duplicate polling.
2. Declare one canonical migration root and reconcile critical live RPC
   definitions before replacing any shared function.
3. Run controlled POS and website workload deltas and collect production
   read-only statistics.
4. Version and reshape active-order, order-detail, KDS, and floor-plan RPCs.
5. Batch checkout price resolution and replace Location Comparison/HQ raw scans with aggregate RPCs.
6. Add durable batch claiming and limits to abandoned-cart and billing jobs.
7. Review live RLS policies, `SECURITY DEFINER` functions, grants, and index usage before creating any database-hardening migration.

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

1. Shared RPC ownership and versioning policy.
2. Authoritative business-day/timezone implementation.
3. Allowed freshness for merchant reports and HQ analytics.
4. Orders/Payments pagination contract and export behavior.
5. Service-role reduction/authorization owner.
6. Background-job batch and retry SLOs.
7. Production statistics retention and access.
8. Canonical shared migration root and owner.
9. RPC retirement and offline-client compatibility window.

## Status

The website source pass executed no SQL. This summary incorporates read-only
staging SQL results manually collected during the POS audit. No fixes,
migrations, or database writes were made. Application-only bounding work may
start after ticket approval; shared RPC replacement requires canonical
migration ownership, controlled workload evidence, and POS/website contract
approval. All stated latency targets remain provisional until Phase 0 records
repeatable p95 baselines.
