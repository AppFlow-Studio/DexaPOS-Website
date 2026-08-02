# Receipt logo — audit findings

**Ticket:** [Receipts — enlarge merchant logo + remove gray container background](https://app.notion.com/p/Receipts-enlarge-merchant-logo-remove-gray-container-background-check-across-all-receipt-types-3af8280c1b1d81338119d6cc74d64f9d) · Low · MERCHANT
**Audited:** 2026-08-02 · branch `aliawdi-dev`
**Outcome:** Size increase shipped (3 files). Gray-container half is not fixable in code — the ticket's premise on that point is incorrect.

---

## TL;DR

| Complaint | Ours? | Verdict |
|---|---|---|
| Gray container behind logo | ❌ No | Baked into the merchant's uploaded image file. No CSS involved. |
| Logo too small | ⚠️ Partly | Our box is 64px, but **76% of the merchant's file is dead padding** — the real mark is only ~23px on screen. |
| Same pattern on other receipts | ✅ Clean | All 3 receipt surfaces use identical, correct `object-contain` markup with no container. |
| Printed thermal | — | Not this repo. Separate ticket needed. |
| **New:** rounded + cropping logo | ✅ **Real defect** | Found on reservation/waitlist emails — see [Finding 3](#finding-3--reservationwaitlist-emails-do-have-the-bug). |

---

## Finding 1 — the gray box is in the merchant's asset, not our template

Measured directly from the reported screenshot ([screenshots/01-…png](screenshots/01-digital-receipt-charcoal-gardenia-S1-0017.png)):

- Receipt paper renders at **exactly 360 CSS px** → matches `max-w-[360px]`, so the deployed page is identical to HEAD.
- The gray region is **64 × 33.3 CSS px** — precisely the `w-16` box width with a 1.92:1 asset letterboxed by `object-contain`.
- Fill colour **#f8f8f8**, running **full-bleed into all four corners**, with **square corners** (no `border-radius`).
- **77%** of the rendered asset is that gray; **17%** is the white disc; the mark itself is the remainder.

Our code applies no `background-color`, no `padding`, and no `border-radius` to the logo on any receipt surface. The gray is inside the PNG.

**Proof:** [logo-ab-test.html](logo-ab-test.html) (open directly in a browser) · rendered as [screenshots/ab-test.png](screenshots/ab-test.png).
Four receipts. Panels **A** and **C** use **byte-identical CSS** — the 64px box shipping today — and differ only in the image file. The gray box is present in A and absent in C. If the gray were our container styling, it would appear in both.

Panel **B** is the one worth showing the reporter: it is what shipping the ticket as written actually produces — our size fix makes the gray tile **larger and more prominent**, not gone.

## Finding 2 — "too small" has a second cause nobody spotted

Inside the merchant's 192 × 100 asset, the actual logo mark occupies only **68 × 68 px**.

- Mark fills **35% of the asset width**; **76% of the file is padding**.
- At our 64px box that means the visible mark is roughly **23 CSS px**.
- Doubling the box to 120px would still only get the mark to ~42px.

So enlarging our container cannot fully resolve the complaint either. Both halves of this ticket bottom out in the same place: the uploaded asset.

## Finding 3 — reservation/waitlist emails *do* have the bug

The ticket predicted a copy-pasted container pattern. It exists — just not on receipts.

[lib/messaging/notification-shared.ts:56](../../lib/messaging/notification-shared.ts#L56), the shared `renderBrandedEmail` shell:

```html
style="width:64px;height:64px;border-radius:16px;object-fit:cover;…"
```

- **`border-radius:16px`** — a genuine rounded container, exactly what the ticket describes.
- **`object-fit:cover`** — **crops** the logo instead of fitting it. Charcoal's 1.92:1 asset gets centre-cropped to a square, cutting off both sides of the mark.

Callers: [reservation-templates.ts](../../lib/messaging/reservation-templates.ts) (2×), [waitlist-templates.ts](../../lib/messaging/waitlist-templates.ts) (1×). These are customer-facing, merchant-branded emails.

Worth noting `object-fit` is widely ignored by Gmail and Outlook, so in many clients the logo is simply **squashed** to 64×64 instead. Either way it is wrong, and unlike the receipt complaint this one is ours.

## Finding 4 — this is systemic, not one merchant's mistake

Surveyed **all 13 merchant logos on staging**, rendering each through the real receipt CSS and sampling each image's own corner pixels via canvas.

**Page:** [merchant-logo-survey.html](merchant-logo-survey.html) · rendered as [screenshots/merchant-survey.png](screenshots/merchant-survey.png)

| | Count | Merchants |
|---|---|---|
| 🔴 **Baked-in coloured tile** | **6 / 13** | Appflow Studios, **Dexa POS HQ**, Saucy INC, Appflow Studio Cafe, Charcoal Gardenia ×2 |
| 🟡 Raw photo / complex background | 5 / 13 | Mikes Diner, Charcoal Gardenia INC, Joes Coffee Shop, Appflow Studio Cafe 2, Appflow Studio Cafe |
| 🟢 Clean (transparent) | **2 / 13** | Mtech Team, Bora Bora |

Detail on the baked-in group:

| Merchant | File | Background | Padding |
|---|---|---|---|
| Charcoal Gardenia (×2 orgs) | 1200×630 (1.90:1) | `#f8f8f8` | **88%** |
| Appflow Studios | 1024×1024 | `#151515` | 74% |
| Appflow Studio Cafe | 1024×1024 | `#151515` | 74% |
| **Dexa POS HQ** | 160×160 | `#151515` | 73% |
| Saucy INC | 321×200 (1.60:1) | `#000000` | 67% |

Three things follow.

1. **Finding 1 is confirmed from source.** Charcoal's file is 1200×630 at `#f8f8f8` — matching the aspect ratio (1.90:1) and fill colour inferred from the screenshot pixels. The gap flagged under [Unverified](#unverified) is now closed.
2. **Most merchants are worse off than Charcoal.** `#151515` and `#000000` tiles on white receipt paper are far more jarring than Charcoal's near-white `#f8f8f8` — including **our own Dexa POS HQ logo**. Whoever picks this up will find the complaint recurring.
3. **The size bump would hurt more merchants than it helps.** Only 2 of 13 assets are clean enough to benefit. For the other 11, going to 120px enlarges a black tile or a phone photo — visible in the right-hand column of the survey. Appflow Studio Cafe 2's "logo" is a 3024×4032 portrait photograph.

This moves [deferred item 4](#noted-not-actioned) — a dedicated receipt-logo upload with transparency validation — from *nice-to-have* to *the actual fix*. Asking one merchant to re-export solves 1 of 13.

---

## Full surface audit

Every surface the ticket names, plus what the sweep turned up.

### Receipt surfaces — all clean

| Surface | File | Treatment | Container? |
|---|---|---|---|
| Digital web receipt (`dexaposai.com`) | [app/receipts/[t1]/[t2]/page.tsx:181-190](../../app/receipts/[t1]/[t2]/page.tsx#L181-L190) | `w-16 h-16 object-contain` | none ✅ |
| Receipt email | [lib/messaging/receipt-template.ts:327-333](../../lib/messaging/receipt-template.ts#L327-L333) | `64×64 object-fit:contain` | none ✅ |
| Receipt email — edge fn copy | [supabase/functions/_shared/receipt-template.ts:320-326](../../supabase/functions/_shared/receipt-template.ts#L320-L326) | identical duplicate | none ✅ |
| SMS receipt | [lib/messaging/order-notifications.ts](../../lib/messaging/order-notifications.ts) | plain text + link | **no image at all** — n/a |
| Printed thermal | — | POS tablet app (ESC/POS) | **not in this repo** |
| Kitchen ticket | — | no merchant logo rendered | n/a |
| PDF export | [lib/invoices/invoice-pdf.ts](../../lib/invoices/invoice-pdf.ts), [lib/subscription-billing/invoice-pdf.ts](../../lib/subscription-billing/invoice-pdf.ts) | no logo in either | n/a |

Receipts have no PDF export path; "download" is browser print, which re-renders the web receipt (`@media print` block at [page.tsx:151-160](../../app/receipts/[t1]/[t2]/page.tsx#L151-L160)) — same surface, already covered.

Only this repo was audited. The thermal path was confirmed absent here: `printers.ts` and `AddPrinterDialog.tsx` are configuration UI only, no rendering.

### Adjacent surfaces found during the sweep

| Surface | File | Status |
|---|---|---|
| Public invoice page | [app/invoice/[token]/page.tsx:152-161](../../app/invoice/[token]/page.tsx#L152-L161) | clean, same 64px block |
| Invoice email | [lib/messaging/invoice-template.ts:132-136](../../lib/messaging/invoice-template.ts#L132-L136) | clean, same 64px block |
| **Reservation + waitlist emails** | [lib/messaging/notification-shared.ts:56](../../lib/messaging/notification-shared.ts#L56) | ⚠️ **rounded container + crops** — Finding 3 |
| Storefront checkout header | [CheckoutHeader.tsx:38](../../app/sites/components/checkout/CheckoutHeader.tsx#L38) | ⚠️ `rounded-full object-cover` — crops non-square logos |
| Settings receipt previews (6 files) | [receipt-previews/](../../app/dashboard/settings/receipt-templates/components/receipt-previews/) | `bg-zinc-300 … rounded` — **placeholder mock**, merchant-facing only, not a customer receipt |

---

## Shipped — logo size increase

Applied 2026-08-02 to the three surfaces the ticket names. The gray-container half was **not** attempted; it is not fixable in code (Findings 1 and 4).

| File | Change |
|---|---|
| [app/receipts/[t1]/[t2]/page.tsx](../../app/receipts/[t1]/[t2]/page.tsx#L181) | `w-16 h-16` → `h-30 w-auto max-w-[70%]`; intrinsic props `72×72` → `240×120` |
| [lib/messaging/receipt-template.ts](../../lib/messaging/receipt-template.ts#L327) | fixed `64×64` → `height="120"` + `height:120px;width:auto;max-width:70%` |
| [supabase/functions/_shared/receipt-template.ts](../../supabase/functions/_shared/receipt-template.ts#L320) | identical change — the two copies are byte-aligned |

**Why height-driven, not a square box.** `max-height` only caps; it never scales a small asset up (confirmed empirically — a 68px asset showed no change under `max-height:120px`). `h-30 w-auto` drives the height and lets width follow the aspect ratio, with `max-w-[70%]` stopping a wide mark from spanning the receipt.

**Verified in the browser** against the live receipt:

| Asset | Aspect | Unconstrained @120h | Rendered | Result |
|---|---|---|---|---|
| Joes Coffee Shop 826×549 | 1.50:1 | 180px wide | **181 × 120** | height-bound ✅ |
| Charcoal Gardenia 1200×630 | 1.90:1 | 229px wide | **213 × 120** | width cap engaged ✅, no overflow |

Content width is 304px, so the 70% cap is 213px. Aspect preserved, `object-fit: contain`, no paper overflow in either case.

Before/after: [screenshots/logo-before-after.png](screenshots/logo-before-after.png).

**Not verified:** email rendering. Both template copies changed, but no email was sent through a real client. Outlook's Word engine ignores `object-fit` and `max-width`, so it will honour the `height="120"` attribute and scale width from the asset's natural aspect — acceptable, but worth one real send through Gmail, Apple Mail and Outlook before this reaches customers.

**Still true after this change:** for 11 of 13 merchants the enlarged logo shows a *larger* baked-in tile or photo (Finding 4). The size fix is correct on its own terms; it does not make those assets good.

## Noted, not actioned

1. **Get Charcoal a transparent logo.** The reported receipt stays as-is until the asset is re-exported and re-uploaded to the Clerk org. This fixes the reported symptom — for 1 of 13 merchants (see Finding 4).
2. ~~Size bump to ~120px~~ — **done**, see [Shipped](#shipped--logo-size-increase). Invoices and the storefront header were deliberately left at 64px, so a store's invoice and receipt now brand differently. Worth a follow-up decision.
   - Gotcha found while testing: **`max-height` only caps, it will not scale a small logo up.** Use `height:120px; width:auto; max-width:70%` so wide assets stay bounded on both axes. `max-height:120px` produced no visible change on a 68px asset.
   - Email clients: Outlook's Word engine ignores `max-height`/`object-fit`, so the email surfaces need an explicit `width` attribute plus `height:auto`, not the same CSS as web.
3. **Finding 3 (rounded + cropping logo on reservation/waitlist emails).** Real, ours, unfixed. Deserves its own ticket — it is a different surface from this one.
4. **`receipt_templates.show_logo` and `.logo_url` are dead columns.** ← *Finding 4 makes this the real fix, not a nice-to-have.* Both exist in the schema; the web and email receipts ignore both and always pull `organizations."imageURL"` (the Clerk org avatar — a general-purpose org image nobody uploaded *as a receipt logo*). Wiring these up gives a receipt-specific upload with transparency validation, and stops the next merchant uploading a padded JPEG or a phone photo. Not started.
5. **Thermal receipt** rendering lives in the POS tablet repo. Needs a separate ticket; confirm the raster asset isn't padded before print.

## Verification status

**Finding 1 is confirmed from source.** Closed by Finding 4: the survey read Charcoal's actual `organizations."imageURL"` and measured **1200×630, `#f8f8f8`, 88% padding** — matching the aspect ratio and fill colour independently inferred from the screenshot pixels.

Two caveats on that confirmation:
- The survey ran against **staging** (`dfwqakoyittmrwbqvxgw`), not prod. Prod reads were blocked by the permission classifier. Two staging orgs named "Charcoal Gardenia" carry byte-identical assets matching the prod screenshot, so the asset is the same — but the prod row itself was not read.
- Measurements come from canvas sampling in the browser, since direct image downloads were also blocked. Corner-pixel sampling with a tolerance of 8/255 classifies the background; a logo whose own edges happen to match its background colour could be misreported. None in this set look borderline.

## Reproducing this audit

```bash
# open the A/B comparison
start tasks/receipts-logo-enlarge/logo-ab-test.html

# re-measure the reported screenshot (paper width, logo bbox, fill colour)
# see the commands in this session; requires Pillow
```

Interactive harnesses (open directly in a browser):
- `logo-ab-test.html` — the 4-panel A/B proof; fully self-contained (assets inlined as data URIs)
- `merchant-logo-survey.html` — all 13 merchant logos measured live; needs network access to the logo CDN

Assets in [screenshots/](screenshots/):
- `01-digital-receipt-charcoal-gardenia-S1-0017.png` — the reported screenshot, from the Notion ticket
- `asset-as-rendered.png` — merchant's logo cropped at its exact rendered extent (192×100)
- `asset-transparent-cropped.png` — same mark, gray flood-filled out and trimmed (68×68); simulates a correct export
- `ab-test.png` — rendered A/B comparison
- `merchant-survey.png` — rendered 13-merchant survey
- `logo-before-after.png` — the shipped size change, four live receipts before vs after
