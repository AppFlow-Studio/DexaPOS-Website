# QR Dine-In Track A Plan and Status

This document is the active source of truth for **QR Dine-In Track A (Backend / POS / QA)**.

It supersedes `docs/PLAN-2026-05-20-QR-DINE-IN-FOUNDATION.md` for implementation planning and status tracking. The older doc remains historical context only.

## What This Ticket Is

This ticket builds the Track A foundation for Chick-fil-A-style **scan -> order -> pay -> runner-delivered** dine-in. A guest scans a table QR, lands on the merchant's existing online store with the table pre-bound, orders and pays on their own phone, and staff run the food out by table label. QR orders are **online orders with a table label**, not table sessions: they do not seize the floor-plan state, do not merge checks, and do not attach to `table_sessions`.

## Grounded Repo Status

### Done already in repo

- The anon customer-session validation pattern already exists in `cancel_online_order_by_customer(...)`.
- The online-order accept path already exists in `accept_online_order(...)`.
- Staff-gated order creation already exists in `create_order_v2(...)` and `create_order_v3(...)`.
- Idempotency infrastructure already exists via `_idempotency_claim(...)`.
- Rate-limit infrastructure already exists via `waitlist_sms_rate_limit`.
- `floor_plan_objects` already has merchant/location-scoped RLS that can be mirrored for QR tables.
- `online_order_sessions` already has:
  - `session_token`
  - `expires_at`
  - `order_id`
  - `cart_data`
  - `customer_email_opt_in`
  - `customer_sms_opt_in`
- `online_store_config` already has:
  - `slug`
  - `custom_domain`
  - `auto_accept_orders`
  - `delivery_pricing_enabled`
  - `pricing_disclosure_text`
  - `tip_presets`
  - `notification_prefs`
- Printer capability already exists via `printers.supports_qr_code`.
- Tablet floor-plan surfaces already exist under `components/dashboard/tables/*`.
- The shared bottom-sheet shell already exists in `components/ui/bottom-sheet.tsx`.
- The merchant-tier / service-catalog layer already exists and is suitable for QR billing gating:
  - `subscription_plans`
  - `merchant_plan_subscriptions`
  - `get_merchant_subscription_status(...)`

### Missing and must be built in Track A

- No `table_qr_codes` table exists.
- No `qr_scan_events` table exists.
- No `qr_guest_alerts` table exists.
- `online_order_sessions` does not yet have QR/table-binding columns.
- `online_store_config` does not yet have QR-specific columns:
  - `accepts_dine_in`
  - `qr_fulfillment_mode`
  - `qr_geofence_enabled`
  - `qr_service_fee_pct`
  - `qr_kill_switch`
- `order_type` does not yet include `qr_dine_in`.
- No QR-specific anon RPCs exist:
  - `resolve_table_qr(...)`
  - `get_qr_order_status(...)`
  - `raise_qr_guest_alert(...)`
  - `resolve_qr_guest_alert(...)`
- No QR token helpers or rotation model are implemented in Track A yet.
- No Track A-owned POS QR actions are attached to the table bottom sheet yet.
- No Track A-owned guest-alert bell or incoming-QR tray exists yet.
- `online_store_config.primary_color` still defaults to retired teal `#2DD4BF`, so QR-22 is still open.

### Exists but belongs to another owner

- Track B storefront / dashboard / edge integration is owned by **Ali Awdi**:
  - `create-online-order` extension for `qr_dine_in`
  - storefront QR landing flow
  - dashboard QR Manager generate/regenerate path
  - guest-alert realtime emit consumer wiring
  - accept-gate behavior wiring on the online-order side
- The HMAC secret handoff and rotation inputs are owned by **Temur**.
- The online-order lightweight broadcast hydration / auto-close dependency stays external with **Ali Jaffal** if it becomes a blocker for QR live-order visibility.

## Architecture Rules

- QR orders never seize or flip the floor-plan dining state.
- `orders.session_id` remains `NULL` for QR dine-in orders.
- `orders.table_number` is the runner-facing label and the only shared table context.
- Guests never get direct row access to QR data; anon access happens only through Track A RPCs and token-scoped realtime auth.
- Reuse `_idempotency_claim(...)`; do not introduce a parallel uniqueness scheme.
- Mirror `cancel_online_order_by_customer(...)` validation style for all guest-facing token/session checks.
- Use `NUMERIC(12,2)` for money and never floats.
- Promotion path is:
  - staging SQL editor first
  - prod SQL editor second
  - `supabase migration repair --status applied`
  - commit migration files after promotion
- Never use `db push`.
- `qr_dine_in` is a first-party online order type, not a table-session shortcut.
- POS and dashboard must consume the same QR backend contracts; no duplicate token logic is allowed.

## Track A Status Matrix

| Ticket | Title | Owner | Status | Depends On | Unblock Artifact | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| QR-1 | `qr_w1_schema` | Track A | `qa_only` | None | Manual staging validation + `get_advisors(security)` pass | Migration authored and user-reported as applied on staging; security/manual validation is the remaining gate. |
| QR-5 | HMAC token helpers + dual-secret rotation | Track A | `blocked` | Temur secret handoff, QR-1 | Current + previous secret values and rotation procedure | Cannot finish without Temur-owned secret inputs. |
| QR-2 | `resolve_table_qr` | Track A | `blocked` | QR-1, QR-5 | QR schema live, token helpers live | Main anon bootstrap RPC for Track B. |
| QR-4 | `get_qr_order_status` | Track A | `ready_to_build` | QR-1 | Wave 2 migration applied on staging | Local migration authored; apply after Wave 1 validation. |
| QR-24 | Token-scoped realtime auth | Track A | `blocked` | QR-1 | Session-bound auth design and channel contract | Track B should not assume live guest realtime until this lands. |
| QR-2b | Guest alert RPCs | Track A | `ready_to_build` | QR-1 | Wave 2 migration applied on staging | Local migration authored, including server-side dedup + rate-limit table. |
| QR-19 | Billing gate via subscription service catalog | Track A | `ready_to_build` | QR-1 | QR service catalog entry + gating rule | Must reuse the current merchant-tier / service-catalog system. |
| QR-22 | Teal -> blue default cleanup | Track A | `qa_only` | None | Manual staging verification on a new row | Migration authored and user-reported as applied on staging. |
| QR-28 | PII / retention policy | Track A | `blocked` | QR-1 | Guest scan tables exist | Policy work depends on actual QR data tables existing. |
| QR-18 | POS table bottom-sheet QR actions | Track A | `waiting_on_other_track` | Awdi QR-15, QR-2, QR-5 | Shared generate/regenerate path live on staging | POS must consume the shared path, not invent its own generator. |
| QR-18b | POS incoming-QR tray + non-seizing marker | Track A | `waiting_on_other_track` | Awdi QR-7 | Accept-gate behavior contract live | Must reflect QR as labelled orders without seizing floor-plan state. |
| QR-18c | POS guest-alert bell | Track A | `waiting_on_other_track` | QR-2b, Awdi QR-9c | Alert broadcast contract live | Bell waits on backend RPCs plus Track B emit wiring. |
| QR-30 | Tax + dual-pricing rule verification | Track A | `waiting_on_other_track` | Awdi QR-6 | `qr_dine_in` order-creation path live | Validation only after Track B creates QR orders end to end. |
| QR-31 | NMI refund verification for `qr_dine_in` | Track A | `waiting_on_other_track` | Awdi QR-6 | Paid QR order fixture on staging | No QR-specific refund code should be introduced unless proven necessary. |
| QR-9b | Loyalty accrual verification | Track A | `waiting_on_other_track` | Awdi QR-6 | Paid QR order with recognizable customer data | Verification-only item once QR orders can be paid on staging. |
| QR-21 | E2E + load + race QA matrix | Track A | `qa_only` | All integrated work | Staging environment with real printed tent and all dependencies delivered | Final closeout only. |

## Execution Waves

### Wave 0: tracking and contracts

- Publish this document first and treat it as the live Track A board.
- Define the Track A / Track B API boundary before any implementation starts.
- Track A-owned API contracts:
  - `resolve_table_qr(p_slug text, p_table_token text)`
  - `get_qr_order_status(p_session_token text)`
  - `raise_qr_guest_alert(p_session_token text, p_alert_type text, p_message text)`
  - `resolve_qr_guest_alert(p_alert_id uuid)`
- Track B may assume only this:
  - those RPC names are stable
  - they are the only supported guest/table bootstrap and alert APIs
  - integration should wait until Wave 2 is live on staging
- Dependency owners to track explicitly:
  - **Temur** for QR-5 secrets
  - **Ali Awdi** for Track B integration tickets
  - **Ali Jaffal** only where lightweight-broadcast hydration becomes a blocker

### Wave 1: schema spine

- Deliver `QR-1` as `YYYYMMDDHHMMSS_qr_w1_schema.sql`.
- Additively create:
  - `table_qr_codes`
  - QR columns on `online_store_config`
  - QR columns on `online_order_sessions`
  - `qr_scan_events`
  - `qr_guest_alerts`
  - enum value `order_type = 'qr_dine_in'`
- Mirror RLS from `floor_plan_objects` for the new QR tables.
- Run `get_advisors(security)` after applying on staging and resolve new findings before promotion.
- Keep enum sequencing strict:
  - add `qr_dine_in` in Wave 1
  - first reference it from code/RPC logic in Wave 2 or later

### Wave 2: token + anon RPC backbone

- Deliver:
  - `QR-5`
  - `QR-2`
  - `QR-4`
  - `QR-24`
- `QR-5` cannot complete without Temur's secret handoff. Treat that as a hard blocker, not a soft assumption.
- Track B must not integrate storefront or Edge QR flow until these are live on staging.
- The Wave 2 contract should give Track B:
  - table resolution
  - session bootstrap
  - guest status polling
  - realtime subscription boundary

### Wave 3: guest alerts + platform controls

- Deliver:
  - `QR-2b`
  - `QR-19`
  - `QR-22`
  - `QR-28`
- `QR-19` must reuse the existing subscription service catalog / merchant-tier system. Do not create a separate QR feature flag.
- `QR-22` is isolated and should land early in this wave because it is low-risk and independent.
- `QR-28` should define both policy and enforcement, not just prose.

### Wave 4: POS tablet surfaces

- Deliver:
  - `QR-18`
  - `QR-18b`
  - `QR-18c`
- These are local tablet integrations on top of Waves 1 to 3.
- Real Track A touchpoints:
  - floor-plan/table surfaces in `components/dashboard/tables/*`
  - orders surface in `app/dashboard/orders/page.tsx`
  - order accept action in `app/dashboard/actions/order.ts`
  - printer capability surface in `app/dashboard/actions/printers.ts`
- POS must consume the shared QR backend and shared generate/regenerate path. No duplicate token logic, no POS-only QR model.
- Preserve the invariant:
  - QR marker may exist
  - floor-plan dining state must remain staff-owned and non-seized

### Wave 5: validation and closeout

- Deliver validation items:
  - `QR-30`
  - `QR-31`
  - `QR-9b`
  - `QR-21`
- These stay open until Awdi's order-creation / storefront path is integrated on staging.
- No item in this wave should be marked complete off mocks alone.

## Dependency Board

### Temur

- **QR-5**
  - current HMAC secret
  - previous HMAC secret for the grace window
  - expected rotation procedure and when to bump `token_version`

### Awdi

- **QR-6**
  - extend `create-online-order` for `qr_dine_in`
- **QR-7**
  - online-order accept-gate behavior contract
- **QR-9c**
  - guest-alert realtime emit wiring
- **QR-15**
  - shared dashboard QR generate/regenerate path used by POS print/reprint

### Ali Jaffal

- External only if it blocks QR live-order surfacing:
  - lightweight-broadcast hydration / auto-close check behavior for online orders

## Cross-Track Progress Notes

- `2026-05-22`:
  - Local worktree now includes the Wave 1 Track A schema migrations:
    - `supabase/migrations/20260522120000_qr_w1_schema.sql`
    - `supabase/migrations/20260522120500_qr_w1_primary_color_default_blue.sql`
  - User reported both migrations were run on staging. This doc still treats Wave 1 as pending manual validation until `get_advisors(security)` and smoke checks are confirmed.
- `2026-05-22`:
  - Local worktree now extends `supabase/functions/create-online-order/index.ts` toward the Track B blockers that Track A depends on:
    - QR-aware table-bound session detection
    - QR service-fee passthrough into the existing order engine
    - customer upsert/link by phone
    - `orders.online_session_id` binding after order creation
    - `orders.table_number` + `order_type='qr_dine_in'` patching after the shared RPC returns
    - explicit post-create `accept_online_order(...)` wiring instead of relying on the legacy `p_auto_accept` shortcut
  - The patch now keeps `online_order_sessions.order_type` inside the legacy `pickup|delivery` constraint instead of widening schema just for session bookkeeping.
  - This patch is local only and depends on the Track A schema being present before deploy.
- `2026-05-22`:
  - Local worktree now includes the Wave 2 Track A RPC migration:
    - `supabase/migrations/20260522133000_qr_w2_status_and_guest_alert_rpcs.sql`
  - It adds:
    - `get_qr_order_status(...)`
    - `raise_qr_guest_alert(...)`
    - `resolve_qr_guest_alert(...)`
    - `qr_guest_alert_rate_limit`
  - This migration is authored locally only. It still needs staging apply + validation.
- `2026-05-22`:
  - Still blocked on the other track:
    - `QR-9c` cannot complete until Track A `QR-2b` exists.
    - `QR-15` cannot complete until Track A `QR-2` and `QR-5` exist, and the QR-20 dashboard spec is considered ready enough to build against.

## QA Closeout Matrix

| # | Scenario | Expected | owner_to_verify |
| --- | --- | --- | --- |
| 1 | Server is physically at a table that also gets a QR order | QR order surfaces as an independent labelled order; floor-plan dining state is not seized or flipped by QR | Track A + Track B |
| 2 | Multiple QR orders on the same `table_number` | Each is an independent paid order sharing only the label; no merge, no shared check, no per-table order limit | Track A + Track B |
| 3 | Cart never paid | Session expires -> `abandoned` logged, no kitchen impact | Track A + Track B |
| 4 | Item 86'd while in cart | Blocked pre-pay with clear message | Track A + Track B |
| 5 | Menu price changed after pay | Captured price holds | Track A + Track B |
| 6 | Existing phone | Customer updated, never duplicated | Track A + Track B |
| 7 | No phone when required | Checkout blocked with explanation | Track A + Track B |
| 8 | Table blocked/removed | Resolve fails closed | Track A |
| 9 | Token rotated mid-cart | Existing session completes; new scans die | Track A + Track B |
| 10 | Payment declined | Recoverable, same idempotency key, no duplicate charge, no kitchen fire | Track A + Track B |
| 11 | POS offline | Order syncs via offline queue; KDS still fires | Track A + Track B |
| 12 | Printer offline at generate | Code saved; download fallback works | Track A + Track B |
| 13 | Outside hours | Closed screen with next-open time | Track A + Track B |
| 14 | Browser closed post-pay | Status recoverable via re-scan or receipt link | Track A + Track B |
| 15 | Double-tap pay on flaky cell | Idempotency holds, single charge | Track A + Track B |
| 16 | Concurrent-scan load test on `resolve_table_qr` | No errors; rate limit holds | Track A |
| 17 | Apple / Google Pay path | Completes | Track A + Track B |
| 18 | Refund a QR order | Succeeds via existing online refund path | Track A + Track B |
| 19 | Kill switch flipped live | New scans stop within seconds; in-flight paid orders unaffected | Track A + Track B |
| 20 | Guest taps "call server" | Bell appears with count 1 on both Order Line and KDS within seconds | Track A + Track B |
| 21 | Guest re-taps "call server" 5 times | Still one open alert; count stays 1 | Track A + Track B |
| 22 | Cashier resolves an alert | Bell decrements or disappears on both surfaces; `resolved_by` recorded; re-resolve is idempotent | Track A + Track B |

## Promotion Runbook

1. Write the migration locally under `supabase/migrations/*`.
2. Apply on **staging** first using the SQL editor for `dfwqakoyittmrwbqvxgw`.
3. Run manual validation for that wave on staging.
4. Resolve any `get_advisors(security)` findings introduced by the new QR objects.
5. Apply the same SQL on **prod** using the SQL editor for `ymbmhyrhofnfdooszehx`.
6. Run:

   ```bash
   supabase migration repair --status applied
   ```

7. Commit migration files only after prod promotion is complete.

Manual validation minimums per promotion:

- schema objects exist where expected
- RLS/policies are present and scoped correctly
- anon flows fail closed on bad input
- no existing online-ordering behavior regressed

Important promotion constraint:

- `CREATE INDEX CONCURRENTLY` must not be wrapped in a `BEGIN/COMMIT` transaction block. If needed, separate it from transactional migration steps.

## Implementation Order While This Doc Is Live

- **Docs first**
  - add this Track A plan/status doc
  - start the status matrix with grounded repo truth, not ticket assumptions

- **Schema and RPC second**
  - all new QR backend work goes under `supabase/migrations/*`
  - do not start QR dashboard/storefront logic before the data contracts exist
  - use `SECURITY DEFINER` and `SET search_path TO 'public','pg_temp'` consistently

- **POS third**
  - attach QR actions to the existing table bottom sheet
  - add non-seizing QR markers and incoming-QR tray only after the data contracts are live
  - guest-alert bell waits for RPCs plus broadcast contract

- **Track B stays external**
  - if a task depends on Awdi, stop at the contract
  - mark the dependency explicitly
  - do not fill gaps with placeholder code in Edge/storefront/dashboard files owned by Track B

## Test Plan

### Repo-grounding checks before implementation

- Confirm no existing QR tables or QR RPCs are already present.
- Confirm `order_type` does not yet include `qr_dine_in`.
- Confirm `online_store_config.primary_color` still defaults to teal.
- Confirm printer QR support field exists.
- Confirm current anon session validation function exists and is reusable.

### Wave-by-wave acceptance

- **Wave 1**
  - schema exists
  - RLS mirrors `floor_plan_objects`
  - advisor checks pass

- **Wave 2**
  - valid scan resolves
  - invalid scan fails closed
  - polling works
  - rate limiting holds

- **Wave 3**
  - guest alerts dedup and resolve correctly
  - billing gate blocks or permits correctly
  - default color applies only to new rows

- **Wave 4**
  - POS print / reprint / regenerate / on-off works
  - QR markers remain non-seizing
  - accept tray works
  - bell stays in sync

- **Wave 5**
  - refund validation passes
  - loyalty validation passes
  - tax / pricing validation passes
  - full 22-row matrix passes

### Final signoff

- staging printed-tent test completed
- Temur signoff recorded
- any undelivered external dependency remains explicitly open in this doc rather than silently assumed complete

## Assumptions and Defaults

- A new doc is preferable to overwriting the older QR foundation note.
- This doc is the live tracker and should be updated as work lands.
- Track A starts from "not implemented in repo" for QR-specific backend features unless directly discoverable otherwise.
- QR-19 integrates into the existing merchant-tier / service-catalog system already present in this repo.
- POS tablet integration reuses existing floor-plan and orders surfaces rather than creating a parallel tablet route.
- External dependencies stay out of scope for Track A implementation and must remain explicit blockers, not worked around.
