# Shared Supabase/Postgres Performance and Architecture Audit - Combined POS and Website

- **Date:** 2026-07-31
- **Principal-review expansion:** 2026-08-02
- **Repositories and source revisions:**
  - Dexa-POS: branch `databse-audit`, commit `7a6ab3069840de5da926e71a3b05caca3f2700ff`
  - DexaPOS-Website: branch `dika-dev`, commit `1b53bc0846c149ce4d4b3008b23380a54d3a398b`
- **Database evidence:** staging project `dfwqakoyittmrwbqvxgw`; follow-up statistics captured `2026-07-31 10:22:56 UTC`; deployed OpenAPI contract refreshed read-only at `2026-08-01 21:15:50 UTC`
- **Phase:** Investigation and documentation only
- **Database:** Shared by DexaPOS-Website and Dexa-POS
- **Canonical status:** Combined senior-review audit; no performance fixes approved or applied

## 1. Executive Summary

The highest-value work is not adding Redis. Both applications create avoidable
database load through oversized nested order payloads, repeated raw-data scans,
sequential request waterfalls, per-record RPC calls, and high-frequency
Realtime or polling paths. These problems should be corrected before
introducing a distributed cache. The measured staging workload supports this
conclusion: nested order/item payloads dominate statement cost and operate
mostly on cache-hot data.

### Top Five Performance And Architecture Risks

1. **Operational order payloads are too broad.** POS active-order and
   order-detail hydration serialize large nested row graphs. The dominant
   retained statements average approximately 1.2 to 8.45 seconds.
2. **Website history and reporting work is unbounded or repeated.** Orders,
   Payments, Location Comparison, merchant reports, and HQ analytics fetch raw
   or nested data that grows with history and is often filtered or grouped in
   JavaScript.
3. **The deployed database contract is not reproducible from one migration
   root.** Competing SQL histories and missing live definitions make shared RPC
   optimization and disaster recovery unsafe.
4. **Per-record work amplifies checkout and background load.** Checkout resolves
   price once per cart item, while abandoned-cart and billing jobs scan broad
   eligible sets and perform repeated row-level work.
5. **Workload attribution and tenant-scope governance are incomplete.** The
   retained statistics span clients and releases, while 285 static website
   service-role helper-call occurrences bypass RLS when executed and need an
   explicit authorization inventory.

### Top Five Highest-Impact Improvements

1. Bound Orders and Payments lists, move filters into SQL, and return explicit
   list projections instead of nested detail graphs.
2. Add versioned active-order and order-detail read models that aggregate child
   records once and return only fields consumed by POS.
3. Consolidate Location Comparison, merchant reports, and HQ summaries into
   tenant-safe aggregate RPCs while keeping drill-down and exports paged.
4. Batch checkout price resolution and give recurring jobs bounded,
   idempotent claim processing with queue-age visibility.
5. Establish one canonical migration root and controlled workload baselines
   before adding indexes, read replicas, partitioning, or Redis.

Static website evidence does not prove that a candidate index is missing or useful in production. The repository already contains many overlapping historical index definitions, and the POS live inventory disproved initial missing-index hypotheses for `order_item_modifiers` and `order_discounts`. Additional index, RLS, and function conclusions must be validated against the live catalog and `pg_stat_statements` using the companion read-only SQL pack.

## 2. Critical Issues

| ID | Evidence level | Problem | Why it matters | Required action |
| --- | --- | --- | --- | --- |
| CI-1 | Measured, shared attribution | Retained nested order statements average 1.20 to 8.45 seconds and construct broad child graphs | Login, reconnect, order detail, CPU, JSON serialization, and network cost grow with payload width and child cardinality | Capture controlled POS deltas, then ship explicit-column `get_active_orders_v2` and `get_order_details_v2` contracts |
| CI-2 | Confirmed repository/deployed-contract mismatch | Critical functions are split between canonical and historical migration roots, and some live definitions are missing locally | A later migration can overwrite an optimized function with stale behavior; fresh rebuild and disaster recovery are not trustworthy | Declare one migration authority, export live definitions, and reconcile them with forward-only migrations |
| CI-3 | Confirmed static application path | Merchant Orders and Payments fetch unbounded nested history and apply some filters after transfer | Payload, PostgREST join work, memory, and incomplete-default-limit risk grow directly with merchant history | Add bounded pagination, database-side filters, list/detail separation, and explicit export contracts |
| CI-4 | Confirmed static application path | Location Comparison repeats five merchant resolutions and five raw-order scans | One page load duplicates tenant/date work and JavaScript aggregation | Replace the fallback fan-out with one business-timezone aggregate contract |
| CI-5 | Confirmed static application path | Checkout performs one pricing RPC per cart item | A bursty latency-sensitive path creates O(line items) PostgREST/function overhead | Resolve the complete cart set-wise inside the authoritative create-order transaction |
| CI-6 | Confirmed static application path | Abandoned-cart and billing jobs fetch all eligible records and process per record | Backlogs can exceed function duration, cause retry amplification, and leave partial progress | Add bounded claims, idempotency, retry state, continuation, and queue-age metrics |
| CI-7 | Static security surface | Service-role use appears in 285 helper-call occurrences across 89 website files | Missing tenant filters can become both platform-wide scans and data exposure | Inventory every executable caller and centralize merchant/location scope assertions |

No finding above justifies a speculative index migration. Existing modifier and
discount indexes disproved the first missing-index hypothesis; every new or
removed index requires a live plan, usage window, write-cost review, and
constraint-ownership check.

## 3. Optimization Opportunities

### Query And Payload Improvements

- Replace whole-row and nested `select('*')` shapes on hot list paths with
  explicit list, summary, and detail projections.
- Materialize the bounded parent-ID set first, then aggregate children once
  against that set instead of using repeated correlated subqueries.
- Move merchant, location, date, source, payment-method, card-type, and search
  filters into SQL before rows cross the network.
- Separate summary cards/charts from paged drill-down rows and capped exports.
- Keep typed sort and filter fields typed until the final JSON projection.

### Indexing Opportunities

- Validate composite merchant/location/time and source/time index families
  against current production predicates and query plans.
- Use partial indexes only where the query predicate exactly matches a stable,
  selective operational subset.
- Consider trigram search only after search telemetry proves that leading
  substring search is operationally important.
- Remove overlapping indexes only after a clean usage window and confirmation
  that no constraint owns the index.
- Treat BRIN, partitioning, and archive strategies as large-table options, not
  fixes for the current staging row counts.

### Realtime Opportunities

- Attribute Realtime statement deltas to controlled POS and website workflows
  before changing publications or subscriptions.
- Remove confirmed polling duplication where Realtime already provides
  invalidation, while retaining a slower disconnect/recovery safety interval.
- Prefer compact order-level invalidation events over repeated broad row
  payloads when correctness permits.
- Preserve transactional Postgres state as the authority for KDS, payments,
  shifts, inventory acceptance, and subscriptions.

### Cache Opportunities

- Use request-local React/Next caching for duplicate work inside one render.
- Use React Query for browser reuse and mutation-driven invalidation.
- Use CDN/Next.js caching for public storefront read models with an explicit
  menu/config version and freshness contract.
- Use summary tables or materialized views for measured stale-tolerant
  analytics before introducing a general Redis query cache.
- Reconsider Redis only for repeated cross-instance stale-tolerant reads,
  distributed rate limits, or short-lived coordination after query work is
  fixed.

## 4. Advanced Recommendations

### Separate Operational And Analytical Read Models

Keep payment, order, KDS, shift, and entitlement writes in transactional
Postgres. Build narrow operational read models for POS/KDS and separate
stale-tolerant daily/hourly summaries for merchant and HQ analytics. This
prevents dashboards from repeatedly scanning and transferring OLTP facts while
preserving authoritative drill-down paths.

### Add A Transactional Outbox Before Event-Driven Expansion

If background processing grows, write domain state and an outbox event in the
same transaction. Workers claim events in bounded batches, use stable
idempotency keys, record attempts, and expose queue age. Do not publish a
best-effort external event before the transaction commits, and do not move
payment correctness out of Postgres.

### Use Read Replicas Only For Explicitly Stale-Tolerant Reads

Supabase read replicas can offload analytical GET/RPC traffic, but replication
is asynchronous and Realtime cannot use a replica endpoint. Consider replicas
only after report queries are bounded and measured, and route payment, active
order, KDS, shift, and read-after-write workflows to the primary.

### Define Partitioning Triggers, Not A Premature Partition Migration

Current staging tables are small. Define review triggers based on relation
size, retention cost, vacuum behavior, and partition-prunable query patterns.
Likely future candidates are append-heavy audit/history/event tables, but only
after production plans show that pruning or retention operations would help.

### Preserve A Natural Tenant Boundary

Require merchant and location scope in list/report contracts and index design.
If horizontal isolation is eventually required, a merchant or merchant-group
boundary is more defensible than arbitrary row ranges because it keeps most POS
transactions and reporting inside one tenant group. Sharding is not justified
at current scale and would add cross-shard transaction and operational risk.

### Validate Connection Behavior Before Scaling Compute

Inventory persistent, serverless, Edge Function, PostgREST, Realtime, and
service-role connection patterns. Use the Supabase transaction pooler for
transient serverless SQL clients where applicable, but do not change pooling
from static source assumptions. Capture active/backend connection peaks and
wait events first.

## 5. Big Tech Patterns And Dexa Applicability

The goal is to adopt proven principles, not copy infrastructure designed for a
different workload or claim private knowledge of Toast, Square, Netflix, or
YouTube internals.

| Pattern | Public precedent | Dexa adaptation now | Defer until measured need |
| --- | --- | --- | --- |
| Idempotent mutation APIs | [Square documents stable idempotency keys for safe payment retries](https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency) | Require stable request keys and semantic replay behavior for payments, job claims, webhooks, and external provider calls | None; this is correctness work |
| Tenant/entity locality | [Square described keeping critical money operations inside an entity group before sharding Cash App](https://medium.com/square-corner-blog/sharding-cash-10280fa3ef3b) | Keep merchant/location scope explicit and preserve single-transaction payment/order invariants | Physical sharding until size or contention proves it |
| Query gateways, limits, and pooling | [Vitess, originally used for YouTube traffic, emphasizes routing, pooling, query limits, and later sharding](https://vitess.io/docs/25.0/overview/whatisvitess/) | Enforce bounded contracts, explicit tenant routing, connection discipline, and protection from pathological queries | A new distributed database layer |
| Bounded queues and safe retries | [AWS recommends idempotent APIs and controlled retries to avoid duplicate effects and overload](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) | Claim small batches, use idempotency, retry/backoff, queue age, and dead-letter/manual recovery semantics | A large messaging platform until job load requires it |
| Read/write workload separation | [Supabase read replicas offload stale-tolerant analytical reads but replicate asynchronously](https://supabase.com/docs/guides/platform/read-replicas) | Keep transactional reads on primary; consider report/HQ replicas after query optimization | Replica spend before primary query shapes are fixed |
| Evidence-led indexing | [Supabase recommends query-plan validation and warns about over-indexing](https://supabase.com/docs/guides/database/query-optimization) | Approve indexes only from live predicates, plans, selectivity, and write cost | Blanket indexing from static scans |
| Partition large append-only histories | [PostgreSQL documents partitioning benefits when queries touch a small subset of a large table](https://www.postgresql.org/docs/current/ddl-partitioning.html) | Define size/retention thresholds for audit and event histories | Partitioning current small staging relations |
| Understand Realtime database cost | [Supabase Realtime streams WAL through replication slots and subscription processing](https://supabase.com/docs/guides/realtime/architecture) | Measure publication, subscription, payload, and polling amplification together | Assuming WebSocket count alone explains database cost |

## 6. Prioritized Action Plan

### Immediate: Bounds, Evidence, And Ownership

1. Revalidate all source references against the post-SDK-rollback POS branch and
   current website branch.
2. Add bounded Orders and Payments pagination, explicit list projections, and
   database-side filters.
3. Reduce confirmed duplicate polling and pause nonessential hidden-tab reads.
4. Run controlled POS and website workload deltas and collect approved
   production read-only statistics.
5. Declare one canonical migration root and export missing live critical RPC
   definitions.
6. Create an executable inventory of service-role callers and tenant checks.

### Mid-Term: Version Shared Contracts

1. Add explicit-column active-order and order-detail vNext RPCs.
2. Split floor-plan geometry from session status and reshape KDS after early
   tenant/status bounding.
3. Batch checkout pricing inside the authoritative order transaction.
4. Consolidate Location Comparison, merchant reports, and HQ summaries.
5. Add bounded/idempotent claim processing to abandoned-cart and billing jobs.
6. Add request duration, response bytes, request-count, query-family, and queue
   age telemetry.

### Long-Term: Read Models And Capacity Options

1. Add maintained summary tables or materialized views for measured
   stale-tolerant analytics.
2. Reassess read replicas after analytical contracts are bounded.
3. Reassess table partitioning when production size, retention, and plans meet
   an agreed trigger.
4. Reassess Redis only for a measured cross-instance cache or coordination
   workload with explicit TTL, invalidation, tenant keys, and fallback.
5. Consider tenant isolation or sharding only after a single optimized primary,
   replicas, and archival/partition strategies no longer meet measured SLOs.

The ticket-sized execution sequence, dependencies, migration requirements, and
definitions of done are maintained in
`docs/engineering/database-performance/IMPLEMENTATION-BACKLOG-2026-08-01-SHARED-DATABASE-PERFORMANCE.md`.

## 7. Estimated Performance Gains

These are structural estimates, not promised end-to-end latency improvements.
They must be replaced by measured before/after values using identical fixtures.
Percentages must not be added together because they affect overlapping work.

| Change | Estimated structural gain | End-to-end latency claim | Confidence and basis |
| --- | --- | --- | --- |
| Consolidate Location Comparison | Approximately 90% fewer application/database round trips for that page shape, from up to 10 to 1 | Not yet measured | High confidence in request-count reduction from static call graph; latency depends on aggregate RPC plan |
| Batch checkout pricing | For 10 lines, 90% fewer pricing RPCs; for 50 lines, 98% fewer; for one line, no request-count reduction | Not yet measured | High confidence in N-to-1 call reduction; provider/tax/order-write time remains |
| Paginate Orders and Payments | Work becomes bounded by page size; expected 50-95% payload reduction for merchants with histories materially larger than one page | Not yet measured | Medium confidence; exact reduction depends on current history and nested detail size |
| Explicit active-order/detail payloads | Provisional target of at least 40% fewer response bytes | Provisional p95 target below 500 ms for the 200-order fixture | Low-to-medium until controlled current-client attribution and payload fixtures exist |
| Aggregate HQ and merchant reports | Expected 70-99% fewer fact rows transferred when many raw rows become tens of grouped rows | Not yet measured | Medium confidence in row-transfer reduction; SQL execution gain requires plans |
| Remove confirmed polling duplication | Expected 50-90% fewer requests on only the affected components when Realtime becomes primary and polling becomes a slow fallback | Not yet measured | Low until per-query-key request telemetry confirms duplication |
| KDS rewrite | Unknown; current retained mean is approximately 98.91 ms | Provisional warm p95 below 150 ms and stress p95 below 300 ms | Low; optimize correctness-preserving shape only after p95/stress evidence |
| New indexes | Unknown and possibly negative for write-heavy paths | None | No estimate until production plans and write cost justify a specific index |
| Redis | Zero planned gain in initial waves because it is intentionally deferred | None | Correctness and invalidation cost outweigh unproven benefit today |

## 8. Scale Readiness: 10x And 100x Model

This is a linear data-volume thought experiment, not a load test. It does not
model concurrency, hardware, cache hit rate, tenant skew, provider latency, or
write amplification.

| Relation | Staging observation | Illustrative 10x | Illustrative 100x |
| --- | ---: | ---: | ---: |
| `orders` | 6,539 | 65,390 | 653,900 |
| `order_items` | 11,127 | 111,270 | 1,112,700 |
| `order_item_modifiers` | 8,460 | 84,600 | 846,000 |
| `order_payments` | 5,100 | 51,000 | 510,000 |
| `audit_logs` | 14,769 | 147,690 | 1,476,900 |

### At 10x

- Unbounded website lists and raw-report transfer become materially worse even
  though the absolute database remains moderate.
- The immediate design requirement is bounded tenant/time queries, explicit
  payloads, aggregate reports, and stable job batches, not sharding.
- Index and autovacuum decisions should be driven by production plans and
  write rates at this scale.

### At 100x

- Raw JavaScript aggregation and nested history transfer are no longer
  acceptable report architectures.
- Append-heavy history may justify partitioning or archival if queries and
  retention align with a partition key.
- Stale-tolerant reporting may justify summary tables and read replicas.
- Tenant skew, peak connections, WAL/Realtime volume, queue age, and primary
  write saturation become required capacity signals.
- Sharding remains a last-stage decision because it changes transaction,
  consistency, migration, and operations semantics.

### Breaking Points To Measure

- p95/p99 latency and timeout rate by operational RPC.
- Payload bytes and rows returned versus rows rendered.
- Database CPU, memory, IOPS, WAL volume, locks, waits, and backend connections.
- Realtime publication volume, subscriber count, delivered bytes, and
  end-to-end event delay.
- Job arrival rate, processing rate, oldest queue age, retry count, and poison
  record behavior.
- Largest-tenant share of rows, calls, write rate, and report time.

## 9. Audit Method, Evidence Tiers, And Specialist Lenses

This audit reviewed:

- POS hooks, services, stores, offline/recovery paths, and direct PostgREST/RPC
  access in `C:\Users\Ali DIka\Desktop\Dexa-POS`.
- Server actions and Supabase clients under `app/` and `lib/`.
- Dashboard and HQ reporting pages, hooks, and actions.
- Public storefront and checkout Edge Functions.
- API routes, webhooks, scheduled Edge Functions, and background processing.
- Browser realtime subscriptions and polling behavior.
- Migration definitions for indexes, RLS policies, `SECURITY DEFINER`, and `search_path` usage.
- Existing React Query and Next.js caching behavior.
- The POS audit, read-only collectors, deployed staging contract inventory, and
  captured staging statistics.

The website source-audit pass executed no SQL against Supabase. This combined
report incorporates read-only SQL results that were manually collected from
staging during the POS audit. No database writes, application changes,
migrations, package changes, or lockfile changes were made by either audit.

A live Supabase MCP connector and independent sub-agent runtime were not
available during the 2026-08-02 expansion. The review therefore applies eight
independent specialist checklists in one coordinated analysis; it does not
claim fresh SQL plans, row reads, write benchmarks, or independently executed
agent conclusions. A direct read-only `GET /rest/v1/` OpenAPI refresh was
completed with the existing ignored staging credential; it returned contract
metadata only and performed no table read, RPC execution, or mutation.

### Discovery Completeness

- The deployed PostgREST surface is mapped at the contract level: 239 exposed
  relation/view definitions, 3,855 properties, and 541 RPC paths.
- The repository SQL and source-call inventories cover schema history, hot
  functions, indexes, policies, and application access patterns.
- OpenAPI does not expose private schemas, live index usage, all foreign-key
  semantics, policy execution plans, triggers outside the API contract, or
  planner/runtime statistics. The read-only SQL pack remains required for that
  catalog layer.
- Historical migration text cannot be treated as the live schema because many
  functions and policies are replaced across competing roots.

### Evidence Tiers

| Tier | Meaning | Permitted conclusion |
| --- | --- | --- |
| Measured | Read-only staging statistics or captured deployed contract | Rank retained query families and state observed means/calls/rows for the captured window |
| Confirmed static | Exact repository call path or SQL definition at the pinned revision | State that the code path exists and describe its structural request/payload behavior |
| Inferred | Reasoned consequence not isolated in production | Present as a hypothesis requiring controlled measurement |
| Proposed | Target architecture, SLO, index, cache, or capacity option | Present as a decision or experiment, never as an achieved gain |

### Specialist-Lens Synthesis

| Lens | Primary conclusions |
| --- | --- |
| Database architecture | Establish one migration authority; preserve transactional invariants; separate operational and analytical read models |
| Database performance | Fix broad nested payloads and repeated scans before speculative indexes or infrastructure |
| Backend systems | Consolidate request waterfalls, batch per-record work, and centralize contract/version ownership |
| Realtime and streaming | Attribute WAL/change-feed cost, remove confirmed amplification, and retain Postgres authority |
| Scalability and infrastructure | Optimize one primary first; define evidence gates for replicas, partitioning, Redis, and eventual tenant isolation |
| Security and RLS | Measure live policy plans and inventory service-role tenant checks before policy rewrites |
| Client data access | Bound lists, use explicit columns, separate summary/detail/export, and instrument response bytes |
| Benchmark and research | Apply idempotency, bounded queues, read/write separation, locality, and evidence-led scaling without copying premature distributed infrastructure |

### Measurement Coverage And Gaps

| Requested measure | Current coverage | Required next evidence |
| --- | --- | --- |
| Read latency | Mean/call data exists for retained statement families; application p95/p99 is missing | Controlled POS and website traces with request/query attribution |
| Write latency | Not captured | Payment/order/job staging fixtures with safe transaction timing and no production mutation benchmarking |
| Realtime latency | Database-side change-feed call/time exists; end-to-end event delay is missing | Timestamped commit-to-client delivery telemetry by channel and payload size |
| RLS cost | Static policy corpus only | Role-realistic read-only plans for owner, manager, limited staff, HQ, and service role |
| Connections and waits | Not captured in the returned audit grids | Peak `pg_stat_activity`, wait events, pooler clients/backends, and compute metrics |
| 10x/100x behavior | Structural thought experiment only | Repeatable load fixtures with tenant skew, concurrency, and queue arrival rates |
| Production workload | Not available | Approved production read-only statistics and observation window |

## Shared Database Evidence From the POS Audit

The sibling artifact `Dexa-POS/tasks/database-performance-architecture-audit.md`
contains staging statistics captured on 2026-07-31, including a follow-up
snapshot at 2026-07-31 10:22:56 UTC. This combined audit treats those values as
shared-database evidence while avoiding attribution of a normalized SQL
statement to one client until a controlled workload delta is captured.

### Staging Scale

| Relation | Approximate rows |
| --- | ---: |
| `orders` | 6,539 |
| `order_items` | 11,127 |
| `order_item_modifiers` | 8,460 |
| `order_payments` | 5,100 |
| `order_status_history` | 10,698 |
| `payment_events` | 2,140 |
| `audit_logs` | 14,769 |
| `table_sessions` | 1,410 |
| `staff_shifts` | 128 |

### Measured Workload Signals

- The manual `pg_stat_database` check returned `stats_reset = NULL` on
  2026-07-31. PostgreSQL therefore provides no reset boundary for these
  cumulative counters. They are valid for relative workload ranking, but not
  for calculating per-day rates or attributing cost to a specific deployment.
- At the 2026-07-31 observation, the database server had been running for 114
  days, 21 hours, and 50 minutes. `pg_stat_statements` had a separate reset at
  2026-05-07 23:24:09 UTC, giving the statement sample a known 84.87-day
  window.
- `pg_stat_statements_info.dealloc = 9` means statement entries were
  deallocated after the extension reached its tracked-statement capacity.
  Low-frequency statement history may therefore be incomplete; the results
  should be used to prioritize dominant retained queries, not as an exhaustive
  total of every query executed.
- The top 25 captured statements consumed 12.54 database-hours during that
  84.87-day statement-statistics window.
- Normalized only for scale, that is approximately 8.87 minutes of execution
  time per day across the retained top 25. Nested order payloads account for
  approximately 3.27 minutes/day, nested item/modifier payloads 2.47
  minutes/day, and Realtime change-feed statements 1.87 minutes/day.
- These cumulative totals identify expensive and frequent query families; they
  do not by themselves prove database CPU saturation or exhausted capacity.
- Ten nested order-payload statements accounted for 4.63 hours, or 36.9% of the top-25 cost.
- Two nested item/modifier statements accounted for 3.49 hours, or 27.8%.
- Two Realtime change-feed statements made about 1.1 million calls and accounted for 2.64 hours, or 21.1%.
- The most expensive nested order shape ran 1,066 times, averaged 8,447.65 ms, and consumed about 157,104 shared buffers per call.
- A nested `order_items` plus `order_item_modifiers` shape ran 7,421 times and averaged 1,195.43 ms despite filtering one order.
- `get_kds_tickets_v2` averaged 98.91 ms over 3,978 calls; it is cumulative-load work but not the slowest mean-latency path.
- `track_io_timing` was off. Dominant nested statements reported high shared-buffer hits and no shared-block reads, which points toward CPU/query-shape/JSON aggregation cost rather than storage latency or a Redis miss.

### Measured Relation and Index Signals

- `order_item_modifiers` recorded 6.83 million sequential scans and 47.9 billion sequential rows examined.
- `order_discounts` recorded 5.11 million sequential scans on a very small relation.
- `orders`, `kds_item_status`, and `table_sessions` also show material sequential-scan volume.
- The relevant `order_item_modifiers(order_item_id)` and active `order_discounts(order_id)` indexes already exist and are heavily used. More indexes are not the first fix for those statement families.
- Probable duplicate/overlapping indexes include the two location/created-at order indexes and duplicate merchant/order-number uniqueness definitions. Removal still requires a clean usage window and constraint-ownership review.
- Dead tuples were approximately 16.5% for `order_items`, 13.2% for `order_payments`, and 12.2% for `orders` at collection time. Table-specific autovacuum tuning is a review item, not an immediate change.

### Combined Interpretation

The live statistics validate the website priorities that reduce nested order graphs and repeated raw fact scans. They do not prove that every expensive normalized statement came from the website. Run the POS workload-delta collector around website-only QA, or capture application-name/request telemetry, before assigning statement ownership.

## Static Inventory

The following counts are static code occurrences outside migrations, not production call volume:

| Pattern | Occurrences | Interpretation |
| --- | ---: | --- |
| `.from(...)` | 2,944 | Large direct PostgREST access surface |
| `.rpc(...)` | 328 | Large shared function contract surface |
| `select('*')` patterns | 251 | Payload review required; not every occurrence is a defect |
| `.range(...)` | 25 | Pagination is uncommon relative to read volume |
| `.limit(...)` | 103 | Many reads rely on implicit PostgREST limits or date filters |
| `.channel(...)` | 7 | Realtime surface is small and inspectable |
| Service-role helper-call occurrences | 285 in 89 files | Static RLS-bypass review surface; not measured production call volume |

The POS repository static inventory found:

| Pattern | Occurrences | Interpretation |
| --- | ---: | --- |
| Literal `.rpc(...)` names | 152 names across 216 calls | Large shared RPC contract and version-retirement surface |
| Direct `.from(...)` access | 71 relations across 386 calls | Direct PostgREST paths need bounded payload review |
| Direct `orders` access | 52 sites | Order hydration and fallback ownership must be traced |
| Direct `.select('*')` | 26 sites | Explicit columns should replace wide reads on hot paths |

Repository SQL contains approximately 903 `SECURITY DEFINER` references, 683 `search_path`-pinning references, and 486 policy statements. These counts include historical/replaced function definitions and cannot identify the live database state. The catalog query pack is authoritative.

### Shared Contract and Migration Inventory

- The 2026-08-01 OpenAPI refresh returned approximately 2.30 MB of contract
  metadata: 781 paths comprising 541 RPC paths, 239 relation/view endpoints,
  and the API root. It contained 239 schema definitions with 3,855 exposed
  properties.
- Twelve `process_payment` generations, from v6 through v17, remain exposed,
  alongside several other versioned payment, refund, order, and report RPC
  families.
- The POS repository has 39 SQL files under `supabase/migrations` and 333 files
  under `utils/supabase/migrations`.
- Runtime-critical definitions including `get_active_orders_v1`,
  `get_order_details`, and `get_location_stations_with_status` exist only under
  the historical POS SQL root.
- Deployed functions such as `get_floor_plan_status`,
  `get_menu_for_location`, and `process_payment_v17` were not found in the
  canonical POS migration root inspected by the source audit.
- A fresh database built only from the presumed canonical root cannot yet be
  assumed to reproduce the deployed shared contract.

This is a correctness and performance-governance blocker for shared function
replacement and deployment. It does not block independent application-only
quick wins such as bounded pagination, explicit projections, or reduced
polling. RPC optimization is unsafe when a later deployment can replace a
function with an older body from a competing migration root.

## Database Access Architecture

### Supabase Clients

| Client | File | Access model | Performance and architecture concern |
| --- | --- | --- | --- |
| Public/browser client | `lib/supabase/client.ts:5` | Publishable key; public or RLS-protected reads | Browser query frequency and realtime subscriptions affect PostgREST directly |
| Authenticated browser client | `lib/supabase/client.ts:15` | Clerk token forwarded to Supabase | RLS policy cost is paid per matching row |
| Authenticated server client | `lib/supabase/server.ts:4` | Publishable key plus Clerk access token | Preferred tenant-aware server path when policies/RPC authorization are correct |
| Service-role client | `lib/supabase/service-role.ts:8` | Bypasses RLS | Every caller must authenticate and scope merchant/location explicitly |
| Edge Function service clients | `supabase/functions/*/index.ts` | Usually service role | Must enforce scope in function code or called RPCs |

### Website Surfaces

- Merchant dashboard actions under `app/dashboard/actions/`.
- HQ and merchant-management actions under `app/manage/actions/`.
- Public online-store actions under `app/sites/`.
- Next.js API routes under `app/api/`, including NMI webhooks, internal notification routes, invoice PDF, support attachment, CMS, and OrderOut resync.
- Edge Functions under `supabase/functions/`, including checkout, payment, receipts, billing, Clerk webhooks, OrderOut relay, notifications, and abandoned carts.
- React Query hooks under `app/dashboard/hooks/`, `lib/queries/`, and feature folders.
- Realtime channels for order status, QR sessions, support unread state, station/device state, and receipt templates.

### Largest Static Query Hotspots

These files have the highest direct table/RPC density and deserve targeted production tracing:

| File | Approximate access density | Primary concern |
| --- | ---: | --- |
| `app/manage/actions/admin-merchant/menus.ts` | 113 | Large menu graph and override reads |
| `app/manage/actions/hq-platform/analytics.ts` | 107 | Platform-wide raw fact aggregation |
| `app/dashboard/actions/unified-staff.ts` | 88 | Identity, profile, membership, and location joins |
| `app/dashboard/actions/orderout.ts` | 77 | Integration state and reconciliation workflows |
| `app/dashboard/actions/tips.ts` | 67 | Distribution and staff/payment joins |
| `app/dashboard/actions/item-assignments.ts` | 54 | Menu/category assignment graph |
| `app/dashboard/actions/inventory.ts` | 52 | Inventory and location override graph |
| `supabase/functions/clerk-webhooks/index.ts` | 50 | Provisioning workflow and repeated entity checks |
| `app/dashboard/actions/categories.ts` | 50 | Category and assignment workflows |
| `app/dashboard/online-ordering/actions.ts` | 49 | Store configuration and payment setup |

## Shared and POS Findings

### P0 - Establish One Authoritative Migration History

**Evidence**

- The POS repository has two substantial SQL roots: 39 files under
  `supabase/migrations` and 333 files under `utils/supabase/migrations`.
- Several deployed or runtime-critical functions are absent from the presumed
  canonical root or exist only in the historical root.
- Staging exposes hundreds of RPCs and multiple live generations of payment,
  refund, order, and reporting functions.

**Impact**

A performance rewrite can silently regress correctness if another branch later
deploys an older complete function body. Fresh-database builds and disaster
recovery also cannot be trusted until the live contract is reproducible.

**Recommendation**

1. Declare one deployable migration root for the shared database.
2. Export live definitions of runtime-critical functions.
3. Reconcile missing definitions with forward-only migrations.
4. Add CI that builds an empty database and verifies required signatures.
5. Treat legacy SQL roots as reference-only.

This governance work precedes shared RPC rewrites and index cleanup.

### P0 - Attribute Current Workload Before Removing Compatibility Paths

**Evidence**

- The database relation counters have no reset timestamp.
- The statement window is known, but it spans 84.87 days and nine statement
  deallocation events.
- POS code prefers `get_active_orders_v1`, but retains a deep PostgREST fallback
  when the RPC is unavailable at
  `Dexa-POS/hooks/pos/useOrdersQuery.ts:77` through `:125`.

**Impact**

Captured normalized statements can include old deployments, current POS,
website, Edge Functions, or background jobs. Removing a compatibility path
without a controlled workload delta risks breaking an active client; retaining
an accidentally active fallback preserves multi-second queries.

**Recommendation**

- Run the POS delta collector immediately before and after one controlled POS
  workflow.
- Run the website SQL pack around isolated website QA.
- Map changed query IDs to exact current call sites before retirement.
- Add application/request attribution where Supabase supports it.

### P1 - Replace Whole-Row Active-Order and Order-Detail Serialization

**Evidence**

- POS bootstrap calls `get_active_orders_v1` at
  `Dexa-POS/hooks/pos/useOrdersQuery.ts:80` with a business-day bound and hard
  limit, which is directionally correct.
- Its compatibility fallback selects `orders.*`, nested `order_items.*`, nested
  `order_item_modifiers.*`, payments, discounts, station, and staff data at
  `Dexa-POS/hooks/pos/useOrdersQuery.ts:100`.
- The live RPC definition inspected by the POS audit also serializes whole rows
  with `to_jsonb(o.*)`, `to_jsonb(oi.*)`, and `to_jsonb(oim.*)` and performs
  correlated child aggregates.
- The slowest captured nested order query averaged 8.45 seconds; the nested
  item/modifier query averaged 1.20 seconds.

**Impact**

Whole-row serialization couples payloads to schema growth, fetches unused JSON
or metadata columns, repeats child aggregation, and creates significant CPU and
network cost even when pages are cached in PostgreSQL.

**Recommendation**

- Build `get_active_orders_v2` and `get_order_details_v2` with explicit columns.
- Materialize the bounded order ID set first.
- Aggregate items, modifiers, payments, and discounts once against those IDs.
- Preserve the current business-day and 200-order bounds.
- Consider header-first bootstrap and on-demand details for rows not visible.
- Keep old signatures through a measured compatibility window.

**Provisional target (baseline and senior approval required)**

- Active-order bootstrap p95 below 500 ms for the 200-order fixture.
- At least 40% payload reduction.
- No child-table full scan and no behavioral payload regression.

### P1 - Reshape KDS Before Caching It

**Evidence**

- The live POS KDS calls are at `Dexa-POS/stores/useKDSStore.ts:1600` and
  `Dexa-POS/stores/useKDSStore.ts:1764`.
- `get_kds_tickets_v2` ran 3,978 times, consumed 393,445 ms, and averaged
  98.91 ms.
- Static SQL review found repeated acknowledgement predicates, nested modifier
  aggregation, JSON construction before sorting, and insufficiently early
  location bounding.
- `kds_item_status` averaged more than 5,300 rows per sequential scan.

**Impact**

The mean latency is not the worst measured path, but KDS is operationally hot,
frequency-sensitive, and correctness-sensitive. Redis would create stale-ticket
risk without removing the expensive query shape.

**Recommendation**

Create a compatible vNext RPC that:

1. Filters location and visible order statuses first.
2. Joins items only to scoped order IDs.
3. Aggregates acknowledgement state once per item.
4. Aggregates modifier JSON once per item.
5. Sorts typed fields before converting the final payload to JSON.
6. Preserves display routing, void/refund notices, rush priority, Done
   retention, and server-name behavior.

**Provisional target (baseline and senior approval required)**

- Warm p95 below 150 ms for normal locations.
- Stress p95 below 300 ms with 100 visible tickets.
- No temporary-file writes or unrelated-location item scans.

### P1 - Split Floor-Plan Geometry From Session State

**Evidence**

- POS calls `get_floor_plan_status` at
  `Dexa-POS/services/floorPlanService.ts:80`.
- The same service fetches all active `floor_plan_objects` with `select('*')`
  at `Dexa-POS/services/floorPlanService.ts:106`.
- Existing measurements place a full floor refresh around 835 to 1,999 ms and
  approximately 215 KB.
- `floor_plan_objects` and `table_sessions` both show material scan volume.

**Impact**

Rarely changing geometry is repeatedly coupled to volatile table/session
state, causing oversized reconciliation payloads.

**Recommendation**

- Create a versioned geometry/config RPC that can use the POS local cache.
- Create a compact session/status RPC for active reconciliation.
- Retain a composed full snapshot only for cold start and recovery.
- Return explicit client-consumed fields rather than whole rows.

**Provisional target (baseline and senior approval required)**

- Warm geometry cache hit without a large database response.
- Session/status p95 below 100 ms.
- Cold full snapshot p95 below 400 ms and payload below 75 KB.

### P1 - Make Shared Reporting Predicates Sargable

**Evidence**

- Shared reporting functions normalize already canonical `order_source` values
  inside row predicates.
- Payment date filters use expressions such as
  `COALESCE(captured_at, initiated_at, order.created_at)`.
- Admin search uses leading-wildcard substring predicates.
- Business-day/channel reports can compose one aggregate and then perform an
  additional channel scan.

**Impact**

Functions and multi-column expressions in predicates can prevent ordinary
B-tree indexes from supporting filters. Website report fan-out then multiplies
that work.

**Recommendation**

- Compare validated canonical source values directly.
- Define one authoritative reporting timestamp or use separate sargable
  branches for fallback timestamps.
- Add trigram indexes only if search telemetry proves value.
- Use summary tables or materialized views only for measured, stale-tolerant
  historical aggregates.
- Standardize one merchant-timezone business-day contract shared by POS and
  website.

### P2 - Attribute Realtime Load and Reduce Confirmed Amplification

**Evidence**

- Two Realtime change-feed statements made approximately 1.1 million calls and
  consumed 21.1% of the captured top-25 statement time.
- The POS already coalesces some client refreshes, and inspected website
  subscriptions clean up channels, but several surfaces combine Realtime with
  polling.

**Impact**

Low per-call latency becomes material through frequency. However, the retained
statements are shared infrastructure evidence and are not yet attributable to
duplicate POS or website subscriptions. Row-level trigger broadcasts may also
emit repeated payloads during bulk logical changes; this remains a hypothesis
until controlled workload deltas confirm it.

**Recommendation**

- Inventory live triggers, publications, channel counts, and payload sizes.
- Detect duplicate broadcasts and unnecessary `REPLICA IDENTITY FULL` use.
- Prefer one compact order-level signal per logical transaction where safe.
- Keep payment and order truth transactional in PostgreSQL.

### P2 - Measure High-Churn Table Maintenance

**Evidence**

- Dead-row ratios at collection time were approximately 16.5% for
  `order_items`, 13.2% for `order_payments`, and 12.2% for `orders`.
- Automatic vacuum timestamps were stale for some high-churn staging tables.

**Recommendation**

- Collect table sizes, write rates, vacuum duration, and dead-tuple growth over
  a representative window.
- Tune table-specific autovacuum thresholds only after that evidence.
- Do not use `VACUUM FULL` as routine remediation because it locks and rewrites
  the table.

### P2 - Retire RPC Versions Using Cross-Repository Evidence

Function count does not directly slow a single query, but version sprawl makes
authorization review, migration safety, and optimization ownership harder.
Before retiring a function:

1. Search POS, website, Edge Functions, webhooks, jobs, and offline replay.
2. Confirm zero calls over an agreed statistics window.
3. Revoke execute and monitor before dropping it later.
4. Keep rollback definitions outside the forward migration sequence.

## Website Findings

### P1-W1 - Checkout Performs One Pricing RPC Per Cart Item

**Evidence**

- `supabase/functions/create-online-order/index.ts:736` starts canonical price resolution.
- `supabase/functions/create-online-order/index.ts:741` calls `get_effective_price` inside a `Promise.all` over the cart.
- `supabase/functions/create-online-order/index.ts:754` and `supabase/functions/create-online-order/index.ts:766` perform two tax-rate fallback queries.

**Impact**

A cart with N line items generates N pricing RPCs before order creation. Parallel execution reduces wall time relative to serial calls but still amplifies PostgREST requests, connection pressure, parsing, and function setup. Checkout is latency-sensitive and bursty.

**Recommendation**

- Add a shared, tenant-safe batch price resolver that accepts the complete cart and returns one row per item.
- Prefer resolving prices set-wise inside the authoritative create-order transaction so validation and persistence use the same snapshot.
- Replace the two tax-rate reads with one deterministic SQL/RPC rule.
- Preserve the existing five-level price cascade contract for POS and website callers.

**Ownership:** Shared database migration plus website Edge Function update. POS contract review required.

### P1-W2 - Location Comparison Repeats the Same Raw Orders Scan Five Times

**Evidence**

- `app/dashboard/reports/comparison/hooks/useComparisonData.ts:273`, `:293`, `:313`, `:333`, and `:353` create five independent queries.
- Each calls a direct-orders fallback action at `app/dashboard/actions/location-analytics-fallback.ts:38`, `:132`, `:228`, `:345`, or `:428`.
- Each fallback resolves the same merchant independently through `getMerchantId` at `app/dashboard/actions/location-analytics-fallback.ts:19`.
- Pre-aggregated RPC alternatives already exist in `app/dashboard/actions/location-analytics.ts:196`, `:229`, `:263`, `:297`, and `:330`.

**Impact**

One page load creates five merchant lookups and five date-range `orders` reads, then repeats grouping in JavaScript. React Query cannot deduplicate the work because each result has a distinct query key and action.

**Recommendation**

- Replace the fallback fan-out with one consolidated comparison RPC returning line chart, daypart, summary, hourly, and ranking payloads.
- Alternatively, restore the maintained aggregate RPC path if its freshness and tenant contract are valid.
- Use `location_daily_stats` and `location_hourly_stats` or an equivalent summary table rather than five raw fact scans.
- Keep one request and one common business-day/timezone boundary.

**Expected shape improvement:** Up to ten application round trips become one; the same raw order range is no longer transferred five times.

**Ownership:** Website hook/action refactor plus shared aggregate RPC decision.

### P1-W3 - Merchant Orders List Fetches an Unbounded Nested Order Graph

**Evidence**

- `app/dashboard/actions/order.ts:16` defines `GetOrders`.
- `app/dashboard/actions/order.ts:45` embeds `order_items` and modifiers.
- `app/dashboard/actions/order.ts:51` embeds all `order_payments` columns.
- `app/dashboard/actions/order.ts:121` orders results but does not apply `.range()` or `.limit()`.
- `app/dashboard/actions/order.ts:220` applies payment-method filtering after retrieval.
- A fallback fetch retrieves missing nested items and modifiers for all missing order IDs.

**Impact**

History size directly increases response payload, PostgREST join work, server memory, and client transformation time. A broad payment filter still downloads records that are later discarded. Large histories can hit PostgREST row limits and produce incomplete UI without an explicit pagination contract.

**Recommendation**

- Introduce cursor or offset pagination with a bounded default page size.
- Return a narrow order-list projection; load items, modifiers, refunds, and payments only for order detail.
- Move payment-method and text filtering into a SQL/RPC list contract.
- Avoid large fallback `.in(order_id, ...)` reads by making the list RPC deterministic.

**Ownership:** Website action/hook/UI; a shared list RPC is preferred if POS or HQ needs the same contract.

### P1-W4 - Payments List Fetches an Unbounded Nested Payment Graph

**Evidence**

- `app/dashboard/actions/payments.ts:6` defines `GetPayments`.
- `app/dashboard/actions/payments.ts:47` embeds payment-item details.
- `app/dashboard/actions/payments.ts:51` embeds reversals and refund items.
- `app/dashboard/actions/payments.ts:100` orders the full result with no range/limit.
- `app/dashboard/actions/payments.ts:112` applies card-type filtering in JavaScript.

**Impact**

The list pays detail-query cost for every payment, and search/card filters do not reduce database work. Payment histories grow continuously and are unsuitable for unbounded nested retrieval.

**Recommendation**

- Add a paginated payment summary/list RPC with database-side filters and total count.
- Load reversal/refund/item graphs only when the user opens payment detail.
- Keep exports as a separate capped streaming or batched contract.

**Ownership:** Website plus shared list RPC if multiple clients consume it.

### P1-W5 - HQ Dashboard Uses Sequential Raw Reads for Simple Aggregates

**Evidence**

- `app/manage/actions/hq-platform/dashboard.ts:150` and `:159` fetch raw amounts for current and previous periods.
- `app/manage/actions/hq-platform/dashboard.ts:189`, `:198`, `:203`, `:215`, and `:224` issue additional independent reads for orders, stations, shifts, and payments.
- `app/manage/actions/hq-platform/dashboard.ts:340` loads 24 hours of order timestamps for JavaScript heatmap grouping.
- `app/manage/actions/hq-platform/dashboard.ts:372` starts an alerts workflow with several platform-wide reads.
- `lib/queries/use-platform-dashboard.ts:32`, `:44`, `:56`, and `:68` repeat major dashboard calls every 60 seconds; `:80` polls activity every 30 seconds.

**Impact**

The response latency includes sequential network waits, while database and application transfer raw rows for sums/counts/grouping. Every open HQ dashboard repeats this work each minute.

**Recommendation**

- Build one HQ dashboard summary RPC for revenue, order count, AOV, active orders, station health, shifts, payment states, and support counts.
- Aggregate the heatmap with `date_trunc`/business-hour SQL.
- Compute alerts from grouped existence/count queries instead of downloading order IDs.
- Until the RPC exists, parallelize independent reads and slow polling for metrics that do not need minute-level freshness.

**Ownership:** Shared aggregate RPC plus website orchestration/polling update.

### P1-W6 - HQ Analytics Downloads Raw Fact Rows and Aggregates in Node

**Evidence**

- `app/manage/actions/hq-platform/analytics.ts:3018` implements order-type intelligence; `:3030` fetches raw order facts.
- `app/manage/actions/hq-platform/analytics.ts:3862` implements audit analytics; `:3875` reads audit rows for the complete requested window.
- `app/manage/actions/hq-platform/analytics.ts:4047` implements location density; `:4058` and `:4062` load active locations and reportable order facts.
- Additional raw-order paths exist throughout the same file, including lines `338`, `485`, `562`, `799`, `949`, `2441`, `2611`, `2815`, `3179`, and `3183`.

**Impact**

Platform growth increases database-to-application transfer and JavaScript CPU even when the result is only a few chart points. Several hooks poll analytics every one or five minutes in `lib/queries/use-platform-analytics.ts`.

**Recommendation**

- Move grouping, sums, percentiles, distinct counts, and time buckets into SQL.
- Create focused aggregate RPCs with narrow result types.
- Consider daily/hourly summary tables or materialized views only for stale-tolerant HQ analytics after write/freshness requirements are agreed.
- Preserve live operational metrics outside materialized views.

**Ownership:** Shared database analytics contracts plus website types/hooks.

### P1-W7 - Merchant Report Pages Stack Overlapping Data Requests

**Evidence**

- `app/dashboard/reports/page.tsx:116`, `:120`, `:125`, and `:129` request analytics, financial KPIs, revenue breakdown, and dual-pricing data for the same scope.
- `app/dashboard/reports/financials/page.tsx:52`, `:58`, `:64`, `:68`, and `:74` request four report datasets plus the unbounded Orders graph.
- `app/dashboard/actions/order-analytics.ts:147` uses `select("*, order_items(*)")` for core analytics.
- `app/dashboard/actions/order-analytics.ts:1982` and `:2005` issue separate raw orders and payment reads for Sales Summary.
- `app/dashboard/actions/order-analytics.ts:2144` loads every order timestamp/amount and groups hourly results in JavaScript.

**Impact**

One report navigation can scan the same date/location scope repeatedly through multiple actions. The Financials page also downloads full order details although its initial view only needs list-level data.

**Recommendation**

- Define report-page aggregate contracts rather than one query per card.
- Reuse one common report scope and business-day boundary.
- Keep drill-down rows paginated and separate from summary data.
- Retain existing focused RPC paths such as `get_financial_kpis`, `get_sales_by_item_report_v2`, `get_voids_report`, `get_cash_flow_report`, and `get_kitchen_performance_stats` where their implementation performs set-based SQL.

**Ownership:** Website report orchestration plus shared combined RPCs where repeated scans persist.

### P2-W1 - Scheduled Jobs Have Unbounded Batches and Per-Record Database Work

**Evidence**

- `supabase/functions/process-abandoned-carts/index.ts:121` fetches all eligible sessions without a limit.
- `supabase/functions/process-abandoned-carts/index.ts:151` creates a potentially large `IN (...)` request.
- `supabase/functions/process-abandoned-carts/index.ts:171` loops every eligible cart; `:181`, `:235`, `:242`, and `:250` perform per-cart writes around an external email call.
- `supabase/functions/billing-generate-monthly-invoices/index.ts:35` fetches every due subscription; `:56` loops and `:66` calls one invoice RPC per subscription.
- `supabase/functions/billing-suspend-overdue/index.ts:32` fetches all overdue invoices; `:55` loops with an update and audit RPC per subscription.

**Impact**

Backlogs can exceed Edge Function execution time, produce very large `IN` payloads, and leave partially processed batches. Retrying broad scans creates repeated work.

**Recommendation**

- Add bounded claim batches, durable status/lease fields, idempotency constraints, and continuation scheduling.
- Use set-based RPCs for invoice generation and suspension where business rules allow.
- Keep external provider concurrency bounded rather than unbounded `Promise.all`.
- Monitor processed, failed, remaining, and oldest-age metrics.

**Note:** `supabase/functions/orderout-status-relay/index.ts:243` is intentionally serial and already claims a bounded batch to avoid provider 429s. Preserve that rate-limit design and measure queue age.

### P2-W2 - Campaign Delivery Performs Sequential Provider and Database Calls Per Recipient

**Evidence**

- `app/dashboard/actions/marketing.ts:332` and `:453` iterate recipients.
- Each iteration sends SMS/email and then records delivery through `record_marketing_result` at `:377` or `:496`.

**Impact**

Large campaigns can exceed server-action duration and tie UI requests to long-running provider work.

**Recommendation**

- Convert campaign sending into an asynchronous claimed job with bounded concurrency.
- Batch database status updates where possible.
- Keep provider idempotency and per-recipient error state.

### P2-W3 - Realtime Plus Polling Produces Redundant Reads

**Evidence**

- `app/dashboard/online-ordering/components/QrGuestAlertsPanel.tsx:52` polls every 15 seconds.
- The same component subscribes to location order changes at `:65` and cleans up at `:77`.
- Platform hooks poll many expensive datasets every 30-60 seconds.
- `app/dashboard/hooks/useFloorPlan.ts:48` polls every five seconds, including in the background.

**Impact**

Realtime-triggered invalidation and polling can request the same unchanged data repeatedly. Polling cost scales with active browser tabs.

**Recommendation**

- Poll only as a fallback when realtime is disconnected, or use a substantially slower safety interval.
- Pause background polling for hidden tabs where operationally acceptable.
- Instrument query-key request counts to find duplicate consumers.
- Preserve frequent refresh only for genuinely live floor/KDS state and return minimal deltas.

**Positive finding:** The seven inspected realtime channel sites use explicit `removeChannel` cleanup. No duplicate-subscription leak was confirmed statically.

### P2-W4 - Broad `select('*')` Usage Increases Payload and Couples Callers to Schema Growth

**Evidence**

- `app/dashboard/actions/order-analytics.ts:148` requests orders plus all order-item columns.
- `app/dashboard/actions/order.ts:45` and `:51` request full nested children.
- `app/manage/actions/get-merchants.ts:7` requests all merchant columns without pagination.
- `app/dashboard/actions/location-menus.ts` and `app/dashboard/actions/floor-plan-actions.ts` contain multiple full-row reads.
- Static scan found approximately 251 `select('*')` patterns outside migrations.

**Impact**

Schema additions silently increase network and serialization cost. JSON/JSONB metadata, receipt data, payment metadata, and configuration objects can be especially expensive.

**Recommendation**

- Define list, summary, and detail projections separately.
- Avoid JSON/JSONB columns unless the view uses them.
- Add payload-size telemetry before and after narrowing critical endpoints.

### P2-W5 - Large `IN (...)` Requests Need Chunking or Set-Based Alternatives

**Evidence**

- Orders enrichment builds staff and user ID lists in `app/dashboard/actions/order.ts`.
- Abandoned-cart processing uses all eligible session IDs at `supabase/functions/process-abandoned-carts/index.ts:151`.
- HQ analytics resolves merchant/location names after aggregating raw rows.

**Impact**

Large URL/query payloads increase planning and parsing overhead and can hit gateway limits. Repeated lookup joins should generally stay in SQL.

**Recommendation**

- Join labels in the primary RPC when the cardinality is high.
- Chunk `IN` requests only when a set-based SQL contract is not practical.
- Deduplicate IDs before sending and cap each chunk.

### P2-W6 - Service-Role Use Is Broad and Bypasses RLS

**Evidence**

- `lib/supabase/service-role.ts:8` creates the bypass client.
- Static scan found 285 helper-call occurrences across 89 files; this is not
  measured production call volume.
- Examples include public storefront actions, merchant dashboard actions, HQ actions, support, marketing, loyalty, invoice, and notification paths.

**Impact**

This is primarily an authorization risk, but it also hides expensive or missing RLS/index behavior during testing. Tenant filters omitted by one service-role path can cause platform-wide scans and data exposure.

**Recommendation**

- Inventory each service-role caller with its authentication and merchant/location scope gate.
- Prefer authenticated RLS clients for ordinary tenant operations.
- Centralize service-role scope assertions and require explicit merchant/location identifiers.
- Log platform-wide service-role reads and enforce bounded result sets.

## Reporting and Dashboard Map

| Surface | Entry points | Current data path | Main risk | Preferred direction |
| --- | --- | --- | --- | --- |
| Reports overview | `app/dashboard/reports/page.tsx:116` | `GetOrderAnalytics`, `get_financial_kpis`, revenue breakdown, dual pricing | Four overlapping requests; core analytics fetches `orders` plus all items | Consolidated overview RPC plus narrow drill-down |
| Financials | `app/dashboard/reports/financials/page.tsx:52` | KPIs, waterfall, revenue, dual pricing, full Orders action | Summary scans plus unbounded nested order graph | Aggregate summary RPC and paged list |
| Location comparison | `app/dashboard/reports/comparison/hooks/useComparisonData.ts:273` | Five direct raw-orders fallback actions | Five duplicate scans and merchant lookups | One aggregate RPC or maintained stats tables |
| Sales by item | `app/dashboard/actions/order-analytics.ts:681` | `get_sales_by_item_report_v2` | RPC payload size depends on date/cardinality | Keep SQL aggregation; add limits/top-N or export path if needed |
| Voids/refunds | `app/dashboard/actions/order-analytics.ts:650` | `get_voids_report` | Potential large detail response for wide ranges | Keep SQL; paginate detail rows |
| Cash management | `app/dashboard/actions/order-analytics.ts:717` | `get_cash_flow_report` | Wide-range response size | Keep SQL; separate summary from rows |
| Kitchen performance | `app/dashboard/actions/order-analytics.ts:2199` | `get_kitchen_performance_stats` | RPC implementation/indexes need live plan review | Good set-based pattern; verify plans |
| Sales Summary | `app/dashboard/actions/order-analytics.ts:1955` | Raw recognized orders plus separate refunds | Repeated raw transfer and JS grouping | One SQL channel/day aggregate |
| Hourly sales | `app/dashboard/actions/order-analytics.ts:2131` | Raw order timestamps and amounts | JS bucketization of all rows | SQL business-timezone hour buckets |
| Tax breakdown | `app/dashboard/actions/tax-reporting.ts:183` | Paged orders plus payment lookups | Better bounded pattern; still repeated supporting reads | Preserve pagination; consider joined RPC |
| Tax summary/category/location | `app/dashboard/actions/tax-reporting.ts:76`, `:309`, `:420` | Orders/items/refunds and JavaScript grouping | Several scans per page | Combined tax aggregate RPC if stats show load |
| Cash drawers | `app/dashboard/reports/cash-drawers/page.tsx:382` | Multiple hooks and client filtering | Wide date ranges and several independent datasets | Combined summary plus paged operations |
| HQ dashboard | `lib/queries/use-platform-dashboard.ts:28` | Raw platform reads polled every 30-60s | Serial reads and repeated full-platform work | One narrow platform summary RPC |
| HQ analytics | `app/manage/actions/hq-platform/analytics.ts` | Mixed RPC and raw fact aggregation | Raw rows, JS grouping, polling | Aggregate RPCs and stale-tolerant summaries |
| HQ transactions | `app/manage/actions/hq-platform/transactions.ts:1662` | Paged list RPC/direct path and capped export | Generally better bounded pattern | Preserve 50-row pages and 10,000 export cap; inspect RPC plans |

## Postgres and Supabase Review

### Existing Index Baseline

Repository history already defines indexes including:

- `orders(location_id, created_at DESC)`.
- `orders(merchant_id, created_at DESC)`.
- `orders(order_source, created_at DESC)`.
- Reportable-order expression/partial indexes.
- `order_items(order_id)` and an active-order partial index.
- `order_payments(merchant_id, location_id, initiated_at DESC)`.
- `order_payments(order_id)`, status, pending, and cash reconciliation indexes.
- Audit log indexes on creation time, merchant, location, action, actor, and resource.
- Open-shift and staff-shift indexes.

Because several definitions are repeated across snapshots and later migrations, no new index should be added from repository text alone.

### Candidate Index Families to Validate

These are hypotheses based on website filters. The POS live inventory already rules out blindly adding modifier/discount foreign-key indexes. Use the SQL pack to compare all remaining candidates with live definitions and usage:

| Query pattern | Candidate shape to validate | Notes |
| --- | --- | --- |
| Merchant/location order history | `(merchant_id, location_id, created_at DESC)` | May already be covered by separate indexes; confirm actual plan/selectivity |
| Channel reports | `(merchant_id, location_id, order_source, created_at DESC)` or reportable partial equivalent | Only if channel/date scans are frequent and selective |
| Active location orders | `(location_id, status, created_at DESC)` partial on active statuses | Existing status indexes may already cover this |
| Payment history | `(merchant_id, location_id, initiated_at DESC)` | Present in repository baseline; verify live usage |
| Payment filters | `(merchant_id, status, initiated_at DESC)` or `(merchant_id, payment_method, initiated_at DESC)` | Add only if top statements show those filters |
| Audit analytics | `(created_at DESC)` plus selective partial/indexed dimensions | Existing indexes exist; combined indexes may not be justified |
| Open shifts | `(location_id, status, clock_in_time)` partial where not completed | Existing partial index does not include clock time in repository baseline |
| Abandoned sessions | Partial on unconverted eligible session state and `updated_at` | Predicate must match actual job query; JSON/cart predicates complicate it |
| Billing jobs | `(status, next_billing_date)` and invoice `(status, due_date)` | Verify existing indexes before adding |

### RLS Policy Concerns

The migration corpus contains many policies and historical function versions. Static review cannot confirm the live definitions or planner behavior.

Review live policies for:

- Per-row subqueries against `members`, `location_members`, roles, or merchant mappings.
- Repeated Clerk/user lookup functions that are not stable or not index-supported.
- Policies that call volatile functions for every row.
- Tenant predicates that cast values or wrap indexed columns in functions.
- Broad service-role fallbacks that bypass the policy entirely.

Prefer stable helper functions that resolve authorization once per statement, with indexed membership keys. Verify with real tenant-role queries, not the `postgres` role alone.

### `SECURITY DEFINER` and `search_path`

All live `SECURITY DEFINER` functions require:

- A pinned `search_path`, normally `public, pg_temp` or the approved equivalent.
- Explicit tenant/HQ authorization inside the function.
- Fully qualified sensitive objects where practical.
- Revoked default `PUBLIC` execute and explicit grants to intended roles.
- Review of dynamic SQL and role switching.

The SQL pack lists live definers missing any `search_path` setting and their grants. Repository occurrence counts are not sufficient because migrations replace functions over time.

### JSON/JSONB Payloads

Orders, payments, merchant/location metadata, online-store configuration, and audit records contain metadata/config payloads that can grow independently of list needs. Use the SQL pack to rank average and maximum JSON column sizes, then remove those columns from list/summary projections.

### Timezone and Business-Day Logic

Report actions repeatedly build date bounds and group timestamps in JavaScript. Shared POS/website correctness requires one SQL business-day contract using location timezone. Hourly, daypart, current-day, prior-period, and order-number reporting should not each implement independent UTC/local conversion.

## Caching and Redis Decision

### Current Cache Layers

- React Query defaults in `utils/tanstackquery.tsx:12` use five-minute stale time and ten-minute garbage collection.
- Feature hooks override freshness and polling for live/admin surfaces.
- Request-local React `cache()` is used for storefront metadata in `app/sites/[slug]/layout.tsx`.
- Realtime is used for a small number of live resources.
- No broad Redis-backed query cache was identified.

### Correct Tool by Workload

| Workload | Preferred layer | Reason |
| --- | --- | --- |
| Duplicate calls during one server render/request | React/Next request-local cache | No cross-request invalidation problem |
| Browser navigation and recently viewed reports | React Query | Already tenant/key scoped; easy invalidation after mutations |
| Public pages/read models with controlled freshness | Next.js cache or CDN | Cheaper than Redis and close to the HTTP response |
| Expensive repeated SQL aggregation | Efficient SQL, summary table, or materialized view | Avoids caching an inefficient query as the primary fix |
| Cross-instance rate limits, leases, or ephemeral coordination | Redis may be suitable | Requires atomic operations and short TTLs |
| Durable idempotency, payment/order state | Postgres | Must be transactional and authoritative |

### Redis Recommendation

**Decision: Redis is not currently justified as the first remediation.**

The confirmed bottlenecks are avoidable database/request patterns. Adding Redis now would preserve duplicate scans behind a second state system and introduce invalidation risk.

Reassess Redis after phases 1-3 if `pg_stat_statements` shows high call counts for identical, stale-tolerant reads across multiple application instances.

### Suitable Redis Candidates After SQL Remediation

| Candidate | Suggested key | TTL | Invalidation |
| --- | --- | ---: | --- |
| Public storefront menu read model | `storefront:v1:merchant:{merchantId}:location:{locationId}:slug:{slug}:menu:{version}` | 30-120s | Menu/config version bump or explicit publish invalidation |
| Stale-tolerant merchant report snapshot | `report:v1:merchant:{merchantId}:location:{locationId|all}:kind:{kind}:from:{from}:to:{to}:source:{source|all}` | 30-120s | Order/refund change invalidation is hard; short TTL plus versioning |
| Stale-tolerant HQ analytics | `hq-analytics:v1:metric:{metric}:from:{from}:to:{to}:version:{version}` | 60-300s | Scheduled refresh or analytics version bump |
| Distributed rate limit/lease | `lease:v1:{job}:{scope}` | Seconds/minutes | Natural TTL plus owner token |

All keys must include merchant and location scope where applicable. Authorization must be checked before a cached value is returned.

### Data That Must Not Be Served Stale

- Payment authorization, capture, void, refund, and settlement state.
- Active order/KDS status and routing.
- Staff clock-in/out, open breaks, and active-shift blockers.
- Subscription entitlement, suspension, and station quota enforcement.
- Inventory decrements and stock availability used to accept an order.
- Idempotency and webhook delivery claims.

These need transactional Postgres truth, narrow realtime updates, or short request-local reuse, not a general Redis result cache.

### Operational Cost

Redis introduces tenant-key discipline, invalidation, warm-up behavior, failure mode decisions, monitoring, memory eviction policy, backups/HA, and another secret/network dependency. Adopt it only with a measured target, owner, SLO, and fallback behavior.

## Phased Remediation Plan

### Phase 0 - Measure and Establish Baselines

1. Run the companion read-only SQL pack in staging and production.
2. Export results as JSON with environment and timestamp labels.
3. Capture p50/p95/p99 action duration, PostgREST request count, response bytes, database CPU, and statement call/row statistics.
4. Reproduce representative merchant and HQ report loads using the same date/location scope.
5. Run the POS workload-delta collector around active-order, order-detail, KDS,
   floor-plan, and staff-login QA.
6. Confirm which RPCs are shared before changing signatures or payloads.
7. Declare one canonical migration root and export missing live function
   definitions before any RPC rewrite.

The migration-history work gates shared RPC replacement, but Phase 1
application-only bounding and projection changes may proceed in parallel.

### Phase 1 - Bound Data and Remove Critical Fan-Out

1. Add pagination and narrow list projections for Orders and Payments.
2. Move list filters to SQL.
3. Batch checkout price resolution and tax lookup.
4. Add bounded claim batches to abandoned-cart and billing jobs.
5. Cap merchant/HQ date windows or require an explicit export workflow for very wide ranges.
6. Replace hot POS direct `select('*')` reads with explicit columns where no
   shared RPC change is required.

### Phase 2 - Version Hot POS RPCs and Consolidate Website Reports

1. Add compatible vNext functions for active orders, order details, KDS, and
   split floor-plan geometry/session state.
2. Validate old/new POS response equivalence and retain feature-flag fallbacks
   during rollout.
3. Replace the five Location Comparison scans with one aggregate call.
4. Add combined merchant report overview/financial summary contracts.
5. Move Sales Summary and Hourly Sales grouping into SQL with location business timezone.
6. Replace HQ dashboard raw rows with one narrow aggregate RPC.
7. Keep drill-down tables paged separately from summary payloads.

### Phase 3 - Database Hardening

1. Use live statement/index statistics to approve only necessary indexes.
2. Remove or consolidate duplicate/unused indexes only after write-cost and ownership review.
3. Fix live `SECURITY DEFINER` functions missing pinned `search_path`, authorization, or grants.
4. Optimize RLS helper functions and membership indexes based on real tenant queries.
5. Standardize business-day and timezone functions shared by website and POS.

### Phase 4 - Polling, Caching, and Pre-Aggregation

1. Reduce polling where realtime already invalidates data.
2. Apply request-local/React Query/Next.js caching first.
3. Add summary tables or materialized views for stale-tolerant analytics with documented refresh ownership.
4. Reassess Redis only if repeated cross-instance reads remain a measured bottleneck.

## Verification and Performance Measurement

For each remediation, compare the same tenant/date scenario before and after:

| Metric | Provisional target |
| --- | --- |
| Database round trips per page | Decrease; Location Comparison target is one aggregate request |
| Rows returned vs rows rendered | Near 1:1 for lists; summary payloads contain only chart/card rows |
| Response bytes | Bounded by page size, independent of full history |
| Server action p95 | Reduced and stable as history grows |
| `pg_stat_statements.total_exec_time` | Lower for targeted statement family |
| `mean_exec_time` and rows/call | Lower or intentionally aggregated |
| Sequential scans | No growth on large fact tables for selective tenant/date requests |
| Index write overhead | No unjustified duplicate indexes |
| Job queue age | Bounded and observable during backlog |
| Correctness | Totals match authoritative POS/website reports and payment state |
| POS active-order bootstrap | p95 below 500 ms and at least 40% smaller payload |
| POS KDS | Warm p95 below 150 ms; stress p95 below 300 ms |
| POS floor status | Session p95 below 100 ms; cold snapshot below 400 ms/75 KB |

Test matrix:

1. Small merchant, one location, one day.
2. Large merchant, all locations, 30 and 90 days.
3. HQ platform-wide dashboard and analytics.
4. Concurrent open HQ dashboard tabs.
5. Checkout carts with 1, 10, and 50 line items.
6. Orders/payments histories above PostgREST default row limits.
7. Job backlog with more eligible rows than one batch.
8. RLS tests as merchant owner, manager, limited staff, HQ scoped admin, and service role.
9. POS active-order cold start and reconnect with 200 active orders.
10. POS order detail with heavy modifier/payment history.
11. KDS normal and 100-ticket stress fixtures across two locations/displays.
12. Floor-plan cold start, warm geometry reuse, and session-only refresh.

Do not benchmark only as `postgres`; that bypasses the RLS cost and authorization path used by the applications.

All latency and payload thresholds above are proposed acceptance targets, not
measured current p95 baselines. Confirm or revise them after Phase 0 captures a
repeatable fixture, concurrency level, cache state, and tenant/date scope.

## Required Senior Decisions

1. Approve a shared RPC ownership model so POS and website do not independently redefine report contracts.
2. Choose the authoritative business-day/timezone SQL contract.
3. Decide summary freshness targets for merchant reports and HQ analytics.
4. Decide whether Orders/Payments pagination can change existing UI/API response contracts.
5. Assign an owner for service-role authorization inventory and reduction.
6. Approve background-job batch size, retry, and queue-age SLOs.
7. Approve retention and, if safe, a controlled reset window for the already-enabled `pg_stat_statements` extension so representative traffic can be measured.
8. Defer Redis approval until post-remediation statistics show a remaining cross-instance cache use case.
9. Declare the authoritative shared migration root and owner.
10. Approve RPC version-retirement and offline-client compatibility windows.

## Risks and Limitations

- Shared staging statistics were available from the POS audit, but no website-isolated workload delta or production statistics were available.
- Source line references are pinned to the revisions listed at the top of this
  document. Revalidate them after the July 31 SDK rollback or later branch
  merges before implementation.
- Repository migrations contain historical and duplicate definitions; they do not prove current production state.
- Index suggestions are conditional, not migration instructions.
- Static analysis cannot determine actual row counts, cache-hit ratios, query plans, RLS plan cost, or provider latency.
- Some sequential processing is intentional for provider rate limits and correctness.
- Changing shared RPCs without POS coordination can break tablet sync/reporting.
- Materialized views and Redis can create stale financial or operational data if freshness contracts are not explicit.

## Authoritative Architecture References

- [Supabase query optimization](https://supabase.com/docs/guides/database/query-optimization)
- [Supabase `pg_stat_statements`](https://supabase.com/docs/guides/database/extensions/pg_stat_statements)
- [Supabase RLS performance and best practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Supabase Realtime architecture](https://supabase.com/docs/guides/realtime/architecture)
- [Supabase connection and pooling guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase read replicas](https://supabase.com/docs/guides/platform/read-replicas)
- [PostgreSQL table partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [Square idempotency contract](https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency)
- [Square Cash App sharding and entity-locality case study](https://medium.com/square-corner-blog/sharding-cash-10280fa3ef3b)
- [Vitess architecture and YouTube lineage](https://vitess.io/docs/25.0/overview/whatisvitess/)
- [AWS safe retries with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
- [AWS retry and backoff guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html)

## Companion Artifacts

- Senior summary: `docs/engineering/database-performance/SENIOR-SUMMARY-2026-07-31-SHARED-DATABASE-PERFORMANCE.md`
- Read-only SQL pack: `docs/engineering/database-performance/SQL-READONLY-2026-07-31-DATABASE-PERFORMANCE-AUDIT.sql`
- Website source audit: `docs/engineering/database-performance/AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-WEBSITE.md`
- POS source audit: `Dexa-POS/tasks/database-performance-architecture-audit.md`
- POS workload delta collector: `Dexa-POS/supabase/audits/20260731_database_workload_delta_readonly.sql`
