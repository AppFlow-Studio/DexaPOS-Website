# Shared Database Performance Implementation Backlog

- **Created:** 2026-08-01
- **Audit date:** 2026-07-31
- **Scope:** Dexa-POS, DexaPOS-Website, and their shared Supabase/Postgres database
- **Status:** Proposed backlog; implementation requires ticket-level approval
- **Canonical audit:** `docs/engineering/database-performance/AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-COMBINED.md`

## Evidence Baseline

- Dexa-POS current-staging revision: `audit/pos-database-refresh` at `a1c7a032479bdfc533f28e29eb983824077742c1`.
- Dexa-POS prior evidence revision: `databse-audit` at `7a6ab3069840de5da926e71a3b05caca3f2700ff`.
- DexaPOS-Website evidence revision: `dika-dev` at `a2473d88933a90f8fcd46ddd8d4b11a1d1801e29`.
- Database evidence: staging project `dfwqakoyittmrwbqvxgw`.
- Follow-up database snapshot: `2026-07-31 10:22:56 UTC`.
- Current POS staging source has been revalidated. Controlled POS workflow
  deltas remain pending because the received collector export has no matching
  after-export.

## Guardrails

- Use forward-only migrations. Do not edit an already-applied migration.
- Version shared RPC payload changes; do not silently replace a contract used by deployed or offline clients.
- Do not add indexes from static source inspection alone.
- Do not remove an RPC until both repositories, Edge Functions, jobs, webhooks, offline replay, and live statistics confirm it is unused.
- Keep payment, KDS, active-order, shift, inventory-acceptance, and subscription state authoritative in Postgres.
- Do not add Redis during the initial remediation waves.
- Measure the same tenant, date range, fixture, cache state, and concurrency before and after each change.

## Priority Model

| Priority | Meaning |
| --- | --- |
| P0 | Required evidence, ownership, or compatibility work that gates shared database deployment |
| P1 | Confirmed high-impact query or payload problem affecting operational or growing data paths |
| P2 | Important hardening, amplification, maintenance, or governance work |
| P3 | Optional optimization to reconsider only after measured P0-P2 results |

## Work Register

| ID | Priority | Owner | Deliverable | Dependency | Migration |
| --- | --- | --- | --- | --- | --- |
| DB-P0-01 | P0 | POS + Website | Revalidate every cited source path against the post-rollback implementation branches and record new commit hashes | None | No |
| DB-P0-02 | P0 | Database owner + senior | Declare one canonical migration root, export missing live definitions, and mark historical SQL roots reference-only | Senior ownership decision | Forward-only reconciliation likely |
| DB-P0-03 | P0 | Database + QA | Capture controlled POS and website workload deltas plus production read-only statistics | Approved test fixtures and access | No |
| DB-P0-04 | P0 | Security + Database + POS | Replace the authless PUBLIC/`anon` definer contracts for staff/PIN reads, check mutations, cash operations, and floor-plan deletion; preserve authenticated POS and offline replay | Immediate owner, station/user authorization contract, canonical migration root | Yes, focused forward-only migration |
| DB-P0-05 | P0 | Security + Database + Kiosk/Website | Contain full anonymous access to `kiosk_pickup_sequences` and `luqra_sync_runs`; add appropriate RLS/grants and preserve authorized atomic kiosk allocation plus HQ/service-role Luqra jobs | Canonical migration root and decision to retain or retire the currently unreferenced kiosk counter | Yes, separate focused forward-only migration |
| DB-P0-06 | P0 | Security + Database + POS + Website | Classify all 511 live `SECURITY DEFINER` signatures by caller, internal authorization, sensitivity, and intended role; replace broad PUBLIC/`anon` defaults with a reviewed allowlist, prioritizing payment, secret/device, NMI, billing, staff, order, and platform mutations | Query 13 inventory complete; canonical migration root; cross-repo/Edge Function/offline caller inventory | Classification first; multiple focused forward-only migrations likely |
| DB-P0-07 | P0 | Security + Database + POS | Replace the conflicted station-status reference and version `pos_staff_login_v2` with atomic staff/location/merchant/station binding, rate limiting, and no plaintext PIN persistence | Live body/grant export; legitimate anonymous pre-login and unattended-device contract; canonical migration root | Yes, focused forward-only versions |
| DB-P0-08 | P0 | POS + Payments + Database | Select one payment/preauthorization generation across direct, service, and offline replay, reproduce it in the canonical root, regenerate types, and retain compatible old versions through rollout | Live v16/v17 and preauth definitions; feature-flag state; offline compatibility window | Shared migration reconciliation plus POS caller change |
| DB-P1-01 | P1 | Website | Paginate Merchant Orders, return list-only columns, and move payment/text filters into the database query | UI pagination contract | No initially; versioned list RPC optional |
| DB-P1-02 | P1 | Website | Paginate Payments, separate summary from detail graphs, and move card/search filters into the database query | UI pagination/export contract | No initially; versioned list RPC optional |
| DB-P1-03 | P1 | Website + Database | Resolve checkout prices and tax rules set-wise in one authoritative request/transaction | Price-cascade compatibility review | Yes |
| DB-P1-04 | P1 | Website + Database | Replace five Location Comparison fallback scans with one tenant-safe aggregate contract | Business-day/timezone decision | Yes |
| DB-P1-05 | P1 | Website + Database | Replace HQ dashboard/raw analytics scans with narrow aggregate contracts; keep drill-down lists paged | Freshness and HQ authorization decisions | Yes |
| DB-P1-06 | P1 | POS + Database | Add versioned active-order and order-detail RPCs using explicit fields and one-pass child aggregation | Canonical migration root and payload equivalence fixture | Yes |
| DB-P1-07 | P1 | POS + Database | Split stable floor-plan geometry from volatile session/status state | Cache/version contract | Yes |
| DB-P1-08 | P1 | POS + Database | Reshape KDS with early location/status bounds and one-pass item/modifier/acknowledgement aggregation | Preserve Done, rush, routing, retention, and server-name behavior | Yes |
| DB-P1-09 | P1 | POS | Replace the active-order length/first-opened-at fingerprint with an authoritative snapshot revision or identity-preserving merge | Missed-broadcast/reconnect fixture | No unless a server revision is added |
| DB-P1-10 | P1 | POS + Website + Database | Standardize location-timezone End-of-Day bounds and check-state vocabulary; route closure through authoritative mutations and replace raw/N+1 summaries with grouped SQL plus paged drill-down | Shared business-day contract and POS/website total-equivalence fixture | Yes |
| DB-P1-11 | P1 | POS + Database | Consolidate Previous Orders page/count/summary work, raw analytics facts, and refund allocation reads into bounded list, aggregate, and batched/transactional contracts | Business-day/filter contract and payment-allocation correctness fixtures | Usually yes |
| DB-P2-01 | P2 | Website + Database | Add bounded, idempotent claim batches to abandoned-cart and billing jobs | Batch size, retry, and queue-age SLO | Usually yes |
| DB-P2-02 | P2 | Website | Remove confirmed Realtime/polling duplication and pause nonessential hidden-tab polling | Controlled request-count evidence | No |
| DB-P2-03 | P2 | Website + Database | Consolidate overlapping merchant report requests and move hourly/sales grouping into SQL | Business-day/timezone contract | Yes where new RPCs are required |
| DB-P2-04 | P2 | Website security owner | Inventory service-role callers and centralize tenant-scope assertions | Named security owner | No initially |
| DB-P2-05 | P2 | Database owner | Review live RLS, `SECURITY DEFINER`, grants, autovacuum, duplicate indexes, and sargability using production evidence | DB-P0-03 | Only evidence-approved changes |
| DB-P2-06 | P2 | POS + Website | Add request duration, response bytes, request-count, and query-family attribution telemetry | Privacy and observability contract | Possibly |
| DB-P3-01 | P3 | Architecture | Reassess Redis for stale-tolerant cross-instance reads or coordination only | P0-P2 measured results show remaining need | Separate approval |

## Delivery Waves

### Wave 0 - Evidence And Contract Safety

Complete `DB-P0-01`, `DB-P0-02`, `DB-P0-03`, and immediately sequence
`DB-P0-04` through `DB-P0-08`. The security and payment-contract tickets may not wait for general
performance implementation, but their rollout still requires the canonical
migration owner and POS/kiosk compatibility plans.

Output:

- Current source references for both repositories.
- One declared database migration authority.
- Exported live definitions for critical shared RPCs.
- Repeatable staging fixtures and before/after workload snapshots.
- Production read-only evidence where access is approved.
- A forward-only authorization replacement for `get_unified_staff_view`,
  `close_check`, `reopen_check`, `record_cash_operation`, and
  `delete_floor_plan_cascade`, with no raw PIN material in staff-list output.
- A separate forward-only RLS/grant containment migration for
  `kiosk_pickup_sequences` and `luqra_sync_runs`, with service-role/HQ and
  authorized kiosk behavior verified.
- A signature-level authorization matrix for all 511 live definers, with the
  465 anonymous-executable signatures classified as intentional public,
  authenticated station/user, server-only, or obsolete before grants change.
- A valid, canonical station-status function and versioned PIN-login contract
  with no plaintext PIN persistence.
- One documented payment/preauthorization router shared by direct, service,
  and offline replay paths.

Application-only work that does not change shared contracts may proceed in parallel after its individual ticket is approved.

### Wave 1 - Bound Website Work Immediately

Implement `DB-P1-01`, `DB-P1-02`, and the safe portions of `DB-P2-02`.

Expected outcome:

- Order and payment list cost is bounded by page size rather than merchant history.
- List views no longer fetch nested detail graphs they do not render.
- Filters reduce database work rather than discarding rows after transfer.
- Background tabs stop producing unnecessary requests.

### Wave 2 - Version Operational Contracts

Implement `DB-P1-03`, `DB-P1-06` through `DB-P1-11` as versioned or
compatibility-preserving contracts.

Required rollout:

1. Capture old-response fixtures.
2. Implement a new RPC signature or version.
3. Compare old and new semantic payloads.
4. Deploy the database contract before the client switches.
5. Gate the client path and retain the prior contract during the compatibility window.
6. Monitor errors, latency, rows, and payload size.
7. Retire the old contract only through a separate approved ticket.

### Wave 3 - Consolidate Reporting And Jobs

Implement `DB-P1-04`, `DB-P1-05`, `DB-P2-01`, and `DB-P2-03`.

Expected outcome:

- One report scope is scanned once per summary request.
- Raw fact transfer is replaced by narrow grouped results.
- Drill-down and export remain separate, bounded contracts.
- Scheduled work has claim limits, idempotency, retry state, and queue-age visibility.

### Wave 4 - Database And Authorization Hardening

Implement only evidence-approved portions of `DB-P2-04`, `DB-P2-05`, and `DB-P2-06`.

Do not bundle index removal, RLS rewrites, function authorization, and autovacuum tuning into one migration. Each change needs a focused rollback and verification plan.

### Wave 5 - Redis Decision Gate

Consider `DB-P3-01` only if measurements still show repeated, identical, stale-tolerant reads across application instances after Waves 1-4.

Redis remains unsuitable as generic truth for payments, active orders/KDS, staff shifts, subscription enforcement, transactional inventory, idempotency, or webhook claims.

## Ticket Requirements

Every implementation ticket must include:

- Exact source commit and database environment.
- Current request count, duration distribution, rows, and response bytes.
- Current and proposed request/RPC contract.
- Tenant authorization and RLS/service-role behavior.
- Business-day/timezone and reportability rules where relevant.
- Migration ordering and backward-compatibility window.
- Rollback procedure.
- Targeted automated tests.
- Manual QA fixture and evidence requirements.
- Post-deployment observation window and owner.

## Measurement Protocol

For each affected workflow:

1. Use the same merchant, location, user role, date range, fixture size, cache state, and concurrency.
2. Capture application p50/p95/p99, request count, response bytes, and error rate.
3. Capture the relevant `pg_stat_statements` call/time/row deltas before and after the workflow.
4. Record query plans for read-only representative statements where safe.
5. Compare rendered totals and operational state, not only latency.
6. Repeat cold and warm runs separately.

Do not run `EXPLAIN ANALYZE` on mutations or payment/order state-changing functions in a shared environment.

## Definition Of Ready

A ticket is ready when:

- Its owner and repository are assigned.
- Source references are current.
- Baseline evidence is captured or the change is explicitly classified as an application-only safety bound.
- Shared payload and authorization contracts are documented.
- Required migration and deployment ordering are known.
- QA has a reproducible fixture.

## Definition Of Done

A ticket is done when:

- Targeted tests pass in the owning repository.
- Any migration is forward-only and reproducible from the canonical root.
- Old and new payloads have been checked for semantic compatibility.
- Before/after measurements use the same fixture.
- No payment, reporting, timezone, KDS, shift, or tenant-scope regression is found.
- Rollout monitoring completes without unexplained error or latency regression.
- Manual evidence and required senior/QA sign-off are attached.

## Immediate Senior Decisions

1. Assign the canonical shared-database migration owner and root.
2. Approve the Orders and Payments pagination contracts.
3. Approve one shared business-day/timezone contract.
4. Set report/HQ freshness expectations.
5. Set the shared RPC backward-compatibility window for deployed and offline POS clients.
6. Assign service-role authorization review ownership.
7. Approve production read-only statistics collection and a controlled measurement window.
