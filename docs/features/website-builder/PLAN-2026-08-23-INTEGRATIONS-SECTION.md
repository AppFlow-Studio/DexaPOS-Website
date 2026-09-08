# PLAN — Integrations section: match Owner's paste ergonomics, add Untappd

**Date:** 2026-08-23 · **Branch:** `feat/website-owner-ui` · **Status:** code complete — 39 site-builder test files green (744 tests)

Reference: Owner's Integrations editor (merchant screenshot, 2026-08-23) — the `Untappd` provider.
Catalogue entry: [`06-section-types.md`](../../research/owner-com-website-tab/features/06-section-types.md) — `☀ Integrations · Third-party embeds`.

## Why

Untappd for Business is where a bar's draft list already lives — kegs blow, taps rotate, ABV and
price change weekly. Embedding that hosted menu means the merchant never maintains the same beer
list twice. It is the rule Popular Items and Events already follow, pointed at a system of record
outside our walls.

Owner's editor is better than ours in four specific ways, none of them cosmetic.

## The gaps

| | Owner | Ours (before) |
|---|---|---|
| Providers | Untappd (+ others) | `google-maps`, `spotify` |
| Accepted input | pasted `<iframe>` code, plain URL, **or** bare IDs | one HTTPS URL; markup rejected outright |
| Confirmation | derived **Location ID** / **Theme ID** echoed back read-only | nothing |
| Field copy | provider-specific label, help text, example | `humanize("embedUrl")` → "Embed url" |
| Unconfigured canvas | titled section + one explanatory sentence | untitled dashed grey box |

## Work items

- [x] **1. Provider table.** Rewrite `schemas/integrations.ts` around a `ProviderSpec` record so a
      fourth provider is one entry, not a new `if`.
- [x] **2. Untappd resolver.** Accept `business.untappd.com/embeds/iframes/{loc}/{theme}` and bare
      `2800/7676`. Store the canonical URL; discard the query string.
- [x] **3. Markup extraction.** Pull `src="…"` out of pasted code, decode entities, then feed it to
      the **same** validator a typed URL faces. The security boundary does not move: output is still
      a reconstructed URL on an allowlisted host.
- [x] **4. Derived identifiers.** `ResolvedIntegrationEmbed.identifiers` carries the human-meaningful
      IDs; they are *derived on read*, never stored twice, so they cannot drift.
- [x] **5. `embed` control kind.** New control in `schema-introspect.ts` + `SectionDrawer.tsx`:
      paste textarea, help text, read-only ID rows, inline error. **Commits only when it resolves** —
      which is exactly what Owner's "Only the verified IDs are saved" means.
- [x] **6. `fieldOverrides` registry hook.** Provider-specific label/help/placeholder, and `clears`.
- [x] **7. Provider-switch bug.** Changing provider today leaves a mismatched `embedUrl`, which
      `updateSectionProps` refuses — the panel goes dead with no explanation. Clear it atomically.
- [x] **8. Canvas placeholder.** Unconfigured section renders a real `SectionHeading` (merchant title
      or the provider's own, e.g. "Untappd beer menu") + one sentence. Builder-only.
- [x] **9. Tests.** Untappd resolution, markup extraction, the attack list, identifiers, control
      classification, provider switch.

## Deliberate deviations from Owner

- **Provider stays selectable.** Owner locks it (greyed input) because their catalogue picks the
  provider when the section is added. Our Add Section flow has one `Integrations` card, so locking
  it would leave the section unfillable. Keep the segmented control.
- **Placeholder stays builder-only.** `RenderMode` separates `builder` from `preview`/`public`;
  "Add your Untappd embed information" must never reach a visitor.
- **No pasted JavaScript, ever.** Providers requiring a `<script>` tag stay out. Copied script is
  merchant-authored code executing on a DexaPOS subdomain.

## Result

`npx vitest run lib/site-builder components/site-builder` → **39 files, 744 tests, all passing**
(737 before, +7 in the new `integrations-render.test.tsx`). ESLint clean on every touched file.
`tsc` reports nothing new; the two pre-existing errors in `starter-page.ts` / `demo-page.ts`
reproduce with this branch's changes stashed out.

### Files

| File | Change |
|---|---|
| `lib/site-builder/sections/schemas/integrations.ts` | `PROVIDER_SPECS` table, Untappd resolver, markup unwrapping, entity decoding, `identifiers` |
| `lib/site-builder/schema-introspect.ts` | `embed` control kind; `help` / `placeholder` / `clears` on `FieldControl` |
| `lib/site-builder/sections/registry.ts` | `fieldOverrides` hook; integrations entry uses it |
| `components/site-builder/builder/SectionDrawer.tsx` | applies `fieldOverrides`; new `EmbedControl`; `select` honours `clears` |
| `components/site-builder/sections/IntegrationsSection.tsx` | titled placeholder; unresolvable link takes the empty path |
| `lib/site-builder/__tests__/integrations.test.ts` | Untappd, paste unwrapping, widened attack matrix across all providers |
| `lib/site-builder/__tests__/integrations-render.test.tsx` | **new** — placeholder, frame, and the never-in-public rule |
| `lib/site-builder/__tests__/schema-introspect.test.ts` | `embed` classification; `fieldOverrides` contract |

### Note on the security boundary

Accepting pasted markup moved a test out of the attack list, which deserves saying plainly: it was
**not** a loosening. A `src` extracted from a snippet is handed to the same validator a typed URL
faces, and `integrations.test.ts` now asserts every attack payload twice — bare, and wrapped in an
`<iframe>` tag — plus `srcdoc`, `<script>` and event-handler payloads. What is stored is still only
a URL this codebase rebuilt from parsed parts.
