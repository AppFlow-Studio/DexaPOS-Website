# Code Review — Branded QR Rendering (Part A)

**Date:** 2026-09-02
**Reviewer:** Claude (Opus 5), at Ali Awdi's request
**Subject:** commit `7e49a05e` — "QR codes carry the merchant's logo and brand colours"
**Branch:** `feat/branded-qr-rendering`
**Ticket:** [Online Store QR — Branded QR rendering & table-less marketing QR codes](https://app.notion.com/p/3c78280c1b1d81459349d1f7313b958a)
**Companion doc:** [SCRATCH-2026-08-26-BRANDED-AND-MARKETING-QR.md](SCRATCH-2026-08-26-BRANDED-AND-MARKETING-QR.md) (plan + browser QA)

---

## Scope of this review

Read in full: `lib/qr/render.ts`, `lib/qr/branding-rules.ts`,
`app/dashboard/online-ordering/components/BrandedQrPreview.tsx`, the `QrTableManager.tsx` and
`actions.ts` diffs, both test files, and the relevant parts of the bundled `qr-code-styling`
source. Ran `tests/qr-branding-rules.test.ts` and `tests/qr-render-options.test.ts` — **34 passed**.

Part B (`marketing_qr_codes`) is unstarted and is not reviewed here.

## Verdict

The engineering is above the bar. The central decision — collapse four independent `QRCode` call
sites into one shared renderer — is the correct fix for the failure mode the ticket is actually
about, and the non-obvious traps (`imageSize` units, `saveAsBlob`, the quiet zone) are handled and
guarded by tests.

**Part A does not yet meet its acceptance criteria.** Two ACs are unimplemented in the product, and
one failure mode degrades worse than the ticket allows. Issues 1 and 2 below are the gap between
this commit and DoD; both are small.

---

## Issues

### 1. Blocker — the input-rejection ACs are not met; `validateQrBrandingColors` is never called

**Two acceptance criteria are unimplemented:**

> - [ ] Light-module-on-dark inversions are rejected **at input** with a visible reason, not silently rendered
> - [ ] Insufficient contrast between module colour and background is rejected with a visible reason

`validateQrBrandingColors()` is written, correct, and well tested — but nothing in the product calls
it. Its only callers are `resolveQrBranding()` (which is the *render-time* path) and the test file.
Confirmed by grep across the repo.

The colour pickers a merchant actually uses are plain `ColorField`s with no validation:

`app/dashboard/online-ordering/page.tsx:853-881`

```tsx
<ColorField
  label="Primary Color"
  value={settings.primaryColor}
  onChange={(primaryColor) => onUpdate({ primaryColor })}
/>
```

**Effect:** a merchant picks pale yellow, it saves without complaint, and they only learn it was
unusable much later — via a toast raised while exporting a QR code, on a different screen. That is
the degrade path doing the input path's job. The ticket separates the two deliberately: reject when
they *pick* the colour; degrade only for rows that predate the feature.

**Fix:** call `validateQrBrandingColors` from the Online Store branding form and render the returned
`QrBrandingIssue[]` under the offending swatches. The `message` strings are already merchant-facing
and already say *why*. The `scope` field distinguishes a blocking primary-pair problem from a
droppable gradient one. No changes needed inside `lib/qr/`.

---

### 2. Blocker — a broken logo URL hangs forever instead of degrading

`qr-code-styling` has **no error handling of any kind** on image loading. Verified against the
bundled source (`node_modules/qr-code-styling/lib/qr-code-styling.common.js`):

```
grep -c "onerror"             -> 0
grep -c "onabort\|ontimeout"  -> 0
```

The browser path is `img.onload = ...; img.src = url` with no `onerror`, and the `saveAsBlob` XHR
that inlines the logo as a data URI likewise sets only `onload`. The Node/`nodeCanvas` branch *does*
have a `.catch` — the browser branch, the one we use, does not.

**Effect:** if a merchant's `logo_url` 404s, is deleted from the bucket, or a host that isn't Bunny
or legacy Supabase Storage fails CORS, `loadImage()`'s promise never settles. Not an exception we
can catch — a hang:

- `BrandedQrPreview` spins its loader indefinitely; `isRendering` never clears and the `.catch`
  never fires.
- `handleDownloadSvg` / `handleDownloadPng` / `handleDownloadPdf` await forever — no toast, no
  error, no completion.

The AC "merchant with no `logo_url` gets a clean unbranded QR, no error state" is satisfied for a
**null** logo. A **broken** logo is worse than the error state the ticket forbids, because there is
no state at all.

**Fix:** wrap `createStyledQr` in a timeout (a few seconds), and on expiry re-render with
`logoUrl: null` plus a warning through the existing `reportBrandingWarnings` channel. The
degrade-and-say-so machinery already exists; this failure mode simply never reaches it.

---

### 3. Design — the QR background is bound to the storefront's `background_color`

`readQrBranding()` maps `online_store_config.background_color` onto the QR background. That column
describes the merchant's **website** background, not their print surface.

**Effect:** a merchant with a dark-themed storefront (`background_color: '#111827'`) trips
`isInverted()`. Because `primaryPairBroken` resets *both* colours together, they lose their brand
module colour entirely — and see a warning toast on every single export — as a consequence of a
website setting that has nothing to do with printing on paper.

The fallback is *safe* (black on white always scans), so this is not a correctness bug. It is the
wrong default, and it will generate support noise from exactly the design-conscious merchants this
feature is meant to please.

**Fix:** force the QR background to `DEFAULT_BACKGROUND_COLOR` and validate `primary_color` against
white. A printed code should be dark-on-light regardless of the site's theme. Far fewer merchants
would then ever meet the fallback at all.

---

### 4. Minor — the brand-mode toggle is a no-op for a merchant on default colours

`online_store_config.primary_color` is `NOT NULL DEFAULT '#0C4FD1'` — the same value as
`DEXA_BRAND_COLOR` in `QrTableManager.tsx`.

**Effect:** a merchant who never customised their colours and has no logo gets byte-identical
artwork from both `merchant` and `dexa` mode, and reasonably concludes the toggle is broken. The
copy beneath the preview does change ("Your brand colours" vs "Dexa branding"), which makes it look
more broken rather than less — the words move and the code does not.

**Fix:** either detect "still on defaults" and say so in the merchant-mode blurb, or hide the toggle
until the store has customised branding.

---

### 5. Minor — the printed tent PDF is 5.9 MB per table

Already found and documented in §6 of the scratch doc; repeated here so the issues live in one
place. `jsPDF` embeds the QR as uncompressed raw RGB (`/DeviceRGB`, `/BitsPerComponent 8`, no
`/Filter`) — exactly 1400 × 1400 × 3 = 5,880,000 bytes.

Not a correctness bug and not an AC breach. It becomes one the moment anyone builds the bulk print
sheet on top of `handleDownloadPdf`: 120 tables at Uptown Branch alone would produce a ~700 MB
document. Pass a compression option to `addImage`, or embed the already-compressed PNG bytes.

---

### 6. Process — Part A cannot merge independently as it stands

The ticket explicitly says Part A has no schema impact and can merge on its own. But
`feat/branded-qr-rendering` is stacked on ~30 unrelated commits (website builder, Valor payments,
dual pricing), so a PR to `main` today would bury a clean 10-file change in an enormous diff.

**Fix:** rebase the QR commit onto `main` before opening the PR.

---

## Still outstanding (unfinished AC, not defects)

- **The physical printed scan matrix.** iOS Camera and Android Camera, 1.5in, on paper. The browser
  QA in §6 of the scratch doc is strong indirect evidence — decoding the QR straight out of the
  generated PDF, and proving the print path is not falling back by counting 7 near-black pixels out
  of 1.96M — but a browser downscale is not a camera reading ink.
- **No-logo fallback path** — every location tested had a logo.
- **Wide non-square logo** — untested; flagged in §3/B3 of the scratch doc.
- **`!qrEntitled` lockout UI** — the test merchant is entitled.
- **QR-18 POS print path** — handed off to Ali Jaffal (separate React Native repo, decision D4).
- **Screen recording for Abubeckr.**

## What is right, and should not be "fixed" in review

Recorded because two of these look like mistakes to a reader who does not know the traps:

- **`imageSize` is not a percentage of the code.** The library computes
  `hiddenModules = imageSize × ECC_RECOVERY_CAPACITY[ecc] × totalModules`, so `imageSize: 0.25` at
  level H yields a 7.5% logo, not 25%. `areaFractionToImageSize()` converts correctly, and
  `tests/qr-render-options.test.ts` asserts `imageSize > MAX_LOGO_AREA_FRACTION` specifically to
  fail a well-meaning revert to the naive value. Measured output: 22.8%.
- **`saveAsBlob: true` is load-bearing and fails silently.** Without it the SVG keeps a remote
  `href`, and since an `<img>`-loaded SVG cannot fetch external resources, the PNG and PDF come out
  with no logo and no error. Pinned against a future library default change, and tested.
- **The quiet zone is solved, not guessed.** `margin` is in pixels while the spec is in modules, and
  module size itself depends on the margin. The old print path hardcoded `margin: 2` — about a tenth
  of one module, a pre-existing latent bug this work incidentally fixed. Measured: 6.36 modules.
- **`type: "svg"` with `getRawData("png")` is correct.** `_getElement()` lazily sets up whichever
  drawer the requested extension needs, so the constructor's `type` only affects `append()`.
  Verified in the bundled source.

## Suggested order of work

1. Wire `validateQrBrandingColors` into the branding form (issue 1) — closes two ACs.
2. Timeout + unbranded fallback around the renderer (issue 2).
3. Force the QR background to white (issue 3).
4. Rebase onto `main` and open the Part A PR (issue 6).
5. Physical printed scan matrix + screen recording.
6. Issues 4 and 5 as follow-ups, or alongside Part B.
