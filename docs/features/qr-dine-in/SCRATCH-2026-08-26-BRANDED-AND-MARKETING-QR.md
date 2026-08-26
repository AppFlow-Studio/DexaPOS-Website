# Scratch plan — Branded QR rendering + table-less marketing QR

**Ticket:** Online Store QR — Branded QR rendering & table-less marketing QR codes
**Notion:** https://app.notion.com/p/3c78280c1b1d81459349d1f7313b958a
**Owner:** Ali Awdi · **DoD verifier:** Abubeckr Elcharfa
**Status:** scratch. Approach decisions taken (§0.1). Sizing not agreed. No code written.

---

## 0.1 Decisions taken (Ali Awdi, 2026-08-26)

| # | Decision | Effect |
|---|---|---|
| D1 | **`marketing_qr_codes.location_id` is `NOT NULL` for v1.** No merchant-wide codes. | Kills blocker B1 outright. A marketing QR points at one location's storefront, which is the only thing that actually has a slug and a branding row. Merchant-wide is a follow-up ticket. |
| D2 | **Render via client canvas + `qr-code-styling`** (ticket's own suggestion). | Blocker B3 **retired by measurement** — see §3/B3. Cost: browser-only, so C1's shared endpoint is separate work rather than free. |
| D3 | **Marketing QR is ungated** — part of the online store, not behind `qr_table_ordering`. | Single-location merchants (the ones printing flyers) can reach it. Must NOT be rendered inside the `qrEntitled` gate at `app/dashboard/online-ordering/page.tsx:1155`. |
| D4 | **POS print AC closed by handoff.** Build the shared render surface, document it, raise a linked POS ticket for Ali Jaffal. | That AC moves to the POS ticket instead of blocking ours. See C1. |

Still open: **B2** — new `stage` value vs reuse `'scanned'` + `table_qr_code_id is null`.

---

## 0. Codebase reality check

Everything below was verified against this repo on `feat/website-owner-ui` (2026-08-26).

| Thing the ticket assumes | Reality in repo |
|---|---|
| A QR render path exists | Yes — `qrcode@1.5.4`, imported only in `app/dashboard/online-ordering/components/QrTableManager.tsx:5` |
| Branding is unused at render time | Confirmed. All three export paths hardcode `dark:"#111827" light:"#FFFFFF"`, `errorCorrectionLevel:"Q"` |
| We store logo/colours on `online_store_config` | Yes — `schema.sql:2301`, incl. `primary_color NOT NULL default '#0C4FD1'`, `secondary_color`, `logo_url` |
| `table_qr_codes` is table-bound | Yes — see `supabase/migrations/20260522120000_qr_w1_schema.sql` |
| `qr_scan_events` can take a new `stage` | **Partly** — `stage` has a CHECK constraint, see blocker B2 |
| `location_id` can be null on a marketing QR | **Conflicts with the storefront model** — see blocker B1 |

### The three render call sites (all must change, or the AC fails)
- `QrTableManager.tsx:302` — `QRCode.toString(..., {type:"svg", ecc:"Q", margin:4})` → **Download SVG**
- `QrTableManager.tsx:331` — `QRCode.toDataURL(..., {ecc:"Q", margin:4, width:1200})` → **Download PNG**
- `QrTableManager.tsx:357` — `QRCode.toDataURL(..., {ecc:"Q", margin:2, width:1400})` → **PDF print sheet** (`jspdf`)

The AC "printing must not silently fall back to unbranded" is aimed exactly at the third one.

### Naming trap — `brandMode` already exists and is NOT branding
`QrTableManager.tsx:122` has `const [brandMode, setBrandMode] = useState<QrBrandMode>("merchant")` with a
`"merchant" | "dexa"` toggle in the UI at lines 509–525. It only swaps **text labels** in the PDF
(`getBrandTitle`/`getBrandSubtitle`, lines 268–276). The panel chrome is hardcoded Dexa blue
(`doc.setFillColor(12, 79, 209)`). Do not mistake this for existing branding support — reuse the control,
replace the meaning.

---

## 1. What we can achieve in this repo

### Part A — branded rendering (no schema impact, mergeable alone)
- **A1.** Shared render util `lib/qr/render.ts` — `{ value, logoUrl, primaryColor, secondaryColor }` →
  SVG string / PNG data URL, wrapping `qr-code-styling` (D2). Client-only; must be reached through
  `dynamic(..., { ssr: false })`. **Always pass `crossOrigin: "anonymous"`** and the converted
  `imageSize` — see B3. No new table, no new column.
- **A2.** Validation module `lib/qr/branding-rules.ts`, all pure and unit-testable:
  - ECC forced to `H` whenever a logo is present
  - logo box clamped to ≤25% of QR area (clamp in code, per ticket)
  - quiet zone ≥4 modules (current PDF path uses `margin:2` — **already violates this**)
  - reject inversion (light modules on dark) with a reason string
  - contrast floor between module colour and background, with a reason string
  - gradient only `primary→secondary`, both stops contrast-checked
- **A3.** Extend `getQrTableManagerSnapshot` (`app/dashboard/online-ordering/actions.ts:1397`) to return
  `logoUrl` / `primaryColor` / `secondaryColor`. The action already selects from `online_store_config`
  (line 1442); the sibling action at lines 835–842 already maps exactly these fields, so this is ~4 lines
  plus the `QrTableManagerSnapshot` interface at line 75.
- **A4.** Live preview in the QR settings screen (`app/dashboard/online-ordering/page.tsx:1149`).
- **A5.** Route all three export paths through A1. Graceful degradation when `logo_url` is null.
- **A6.** Vitest coverage for A2 (vitest is working in this repo).

### Part B — table-less marketing QR
- **B-a.** Migration: `create table public.marketing_qr_codes (...)` per the ticket sketch.
- **B-b.** RLS mirroring `20260522120000_qr_w1_schema.sql:130-215` — helpers `is_dexapos_admin()`,
  `user_merchant_id()`, `user_location_ids()` all exist and are the established pattern.
- **B-c.** `create_marketing_qr_code()` RPC — `SECURITY DEFINER`, `SET search_path = 'public','pg_temp'`,
  actor from the JWT `sub` claim. Retry-on-`23505` for `short_code`, not pre-check.
- **B-d.** Public resolver route. `proxy.ts` is **public-by-default for unknown paths** (line 244) and
  `/sites(.*)` is explicitly public (line 9), so a new resolver is not Clerk-gated. Modelled on
  `app/sites/[slug]/t/[token]/page.tsx`.
- **B-e.** Friendly "no longer active" page for a deactivated code (the `t/[token]` page already has this
  shape — `buildQrUnavailableCopy`).
- **B-f.** Dashboard CRUD: create, name, preview, download PNG/SVG, deactivate.

### Verification we can do here
- Unit tests for every branding rule
- RLS proven by signing in as a second merchant (test creds exist)
- `table_qr_codes.floor_plan_object_id` still `NOT NULL` after migration — trivial assertion
- Deactivated-code page, scan-event row written

---

## 2. What we cannot achieve from this repo

### C1. The POS print path — **out of repo, hard blocker on one AC**
AC: *"Branded output appears in the POS print path, not only in the dashboard preview."*
QR-18 is a **POS tablet** ticket, not a web ticket:
`docs/features/qr-dine-in/PLAN-2026-05-22-QR-DINE-IN-TRACK-A.md:109` — *"QR-18 | POS table bottom-sheet QR
actions | Track A | `waiting_on_other_track`"*, and `PLAN-2026-05-27-QR-DINE-IN-UNIFIED.md:538` says only
mark QR-18 complete *"after the POS owner confirms the tablet build under test actually contains those UI
changes."* The tablet is a separate React Native repo.

**Most we can do here:** expose the A1 renderer as a shared server surface the tablet consumes, so the
tablet does not fork its own generator (which is exactly what the QR-18 row already warns against), then
hand off to Ali Jaffal. **This AC cannot be closed by us.** It should either move to a linked POS ticket or
be explicitly deferred.

### C2. The printed-scan matrix — **physical, not automatable**
iOS Camera + Android Camera, 1.5in, **on paper not on screen**. Needs a human, a printer, two phones.
Same for the screen recording to Abubeckr. I can prepare the print sheet and the test script; I cannot
execute this AC.

### C3. Applying migrations
Supabase MCP here is read-only / pinned to a ref its token cannot see. Migration discipline per the ticket
is staging SQL editor → `db pull` → commit → `db push`. **You run the SQL; I write it and the pull/commit.**

---

## 3. Blockers, ranked

### B1 — 🔴 A merchant-wide marketing QR has nothing to point at, brand with, or log against
The ticket's schema sketch makes `location_id` nullable, "merchant-wide codes are valid". The storefront
model does not support that:

- `online_store_config.location_id` is **`NOT NULL`** and `slug` is **`UNIQUE` per config row**
  (`schema.sql:2301-2305`). The storefront slug is therefore **per-location, not per-merchant**.
- `buildStoreUrl()` (`app/sites/lib/store-url.ts`) derives the destination purely from that slug /
  `custom_domain`. A code with no location has **no slug to resolve to**.
- Branding (`logo_url`, `primary_color`, `secondary_color`) lives on that same per-location row, so a
  merchant-wide code has **no branding source** either — which breaks Part A for Part B's flagship case.
- `qr_scan_events.location_id` is **`NOT NULL`** (`schema.sql:3420`), so there is nothing to log.

That is three independent failures from one nullable column. **This needs a decision before any migration
is written.** Recommendation: make `location_id` **NOT NULL** for v1 — a marketing QR points at one
storefront, because a storefront *is* a location here. Ship merchant-wide later if it is really wanted,
once there is a merchant-level default config to hang it on.

### B2 — 🟠 `qr_scan_events.stage` is CHECK-constrained
`supabase/migrations/20260522120000_qr_w1_schema.sql:71-72`:
`check (stage in ('scanned','menu_viewed','cart_started','checkout','paid','abandoned'))`.
Logging a marketing scan means **altering a constraint on a live table**, not just inserting a new value.
Cheap, but it is a schema change on an existing table and belongs in the Part B migration explicitly.
Alternative: reuse `'scanned'` and distinguish by `table_qr_code_id is null` — zero schema churn.

### B3 — ✅ RESOLVED by measurement (2026-08-26). Canvas approach is safe.
Original concern: logos are cross-origin, so drawing one into a `<canvas>` taints it and `toDataURL()` /
`toBlob()` throw — breaking Download PNG and the PDF print sheet.

**Measured, not assumed.** Real `logo_url` values pulled from staging `online_store_config`, then probed:

| Host | Result |
|---|---|
| `dexa-pos-uploads.b-cdn.net` (Bunny, current) | `Access-Control-Allow-Origin: *` |
| `hifouuofcaytijrkbvcy.supabase.co` (Supabase Storage, **legacy rows**) | `Access-Control-Allow-Origin: *` |

Bunny was additionally probed for the classic edge-cache CORS bug — a cold `MISS` with no `Origin`, then
warm `HIT`s with and without `Origin`. `ACAO: *` present on every one, and being a static `*` there is
nothing for it to vary on. **The risk does not exist.**

⚠️ **Two logo hosts are live, not one.** Newer uploads go to Bunny via `lib/storage/actions.ts:64`; older
rows still point at Supabase Storage on the **prod** project ref. Both are CORS-clean, but any future
allowlist, CSP `img-src`, or proxy must cover **both**.

#### Library audit — `qr-code-styling@1.9.2`
- MIT. **Only dependency is `qrcode-generator`** (pure JS). No native modules → none of the
  build-pipeline risk that rules out `sharp`/`resvg`.
- Ships CJS, `main` only — no `exports`, no ESM. Needs `dynamic(() => import(...), { ssr: false })`
  under Turbopack. It is DOM-dependent and cannot be server-rendered.
- `imageOptions.saveAsBlob` defaults to **`true`**, so it XHRs the logo and inlines it as a `data:` URI in
  the SVG output — the downloaded SVG is self-contained, not a remote `href`. That XHR is also
  cross-origin and also relies on the CORS result above.

#### ⚠️ Correction (2026-08-27, after running it in a real browser)
An earlier revision of this document claimed `crossOrigin` was the load-bearing option, because a
cross-origin logo would taint the canvas and make `toDataURL()` throw. **That is not how this library
works.** `_setupCanvas` serialises the SVG, base64-encodes it into a `data:` URL, and rasterises *that* —
the canvas never holds cross-origin pixels, so it cannot taint. Verified in Chromium: rendering with and
without `crossOrigin` produced byte-identical 532,670-byte PNGs.

The option that actually matters is **`imageOptions.saveAsBlob`**, and it fails *silently*:

| `saveAsBlob` | Exported SVG | PNG |
|---|---|---|
| `true` (default) | logo inlined as `data:` URI, no remote href | 119,465 bytes — **logo present** |
| `false` | **remote `href` to the CDN** | 29,986 bytes — **logo silently missing** |

With it off there is no error and no warning: the PNG and the printed tent simply come out unbranded,
which is the exact failure the ticket's print AC exists to prevent. The cause is that an SVG loaded through
an `<img>` is forbidden from fetching external resources. It is the library default, but it is now pinned
explicitly in `lib/qr/render.ts` so a future default change cannot flip it.

`crossOrigin: "anonymous"` is still set and still correct — the XHR that inlines the logo *is* subject to
CORS, which is why the `ACAO: *` finding above remains load-bearing — but it is defence in depth, not the
thing holding export up.

#### 🔴 The defaults that will silently break the ACs
1. **`imageOptions.saveAsBlob`** — see the correction above.
2. **`imageOptions.imageSize` is NOT a percentage of the QR.** Internal math is
   `maxHiddenDots = imageSize × coeff[ecc] × count²` with `coeff = {L:.07, M:.15, Q:.25, H:.3}`.
   So the default `imageSize: 0.4` at ECC `H` hides **12%** of the code, not 40%. The ticket's
   "logo ≤25% of QR **area**" is a different unit: the clamp is `imageSize ≤ 0.25 / 0.3 ≈ 0.83` at H.
   Naively setting `imageSize: 0.25` to "comply" yields a **7.5%** logo — needlessly tiny, and a reviewer
   could plausibly "correct" it the wrong way. **Comment the conversion at the call site.**

Library default ECC is `Q` (same as our current code) — override to `H` whenever a logo is present.

**Guard shipped:** `tests/qr-render-options.test.ts` pins `saveAsBlob`, `crossOrigin`, the ECC level, the
logo-area conversion and the quiet-zone margin, so any of them being dropped fails in CI rather than
silently shipping unbranded prints.

#### Real-data finding — merchant "logos" are not always logos
The staging merchant used for the browser check has a `logo_url` pointing at a **wide 4-tile menu
collage**, not a square mark. The 25% area cap is still honoured, but a wide image spends that budget as a
broad horizontal band across the code rather than a compact centre square. Long single-direction runs of
occluded modules are harder on decoders than a square of equal area. The printed-scan matrix should
include a wide non-square logo, not just a tidy square one.

*(Not chosen: pure-SVG server compositing — zero deps and would have given C1's shared endpoint for free,
but D2 selected the library approach now that the CORS risk is measured away.)*

### B4 — ✅ DECIDED (D3): marketing QR is ungated
QR is gated behind billable service `qr_table_ordering`, `required_plan_code: 'multi_location'`
(`supabase/migrations/20260528103000_qr_service_catalog_gate.sql`). `QrTableManager` is rendered with
`qrEntitled={qrGate.entitled}` (`app/dashboard/online-ordering/page.tsx:1155`). A flyer/door-decal QR is a
**marketing** feature for the storefront, not a dine-in table feature — gating it behind a multi-location
dine-in entitlement would lock out exactly the single-location merchants who print flyers.
**Decided: ungated.** Implementation note — the marketing-QR surface must be rendered *outside* the
`qrEntitled` branch, not merely with the flag forced true, or a future refactor of the gate will
silently swallow it. Part A's branded rendering of *table* QRs stays inside the existing gate, since
those are dine-in.

### B5 — 🟡 Print payload shape is shared
Ticket: coordinate with Ali Jaffal before changing the print payload shape. Ties back to C1.

### B6 — 🟢 Existing PDF already violates a new AC
`QrTableManager.tsx:359` uses `margin: 2`. New AC demands quiet zone ≥4 modules. Fixing it changes the
existing table-QR print sheet layout slightly — a pre-existing-behaviour change to call out in review.

---

## 4. Proposed sequencing

**PR 1 — Part A, render only. ✅ CODE COMPLETE** on `feat/branded-qr-rendering` (not pushed, no PR).
A1–A6 plus `qr-code-styling@1.9.2` and `@types/qrcode`. No migration.

Shipped:
- `lib/qr/branding-rules.ts` — pure, DOM-free: contrast, inversion, ECC selection, the area→`imageSize`
  conversion, the quiet-zone closed form, and the input-reject vs render-degrade split.
- `lib/qr/render.ts` — the single renderer all outputs share. Lazy-imports the library so it stays out of
  the server path (verified: `/dashboard/online-ordering` still prerenders, and the library is in its own
  code-split chunk).
- `app/dashboard/online-ordering/components/BrandedQrPreview.tsx` — live preview, rendering the *raster*
  output so the preview is literally what prints.
- `QrTableManager.tsx` — SVG, PNG and PDF export all routed through the shared renderer; the `brandMode`
  toggle now controls real branding instead of only a PDF text label; PDF panel chrome follows the
  resolved module colour; branding fallbacks raise a visible toast.
- `getQrTableManagerSnapshot` returns a `branding` block from `online_store_config`.
- 34 unit tests, green. Full suite: 9 pre-existing failures in 4 unrelated files, identical on a clean
  tree — not caused by this work.

Not done in PR 1: in-app QA against a signed-in dashboard, and everything in §2 (printed scan matrix,
POS print path).

**PR 2 — Part B schema.** Table + RLS + RPC, `location_id NOT NULL` per D1.

**PR 3 — Part B surfaces.** Public resolver + dashboard CRUD + scan logging (B2 still open). Per D3 the
marketing-QR surface must sit **outside** the `qrEntitled` gate.

**Handoff — C1.** Per D4: because D2 is browser-only, the shared surface for the tablet is real work, not
a by-product. Scope it explicitly, document it, raise the POS ticket for Ali Jaffal.

**Out of scope (per ticket):** dynamic/editable destinations, UTM attribution, QR analytics dashboards,
bulk print sheets.

---

## 5. Open questions

1. ~~**B1** — merchant-wide codes~~ → **D1: `location_id NOT NULL` for v1.**
2. ~~**B3** — render approach~~ → **D2: client canvas + `qr-code-styling`.** CORS risk measured away.
3. ~~**B4** — entitlement~~ → **D3: ungated, part of the online store.**
4. ~~**C1** — POS print AC~~ → **D4: shared surface + handoff to Ali Jaffal, AC moves to a POS ticket.**
5. **B2 — still open.** New `stage` value (requires altering a CHECK constraint on a live table) vs reuse
   `'scanned'` and distinguish by `table_qr_code_id is null` (zero schema churn). Leaning reuse.
6. **New — sizing.** The ticket says sizing is not agreed and Ali Awdi estimates before a due date is set.
   Nothing here is estimated yet.
