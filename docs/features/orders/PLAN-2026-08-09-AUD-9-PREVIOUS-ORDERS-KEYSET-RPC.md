# AUD-9 — Previous Orders Keyset Pagination RPC (`get_previous_orders_page_v1`)

**Ticket:** [POS-PERF] AUD-9 — https://app.notion.com/p/3a88280c1b1d8148b69bee999480fb7e
**Notion status at plan time:** Not started · Owner: Ali Dika (RPC) · Client: Ali Jaffal (store/screen)
**Ticket branch:** `feat/landi-pay` (POS repo) · **This document covers the DB/RPC half only.**
**Plan author:** Ali Awdi · **Date:** 2026-08-09 (rev 2026-08-10) · **Rev 6** — RPC implemented, see §11
**⚠ Rev 6 corrects a material error in §3.3 carried by Rev 1–5.** See §12.
**Source:** Audit §9 (POS Rush-Lag Investigation, Phase 2)

---

## 1. Why this ticket exists

Previous Orders is the POS screen a cashier opens to find an earlier order (reprint,
refund, lookup). Three problems compound:

1. **Business-day bounds are resolved client-side.** A restaurant "day" does not end at
   midnight; it ends at a configured hour. Computing that on the device is the source of
   the timezone class of bug already tracked live in
   *"[POS · Online Orders] 'Today'/'Yesterday' tabs use inconsistent day boundaries
   (local vs UTC)"*.
2. **The query carries the full object graph.** Items + payments + discounts are fetched
   per order, for a screen that renders only a summary row. Wire cost is orders of
   magnitude above what is painted.
3. **The screen clears its list on navigation away**, forcing a full refetch on return.

AUD-9 replaces **the payload shape**, not the scroll pattern. The `useInfiniteQuery`
shape from the Apr-6 ticket *"Paginate Orders — Fetch 100 at a Time"*
(https://app.notion.com/p/33a8280c1b1d81838ff9c9fdb5c04d97) is retained; only the fetch
function is swapped — **subject to §6 Step 0.8**, which must confirm what the client
actually does today. That Apr-6 ticket closed with unchecked ACs — its behaviors are
re-verified under this ticket's QA.

### Why keyset instead of OFFSET

`OFFSET 500` makes Postgres walk and discard 500 rows before returning anything, and the
cost grows with scroll depth. A keyset predicate — "rows older than this exact
`(created_at, id)`" — seeks directly into the index at constant cost per page, and is
immune to rows shifting underneath a scroll as new orders arrive.

---

## 2. Blast radius

Deliberately small. This is why AUD-9 was selected over AUD-1/2/8/10.

| Dimension | Assessment |
| --- | --- |
| New objects | One function. `get_previous_orders_page_v1` does not exist on staging |
| Existing objects modified | **None** |
| Writes | **None** — read-only, `STABLE` |
| Index changes | **One, required** — the chosen status set (0.1) includes `refunded`/`declined`, so the existing partial index provably cannot match. Additive, `CONCURRENTLY`, written but **not to be applied before the Step 3 EXPLAIN** |
| Callers on deploy | **Zero** — inert until the tablet client switches over |
| Rollback | `DROP FUNCTION` (+ `DROP INDEX CONCURRENTLY` if one was added), scripted in `supabase/migrations/rollback/` per repo convention |

---

## 3. Findings that change the ticket as written

### 3.1 `p_order_type` is the wrong column for the stated purpose — RESOLVED: ship both

The ticket's SQL sketch filters `o.order_type = p_order_type`, and justifies the
parameter as letting the Online-orders channel filter ride this RPC "without a v2."
Those are two different columns:

| Column | Values | Meaning |
| --- | --- | --- |
| `orders.order_type` (enum) | `dine_in`, `takeout`, `delivery`, **`online`**, `catering`, `qr_dine_in` | Fulfillment type |
| `orders.order_source` (text, default `'pos'`) | `pos`, `kiosk`, `online_store`, `orderout` | Reporting **channel** |

Verified: enum at [`remote_schema.sql:126-131`](../../../supabase/migrations/20260413215901_remote_schema.sql#L126-L131)
plus `qr_dine_in` in current [`database.types.ts:26729-26736`](../../../database.types.ts#L26729-L26736);
column at [`schema.sql:2896`](../../../schema.sql#L2896); channel taxonomy constrained and
normalized by [`20260722120000_kiosk_channel_reporting.sql`](../../../supabase/migrations/20260722120000_kiosk_channel_reporting.sql).

**The dangerous part is that `order_type` already contains `online`.** A channel filter
built on it would not fail loudly — it would return a plausible-looking subset that
silently omits `kiosk` and `orderout` orders and misclassifies online-store orders
carrying a fulfillment type. A filter that looks correct in a demo and diverges in
production is worse than one that errors.

There is also a vestigial `order_channel` enum (`pickup`, `dine_in`, `delivery`) in the
type catalog with no column on `orders`
([`database.types.ts:26432`](../../../database.types.ts#L26432)). It is a third spelling
of an overlapping idea and is not a candidate — noted only so nobody rediscovers it and
assumes it is the channel key.

**Decision: ship both `p_order_type` and `p_order_source`, nullable, independently applied.**

### 3.2 `total` has a dual-pricing trap — RESOLVED: return lane fields **plus `total_amount`**

Under dual pricing, `orders.total_amount` and `orders.effective_total` are **always the
card track**, including on cash-paid orders
([`lib/orders/pricing-lane.ts`](../../../lib/orders/pricing-lane.ts)). The real cash
figure is `cash_total`. `card_total` / `cash_total` / `payment_pricing_mode` all exist
([`schema.sql:2880-2889`](../../../schema.sql#L2880-L2889)); the charged-lane resolver is
TypeScript-only ([`lib/orders/order-breakdown.ts`](../../../lib/orders/order-breakdown.ts)).

**`total_amount` must also be returned.** `getOrderBreakdown` resolves totals as
`pick(order.card_total, order.total_amount)` / `pick(order.cash_total, order.total_amount)`
([:115-117](../../../lib/orders/order-breakdown.ts#L115-L117)) — it falls back to the bare
column for legacy / non-dual-pricing rows with null lane columns. And `pick`
([:90-98](../../../lib/orders/order-breakdown.ts#L90-L98)) **returns `0` when every
candidate is null**, so omitting `total_amount` would not surface an error — those orders
would render **`$0.00` in the history list**, reading as a real order that collected
nothing. Silent and plausible; the worst failure mode available.

**Decision: return `card_total`, `cash_total`, `payment_pricing_mode`, `total_amount`.**
Client foots with the helper it already owns. Money stays `NUMERIC(12,2)` dollars.
**Nobody "fixes" the money model in this ticket.**

### 3.3 `business_day_start_hour` and `business_day_end_hour` are duplicate spellings of one setting — VERIFY IN STEP 0

`public.locations` carries both ([`schema.sql:1458-1459`](../../../schema.sql#L1458-L1459)):

- `business_day_start_hour` (`smallint`, default 0) — read by `get_business_day_bounds()`
  ([`20260414000004:193`](../../../supabase/migrations/20260414000004_missing_functions.sql#L193)), 3 migrations
- `business_day_end_hour` (`integer NOT NULL`, default 0) — added by
  [`20260420000003`](../../../supabase/migrations/20260420000003_business_day_end_hour.sql)
  for overnight shifts. Read by **exactly three functions, all tips/labour**:
  `calculate_tip_distribution_v2`, `rebuild_employee_daily_tips`,
  `declare_cash_tips_for_shift`

> **Correction (Rev 6).** Rev 1–5 of this plan said `end_hour` was read by "the tips
> **and business-day-summary** functions, 9 migrations." That was wrong and nearly caused
> the RPC to be built on the wrong column. Nine *files* mention it, but they are repeated
> revisions of the same three tip functions. `get_business_day_summary_v1` does **not**
> read `end_hour` — it calls `get_business_day_bounds()`, which reads `start_hour`, as do
> `get_business_day_activity_summary_v1`, the kiosk channel reporting and the in-kind
> bucket summary.
>
> **The real split is: tips/labour → `end_hour`; every order and reporting surface →
> `start_hour`.** Previous Orders is an order surface and must reconcile against the
> business-day and activity summaries, so it uses **`start_hour`** via
> `get_business_day_bounds` — which means the helper *is* reusable and §4's default holds.
> That the tips functions disagree with every other surface is the actual latent platform
> bug; it stays out of scope per §9.

**These are not two endpoints of a range — they are two names for the same boundary
hour.** `get_business_day_bounds` with `start_hour = 4` yields `date+4h → date+1d+4h`; the
end-hour migration's own comment defines `end_hour = 4` as "Mon 4 AM → Tue 4 AM."
Identical windows from identically-valued columns.

Both default to `0`, so they agree on default configuration and the drift is invisible in
most test data. But a venue configured `end_hour = 4, start_hour = 0` does not get a
subtly wrong window — it gets **tips computed on one window and Previous Orders on
another, offset by the full four hours.**

This is exactly the bug class AUD-9 exists to eliminate, so it must be resolved rather
than inherited. Determine which column the screen's Jul-11 logic honors and match it.
If the two disagree in live data, raise it — reconciling them platform-wide is its own
ticket, not this one.

**RESOLVED (2026-08-10): `business_day_start_hour`, via `get_business_day_bounds`.**
Implemented as assumption A1 in the migration header. Still worth Ali Dika confirming
against what the tablet screen does today — the reasoning above is inferred from the
platform's own usage, not observed on the device.

---

## 4. What already exists (reuse, do not reinvent)

| Asset | Location | Use |
| --- | --- | --- |
| `get_active_orders_v1` | [`20260529130000`](../../../supabase/migrations/20260529130000_get_active_orders_v1.sql) | **Template.** `SECURITY DEFINER`, `SET search_path TO 'public','pg_temp'`, `user_location_ids()` guard raising `42501`, `RETURNS SETOF json` |
| `get_business_day_bounds(p_location_id, p_start_date, p_end_date)` | [`20260414000004`](../../../supabase/migrations/20260414000004_missing_functions.sql) | Returns `(start_ts, end_ts)`. Reads `start_hour` only — **reusable only in one branch of §3.3**. Also already accepts a start/end pair, relevant to §5.6 |
| `get_order_details(p_order_id)` | `20260413215901_remote_schema.sql:14290` | The detail path this RPC hands off to. Note its own comment: *"requires location.orders.view or merchant.orders.view permission"* — a stricter guard than `user_location_ids()`, see §5.9 |
| `user_location_ids()` | `20260413215901_remote_schema.sql:30569` | Location membership array for the authz guard |
| `idx_orders_history_bootstrap` | [`20260529130100`](../../../supabase/migrations/20260529130100_idx_orders_history_bootstrap.sql) | `(location_id, created_at DESC) WHERE status IN ('completed','cancelled','void')` |
| `idx_orders_location_created_at_desc` | `20260413215901_remote_schema.sql:38889` | Non-partial fallback |
| `normalize_order_source()` | [`20260722120000`](../../../supabase/migrations/20260722120000_kiosk_channel_reporting.sql) | Channel normalization for `p_order_source` |

### 4.1 The existing index probably does not cover this query

Two independent reasons, both to be confirmed by EXPLAIN in Step 3 — but the plan should
assume an index is needed rather than be surprised by it:

1. **Partial-predicate implication.** Postgres uses a partial index only when the query's
   predicate *implies* the index predicate. `idx_orders_history_bootstrap` is restricted
   to `status IN ('completed','cancelled','void')`. `order_status` also contains
   `refunded` ([`remote_schema.sql:112-124`](../../../supabase/migrations/20260413215901_remote_schema.sql#L112-L124)).
   If the history status set includes `refunded` — likely, and settled in Step 0.1 — the
   partial index **cannot** be matched.
2. **Missing `id` column.** The index is `(location_id, created_at DESC)`. With
   `ORDER BY created_at DESC, id DESC`, ties on `created_at` must still be ordered, so the
   best case is an incremental sort; and the row-wise keyset comparison
   `(created_at, id) < (…)` cannot seek cleanly against an index lacking `id`.

**Probable remedy:**

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_history_keyset
  ON public.orders (location_id, created_at DESC, id DESC)
  WHERE status IN (<history status set from Step 0.1>);
```

Cheap and additive, but it is an index change — §2 reflects that. `CREATE INDEX
CONCURRENTLY` cannot run inside a transaction block: separate statement, outside a
transaction, and only with the EXPLAIN row that justifies it attached.

---

## 5. Proposed contract

```sql
get_previous_orders_page_v1(
  p_location_id   uuid,
  p_business_date date       default null,   -- null = current business day
  p_order_type    order_type default null,   -- enum, not text (§5.3)
  p_order_source  text       default null,   -- channel filter (§3.1)
  p_cursor        jsonb      default null,   -- {created_at, id}; null = first page
  p_limit         int        default 50      -- clamped, see §5.2
) returns jsonb            -- envelope; pending Step 0.10, see §5.4
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
```

**Row shape (summary only — no items, no payments, no discounts):**
`id`, `order_number`, `display_number`, `created_at`, `status`, `payment_status`,
`order_type`, `order_source`, `table_number`, `customer_name`,
`platform_order_number`, `delivery_platform` (§5.5),
money per §3.2 (`card_total`, `cash_total`, `payment_pricing_mode`, `total_amount` —
all `NUMERIC(12,2)` dollars).

**Page envelope:** see §5.4 — `SETOF json` alone cannot carry `next_cursor` or a
stop signal cleanly, so the signature above shows the recommended `jsonb` envelope.
If Step 0.10 picks the `SETOF json` + `limit + 1` variant instead, the return type
changes back and `has_more` rides every row.

### Deviations from the ticket's literal spec

Tracked deliberately so review can accept or reject each one:

| Ticket says | Plan says | Why |
| --- | --- | --- |
| `p_order_type text` | `p_order_type order_type` (enum) | §5.3 — typo fails loud instead of returning an empty page |
| *(no source param)* | adds `p_order_source text` | §3.1 — the channel filter the parameter was justified by needs `order_source`, not `order_type` |
| *(no status filter)* | mandatory status set | §5.9 — otherwise live in-flight orders enter history |
| Fields: order number, created_at, total, status, type/channel, table, guest name | + `id`, `display_number`, `payment_status`, `platform_order_number`, `delivery_platform` | `id` is required by the keyset cursor and to open detail; the rest per §5.5 / §5.10 |
| `limit p_limit` | `limit v_limit + 1`, clamped | §5.2, §5.4 — named clamp + `has_more` probe |
| `returns` unspecified | `jsonb` envelope | §5.4 — the ticket's shape cannot carry a stop signal |

### 5.1 Cursor is server-emitted, not client-reconstructed

The page carries `next_cursor` as a server-serialized `{created_at, id}` — at the envelope
level per §5.4, not smuggled onto a row. A cursor rebuilt on the client from a rendered timestamp is a
precision-loss bug waiting to happen: `timestamptz` → text → `timestamptz` round-trips
drop microseconds, producing duplicated or skipped rows at page boundaries. Step 4 tests
for that; the contract should make it unrepresentable rather than merely detectable.

**`next_cursor` only helps if its encoding is lossless.** The row's own `created_at` is
already in the payload; emitting a `next_cursor` that serializes the same way is
decorative — it inherits the identical precision loss and buys nothing. The cursor must
be encoded so the round-trip is exact, e.g.

```sql
to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
```

with the RPC parsing it back with the matching cast. Whatever encoding is chosen, the
Step 4 microsecond fixture must exercise **that** encoding, not the display timestamp.

If `next_cursor` is not adopted, the exact serialization format must be pinned in the
handoff instead — but emitting it is strictly safer.

### 5.2 `p_limit` clamp is named, not implied

AUD-9 specifies default 50; the Apr-6 ticket the client retains says "fetch 100 at a
time." The RPC clamps explicitly so the client is not guessing:

```sql
v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);
```

### 5.3 `p_order_type` is typed as the enum

Declaring the parameter `order_type` rather than `text` (and dropping the
`o.order_type::text` cast) makes a typo raise `22P02` instead of silently returning an
empty page. Does not apply to `p_order_source`, which is genuinely `text` with a CHECK.

### 5.4 Return shape must carry a cursor **and** a stop signal

`RETURNS SETOF json` — inherited from the `get_active_orders_v1` template — streams rows
and has nowhere to put page-level metadata. "The last row carries `next_cursor`" is a
workaround, not a contract: the client has to reach into the final array element, and an
empty page carries nothing at all.

Worse, there is **no way to know the list has ended.** `useInfiniteQuery`'s
`getNextPageParam` needs a stop signal; without one, every list fires one extra request
that returns zero rows — on every scroll to the bottom, on every station.

Two acceptable resolutions, to be picked in Step 0.10:

1. **Envelope (recommended):** `RETURNS jsonb` shaped
   `{ rows: [...], next_cursor: <lossless string|null>, has_more: bool }`.
   Departs from the `SETOF json` template, but the template was built for a streaming
   active-order feed with no pagination — different problem.
2. **Keep `SETOF json`** and probe with `LIMIT v_limit + 1`: fetch one extra row, drop it
   before returning, and expose `has_more` on every row. Preserves the template at the
   cost of a redundant field per row.

Either way `has_more` must be derived from an actual `limit + 1` probe, not inferred from
`count(rows) = v_limit` — a page that happens to land exactly on the boundary is
indistinguishable from a full one.

### 5.5 Platform order identity belongs in the summary

`orders` carries `platform_order_number` and `delivery_platform`
([`schema.sql:2897-2898`](../../../schema.sql#L2897-L2898)). Both belong in the row shape,
and the reason is §3.1: this RPC is being built to carry the **Online-orders channel
filter**. Filtering history down to `orderout` and then rendering only the internal
`order_number` hands the cashier the one identifier the customer and the delivery platform
do not use.

There is precedent on both sides: KDS surfaced `platform_order_number` for exactly this
reason in [`20260804130000`](../../../supabase/migrations/20260804130000_kds_platform_order_number.sql),
and `delivery_platform` is the field the platform badge resolves from per the sibling plan
[`PLAN-2026-06-29-DELIVERY-PLATFORM-LOGOS-WEB.md`](PLAN-2026-06-29-DELIVERY-PLATFORM-LOGOS-WEB.md).
Omitting them means the channel filter ships and is immediately not very useful.

### 5.6 Single date or range? And is there a search box?

`p_business_date` is a single `date`. `get_business_day_bounds` already accepts
`(p_start_date, p_end_date)`. If Previous Orders offers anything beyond one business day —
a "Last 7 days", a date-range picker, an "All" tab — the contract is a parameter short and
a `v2` is back on the table, which is the outcome §3.1 exists to prevent. Settled in
Step 0.9.

The same question applies to **search**: if the screen has a search box (order number,
customer name, phone), a day-scoped keyset RPC either has to carry a search parameter or
search silently degrades to filtering only the pages already loaded. Also Step 0.9.

### 5.7 Guard asymmetry with the detail path

This RPC guards on location membership via `user_location_ids()`, copied from
`get_active_orders_v1`. `get_order_details` documents a stricter guard —
`location.orders.view` / `merchant.orders.view` permission. So a user could conceivably
list history rows they cannot open.

That asymmetry already exists between `get_active_orders_v1` and `get_order_details`; this
ticket does not create it and should not unilaterally resolve it. Noted so the choice is
deliberate. If Step 0 finds the permission guard is the right one for history, use it —
but do not invent a third guard shape.

### 5.8 Predicate

```sql
where o.location_id = p_location_id
  and o.status = any (v_history_statuses)        -- REQUIRED, see §5.9
  and o.created_at >= v_day_start and o.created_at < v_day_end
  and (p_order_type   is null or o.order_type   = p_order_type)
  and (p_order_source is null
       or o.order_source = public.normalize_order_source(p_order_source))
  and (p_cursor is null
       or (o.created_at, o.id) < ((p_cursor->>'created_at')::timestamptz,  -- parse must
                                  (p_cursor->>'id')::uuid))                -- match §5.1's
                                                                          -- emit format
order by o.created_at desc, o.id desc
limit v_limit + 1;   -- +1 probe for has_more (§5.4); extra row dropped before return
```

> ⚠️ **`normalize_order_source(NULL)` returns `'pos'`, not `NULL`**
> ([`20260722120000:13-23`](../../../supabase/migrations/20260722120000_kiosk_channel_reporting.sql#L13-L23)
> — the `ELSE COALESCE(..., 'pos')` branch). The `p_order_source is null` check **must**
> short-circuit before normalization ever runs. Folding the two into a single
> `o.order_source = normalize_order_source(p_order_source)` silently filters the entire
> history to POS orders whenever no channel filter is supplied — a default-path bug that
> no channel-filter test would catch.
>
> Normalization is still worth applying, because `normalize_order_source` maps legacy
> spellings (`'online'` → `'online_store'`, `'in_store'`/`'phone'` → `'pos'`) that a caller
> may reasonably pass.

### 5.9 The status set is part of the contract

The status filter is **mandatory**, not optional. Without it the RPC returns `draft`,
`pending`, `sent_to_kitchen` and `preparing` rows — live, in-flight orders — into a
history screen, and it also guarantees no partial index can ever be matched (§4.1).

The exact set is decided in Step 0.1 and written into the function as a constant, and
whatever is chosen must match the index predicate in §4.1.

**The question is wider than `refunded`.** `order_status` also carries `accepted` and
`declined` ([`remote_schema.sql:122-123`](../../../supabase/migrations/20260413215901_remote_schema.sql#L122-L123)),
set by the merchant accept/decline flows on online orders
([:1084](../../../supabase/migrations/20260413215901_remote_schema.sql#L1084),
[:7484](../../../supabase/migrations/20260413215901_remote_schema.sql#L7484)).
A **declined** order is terminal — it belongs in history by any reasonable reading, and it
is precisely the row an Online-orders channel filter (§3.1) would be used to find. An
`accepted` order is *not* terminal and probably does not.

Candidate set: `('completed','cancelled','void','refunded','declined')`. Step 0.1 must
rule on `refunded` **and** `declined` explicitly — deciding only the former leaves the
channel filter this RPC is built to carry looking at an incomplete list.

### 5.10 `payment_status` is passed through, never filtered or derived on

There is an open bug in this folder —
[`BUG-void-order-payment-status-clobbers-collected-payment.md`](BUG-void-order-payment-status-clobbers-collected-payment.md)
— where `void_order` forces `payment_status = 'void'` regardless of money actually
collected. Its proposed fix **derives** `payment_status` instead (`refunded` when money was
collected, `pending` when not) **and backfills existing rows**.

Consequences for AUD-9:

1. **Filter on `status`, never on `payment_status`.** The status dimension is stable; the
   payment dimension is mid-repair and will be rewritten under existing rows.
2. **Do not derive anything** from `payment_status` in this RPC — pass the column through
   and let the client label it. Any derivation here becomes a third disagreeing
   implementation, alongside the POS RPC and the web action that the bug doc already notes
   disagree with each other.
3. **Expect history labels to shift** when that fix and its backfill land. Rows will not
   move in or out of the list (`status = 'void'` is untouched), but their payment label
   will change. Worth knowing before someone reports it as an AUD-9 regression.

**Detail loading is out of scope.** Full order detail continues to load on open through
the existing `get_order_details` path. Working-set rules must **agree with** W1-3
detail-sync gating (https://app.notion.com/p/39c8280c1b1d813ab1b3f98cf43fece6) —
read it, match it, do not modify it.

---

## 6. Work items

### Step 0 — Resolve contract questions (blocking, cheap)

> **Status 2026-08-10:** 0.1, 0.3, 0.10 resolved by the plan author and implemented as
> documented assumptions (A1–A3 in the migration header). They are **decisions, not
> confirmations** — Ali Dika should still ratify them, especially 0.3. The remainder are
> genuinely other people's answers and stay open.

- [x] **0.1 — History status set** (§5.9) → **`completed, cancelled, void, refunded, declined`.** Terminal statuses only; `declined` included (terminal, and what the channel filter searches for), `accepted` excluded (still in flight). Forces the §4.1 index
- [ ] 0.1b — *Ratify with Ali Dika / Jaffal against what the screen shows today*
- [ ] 0.2 — §3.1 confirm `p_order_source` ships alongside `p_order_type` — Ali Dika (ties to his Kiosk channel ticket)
- [x] 0.3 — §3.3 → **`business_day_start_hour`**, reusing `get_business_day_bounds`. See the Rev 6 correction in §3.3 — an earlier draft of this plan had this backwards. **Highest-value item for Dika to ratify**
- [ ] 0.4 — §3.2 confirm money field list including `total_amount`
- [ ] 0.5 — §5.1 confirm `next_cursor` is emitted server-side
- [ ] 0.6 — §5.2 confirm the clamp ceiling (50 default / 100 max)
- [ ] 0.7 — Payload field list acknowledged by Ali Jaffal
- [ ] **0.8 — Confirm the client's current history fetch path.** The index migration comment
      ([`20260529130100`](../../../supabase/migrations/20260529130100_idx_orders_history_bootstrap.sql))
      names `getHistoryOrders` / `getHistoryOrdersByCursor`, implying a cursor path may
      already exist. If so, "swap the fetch function" may over- or under-state the client
      work. Ask Jaffal now, not at handoff
- [ ] **0.9 — Does the screen do more than one business day, and does it have a search box?** (§5.6)
      A date range or a search field that this contract cannot express forces the `v2` §3.1
      exists to prevent. Ask before the signature is frozen
- [x] **0.10 — Return shape** (§5.4) → **`jsonb` envelope `{rows, next_cursor, has_more}`**, `has_more` from a `limit + 1` probe
- [ ] 0.11 — §5.5 confirm `platform_order_number` + `delivery_platform` in the row shape
- [ ] 0.12 — §5.7 confirm the authz guard: `user_location_ids()` (matching `get_active_orders_v1`) or the permission check `get_order_details` uses

### Step 1 — Baseline — ⚠️ ONE-WAY DOOR, CROSS-REPO
- [ ] Record current Previous Orders payload **bytes per page** and **first-content time**, on the tablet
- [ ] Note the status set and day-window the screen requests today (feeds 0.1 and 0.3)

> **This is a scheduling dependency, not a checkbox.** The measurement must be taken on
> the tablet *before* Jaffal switches the client over. Once the client swaps, the "before"
> is unrecoverable and AC 1 can never be closed — no quality of RPC recovers it.
> Not blocking for writing SQL; blocking for closing the ticket.

### Step 2 — Implement
- [ ] Migration `supabase/migrations/<ts>_get_previous_orders_page_v1.sql` (file only; never dashboard-only edits)
- [ ] **Rollback script** `supabase/migrations/rollback/<ts>_get_previous_orders_page_v1_rollback.sql` — repo convention, 52 existing files in that folder. Must drop the index too if §4.1 adds one
- [ ] Authz guard per Step 0.12 — `42501` on non-member location (§5.7)
- [ ] Business-day bounds resolved **inside** the function — **and via the correct column per §3.3**; do not reuse `get_business_day_bounds` if Step 0.3 answers `end_hour`
- [ ] Mandatory status filter from Step 0.1 (§5.9)
- [ ] `p_order_type` typed as the enum (§5.3)
- [ ] `p_order_source` null-checked **before** normalization (§5.8 warning)
- [ ] Keyset predicate + `ORDER BY created_at DESC, id DESC` + clamped `LIMIT` (§5.2)
- [ ] `next_cursor` in a lossless encoding + `has_more` from a `limit + 1` probe (§5.1, §5.4)
- [ ] Summary columns only — assert no items/payments/discounts subqueries
- [ ] Money fields per §3.2 including `total_amount`; `payment_status` passed through underived (§5.10)
- [ ] `platform_order_number` + `delivery_platform` in the row shape (§5.5)
- [ ] Grants matching sibling read RPCs

### Step 3 — Verify on staging (`dfwqakoyittmrwbqvxgw`)
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` **at Charcoal data volume** (the ticket's stated bar), first page and a deep cursor page
- [ ] Determine whether `idx_orders_history_bootstrap` is matched or the §4.1 index is required
- [ ] If required: `CREATE INDEX CONCURRENTLY`, separate statement, EXPLAIN row attached as justification
- [ ] Confirm no full sort on the ordering columns
- [ ] Record payload bytes/page vs Step 1
- [ ] `pg_get_functiondef` captured post-deploy — live DB is authoritative, not CSVs

### Step 4 — Midnight-boundary fixture (the one real regression surface)
- [ ] Non-UTC timezone **and** non-zero business-day hour
- [ ] Orders at boundary − 1s, boundary, boundary + 1s land in the correct bucket
- [ ] Newest-first ordering holds across the boundary
- [ ] UTC-midnight regression from the Jul-11 ticket does not reappear
- [ ] Cursor paging across the boundary returns no duplicates and skips nothing
- [ ] Ties on identical `created_at` resolve deterministically via the `id` tiebreaker
- [ ] Microsecond round-trip: a cursor from a `created_at` with non-zero microseconds pages correctly, exercising the **chosen cursor encoding** rather than the display timestamp (§5.1)
- [ ] `has_more` is `false` on a page that lands exactly on the row count, and the client stops — no trailing empty request (§5.4)
- [ ] Empty result set (a day with no orders) returns a well-formed page, not a null envelope
- [ ] `p_order_source = NULL` returns **all** channels, not just `pos` (§5.8 normalization trap)

### Step 5 — Handoff
- [ ] Post signature + sample payload + cursor contract for Ali Dika / Ali Jaffal
- [ ] Scope the client change against the Step 0.8 answer
- [ ] Client files (tablet repo, not ours): `stores/usePreviousOrdersStore.ts` (1,645 lines), `app/(main)/previous-orders.tsx` (990), `services/orderService.ts`

### Step 6 — Production
- [ ] Staging verified first
- [ ] Prod via SQL editor + `migration repair --status applied`
- [ ] Recording by a non-implementer

---

## 7. Acceptance criteria (from the ticket)

| # | AC | Half |
| --- | --- | --- |
| 1 | First-content time improvement recorded; payload bytes/page recorded | **Both** — requires the Step 1 baseline (one-way door) |
| 2 | Nav away + back within retention window → zero refetch | **Client only** (Jaffal) |
| 3 | Newest-first + business-day boundaries correct across midnight | **DB** — Step 4 |
| 4 | Detail loads only on order open | **Client only** (Jaffal) |
| 5 | Recording by non-implementer | **Both** |

> **This document can be completed without the ticket being closeable.** ACs 2 and 4 are
> client-half and live in the tablet repo; AC 1 depends on a measurement that must be
> taken before the client cutover. Do not mark AUD-9 done on the strength of the DB work
> alone.

---

## 8. Constraints

- Money stays `NUMERIC(12,2)` dollars in every payload field
- `SECURITY DEFINER` + pinned `search_path`; authorization enforced **inside** the
  function — no tenant-isolation regression
- Migration files only; staging before prod
- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block — separate statements,
  and only with an EXPLAIN row justifying each index

## 9. Explicitly out of scope

- `get_order_details` and the W1-3 gating rules — agree with them, do not modify
- The dual-pricing money model (§3.2)
- Reconciling `business_day_start_hour` vs `business_day_end_hour` platform-wide (§3.3)
- Client caching / nav-away retention — tablet repo, Ali Jaffal
- Any change to `get_active_orders_v1`

## 10. Open risks

| Risk | Mitigation |
| --- | --- |
| Business-day column drift (§3.3) offsets history by the full boundary hour for overnight venues | Resolve in Step 0.3; boundary fixture in Step 4 |
| Cash orders display card totals, or legacy rows render `$0.00` silently (§3.2) | Return lane fields **+ `total_amount`**; foot with the existing client helper |
| Channel filter needs a v2 anyway (§3.1) | Ship `p_order_source` now |
| Live in-flight orders leak into history (§5.9) | Mandatory status filter, set decided in Step 0.1 |
| `p_order_source = NULL` silently filters history to POS orders (§5.8) | Null check strictly before `normalize_order_source`; explicit Step 4 case |
| Client cannot tell the list ended → a trailing empty request per scroll (§5.4) | `has_more` from a `limit + 1` probe, decided in Step 0.10 |
| Channel filter ships without the platform's own order number (§5.5) | `platform_order_number` + `delivery_platform` in the row shape |
| `get_business_day_bounds` reused in the `end_hour` branch → wrong window for overnight venues (§3.3) | Step 0.3 answer explicitly gates whether the helper may be reused |
| Screen has a search box or date range the contract cannot express (§5.6) | Step 0.9, before the signature is frozen |
| Void-bug backfill shifts `payment_status` under history rows (§5.10) | Filter on `status` only; pass `payment_status` through underived |
| Neither existing index serves the query (§4.1) | Assume an index is needed; confirm by EXPLAIN before creating |
| Cursor precision loss at page boundaries (§5.1) | Server-emitted `next_cursor` **in a lossless encoding** — a same-format cursor inherits the bug |
| Terminal online-order statuses (`declined`) omitted from history, breaking the channel filter (§5.9) | Step 0.1 rules on `declined` as well as `refunded` |
| Baseline lost to client cutover | Step 1 flagged as a one-way door with a cross-repo dependency |
| Apr-6 ticket closed with unchecked ACs | Re-verify its scroll behaviors under Step 4 |

---

## 11. Implementation status

**Branch:** `feat/aud-9-previous-orders-keyset-rpc` (off `aliawdi-dev`)
**Written 2026-08-10. Nothing applied to any database — files only.**

| File | Purpose |
| --- | --- |
| [`supabase/migrations/20260810120000_get_previous_orders_page_v1.sql`](../../../supabase/migrations/20260810120000_get_previous_orders_page_v1.sql) | The function. Assumptions A1–A5 in the header |
| [`supabase/migrations/20260810120100_idx_orders_history_keyset.sql`](../../../supabase/migrations/20260810120100_idx_orders_history_keyset.sql) | Companion index, separate file (`CONCURRENTLY`) |
| [`supabase/migrations/rollback/20260810120000_get_previous_orders_page_v1_rollback.sql`](../../../supabase/migrations/rollback/20260810120000_get_previous_orders_page_v1_rollback.sql) | Drops both |

**Verified:** structural lint only — balanced dollar-quoting, net-zero parens,
`BEGIN`/`END IF` matched, no unused declarations. **Not executed against any database**,
so it is unproven against a live planner and schema. Step 3 remains outstanding in full.

**Still open:** Steps 1 (baseline), 3 (EXPLAIN at Charcoal volume), 4 (fixtures), 5, 6;
and Step 0 items 0.2, 0.4–0.9, 0.11, 0.12 plus ratification of 0.1/0.3/0.10.

## 12. Revision history

- **Rev 1** (2026-08-09) — initial plan.
- **Rev 2** (2026-08-09) — plan review incorporated. Added the mandatory status predicate
  (§5.5) and its index consequence; reclassified the index change from "not expected" to
  "likely" with a named candidate index (§4.1, §2); added `total_amount` to the money
  payload with the `pick`-returns-zero rationale (§3.2); made the cursor server-emitted
  (§5.1); named the `p_limit` clamp (§5.2); typed `p_order_type` as the enum (§5.3);
  sharpened §3.3 to "duplicate spellings of one setting"; moved the client-fetch-path
  question into Step 0.8; marked Step 1 as a one-way door; split §7 by DB vs client half.
- **Rev 3** (2026-08-09) — second review pass, all Rev 2 citations verified against the
  repo. Two residual gaps closed: `next_cursor` must use a **lossless** encoding or it is
  decorative (§5.1, Step 4); the history status set must rule on **`declined`** as well as
  `refunded`, since declined online orders are terminal and are exactly what the §3.1
  channel filter searches for (§5.5, Step 0.1). Noted the vestigial `order_channel` enum
  in §3.1 so it is not rediscovered as a candidate.
- **Rev 4** (2026-08-09) — third pass, focused on the contract rather than the predicate.
  Added: the page envelope / `has_more` stop signal, absent entirely until now (§5.4);
  `platform_order_number` + `delivery_platform` in the row shape, without which the §3.1
  channel filter is not useful (§5.5); the `normalize_order_source(NULL) = 'pos'` trap
  (§5.8); `payment_status` pass-through and the interaction with the open void bug (§5.10);
  the date-range/search contract question (§5.6); the guard asymmetry with
  `get_order_details` (§5.7); the §3.3 branch where `get_business_day_bounds` **cannot** be
  reused; and the rollback script required by repo convention. Renumbered §5 so the
  contract reads in order.
- **Rev 5** (2026-08-10) — re-confirmed against the ticket text. Added an explicit
  **deviations-from-ticket table** in §5 so every departure is reviewable; fixed four
  internal inconsistencies left by the Rev 4 renumbering (signature still said
  `returns setof json` while §5.4 recommends an envelope; §5.1 still described a
  last-row cursor; two stale §-refs); noted that the cursor **parse** in §5.8 must match
  the **emit** format in §5.1; restored the ticket's "at Charcoal data volume" bar to
  Step 3, which Rev 1-4 had dropped.
- **Rev 6** (2026-08-10) — implementation. **Corrected a material error carried by Rev 1–5:**
  `business_day_end_hour` is read by three tips/labour functions only, *not* by the
  business-day-summary functions as previously claimed; every order/reporting surface uses
  `start_hour`. The RPC therefore uses `start_hour` and reuses `get_business_day_bounds`
  (§3.3). Resolved Step 0.1/0.3/0.10 as documented assumptions; index reclassified from
  "likely" to "required" (§2); added §11 implementation status.
