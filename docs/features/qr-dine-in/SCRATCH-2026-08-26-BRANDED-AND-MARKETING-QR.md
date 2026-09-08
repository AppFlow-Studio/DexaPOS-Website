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

---

## 6. Browser QA — Part A (2026-09-01)

Run against the dev server on `feat/branded-qr-rendering`, signed in as the merchant test account
(Joes Coffee Shop), scoped to **Uptown Branch** (120 generated / 118 active codes). Headless Chrome
via the global `@playwright/mcp` playwright copy, `channel: "chrome"`.

This closes the "in-app QA against a signed-in dashboard" item left open by PR 1 in §4.

### Verdict: all nine checks pass. One non-blocking finding.

| # | Check | Result |
|---|---|---|
| 1 | Live preview renders | PASS — `blob:` img, 352×352 (2× of 176) |
| 2 | `brandMode` swaps **real artwork**, not labels | PASS — merchant 23,153 B vs DEXA 8,186 B, different hashes |
| 3 | SVG export inlines the logo (`saveAsBlob`) | PASS — 2 `data:image/jpeg` URIs, **0** remote `href`s |
| 4 | PNG export branded and scannable | PASS — 1200×1200, decodes |
| 5 | **Printed tent is not silently unbranded** | PASS — see below |
| 6 | Quiet zone ≥ 4 modules | PASS — **6.36** modules on all four sides |
| 7 | Logo area ≤ 25% of the code | PASS — **22.8%** |
| 8 | Bad colours degrade visibly | PASS — toast fired |
| 9 | Console / page errors | PASS — **zero** across every run |

### The print AC, proven rather than eyeballed
The QR image was extracted from the generated `uptown-branch-1-table-tent.pdf` and decoded directly:

- Decodes to the correct guest URL: `/sites/joes-coffee-uptown/t/<token>`
- Module colour `rgb(107,62,46)`, background `rgb(245,235,221)` — the merchant's own colours
- **7 near-black pixels out of 1,960,000.** The old hardcoded `#111827` on `#FFFFFF` is gone; the
  printed path cannot be quietly falling back.

### Scannability, measured
QR version 14 (73 modules), module size exactly 14.00px at 1200px. The branded, logo-occluded code
decodes at full size **and still decodes downscaled 4× to 300×300** — evidence for, but not a
replacement for, the physical matrix in §2/C2.

§3/B6 is resolved: the old `margin: 2` print path (~0.1 module) now measures 6.36 modules.
§1/A2's area→`imageSize` conversion is confirmed correct in the artifact — a naive `imageSize: 0.25`
would have produced a ~7.5% logo; the real output is 22.8%, just under the cap.

### Degradation is visible, as designed
Toast observed on export:
> "The second brand colour was skipped because the resulting gradient would not scan reliably."

The gradient was refused and the code still rendered and still scans — the intended
input-reject vs render-degrade split from §1/A2.

### ✅ Finding — the printed tent PDF was 5.9 MB — FIXED 2026-09-01
`jsPDF` embeds the QR as **uncompressed raw RGB**: the image dict is
`/Width 1400 /Height 1400 /ColorSpace /DeviceRGB /BitsPerComponent 8` with **no `/Filter`**, so the
stream is exactly 1400×1400×3 = 5,880,000 bytes. One table's tent is 5.9 MB.

Not a correctness bug and not an AC breach — the artwork was right and it scanned. But this branch
has 120 tables at this location alone, so any future bulk print sheet built on `handleDownloadPdf`
would have produced a ~700 MB document.

**Fixed.** `addImage` now passes an alias and `"FAST"` compression:

```ts
doc.addImage(qrImage, "PNG", x, y, 56, 56, `qr-${row.floorPlanObjectId}`, "FAST");
```

Measured on a regenerated tent, same table, same branding:

| | before | after |
|---|---|---|
| file | 5.62 MB | **0.22 MB** (25× smaller, −96%) |
| image stream | 5,880,000 B raw RGB, no `/Filter` | 221,351 B `FlateDecode` + `/Predictor 11` |
| 120 tables | 0.66 GB | **27 MB** |

**Verified lossless, not assumed.** The image was extracted from the new PDF, un-deflated, the PNG row
predictors undone, and decoded: it still resolves to the correct guest URL, and the pixel statistics are
*identical* to the uncompressed version — 84.6% coloured, **7** near-black pixels,
`rgb(245,235,221)`×10219 / `rgb(107,62,46)`×6338. Same artwork, a twenty-fifth of the bytes.

The alias also pins image reuse: `renderPanel` is called twice (lines 576–577), so both halves of the
tent now provably share one stored image rather than relying on jsPDF's content hashing. The PDF still
contains exactly 1 image object.

34 unit tests still green; the `alias`/`compression` positional arguments match jsPDF's first
`addImage` overload, so this is type-clean.

### Not covered by this run
- **No-logo fallback** — every location tested had a logo; the "Your brand colours" path is unexercised.
- **Gate-locked state** — this merchant is entitled, so the `!qrEntitled` lockout UI was not seen.
- **Wide non-square logo** — §3/B3 warns that some merchants' `logo_url` is a wide collage. Uptown
  Branch's logo is a compact square mark, so the wide-logo case remains untested. Keep it in the
  physical matrix.
- **C2 physical printed scan matrix** — still requires a human, a printer and two phones.

### Second pass — interactive MCP session (2026-09-01)

Re-run through the Playwright MCP browser against a persistent signed-in profile, exercising the
menu actions the scripted pass did not.

- **Render is deterministic.** The preview came back byte-identical to the scripted run — merchant
  23,153 B / hash `1cb411f6`, DEXA 8,186 B / hash `83945c9f`. Same inputs, same artwork.
- **Caption and blurb follow the mode**, not just the code: "Your logo and brand colours" /
  "Every download and printed table tent uses this exact artwork." ↔ "Dexa branding" /
  "Codes print in Dexa blue with no logo."
- **The scan loop closes.** "Preview guest view" opens `/sites/joes-coffee-uptown/t/<token>` —
  the *same token decoded out of the branded PNG* — and it renders the live guest ordering page
  ("Ordering for Table 1", Uptown Branch, menu loaded), in the same brown brand colour and bird
  logo as the code. Branded artwork and its destination are consistent.
- **"Copy guest link"** → toast "Guest link copied for 1".
- **Console: 0 errors in 22 messages**, dashboard and storefront combined. The only warnings are
  Clerk dev keys and a pre-existing `next/image` "missing sizes prop" on the org logo — neither
  related to this work.

Incidental confirmation of §3/B3: the org logo served on this page comes from
`hifouuofcaytijrkbvcy.supabase.co`, the **legacy** Supabase Storage host. Both logo hosts really are
live, as that section warned, and both are covered by the CORS finding.

Now also covered, beyond the first pass: guest-view resolution, copy-link, and the storefront render.
Still uncovered: no-logo fallback, the `!qrEntitled` lockout, wide non-square logos, and C2.

---

## 7. The box behind a transparent logo (2026-09-03)

Reported from the dashboard: a merchant whose logo has no background of its own gets **a plain box in
the middle of the QR code** instead of their mark.

### Cause, read out of the bundled library rather than guessed

`qr-code-styling` never paints anything behind the logo. In `qr-code-styling.common.js`:

1. `drawBackground()` fills the canvas with `backgroundOptions.color`.
2. `hideBackgroundDots: true` makes `drawDots` **skip** every module inside a centred rectangle. It
   draws no plate — it leaves a hole, and the background colour shows through.
3. `drawImage()` stretches the logo across exactly that rectangle.

The rectangle is sized from `this._image.width/height` — **the image file**, not the ink inside it.
So:

| logo | what the merchant sees |
|---|---|
| opaque (background baked in) | the logo *is* the plate; the hole is filled edge to edge and reads as a badge — this always looked right |
| transparent, pale artwork | artwork vanishes into the background colour: a blank square |
| transparent, with export padding | the hole is sized to the padded canvas, so a small mark floats in an oversized hole |

Both transparent cases read as "there is a box in my QR code".

### Fix — `lib/qr/logo-plate.ts`

Hand the library an image that already carries the plate. `prepareLogoForQr` trims the file to its
alpha bounding box, then redraws that ink on an opaque rectangle before rendering.

- **Opaque logos are passed through untouched** (`outcome: "unchanged"`). The case that already
  worked is not touched.
- The plate keeps the **trimmed ink's aspect ratio**. Forcing a square would strand a wide mark in a
  tall box — the same bug in a different costume.
- Plate colour is the QR's own background, so plate and cleared hole are one continuous field.
- **Pale artwork is rescued, not merely reported**: if the ink would vanish into the background, the
  plate is painted in the merchant's *module* colour instead and a notice is raised. A badge in their
  own brand colour beats an empty square.
- Trimming does **not** change occlusion. The rectangle is cleared in full either way; the mark
  simply stops spending its allowance on padding. The printed-scan matrix needs no re-measuring.

`choosePlateColor` has no third branch, and that is provable rather than assumed. Contrast is
multiplicative along a chain, so ink hidden against *both* colours would require
`contrast(background, module) < 1.4 × 1.4 = 1.96`, while `resolveQrBranding` has already forced that
pair to at least `MIN_CONTRAST_RATIO` (4.5) or replaced it with the defaults. A first draft carried
an unreachable "invisible on both" branch plus a warning string; a test sweep across all 256 grey
tones proved it dead and both were deleted.

### Verified in a real browser (Chrome, `.qr-harness`, since removed)

Four synthetic logos × two payload lengths, each rendered through **both** the old pipeline and the
new one, then decoded with jsQR at 200/250/300/400/600/900/1200 px.

| logo | source | outcome | plate | smallest decoding size, before → after |
|---|---|---|---|---|
| pale transparent circle | 512×512 | plated, **badged** | 348×348 | 200 → 200 |
| dark mark, heavy padding | 512×512 | plated | **232×232** | 200 → 200 |
| wide bar, transparent | 600×200 | plated | **604×164** | 200 → 200 |
| opaque white square | 512×512 | **unchanged** | — | 200 → 200 |

Screenshots confirmed the visual claim: the padded mark goes from a dot in a large empty hole to a
mark that fills its plate, and the pale circle goes from near-invisible on cream to white on a brown
badge. **Decode size is identical before and after in every case** — the change costs no
scannability.

Unit coverage: `tests/qr-logo-plate.test.ts`, 17 tests, including the two traps that make a naive
implementation look correct on synthetic data and fail on real files — the alpha haze along
anti-aliased edges (a zero threshold trims nothing), and the arbitrary RGB encoders leave inside
fully transparent pixels (an unweighted mean calls a white logo dark). QR suite total: 61 passing.

### 🟠 Open, and NOT caused by this change — a decode cliff at 69 modules

While sweeping, a table-length URL failed to decode **at every logo size, including well under the
cap**, and it failed identically in the old pipeline and with a logo this change leaves untouched.

Measured with a solid opaque square logo, three distinct payloads per module count, decoded at 600px:

| modules (version) | area 0.14 | area 0.22 |
|---|---|---|
| 57 (v10) | 3/3 | 3/3 |
| 61 (v11) | 3/3 | 3/3 |
| 65 (v12) | 3/3 | 3/3 |
| **69 (v13)** | **0/3** | **0/3** |
| 73 (v14) | 3/3 | 3/3 |

The same 69-module payloads decode fine **with no logo at all**, at 300/600/1200 px.

A failure that is flat across logo area cannot be an error-correction capacity problem — 0.14 is
comfortably inside budget, and both neighbouring versions pass at 0.22. That points at the decoder
rather than at print reality, but it is **not proven**: an attempted ZXing cross-check could not be
completed (`decodeFromImageUrl` navigates the page and destroys the evaluation context).

Do not tune `maxLogoAreaFractionForModules` on this evidence. **Settle it with the phone scan that is
already outstanding, and make sure that run includes a table URL landing on 69 modules** (v13), not
only the 73-module case that has been tested.

### Not covered

The live preview (`BrandedQrPreview`) still discards `warnings` — it destructures `data` only, so the
badge notice appears on download but not under the preview. That is pre-existing behaviour for every
warning, not new here.

### Follow-up — the plate was not enough, and why (2026-09-03)

Reported straight after the above: a merchant whose logo *is* transparent still saw a panel behind it.
Both of my first guesses were wrong, and checking beat guessing.

**Their file really is transparent.** Pulled from the CDN and measured: 404×618 RGBA, 82% of pixels
fully transparent, all four corners transparent. Nothing baked in, and neither upload path flattens —
`cropImageFile` keeps the PNG mime and never fills, and `optimizeImageForCdn` uses `clearRect` and
encodes to lossy WebP, which carries alpha.

**The panel was not white either.** Sampling the rendered PNG: the area behind the logo is
`rgb(245,235,221)` = `#f5ebdd`, *exactly* their QR background. It only looked white in the small
dashboard preview.

So the panel was the knockout rectangle itself — `hideBackgroundDots` blanks a **rectangle** of
modules, and that hard edge reads as a background whatever colour it is painted.

The plate work above also happened not to help *this* logo: its ink bounding box is 388×607 inside a
404×618 canvas, so there is no padding to trim, and the artwork is black, so it needs no badge.
Before and after were near-identical for them. The fix was real but aimed at two problems they did
not have.

**Silhouette knockout.** `prepareLogoForQr` now returns a plate shaped like the artwork — the alpha
mask dilated by the margin radius — and `createStyledQr` sets `hideBackgroundDots: false` whenever it
gets one. Modules are drawn everywhere and the shaped plate covers only what it must, so the pattern
runs right up to the outline. Opaque logos still take the rectangular path (`outcome: "unchanged"`,
`shapedPlate: false`), because there the rectangle *is* the artwork.

Dilation is done by stamping the mask around two rings, not by blurring and thresholding. Blur was
the first attempt and is wrong here: a Gaussian wide enough to dilate by the margin flattens a thin
letter stroke below any usable threshold, so a text logo loses its halo exactly where it needs one.

**Scannability — measured, not assumed.** Silhouette knockout occludes *less* than the rectangle it
replaces, and decoding is unchanged:

| logo | outcome | marketing (37 mod) | table (73 mod) |
|---|---|---|---|
| merchant's real logo | plated, shaped | 200px | 200px |
| pale transparent circle | plated, shaped, badged | 200px | 200px |
| dark mark, heavy padding | plated, shaped | 200px | 200px |
| wide bar, transparent | plated, shaped | 200px | 200px |
| opaque white square | **unchanged**, rectangular | 200px | 200px |

Every case decodes at the smallest size tested (200px), identical to the rectangular knockout.

**Further evidence on the 69-module (v13) cliff.** It persists unchanged under silhouette knockout,
despite occlusion dropping substantially. A failure that ignores both logo area *and* logo shape is
almost certainly the decoder, not the code. Still worth confirming on the outstanding phone scan, but
it should no longer block anything.
