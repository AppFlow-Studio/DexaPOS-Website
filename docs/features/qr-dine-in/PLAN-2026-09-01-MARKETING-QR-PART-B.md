# Plan — Table-less marketing QR codes (Part B)

**Ticket:** [Online Store QR — Branded QR rendering & table-less marketing QR codes](https://app.notion.com/p/3c78280c1b1d81459349d1f7313b958a)
**Owner:** Ali Awdi · **DoD verifier:** Abubeckr Elcharfa
**Branch:** `feat/branded-qr-rendering`
**Companion docs:** [SCRATCH-2026-08-26](SCRATCH-2026-08-26-BRANDED-AND-MARKETING-QR.md) (approach + Part A QA) ·
[REVIEW-2026-09-02](REVIEW-2026-09-02-BRANDED-QR-PART-A.md) (Part A code review)

**Status:** plan. Ready to implement once §7's blockers clear.

---

## 0. What this closes

The scratch plan called Part B a sketch, and it was: six one-line bullets deferring the schema to
"the ticket sketch" in Notion — a source D1 simultaneously declares wrong on its key column. This
document closes that gap. The DDL is written here, the open B2 question is decided, and the CRUD
surface is specified.

It also **supersedes the scratch plan's B-c on token design**, for reasons in §2 (D5). That is the
one place this plan deliberately diverges from what was written before.

---

## 1. What a marketing QR is

A table QR is bolted to a floor-plan object: `table_qr_codes.floor_plan_object_id` is `NOT NULL`,
one active code per table. A guest scanning it starts a dine-in order *for that table*.

A marketing QR has no table. It goes on a flyer, a door decal, a receipt footer, a delivery bag. It
points at the storefront so a stranger can order — nothing more. It exists because the current
schema makes that impossible to express.

Per **D1**, it belongs to exactly one location. The storefront slug, the branding row and
`qr_scan_events.location_id` are all per-location, so a merchant-wide code has nothing to resolve
to, nothing to brand with, and nothing to log against. Merchant-wide is a later ticket that first
needs a merchant-level default config.

---

## 2. Decisions taken in this plan

Inherited and unchanged: **D1** (`location_id NOT NULL`), **D2** (client canvas rendering),
**D3** (ungated — not behind `qr_table_ordering` / `multi_location`), **D4** (POS by handoff).

### D5 — a random `short_code`, **not** an HMAC-signed token. New; supersedes B-c.

The repo already has a complete signed-token system for table QRs —
`sign_qr_table_token` / `verify_qr_table_token` / `qr_parse_table_token`, HMAC over
(location, floor-plan object, version) with **secret rotation** via
`qr_get_vault_secret('qr_hmac_secret_current' | '…_previous')`. A reviewer will reasonably ask why
Part B doesn't reuse it. The answer must be in the code, or someone will "fix" it later.

**Why the table token is signed:** it *encodes claims* — this token asserts a location, an object
and a version, and `resolve_table_qr` verifies that assertion against a rotating secret. The
signature is what makes the claim trustworthy without trusting the row.

**A marketing code asserts nothing.** It is an opaque pointer to a row that holds the truth. Signing
a pointer buys no security a random pointer doesn't already have — an attacker who cannot guess the
code cannot use it either way.

What differs is cost. A table token is ~120 characters. That is invisible inside a QR, but a
marketing code goes on a **flyer**, where a human-typable fallback URL
(`dexa.example/m/K7QF2M9XBT`) is a real feature. A 120-char token cannot be printed as text.

So: 10 characters of Crockford base32 (digits + uppercase, minus `I`, `L`, `O`, `U`), **≈50 bits**
of entropy. Unguessable at the rate limits in §4.2; short enough to print. The cost is a unique
index and a `23505` retry, which is trivial.

> **Do not "align" this with `sign_qr_table_token` in review.** The divergence is deliberate and the
> reasoning is above. Note it in the migration comment too.

### D6 — closes B2: a new `marketing_qr_code_id` column, keep `stage = 'scanned'`.

The scratch plan left B2 open between two options: add a new `stage` value (requires altering a
CHECK constraint on a live table) or reuse `'scanned'` and distinguish by `table_qr_code_id is null`.

Take neither as stated. **Add `marketing_qr_code_id uuid` to `qr_scan_events` and keep
`stage = 'scanned'`.**

- No CHECK-constraint migration on a live table — the objection to option A.
- Unambiguous, which option B is not: `table_qr_code_id is null` silently absorbs *any* future
  third scan source (kiosk, receipt, delivery bag) into "marketing". An explicit FK cannot.
- `stage` keeps meaning what it means — a funnel position, not a provenance. Provenance is a
  different axis and deserves its own column.

Analytics then read: marketing scans are `marketing_qr_code_id is not null`; table scans are
`table_qr_code_id is not null`. Both stay on the existing `ix_qr_scan_events_loc_time` index.

### D7 — `/m/{code}` **renders**, it does not `redirect()`.

The obvious design is a redirect: log the scan, 302 to the storefront. **Do not build it that way.**

Two independent reasons:

1. There is a recorded app-wide defect where a Next.js page whose body only calls `redirect()`
   renders "This page couldn't load". **Verify this still reproduces before relying on it**
   (§7.3) — but design around it regardless, because:
2. `t/[token]/page.tsx` already establishes the pattern: it *renders* the storefront for the
   resolved token rather than bouncing. Matching it keeps one mental model, one place for the
   unavailable state, and one place for scan logging.

So `/sites/{slug}/m/{code}` resolves, logs, and renders the storefront — the same component
`t/[token]` renders, minus the table binding.

---

## 3. Schema

One migration. Additive only; nothing existing changes shape.

### 3.1 `marketing_qr_codes`

```sql
create table if not exists public.marketing_qr_codes (
  id                uuid primary key default gen_random_uuid(),
  merchant_id       uuid not null references public.merchants(id) on delete cascade,
  -- D1: NOT NULL. The storefront slug, the branding row and qr_scan_events.location_id
  -- are all per-location, so a merchant-wide code has nothing to resolve to.
  location_id       uuid not null references public.locations(id) on delete cascade,
  name              text not null,
  -- D5: a random pointer, not a signed claim. See the plan for why this deliberately
  -- does NOT use sign_qr_table_token. 10 chars Crockford base32 ~= 50 bits.
  short_code        text not null,
  destination_path  text not null default '/',
  is_active         boolean not null default true,
  scan_count        bigint not null default 0,
  last_scanned_at   timestamptz,
  deactivated_at    timestamptz,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint marketing_qr_codes_short_code_unique unique (short_code),
  constraint marketing_qr_codes_short_code_format
    check (short_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  constraint marketing_qr_codes_name_not_blank
    check (length(btrim(name)) > 0),
  -- Relative only: an absolute URL here would turn every printed code into an
  -- open redirect off our own domain.
  constraint marketing_qr_codes_destination_relative
    check (destination_path ~ '^/' and destination_path !~ '^//'),
  constraint marketing_qr_codes_scan_count_nonnegative
    check (scan_count >= 0)
);

create index if not exists ix_marketing_qr_codes_location_active
  on public.marketing_qr_codes(location_id) where is_active;

create trigger set_marketing_qr_codes_updated_at
  before update on public.marketing_qr_codes
  for each row execute function public.update_updated_at_column();
```

`updated_at` + the existing trigger are required by the offline-sync rule in CLAUDE.md — the POS
tablet delta-syncs on it.

**No delete policy, and none is coming.** A printed flyer outlives its row. Deactivating must leave
the row so `/m/{code}` can still answer "this code is no longer active" instead of 404-ing a
customer standing in the shop.

### 3.2 `qr_scan_events` — one additive column (D6)

```sql
alter table public.qr_scan_events
  add column if not exists marketing_qr_code_id uuid references public.marketing_qr_codes(id);

create index if not exists ix_qr_scan_events_marketing
  on public.qr_scan_events(marketing_qr_code_id, occurred_at)
  where marketing_qr_code_id is not null;
```

`location_id` stays `NOT NULL` and is satisfied by D1. The `stage` CHECK is untouched.

### 3.3 RLS

Mirror `table_qr_codes` exactly — `20260522120000_qr_w1_schema.sql:130-215`. Three policies
(`select`, `insert`, `update`), each:

```sql
public.is_dexapos_admin()
or (merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids()))
```

`enable` **and** `force` row level security, matching the sibling tables.

> ⚠️ `user_location_ids()` had a dead branch that was fixed and applied to staging on 2026-08-30 but
> is **not in the migration ledger**. Confirm the fixed version is present on whatever database this
> migration lands on, or these policies will behave differently there than in staging.

---

## 4. Functions

### 4.1 `create_marketing_qr_code(p_location_id uuid, p_name text, p_destination_path text default '/')`

`security definer`, `set search_path to 'public','pg_temp'`, returns `jsonb`.

- Resolve `merchant_id` from the location; authorize the caller the way the sibling QR RPCs do
  (`is_dexapos_admin()` or merchant+location match). Actor into `created_by` from the JWT `sub`.
- Generate `short_code` from `gen_random_bytes`, mapped to the Crockford alphabet.
- **Insert in a loop, catching `23505`** — retry up to 5 times, then fail with a real error. Do not
  pre-check for existence: two concurrent creates both pass a pre-check and one still fails.
- Return `{ success, id, short_code }` or `{ success: false, error }`.

### 4.2 `resolve_marketing_qr(p_slug text, p_short_code text)`

`security definer`, `set search_path`, returns `jsonb`. Anonymous callers reach this.

Model on `resolve_table_qr` (`20260527160000_…:resolve_table_qr`), minus token verification and
minus the table/session machinery:

1. Load the store by `slug` or `custom_domain` where `is_active`. **Do not require
   `accepts_dine_in`** — that is a dine-in flag and a marketing code is not dine-in (D3). Do respect
   the storefront being disabled.
2. Look up the code by `short_code`. Not found → `{ success: false, error: 'not_found' }`.
3. Code belongs to a different store → same `not_found`. Never confirm a code exists elsewhere.
4. `is_active = false` → `{ success: false, error: 'inactive' }`, which the page renders as the
   friendly copy rather than a 404.
5. Rate-limit before writing, mirroring `resolve_table_qr`'s shape — it uses per-IP and per-table
   windows via `qr_request_ip_hash()`. Marketing needs a **per-IP** limit (a flyer is scanned by
   many people from many IPs, so a per-code limit would throttle a successful campaign). This is the
   brute-force defence that keeps 50 bits of entropy sufficient.
6. On success: insert `qr_scan_events` (`stage='scanned'`, `marketing_qr_code_id`, `merchant_id`,
   `location_id`, `ip_hash`, `user_agent`), bump `scan_count` / `last_scanned_at`, return the
   destination and the branding the page needs.

Deactivation needs **no RPC** — it is a plain `update … set is_active = false, deactivated_at = now()`
through RLS from a server action. Fewer functions, same guarantees.

---

## 5. Surfaces

### 5.1 Public — `app/sites/[slug]/m/[code]/page.tsx`

`export const dynamic = "force-dynamic"; export const revalidate = 0;` — as `t/[token]` has.

Calls `resolve_marketing_qr`, then **renders** (D7). Reuse `buildQrUnavailableCopy` /
`QrUnavailableState` from `t/[token]/page.tsx` — lift them into a shared module rather than
copying, since the whole point of Part A was that duplicated render paths drift.

`generateMetadata` must set the **merchant's** title and icon, not DexaPOS's — the website-builder
QA already logged DexaPOS favicons leaking onto merchant sites.

### 5.2 URL builder

Add `buildMarketingQrUrl({ slug, customDomain, shortCode })` to `app/sites/lib/store-url.ts`,
alongside `buildQrTableUrl`, returning `${buildStoreUrl(...)}/m/${code}`. Same `custom_domain` →
`ROOT_DOMAIN` → `APP_URL` cascade, for free.

### 5.3 Dashboard CRUD

**Placement is load-bearing.** Per D3 this must render **outside** the `qrEntitled` branch at
`app/dashboard/online-ordering/page.tsx:1155`, not merely with the flag forced true. Inside it, a
future refactor of the gate silently swallows the feature — and single-location merchants, the exact
people who print flyers, are the ones the `multi_location` gate excludes.

A `MarketingQrManager` component in the Ordering tab:

| Control | Behaviour |
|---|---|
| Create | Name (required) + destination (default `/`), calls the RPC, optimistic row |
| List | Name · short code · scans · created · Active/Inactive badge |
| Preview | **Reuse `BrandedQrPreview`** with the same `qrBranding` from `getQrTableManagerSnapshot` |
| Download | **Reuse `renderBrandedQrSvg` / `…PngBlob` / the PDF path** from `lib/qr/render.ts` |
| Copy link | `buildMarketingQrUrl`, toast on success |
| Deactivate | Confirm first — a printed flyer cannot be recalled. Never offer delete |

Part A's renderer is directly reusable, which is the dividend of collapsing the four call sites.
**That also means Part A's defects are inherited** — see §7.

The table-QR list just grew search, status filter and per-zone paging. Marketing lists are small
(tens, not 233), so **do not** copy that chrome. A flat list is correct here.

---

## 6. Sequencing

Checkable items. Each PR stands alone and is independently revertible.

**PR B1 — schema. ✅ APPLIED AND TESTED on staging (`dfwqakoyittmrwbqvxgw`), 2026-09-02.**
- [x] Migration written, applied to staging via SQL editor — **still needs `db pull` + commit**
- [x] Rollback script alongside, as the reservations migrations do
- [x] `table_qr_codes.floor_plan_object_id` still `NOT NULL`; 150 table codes and 276 scan events
      untouched — regression assertion holds
- [x] Structure: 13 columns, 4 CHECKs, 2 FKs, 4 indexes, 1 trigger, 3 policies, RLS **enabled and
      forced**, `qr_scan_events.marketing_qr_code_id` present, all 3 functions created
- [ ] RLS proven by an **authenticated second merchant** — only the `anon` case was proven (see below)
- [ ] `23505` retry exercised through the RPC — the constraint was proven, the loop was not (below)

### PR B1 test results

**Short-code generator.** 500 codes: 500 distinct, all length 10, all satisfy the CHECK, zero
ambiguous `I/L/O/U`, and **all 32 alphabet symbols observed** — which is what rules out an
off-by-one in the `substr(..., (byte % 32) + 1, 1)` index.

**`resolve_marketing_qr`, called as `anon` over PostgREST** — the actual stranger-scans-a-flyer path:

| case | result |
|---|---|
| valid code + correct slug | `success`, with destination and store branding |
| same code **lowercase** | `success` — `upper()` normalisation works |
| unknown code | `not_found` |
| code belonging to **another store** | `not_found` — never confirms it exists elsewhere |
| unknown store slug | `store_unavailable` |
| empty code | `not_found` |
| **deactivated** code | `inactive` — distinct from `not_found`, so the friendly page renders, not a 404 |

**D6 verified end to end.** After two successful resolves: `scan_count = 2`, `last_scanned_at`
stamped, exactly 2 `qr_scan_events` rows, all `stage = 'scanned'`, merchant and location matching
the code, and **0 rows wrongly carrying a `table_qr_code_id`** — the provenance ambiguity D6 exists
to prevent. The four failing cases and the deactivated scan wrote **nothing**.

**Guards hold.** Every one rejected at the database:

| attempted | result |
|---|---|
| `destination_path: "https://evil.example"` | 400 — the open-redirect guard |
| `destination_path: "//evil.example"` | 400 — the subtle one a bare `^/` would have allowed |
| `short_code` containing `O` | 400 |
| `short_code` too short | 400 |
| blank `name` | 400 |
| duplicate `short_code` | **409** — the unique violation the retry loop catches |

**The rate limit is reachable, not dead code.** `qr_request_ip_hash()` returns a real hash through
PostgREST (`edaf912c…`) and `user_agent` is captured, so the `if v_ip_hash is not null` branch is
taken. The 60/min threshold itself was not tripped — that needs 60 requests and 60 throwaway scan
rows on staging, and the counting query is trivial.

**`updated_at` trigger fires** on update (the offline-sync requirement), and `deactivated_at` stamps.

All QA rows were deleted afterwards: 0 marketing codes and 0 marketing scan rows remain.

#### Two gaps left in B1, both needing a real merchant JWT

1. **`create_marketing_qr_code` was never executed.** It authorises via `is_dexapos_admin()` /
   `user_merchant_id()` / `user_location_ids()`, which need a Clerk-issued merchant token. The MCP
   connection runs as `supabase_read_only_user` and is refused permission on those helpers outright.
   So the authorisation branch **and the 5-attempt `23505` retry loop are untested at runtime** —
   test rows were inserted directly as `service_role` instead. PR B3's UI is the first thing that
   will exercise it; treat the first create as a real test, not a formality.
2. **RLS merchant isolation is only half proven.** `anon` correctly sees `[]`. A second
   *authenticated* merchant seeing zero rows still needs checking, and that is the case the policies
   actually exist for.

**PR B2 — public resolver. ✅ BUILT AND TESTED 2026-09-02.**
- [x] Active code renders the storefront and writes exactly one `qr_scan_events` row
- [x] Deactivated code renders the friendly page (200, "no longer active"), no scan row, no 404
- [x] Unknown code and cross-store code are indistinguishable from each other
- [x] **Probed on BOTH hosts** — `localhost:3000/sites/joes-coffee-uptown/m/{code}` **and**
      `Host: joes-coffee-uptown.localhost:3000` + `/m/{code}`. Both 200, both render the full
      storefront (~329KB with menu items), one scan row each. The `proxy.ts` subdomain rewrite
      handles `/m/*` with no change needed, and `/sites(.*)` was already public.
- [x] Existing `/t/[token]` route regression-tested after the shared-component refactor: valid token
      still renders the storefront, bad token still renders its own unavailable copy.
- [ ] Rate limit trips and recovers — **do not test this until the finding below is fixed**

Files: `app/sites/[slug]/m/[code]/page.tsx`, `app/sites/components/QrUnavailableState.tsx` (lifted
out of the table route so the two dead-end pages cannot drift), `resolveMarketingQr` in
`app/sites/qr-actions.ts`, `buildMarketingQrUrl` in `app/sites/lib/store-url.ts`.

### Two decisions taken while building, both correcting this plan

**D7 was right, but for a stronger reason than it gave — and `destination_path` is deferred.**
The plan hedged on whether the redirect defect still reproduces. It does not matter: the defect hits
any `redirect()` under a `force-dynamic` layout (the response has already begun streaming, so Next
answers 200 and hands the router a state it throws on), and the sanctioned escape — `redirects()` in
`next.config.ts` — only serves **static** rules. A destination read from a database row can never be
a static rule, so that escape is structurally unavailable here.

Therefore the route renders the storefront and **`destination_path` is not honoured in v1**. This is
not a gap: the ticket lists *"dynamic/editable destinations"* as out of scope, so the CRUD screen in
PR B3 must not expose a destination field. The column is migrated and defaults to `'/'`, ready for
whoever picks that up once the Next version allows it.

**The route delegates to the storefront rather than restaging it.** `/t/[token]` and
`/sites/[slug]/page.tsx` already carry two divergent copies of the theme-vars + `StorefrontRoot` +
`CartSidebar` block. A third copy is exactly how branded-on-screen / unbranded-on-paper happened to
the QR renderer before Part A collapsed it, so `/m/[code]` renders `<StorefrontPage>` directly.
Verified this does not double-count: two host visits produced exactly two scan rows, not four.

### 🔴 Finding — the per-IP rate limit does not see the visitor

`resolve_marketing_qr` derives `ip_hash` and `user_agent` from `request.headers` via
`qr_request_ip_hash()`. But the RPC is called **server-side** through the service-role client, so
those headers belong to **our own Next server**, not the guest's phone.

Measured: the two scans logged through the real route both recorded `user_agent = "node"`. When the
same RPC was called directly over PostgREST during B1 testing it recorded `curl/8.7.1` — i.e. it
faithfully reports whoever opened the PostgREST connection, which in the app is us.

**Effect:** in production every scan of every flyer arrives from the same server IP, so all visitors
share **one** 60/min bucket. A campaign that works — the flyer everybody scans — would rate-limit
real customers. The comment in the migration claiming per-IP "would not throttle a successful
campaign" has it exactly backwards under server-side invocation.

**Not unique to this work.** `resolve_table_qr` is called the same way from
`resolveQrStorefrontSession`. Pre-existing table scan rows show a mix of `node` and real browser
agents, so that path is inconsistent for the same reason.

**Fix (needs a small follow-up migration, B2.1):** pass the guest's IP and user agent from the route
into the RPC as explicit parameters — the route has them from `headers()` — and hash server-side
there, rather than reading `request.headers` inside the function. Until then the limit is not a
meaningful control and the "rate limit trips and recovers" check above is not worth running.

**PR B3 — dashboard CRUD. ✅ BUILT AND TESTED 2026-09-02.**
- [x] Create → appears in list → preview renders branded
- [x] Downloads carry branding, via the shared renderer, named after the code
- [x] Deactivate (with a confirm step) → list reflects it → `/m/{code}` shows the friendly page
- [x] Rendered outside the `qrEntitled` gate, with a comment saying why
- [ ] Verified as a **single-location merchant without `qr_table_ordering`** — the D3 case. Still
      only tested on Joes Coffee Shop (entitled, multi-location), so D3 is **not yet proven**.

Files: `app/dashboard/online-ordering/components/MarketingQrManager.tsx`,
`app/dashboard/online-ordering/marketing-qr-actions.ts`, mounted in `page.tsx`.

**Full loop verified end to end.** Created "QA door decal" in the dashboard → a code was minted
(`GP30G0B9KV`) → scanning `/m/GP30G0B9KV` as an anonymous visitor rendered the storefront →
deactivating it in the dashboard → scanning again returned "no longer active". PDF export is
deliberately not offered here: a table tent is a table thing.

Two smaller fixes fell out of testing. `BrandedQrPreview` now takes `label` and `emptyLabel`: both
managers can sit on one screen, and identical `alt` text left a screen-reader user unable to tell the
table preview from the marketing one (it also fooled the first test run into asserting against the
wrong image). Authorisation follows `getQrTableManagerSnapshot` — verify with the caller's JWT via
`authorize_location_access`, then act with the service client — because the dashboard JWT can lack
the legacy location claims that `user_location_ids()` needs, which would have made
`create_marketing_qr_code`'s own check reject legitimate merchants.

### 🔴 Finding, fixed — a flat 25% logo cap is unsafe on short URLs

The first branded marketing QR produced by this codebase **did not scan**. It looked perfect.

| | URL length | version | modules | 25% logo |
|---|---|---|---|---|
| table code | ~184 chars (signed token) | 14 | 73×73 | decodes |
| marketing code | ~59 chars (short code) | **6** | 41×41 | **fails at every scale** |

Measured on the real exports, then isolated with a synthetic occlusion sweep: a version 6 code
survives a 16% centre square and fails at 20%; version 14 survives 20% and fails at 25%.

The cause is block structure, not area. Error correction is interleaved per block; a low version has
few blocks, so one solid centre square can exhaust a whole block's recovery budget, while the same
*fraction* spread across a high version's many blocks stays inside it. Reed–Solomon handles scattered
damage far better than a solid hole.

**This is a Part A bug**, not a Part B one — `MAX_LOGO_AREA_FRACTION` has always been flat. It simply
could not surface while every URL being encoded was a 184-character token. Part B's short URLs are
what exposed it.

**Fixed:** `maxLogoAreaFractionForModules(moduleCount)` in `lib/qr/branding-rules.ts` now derives the
cap from the actual grid — 14% at ≤45 modules, 18% at ≤65, 22% above — each sitting under its
measured failure point with margin, and never above the ticket's 25% ceiling. `render.ts` already
computed `moduleCount` for the quiet zone, so it threads through with no new work. Five tests pin it.

After the fix: the marketing PNG decodes at 1200px **and** down to 300×300, and the table code still
decodes at both, so the change did not cost the high-version case anything.

⚠️ **The printed-scan matrix must now include a marketing code specifically.** A short-URL code is a
different QR version from a table code and has just been shown to fail where the table code passes.
Testing only table tents would not have caught this, and will not catch the next one.

**Handoff — C1.** D2 is browser-only, so the shared render surface for the POS tablet is real work,
not a by-product. Scope it, document it, raise the linked ticket for Ali Jaffal.

---

## 7. Blockers and risks

### 7.1 ✅ Part A's two blockers — FIXED 2026-09-01, gate clear

Both are done, so PR B1 is unblocked.

**Broken logo no longer hangs.** `lib/qr/render.ts` now runs every render through
`renderWithLogoDeadline`. When a logo is in play it races the render against a 6s deadline; on expiry
it re-renders with `logoUrl: null` and reports the drop through the existing `warnings` channel — the
degrade path that already existed and that this failure mode simply never reached. The deadline is
**not armed when there is no logo**, so a slow machine cannot invent a dropped logo that never
existed. Five new tests in `tests/qr-render-logo-timeout.test.ts` mock the library with a render that
never settles — the real failure, not an approximation — and pin the fallback, the warning, the
retry actually dropping the image, colours surviving, and ECC returning to `Q`.

The abandoned first render is not cancelled, because the library exposes no handle to cancel with. It
resolves into nothing if the image ever arrives. Noted so nobody "fixes" it later.

**Colours are now rejected at input.** `validateQrBrandingColors` is called from the Online Store
branding form (`app/dashboard/online-ordering/page.tsx`) over the same three values the renderer
reads, and the returned `QrBrandingIssue[]` render under the swatches with the merchant-facing
`message` verbatim. The heading escalates by `scope`: a `secondary` problem says *"The QR gradient
will be skipped"*, a `primary` one says *"These colours will not scan as a QR code"*.

Verified in the browser on live data. Joes Coffee Shop's real palette already trips it —
`#a67c52` on `#f5ebdd` reports *"contrast 3.2:1, minimum 4.5:1"*, which is the same problem that
previously surfaced only as an export toast on a different screen. Forcing the primary to a pale
value escalated the heading and listed both issues.

> **One deliberate deviation from the review's fix.** It is not a hard save block. `primaryColor` and
> `backgroundColor` drive the **entire storefront**, not just the QR — refusing to save a valid
> website because its palette makes a poor QR code is the wrong trade, and it would strand merchants
> whose brand is legitimately low-contrast. The AC is that the merchant is told at the point of
> choice, with the reason; that is what ships. **Flag this for Abubeckr at DoD** — if he reads
> "rejected" as "cannot save", it is a small change, but it should be his call, not mine.

Regression check: the preview still renders byte-identical to before the refactor (23,153 bytes,
hash `1cb411f6`), and all **39** QR tests pass.

### 7.1b 🔴 Original finding, for the record

Part B's downloads go through `lib/qr/render.ts`. The review found that a broken `logo_url` **hangs
forever** — `qr-code-styling` has no `onerror` in its browser path, so the promise never settles and
every export awaits with no toast and no error. Ship Part B on top of that and marketing QR
downloads inherit it on day one.

Same for `validateQrBrandingColors` never being called: Part B adds another surface that renders the
merchant's colours, so the input-validation gap gets wider, not narrower.

**Fix both before starting PR B1.** They are small.

### 7.2 🟠 Part A cannot merge independently as it stands

The review's issue 6, and the cherry-pick I attempted confirms it: `7e49a05e` conflicts against
`dexaposwebsite-preview` in `actions.ts` and `QrTableManager.tsx`, and
`docs/features/qr-dine-in/` was flattened to `docs/` there. Resolve that before stacking three more
PRs on top, or the conflict compounds.

### 7.3 🟡 Verify the redirect defect before designing around it

D7 avoids `redirect()` partly on a recorded app-wide defect. That note may predate a fix. Reproduce
it once on this branch. If it no longer reproduces, D7 still stands on reason (2) — matching
`t/[token]` — but say so explicitly rather than leaving a stale justification in the plan.

### 7.4 🟡 Two logo hosts, still

Newer logos are on Bunny, older rows on **prod** Supabase Storage. Both send `ACAO: *`, verified.
Any future CSP `img-src`, allowlist or proxy must cover **both** — and Part B's previews pull the
same `logo_url`.

### 7.5 🟢 Staging is shared

PR B1 applies schema to the same staging database the reservations work targets. Coordinate, or land
them in sequence.

---

## 8. Out of scope

Per the ticket: dynamic/editable destinations, UTM attribution, QR analytics dashboards, bulk print
sheets. Merchant-wide codes are deferred by D1 and need a merchant-level default config first.

Sizing is still not estimated.
