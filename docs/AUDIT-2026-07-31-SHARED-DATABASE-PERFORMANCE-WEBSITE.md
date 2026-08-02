# Shared Supabase/Postgres Performance and Architecture Audit - Website

- **Date:** 2026-07-31
- **Repository:** DexaPOS-Website
- **Branch inspected:** `dika-dev`
- **Phase:** Investigation and documentation only
- **Database:** Shared by DexaPOS-Website and Dexa-POS

## Executive Conclusion

The highest-value work is not adding Redis. The website currently creates avoidable database load through repeated raw-data scans, unbounded nested reads, sequential request waterfalls, and per-record RPC calls. These problems should be corrected before introducing a distributed cache. The sibling POS audit's live staging statistics independently support this conclusion: nested order/item payloads dominate measured statement cost and operate mostly on cache-hot data.

The most important confirmed risks are:

1. Online checkout calls `get_effective_price` once per cart item.
2. Location Comparison performs five independent merchant lookups and five raw `orders` scans for one page load.
3. Merchant Orders and Payments list actions fetch unbounded nested datasets and apply some filters in JavaScript.
4. HQ dashboard and analytics paths download raw fact rows for calculations that Postgres can aggregate once.
5. High-frequency polling repeatedly invokes those expensive HQ paths.
6. Scheduled abandoned-cart and billing jobs process unbounded eligible sets with per-record database work.
7. Service-role access is widespread: 285 call sites across 89 website files bypass RLS and therefore require explicit, consistent tenant authorization.

Static website evidence does not prove that a candidate index is missing or useful in production. The repository already contains many overlapping historical index definitions, and the POS live inventory disproved initial missing-index hypotheses for `order_item_modifiers` and `order_discounts`. Additional index, RLS, and function conclusions must be validated against the live catalog and `pg_stat_statements` using the companion read-only SQL pack.

## Scope and Method

This audit reviewed:

- Server actions and Supabase clients under `app/` and `lib/`.
- Dashboard and HQ reporting pages, hooks, and actions.
- Public storefront and checkout Edge Functions.
- API routes, webhooks, scheduled Edge Functions, and background processing.
- Browser realtime subscriptions and polling behavior.
- Migration definitions for indexes, RLS policies, `SECURITY DEFINER`, and `search_path` usage.
- Existing React Query and Next.js caching behavior.

No SQL was executed against Supabase. No application code, migration, package file, or lockfile was changed.

## Shared Database Evidence From the POS Audit

The sibling artifact `Dexa-POS/tasks/database-performance-architecture-audit.md` contains staging statistics captured on 2026-07-31. This website audit treats those values as shared-database evidence, while avoiding attribution of a normalized SQL statement to one client until a controlled workload delta is captured.

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
| Service-role helper calls | 285 in 89 files | Broad RLS bypass surface requiring explicit authorization |

Repository SQL contains approximately 903 `SECURITY DEFINER` references, 683 `search_path`-pinning references, and 486 policy statements. These counts include historical/replaced function definitions and cannot identify the live database state. The catalog query pack is authoritative.

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

## Confirmed Findings

### High 1 - Checkout Performs One Pricing RPC Per Cart Item

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

### High 2 - Location Comparison Repeats the Same Raw Orders Scan Five Times

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

### High 3 - Merchant Orders List Fetches an Unbounded Nested Order Graph

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

### High 4 - Payments List Fetches an Unbounded Nested Payment Graph

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

### High 5 - HQ Dashboard Uses Sequential Raw Reads for Simple Aggregates

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

### High 6 - HQ Analytics Downloads Raw Fact Rows and Aggregates in Node

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

### High 7 - Merchant Report Pages Stack Overlapping Data Requests

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

### Medium 1 - Scheduled Jobs Have Unbounded Batches and Per-Record Database Work

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

### Medium 2 - Campaign Delivery Performs Sequential Provider and Database Calls Per Recipient

**Evidence**

- `app/dashboard/actions/marketing.ts:332` and `:453` iterate recipients.
- Each iteration sends SMS/email and then records delivery through `record_marketing_result` at `:377` or `:496`.

**Impact**

Large campaigns can exceed server-action duration and tie UI requests to long-running provider work.

**Recommendation**

- Convert campaign sending into an asynchronous claimed job with bounded concurrency.
- Batch database status updates where possible.
- Keep provider idempotency and per-recipient error state.

### Medium 3 - Realtime Plus Polling Produces Redundant Reads

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

### Medium 4 - Broad `select('*')` Usage Increases Payload and Couples Callers to Schema Growth

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

### Medium 5 - Large `IN (...)` Requests Need Chunking or Set-Based Alternatives

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

### Medium 6 - Service-Role Use Is Broad and Bypasses RLS

**Evidence**

- `lib/supabase/service-role.ts:8` creates the bypass client.
- Static scan found 285 helper calls across 89 files.
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
5. Confirm which RPCs are shared with POS before changing signatures or payloads.

### Phase 1 - Bound Data and Remove Critical Fan-Out

1. Add pagination and narrow list projections for Orders and Payments.
2. Move list filters to SQL.
3. Batch checkout price resolution and tax lookup.
4. Add bounded claim batches to abandoned-cart and billing jobs.
5. Cap merchant/HQ date windows or require an explicit export workflow for very wide ranges.

### Phase 2 - Consolidate Reports

1. Replace the five Location Comparison scans with one aggregate call.
2. Add combined merchant report overview/financial summary contracts.
3. Move Sales Summary and Hourly Sales grouping into SQL with location business timezone.
4. Replace HQ dashboard raw rows with one narrow aggregate RPC.
5. Keep drill-down tables paged separately from summary payloads.

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

| Metric | Target |
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

Test matrix:

1. Small merchant, one location, one day.
2. Large merchant, all locations, 30 and 90 days.
3. HQ platform-wide dashboard and analytics.
4. Concurrent open HQ dashboard tabs.
5. Checkout carts with 1, 10, and 50 line items.
6. Orders/payments histories above PostgREST default row limits.
7. Job backlog with more eligible rows than one batch.
8. RLS tests as merchant owner, manager, limited staff, HQ scoped admin, and service role.

Do not benchmark only as `postgres`; that bypasses the RLS cost and authorization path used by the applications.

## Required Senior Decisions

1. Approve a shared RPC ownership model so POS and website do not independently redefine report contracts.
2. Choose the authoritative business-day/timezone SQL contract.
3. Decide summary freshness targets for merchant reports and HQ analytics.
4. Decide whether Orders/Payments pagination can change existing UI/API response contracts.
5. Assign an owner for service-role authorization inventory and reduction.
6. Approve background-job batch size, retry, and queue-age SLOs.
7. Decide whether `pg_stat_statements` can be enabled/retained long enough to measure representative traffic.
8. Defer Redis approval until post-remediation statistics show a remaining cross-instance cache use case.

## Risks and Limitations

- Shared staging statistics were available from the POS audit, but no website-isolated workload delta or production statistics were available.
- Repository migrations contain historical and duplicate definitions; they do not prove current production state.
- Index suggestions are conditional, not migration instructions.
- Static analysis cannot determine actual row counts, cache-hit ratios, query plans, RLS plan cost, or provider latency.
- Some sequential processing is intentional for provider rate limits and correctness.
- Changing shared RPCs without POS coordination can break tablet sync/reporting.
- Materialized views and Redis can create stale financial or operational data if freshness contracts are not explicit.

## Companion Artifacts

- Senior summary: `docs/SENIOR-SUMMARY-2026-07-31-SHARED-DATABASE-PERFORMANCE.md`
- Read-only SQL pack: `docs/SQL-READONLY-2026-07-31-DATABASE-PERFORMANCE-AUDIT.sql`
- POS shared-database source audit: `Dexa-POS/tasks/database-performance-architecture-audit.md`
- POS workload delta collector: `Dexa-POS/supabase/audits/20260731_database_workload_delta_readonly.sql`
