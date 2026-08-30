# Fix — "Always ask which location" did nothing a merchant could see

**Date:** 2026-08-27
**Trigger:** "In the website builder settings, what happens when I toggle on
always ask for location — is it working?"

## Verdict

The flag persisted and the *rule* was right. Everything between the rule and the
merchant was wrong, in four separate places, and one of them made the setting
inert on the only page most merchants have.

## What was actually broken

### 1. The home page was pinned to a branch, so the brand layer never applied

`CreateHomePage` inserted `location_id: input.locationId` — whichever storefront
happened to be selected the first time the merchant opened the builder.

`resolvePricingLocation` lets a page's own scope win over any site-wide rule, by
design. So a pinned home page could never be governed by **Default location** or
by this toggle at all: it quoted one arbitrary branch's prices to every visitor,
forever, whatever the merchant set.

This contradicted the schema's own design — see the foundation migration, where
`yourcafe.com` is the brand page carrying NULL — and the settings copy, which
tells a single-location merchant to name a default so "your home page can show
its prices", advice that did nothing.

**Latent, not realised — corrected 2026-08-27 after checking the database.**
`CreateHomePage` was introduced in 2f66085d on 2026-08-16; every home page on
staging (3 of them) predates it and was created by the earlier `CreatePage` path,
which wrote no location. So no home page is pinned today and the toggle *did*
govern them. The defect would have pinned the next home page created, and the
first-listed consequence above has never actually happened to a merchant.

- Code: `CreateHomePage` now inserts NULL.
- Data: `20260827180000_website_home_page_is_brand_page.sql` repairs any rows
  already written. **Written, not applied.** A no-op on staging; production was
  not reachable from that session to check.

### 2. `PAGE_SUMMARY_COLUMNS` never selected `location_id`

`SitePageSummary` has always *typed* the column, so every consumer believed it
held the page's scope while the projection left it `undefined` — and `undefined`
is falsy, so the editor and preview concluded "brand page" for everything and
had no way to tell the difference. The one field that decides whether money may
appear was missing from the summary that answers that question.

### 3. The editor could not represent "no location", so `canShowPrices` was dead code there

`buildRenderContext` passed `site.locationId` — always a real storefront —
straight into `ctx.site.locationId`. `canShowPrices` reads exactly that field and
nothing else, so in the builder canvas and in Preview it was structurally
incapable of returning false.

A merchant could turn the toggle on, save, and watch nothing change. The prices
only vanished on the published site, which is the surface they check last.

Fixed by splitting the two ideas apart in `SiteContext`:

- `locationId` — the storefront being edited (which restaurant's data to read).
- `availableLocationIds` — active storefronts, the set a default may resolve
  against, filtered exactly as `buildPublicRenderContext` filters it.

…and adding `resolveEditorPricingLocation`, which calls the same
`resolvePricingLocation` the public renderer calls. Canvas, Preview and the dish
picker now all read from that one function; a second opinion in any of them is
the same class of bug again.

`scoped` follows it too, so the canvas no longer filters out items one branch has
86'd on a page whose live version keeps them.

### 4. The dish picker quoted prices the canvas beside it was withholding

`loadMenuCatalog`'s `showPrices: locationId !== null` tested the *storefront* id,
which every caller passes as a real uuid — so the branch that withholds prices
was unreachable. The editor route had a second copy of the catalog builder with
`showPrices: true` hardcoded; it is gone, and both callers share one loader.

## Copy

The toggle promised a branch chooser that has never existed anywhere in the
public renderer — grepping for one returns only the description string itself.
Renamed to what it does:

> **Never show prices before a branch is chosen** — Overrides the default above:
> pages that are not about one branch show no prices at all. Guests see prices
> once they open a branch's page or start an order.

## Verification

- 922 tests pass across `lib/site-builder`, `app/dashboard/website`,
  `components/site-builder`.
- Seven new cases in `site-context.test.ts` assert the editor's verdict through
  `canShowPrices` — brand page, location page, default set, default overridden by
  the toggle, page scope beating the toggle, default pointing at a deactivated
  branch, and the no-scope-stated default.
- `tsc` clean over the touched files; ESLint clean.
- Not browser-verified: no browser tooling in that session.

## Scope note

`popular-items` is still the only section that renders money, so this toggle only
ever changes that section. That is a property of the section library, not a
defect, and it was left alone.
