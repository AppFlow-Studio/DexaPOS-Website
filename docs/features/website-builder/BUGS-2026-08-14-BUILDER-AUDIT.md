# Bug audit — Website Builder

**Date:** 2026-08-14
**Verified against `HEAD`:** 2026-08-23 — see [Verification pass](#verification-pass)
**Scope:** the page editor route, the render path, and `components/site-builder/builder/`
**Method:** read of the builder + resolver code, plus `.next/dev/trace` (43,239 events, 8,599 tagged `builder`)

> **Read the verification pass first.** This file was written on 2026-08-14 against a codebase that has
> since moved. **8 of the 16 findings are now fixed**, the route has been renamed, and the premise that
> made C1–C3 "latent" is gone. Every file:line reference in the original prose below is stale; the
> verification notes carry the current ones.

Related: [HANDOFF-2026-08-13-BUILD-SESSION.md](HANDOFF-2026-08-13-BUILD-SESSION.md) — §6b covers the render-cost
work this audit extends, §7 covers what is still unverified.

---

## Verification pass

**Date:** 2026-08-23. Every finding was re-traced to its current location in the code and confirmed
present or absent by reading the implementation, not by trusting this document's own status column.

### What moved

| Then | Now |
|---|---|
| `/dashboard/website/builder` | [`/dashboard/website/pages/[pageId]`](../../../app/dashboard/website/pages/[pageId]/page.tsx) |
| `app/dashboard/website/builder/render-canvas.tsx` | [`app/dashboard/website/pages/render-canvas.tsx`](../../../app/dashboard/website/pages/render-canvas.tsx) |
| `SettingsPanel.tsx` | [`SectionDrawer.tsx`](../../../components/site-builder/builder/SectionDrawer.tsx) |
| `SectionList.tsx` | gone — reorder/hide/duplicate/delete moved into the [canvas gutters](../../../components/site-builder/builder/Canvas.tsx) |

### The premise that changed

This document says of C1/C2/C3 that they "are latent *only* because `noopSaveAdapter` is still in place…
they activate together at Path A step 4."

**That step has happened.** `noopSaveAdapter` no longer exists;
[`save-adapter.ts`](../../../components/site-builder/builder/save-adapter.ts) wires the real `SaveDraft`.
C1 and C2 were fixed before the swap, as this audit recommended. **C3 was not**, and is therefore a live
wrong-behaviour bug today rather than a latent one.

### Result

| # | Title | Verified 2026-08-23 |
|---|---|---|
| [P1](#p1) | Site context loaded twice per open | ✅ **Fixed** — `request-scope.ts`, confirmed genuine |
| [P2](#p2) | 354 KB menu fetched twice per open | ✅ **Fixed** — same |
| [P3](#p3) | Every canvas re-render repeats P1 + P2 | ⚠️ **Half-fixed** — text edits patch the DOM; structural edits still pay in full |
| [P4](#p4) | Cold dev compile dominates first open | ℹ️ Dev-only, unchanged, nothing to fix |
| [P5](#p5) | StrictMode defeats the first-render guard | ✅ **Neutralised downstream** — not at the ref |
| [C1](#c1) | Autosave discards edits made during a save | ✅ **Fixed** — snapshot + generation guard |
| [C2](#c2) | Autosave can fire twice for one change | ✅ **Fixed** — `saving`/`queued` refs |
| [C3](#c3) | `replaceDoc` marks the server doc dirty | ✅ **Fixed 2026-08-23** — `adoptServerDoc` |
| [C4](#c4) | `normalizePage` wipes a location binding | ✅ **Fixed 2026-08-23** — binding id may be blank |
| [C5](#c5) | Undo/redo always marks dirty | ⚪ **Code unchanged, consequence gone** |
| [U1](#u1) | Required text fields cannot be cleared | ✅ **Fixed** — deliberately, in `TextControl` |
| [U2](#u2) | Changing a link’s destination discards the URL | ✅ **Fixed 2026-08-23** — per-kind memory |
| [U3](#u3) | Move up/down offered for refused moves | ✅ **Fixed** — zone-derived, as claimed |
| [U4](#u4) | New repeater rows seeded with `"New"` | ✅ **Fixed 2026-08-23** — blank row + publish gate |
| [U5](#u5) | Select control coerces numeric-looking enums | ❌ **Present, still unreachable** |
| [I1](#i1) | Failed `renderCanvas` blanks the canvas silently | ✅ **Fixed 2026-08-23** — null is a failure |
| [I2](#i2) | `h-[calc(100vh-4rem)]` hardcodes the header height | ✅ **Fixed** — with the suggested remedy |

**Fixed: 13. Present: 1 (P3, half-done). Informational / decayed: 2.**

### Fix pass — 2026-08-23

Worked in severity order. **C4, C3, I1, U2 and U4 are fixed**; see each finding's note for what changed.

| | |
|---|---|
| Suite | `lib/site-builder` + `components/site-builder` + `app/dashboard/website` — **45 files, 830 tests, green** (was 44 / 813) |
| New guards | 17, each confirmed to **fail without its fix** — a test that passes either way is not a guard |
| Typecheck | 11 pre-existing errors in these paths before and after: **no new ones**. (The suite-wide 863 are almost all `date-fns` module resolution.) |

**Still open:**

- **P3's remaining half** — deliberately not attempted. See its note: what is left needs a database
  migration, not a code change, and it trades against decision A4. It is the one item here that should be
  planned rather than patched.
- **U5** — unreachable, left alone on purpose.
- **C5** — cosmetic; recommend closing rather than tracking.

---

## Summary (as filed, 2026-08-14)

| # | Title | Severity as filed | Ships as a user-visible bug when… |
|---|---|---|---|
| [P1](#p1) | Every builder open loads its site context twice | ~~High~~ | ✅ Fixed 2026-08-15 — `request-scope.ts` |
| [P2](#p2) | Every builder open fetches the 354 KB menu twice | ~~High~~ | ✅ Fixed 2026-08-15 — `request-scope.ts` |
| [P3](#p3) | Every canvas re-render repeats P1 + P2 | **High** | Now — on every edit |
| [P4](#p4) | Cold dev compile dominates first open | Info | Dev only, never in prod |
| [P5](#p5) | StrictMode defeats the first-render guard, doubling every builder open | Info | Dev only, never in prod |
| [C1](#c1) | Autosave silently discards edits made during an in-flight save | **High** | The moment `SaveDraft` replaces the no-op |
| [C2](#c2) | Autosave can fire twice for one change | Medium | Same |
| [C3](#c3) | `replaceDoc` marks the freshly-loaded server doc dirty | Medium | Same |
| [C4](#c4) | `normalizePage` can wipe a location binding during repair | Medium | On a malformed/legacy document |
| [C5](#c5) | Undo/redo always marks dirty, even back to the saved state | Low | Same as C1 |
| [U1](#u1) | Required text fields cannot be cleared — the input looks frozen | Medium | Now |
| [U2](#u2) | Changing a link's destination discards the URL already typed | Medium | Now |
| [U3](#u3) | Move up/down offered for moves that are always refused | Low | *(fixed incidentally)* |
| [U4](#u4) | New repeater rows are seeded with the literal string "New" | Low | Now |
| [U5](#u5) | The select control coerces numeric-looking enum values to numbers | Low | Latent |
| [I1](#i1) | A failed `renderCanvas` blanks the canvas with no error shown | Medium | On any transient failure |
| [I2](#i2) | `h-[calc(100vh-4rem)]` hardcodes the dashboard header height | Low | If the dashboard header resizes |

---

## Why the route is slow

Two unrelated causes, and only one of them exists in production.

### Measured, from `.next/dev/trace`

```
render-path  /dashboard/website/builder    n=1615
  p10 568 ms   p50 816 ms   p75 1081 ms   p90 1669 ms   p99 6338 ms   max 15480 ms

worst-case single events
  handle-request           24444 ms
  navigation-to-hydration  24919 ms
  ensure-page (compile)    12676 ms
  compile-path              9184 ms
```

Slowest compiles by route — note the builder is **not** the worst offender; the dashboard layout it sits inside is:

```
17841 ms  /dashboard                      ← the layout
12676 ms  /dashboard/website/builder/page
 9184 ms  /dashboard/website/builder
```

### <a id="p4"></a>P4 — Cold dev compile (Info, dev-only)

The 12–24 s first open is Turbopack compiling the route and the `/dashboard` layout. It does not exist in a
production build, and `next.config.ts` disabling type/lint checks means it is pure module-graph cost. Nothing
to fix in the builder; the honest answer to "why did it take 20 seconds" the *first* time is this.

The steady-state number is the p50 of **816 ms**, and that one is ours.

> **Verified 2026-08-23 — unchanged, and nothing to change.** Dev-only by construction.

### <a id="p5"></a>P5 — StrictMode doubles every builder open in dev (Info, dev-only)

`useServerRender` skips its first run with a `first.current` ref, because the page already rendered the initial
canvas and passed it down. React StrictMode — on by default in dev, `reactStrictMode` is not set in
`next.config.ts` — invokes effects twice. The first invocation flips `first.current` to `false`; the second
sees `false`, schedules the timer, and calls `renderCanvas` for a document nobody has edited.

**Measured** by counting real round trips in `.next/dev/logs/next-development.log`: an isolated request (no
hydration) issues **1** of each query; a real navigation that hydrates and sits idle for 8 s issues **2** of
each. That second set is this.

Harmless in production, where effects run once. Worth knowing because it means a dev-mode builder open costs
*double* the measured query budget — a large part of why the route feels slower while developing than the
numbers suggest.

> **✅ Verified 2026-08-23 — neutralised, though not where this predicted.**
>
> `reactStrictMode` is still unset (so still on in dev) and `first.current` is still a ref, so the double
> effect invocation still happens. But the spurious *render* no longer does:
> [`BuilderShell.tsx:195`](../../../components/site-builder/builder/BuilderShell.tsx#L195) now gates on
> `getTextPreviewPatches(renderedDoc.current, doc) === null`. On the second invocation the document is
> identical, which returns `[]` rather than `null`, so `mustRender` is false and no action fires.
> A side effect of the P3 fast path rather than a fix aimed at this.

### <a id="p1"></a>P1 — Every builder open loads its site context twice (High)

The builder page called `loadSiteContext`, which issues two queries (`merchants`, then `online_store_config`).
It then awaited `renderCanvas(doc, site.locationId)`, and `render-canvas.tsx` called `loadSiteContext`
**again** — a second `merchants` query and a second `online_store_config` query.

There was no deduplication: `grep -rn "cache(" lib/site-builder/ app/dashboard/website/` returned **nothing**.
React's `cache()` was not used anywhere in the feature.

Handoff §6b measured `online_store_config` at **913 ms** against staging. This duplicate alone was therefore
worth roughly **0.9–1.8 s** on every builder open.

> **Note on the handoff's stated reason.** §6b says the duplicate is unavoidable because "`renderCanvas` is a
> Server Action that constructs its own sources and a memo cannot cross that boundary." That is true for the
> *client-invoked* re-renders, which really are separate requests. It is **not** true for the first load:
> the page awaits `renderCanvas(...)` as a direct in-process function call inside the same request, so a
> `React.cache()` wrapper on `loadSiteContext` would dedupe it. The first-load half of this is recoverable.

### <a id="p2"></a>P2 — Every builder open fetches the 354 KB menu twice (High)

The memo in `createSupabaseResolverSources`
([`supabase-sources.ts:66`](../../../lib/site-builder/bindings/supabase-sources.ts#L66)) is **per sources
instance**. The page built one instance for `loadSampleMenuItemIds`; `render-canvas.tsx` built a
second, whose memo started empty. So `get_menus_for_location` ran twice — measured at ~493 ms and 354 KB each.

Handoff §6b flags this as "~500 ms once per builder open." That is accurate for the menu RPC in isolation but
understates the total, because it omits P1.

**Full per-open server cost:**

| Query | Was | Now | Approx. cost each |
|---|---|---|---|
| `merchants` | 2 | **1** | ~190 ms |
| `online_store_config` | 2 | **1** | ~250 ms |
| `get_menus_for_location` | 2 | **1** | ~480 ms / 320 KB |
| `locations` | 1 | 1 | ~190 ms |

### ✅ Fixed 2026-08-15

[`lib/site-builder/request-scope.ts`](../../../lib/site-builder/request-scope.ts) introduces request-scoped
singletons via React `cache()`: one Supabase client, and one resolver-sources instance per request.
`loadSiteContext` no longer takes a client — its two queries are memoised individually, keyed on primitives, so
the builder page's `?location=`-derived call and `renderCanvas`'s resolved-uuid call share one fetch despite
disagreeing about their arguments.

**Verified empirically, not assumed.** React's `cache()` is a *passthrough* outside a React request scope — a
vitest assertion on it would be a false guard — so the proof is a round-trip count taken from
`.next/dev/logs/next-development.log` with temporary probes: one isolated builder request went from 2/2/2 to
**1/1/1**. Two tests in `resolver.test.ts` guard the property that makes it work (the menu memo lives on the
*instance*), including one that deliberately asserts two instances do **not** share.

> **✅ Re-verified 2026-08-23 — the fix is real and still in place.** Both the page
> ([`page.tsx:50`](../../../app/dashboard/website/pages/[pageId]/page.tsx#L50)) and
> [`render-canvas.tsx:49`](../../../app/dashboard/website/pages/render-canvas.tsx#L49) now take their sources
> from `getResolverSources`, and `site-context.ts` memoises `fetchMerchant`, `fetchStoreConfigs` and
> `fetchMerchantSite` individually.

### <a id="p3"></a>P3 — Every canvas re-render repeats all of it (High)

`useServerRender` debounces 400 ms and then calls `renderCanvas`, which re-runs `loadSiteContext` **and** the
full 354 KB menu RPC — to redraw a heading the merchant just typed.

So the felt slowness during editing is not the 400 ms debounce; it is ~1.4 s of database work behind every
pause in typing. This is the one worth fixing first: it is the cost the merchant pays repeatedly, where P1/P2
are paid once.

PLAN-06 §2.2's keystroke-level fast path (patch the text node by `data-sb-field`) was deliberately deferred,
and the comment above `useServerRender` says so. This finding is the evidence that it is now needed — or,
more cheaply, that `renderCanvas` should not re-resolve bindings the document did not change.

> **⚠️ Verified 2026-08-23 — half done. The recommended fast path shipped; the underlying cost did not move.**
>
> **Fixed:** the keystroke path. [`preview-sync.ts`](../../../components/site-builder/builder/preview-sync.ts)
> classifies a document delta as text-only and patches `[data-sb-field]` nodes in place, so plain text editing
> no longer touches the server at all. `TextControl` also debounces its commit, so the document itself changes
> only on a pause. Together these remove the common case.
>
> **Not fixed:** everything else. `renderCanvas` still re-runs `resolveBindings` and the full menu RPC on every
> structural edit, rich-text edit, style change, hide/show, reorder and section add or delete.
> `request-scope.ts:23-26` states the remaining gap in its own words — a browser-invoked `renderCanvas` "is a
> new request with an empty cache, and it pays for its own fetches… it needs a narrower menu query, not a
> longer-lived cache."

---

## Correctness

### <a id="c1"></a>C1 — Autosave silently discards edits made during an in-flight save (High)

```ts
const flush = async () => {
  const { revision, setSaveState, replaceDoc } = store.getState();
  setSaveState("saving");
  const outcome = await adapter.save(doc, revision);   // `doc` is captured from the closure
  if (outcome.ok) {
    store.setState({ revision: outcome.revision, saveState: "saved" });   // unconditional
    return;
  }
```

Two defects in the same three lines:

1. `doc` is the closure's document, not `store.getState().doc`. An edit made after the effect ran is not in
   the payload.
2. The success branch sets `saveState: "saved"` **unconditionally**. If the merchant typed during the await,
   `apply()` had already set `saveState: "dirty"`; this overwrites it. No further save is ever scheduled,
   because the autosave effect only runs `if (saveState !== "dirty") return`.

Net result: the edit is not saved, no retry is queued, and the toolbar says **"Saved"**.

Invisible today because `noopSaveAdapter` resolves immediately. It becomes real data loss the instant
`SaveDraft` is wired in — which is step 4 of Path A in the handoff. **This should be fixed before that swap,
not after.**

> **✅ Verified 2026-08-23 — fixed, and fixed before the swap as recommended.** All three parts:
> - the payload is now a fresh `store.getState().doc`
>   ([`BuilderShell.tsx:282`](../../../components/site-builder/builder/BuilderShell.tsx#L282));
> - success calls `markSaved(outcome.revision, editGeneration)`, and
>   [`store.ts:481`](../../../components/site-builder/builder/store.ts#L481) only sets `"saved"` when
>   `state.editGeneration === savedGeneration`, otherwise leaving it `"dirty"` so the effect re-fires;
> - `saving` / `queued` refs serialise overlapping flushes.
>
> Guarded by *"never marks an edit made during a save as saved"* in `store-save-state.test.ts`.

### <a id="c2"></a>C2 — Autosave can fire twice for one change (Medium)

```ts
const timer = setTimeout(flush, 1500);
const onHide = () => {
  if (document.visibilityState === "hidden") void flush();   // does not clear `timer`
};
```

Hiding the tab within the 1.5 s window runs `flush` twice with the same `revision`. Against a real optimistic-
concurrency check the second write conflicts, so the merchant gets a spurious "changed in another window"
prompt caused by their own tab.

> **✅ Verified 2026-08-23 — fixed.** `flush` now returns early into `queued.current` when `saving.current` is
> set ([`BuilderShell.tsx:276-279`](../../../components/site-builder/builder/BuilderShell.tsx#L276-L279)), and
> reads `revision` fresh from `store.getState()` rather than a closure. Two flushes can no longer be in flight
> with the same revision, so the spurious self-conflict is gone.
>
> A narrow residue remains and is not worth chasing: if the timer's flush *completes* before React re-runs the
> effect and detaches the `visibilitychange` listener, hiding the tab in that window issues one redundant
> write. It carries the correct fresh revision, so it cannot conflict.

### <a id="c3"></a>C3 — `replaceDoc` marks the freshly-loaded server document dirty (Medium)

[`store.ts:499-508`](../../../components/site-builder/builder/store.ts#L499-L508) always sets
`saveState: "dirty"`. But one of its two callers is the conflict resolution path — "Load theirs" — where the
document being loaded *is* the server's. Marking it dirty immediately re-saves the server's own content back
to the server and bumps the revision for nothing.

`replaceDoc` needs to distinguish "replaced with something new" (starter template → dirty) from "replaced with
what the server already has" (conflict resolution → clean).

> **❌ Verified 2026-08-23 — present, unchanged, and now strictly worse.**
>
> Two things changed around it, both against it:
> - **It is no longer latent.** `noopSaveAdapter` is gone; the write it triggers is a real `SaveDraft`.
> - **The other caller is gone.** `grep` finds exactly one call site —
>   [`BuilderShell.tsx:306`](../../../components/site-builder/builder/BuilderShell.tsx#L306), the conflict
>   toast's "Load theirs". The starter-template caller this behaviour was written for no longer exists, so
>   the unconditional `"dirty"` is now wrong on **every** invocation rather than half of them.
>
> It also leaves `saveError` set to *"This page was changed in another window."* after the conflict has been
> resolved, and bumps `editGeneration`, so `useSaveFailureToast` keeps its `announced` latch closed.
>
> **✅ Fixed 2026-08-23.** `replaceDoc` is now `adoptServerDoc(doc, revision)`
> ([`store.ts`](../../../components/site-builder/builder/store.ts)) — `revision` required rather than
> optional, and it sets `saveState: "saved"` with `saveError: null`, because the adopted document *is* the
> stored one. `past` still receives the merchant's replaced version. Three tests in
> `store-save-state.test.ts` cover the redundant write, the stale error message, and the recoverability of
> what was replaced.

### <a id="c4"></a>C4 — `normalizePage` can wipe a location binding during repair (Medium)

[`normalize.ts:187`](../../../lib/site-builder/normalize.ts#L187)

```ts
props = { ...def.defaults(), ...pickValidFields(def.schema, clampedProps) };
```

`def.defaults()` is called with **no context**. For `location` and `footer`, the registry declares
`defaults: (ctx) => locationDefaults(ctx?.locationId)`
([registry.ts:594](../../../lib/site-builder/sections/registry.ts#L594),
[:621](../../../lib/site-builder/sections/registry.ts#L621)), and
`locationDefaults(locationId = "")` ([schemas/location.ts:32](../../../lib/site-builder/sections/schemas/location.ts#L32))
falls back to the **empty string**.

**Exact trigger** (narrower than it first looks): the whole-object parse must fail *and* the `location` field
itself must be missing or invalid — a valid `location` key survives via `pickValidFields`. When both hold, the
section is repaired to `{ type: "location", id: "" }`.

The consequence is disproportionate to the trigger: an empty binding id makes
[`validate.ts:135`](../../../lib/site-builder/validate.ts#L135) raise `unset_binding`, which is a **blocking
error**, so the page can no longer be published — and `normalizePage` runs on the client's document on every
`renderCanvas` call, so the repair is re-applied continuously.

`normalizeSection` has no access to a location id today. Fixing this means threading a `SectionDefaultsContext`
through `normalizePage`, which is a signature change worth planning rather than patching.

> **❌ Verified 2026-08-23 — present and unchanged, but this description gets both the cause and the severity
> wrong.** Three corrections, from reading the code:
>
> **1. It does not wipe a valid binding.** This document's own "exact trigger" paragraph is right and its
> title is not. `pickValidFields` re-parses each field independently and keeps every one that passes, so a
> valid `location` key always survives. The binding is only replaced when it was *already* missing or
> invalid. Nothing is destroyed; an unset value is invented.
>
> **2. The real defect is that normalize emits props its own schema rejects.**
> `bindingSchema` is `id: z.string().min(1).max(64)`
> ([bindings/types.ts:63](../../../lib/site-builder/bindings/types.ts#L63)), so `{ type: "location", id: "" }`
> **fails the location schema**. `normalizePage`'s output is supposed to be a document nothing downstream has
> to defend against — that is the contract in its own header comment — and here it is not. This is the
> invariant to restore, and it is a bigger deal than the publish blocker:
>
> **3. It freezes the section against nearly every edit.**
> [`updateSectionProps`](../../../lib/site-builder/mutations.ts#L282) builds
> `candidate = { ...section.props, ...patch }` and re-parses the whole object, refusing it outright on
> failure. With `id: ""` sitting in `props`, *every* patch that does not itself set `location` — toggling
> "Show map", editing the heading, changing the map style — fails and is refused with a toast. The merchant
> experiences a section that has stopped accepting input, which is a far worse symptom than a publish button
> that explains itself.
>
> **What the audit missed on the other side: recovery exists and works.** The publish gate's blocker card
> carries a "Fix it" button that selects the offending section
> ([`EditorTopBar.tsx:192`](../../../components/site-builder/builder/EditorTopBar.tsx#L192)), and the location
> ref control renders a destructive-styled explanation with a **"Link to this restaurant"** button that sets
> `{ type: "location", id: locationId }`
> ([`SectionDrawer.tsx:1113`](../../../components/site-builder/builder/SectionDrawer.tsx#L1113)). That patch
> *does* include `location`, so it is the one edit that passes — and it repairs the section. The loop closes.
> Severity is therefore **Medium**, not High: recoverable, but only via a route the merchant reaches by being
> blocked first.
>
> **✅ Fixed 2026-08-23** — not by threading context, which cannot work on its own (two of the six call
> sites, `draft.ts` and `publish.ts`, have no location id in scope, and a fallback would still be needed).
> `bindingSchema`'s `id` dropped its `.min(1)`
> ([`bindings/types.ts`](../../../lib/site-builder/bindings/types.ts)), moving the non-empty rule wholly to
> the publish gate — which already enforced it *more* thoroughly, at any depth and for every binding type.
> Blast radius is three fields. Measured before and after:
>
> | | Before | After |
> |---|---|---|
> | Repaired props parse their own schema | `false` | **`true`** |
> | Repairs on a second `normalizePage` | `invalid_props` | **none** |
> | An unrelated edit to the section | refused | **accepted** |
> | `unset_binding` publish error | raised | raised — **unchanged** |
> | Registry kinds with schema-invalid context-free defaults | `location, footer` | **none** |
>
> The durable guard is a second assertion in `registry.test.ts` that every kind's defaults satisfy its own
> schema **with no context**. The existing version passed a `locationId`, which is exactly why it never
> caught this.

### <a id="c5"></a>C5 — Undo/redo always marks dirty (Low)

[`store.ts:437`](../../../components/site-builder/builder/store.ts#L437) sets `saveState: "dirty"`
unconditionally. Undoing back to the last-saved state schedules a redundant save. Harmless, but it makes the
save indicator lie about whether there is anything to save.

> **⚪ Verified 2026-08-23 — code unchanged, finding decayed to cosmetic.** `undo` still sets `"dirty"`
> unconditionally, but everything that made it matter is gone: `grep` finds **no `redo` action at all**, there
> is **no save indicator left to lie** (the status text was removed in the redesign), and `undo` is now
> reachable only through the delete toast's Undo. What remains is one redundant write after an undo-to-saved.
> Not worth a change on its own; fold it in if `store.ts`'s save states are touched for C3.

---

## UX

### <a id="u1"></a>U1 — Required text fields cannot be cleared (Medium)

`SettingsPanel` text and richtext controls emit `onChange(e.target.value || undefined)`. Clearing the input
sends `undefined`, which merges into the candidate props, fails the Zod parse in `updateSectionProps`, and is
**refused**.

Because the refusal leaves state untouched and the input is fully controlled, the old text snaps straight
back. From the merchant's side the field is simply broken: select-all, delete, and nothing happens except a
toast. There is no way to retype a heading from scratch — only to edit it in place.

*Deliberately preserved byte-for-byte in the redesign so the UI change stays presentation-only.*

> **✅ Verified 2026-08-23 — fixed deliberately, with the reasoning written down.**
> [`TextControl`](../../../components/site-builder/builder/SectionDrawer.tsx#L764) holds a local `draft`,
> keeps an empty required field local instead of committing it (`if (!next && !control.optional) { cancel();
> return; }`), and on blur restores from a `committed` ref if the draft never became valid. It also debounces
> the commit and enforces the character cap on the way in, which is what stops a paste over the limit from
> silently freezing the canvas. `useTextDraft` in
> [`FormTextInput.tsx`](../../../components/site-builder/builder/FormTextInput.tsx#L67) does the same job for
> the form builder, covered by `form-text-input.test.tsx`.

### <a id="u2"></a>U2 — Changing a link's destination discards the URL already typed (Medium)

The `link` control's `<select>` handler emits `{ label, target: { kind: e.target.value } }` — with no
`target.value`. Typing a URL, switching to "Call us", then switching back to "External link" loses the URL.

*Deliberately preserved in the redesign.*

> **❌ Verified 2026-08-23 — rewritten, but the reported symptom survives.**
> The handler at [`SectionDrawer.tsx:467-484`](../../../components/site-builder/builder/SectionDrawer.tsx#L467-L484)
> now computes `keepsValue = kind === link.target?.kind`. That guard can only be true when the kind did not
> change — and a `<select>`'s `onChange` does not fire when it did not change. So `keepsValue` is effectively
> always `false`, and url → phone → url still yields `value: ""`. The rewrite did fix a different defect: the
> `page` kind now seeds `pageOptions[0]?.path` instead of emitting a target with no value at all.
>
> The real fix is to remember the per-kind value across switches rather than to reconstruct it — a small piece
> of local state in the control, keyed by kind.
>
> **✅ Fixed 2026-08-23**, that way. The control moved out of the 1,400-line drawer into
> [`LinkControl.tsx`](../../../components/site-builder/builder/LinkControl.tsx) — necessary as well as
> tidier, because it needs a hook and a `switch` arm cannot have one, and because a control that cannot be
> imported without dragging in the pickers' server actions cannot be tested either. The shared label row and
> input styling moved to [`field-chrome.tsx`](../../../components/site-builder/builder/field-chrome.tsx) to
> make that possible. Each kind's last value is remembered per mount and restored on return; `page` still
> seeds the first published page when nothing is remembered. Four tests in `link-control.test.tsx`.

### <a id="u3"></a>U3 — Move up/down offered for moves that are always refused *(fixed incidentally)*

Both the canvas overlay and the layers panel disabled move buttons only at the **document** boundaries
(`index === 0`, `index === total - 1`). Zone rules are enforced in `moveSectionBy`, so pressing "Move up" on
the first body section — legal-looking, since it is not index 0 — produced a refusal toast instead of a
disabled control. The merchant learned the zone rule by being told "no".

Fixed by the redesign because it rewrote both components.

> **✅ Verified 2026-08-23 — fixed, as claimed.**
> [`Canvas.tsx:374-382`](../../../components/site-builder/builder/Canvas.tsx#L374-L382) derives `canMoveUp` /
> `canMoveDown` from `SECTION_REGISTRY[neighbour.kind].zone === def.zone`, and the gutter renders the pair
> only when at least one is legal. `SectionList.tsx` no longer exists at all, so its half cannot regress.

### <a id="u4"></a>U4 — New repeater rows are seeded with the literal "New" (Low)

`blankRow` assigns `"New"` to every required non-boolean, non-number, non-link, non-select sub-field. For an
FAQ that means a question reading `New` and an answer reading `New`. Placeholder text or an empty string with a
validation hint would be better; `"New"` is content that can be published by accident.

*Preserved in the redesign.*

> **❌ Verified 2026-08-23 — present, unchanged.**
> [`SectionDrawer.tsx:1155-1166`](../../../components/site-builder/builder/SectionDrawer.tsx#L1155-L1166) still
> ends `else row[field.name] = "New";`. Its own doc comment now reads *"A new repeater row with every required
> sub-field present but empty"*, which the code contradicts.
>
> Note the constraint that put `"New"` there: required string sub-fields mean an empty row would fail
> `updateSectionProps`. Fixing this properly means the same invariant work as C4 — letting a row be
> *incomplete but editable*, with the publish gate rather than the schema refusing it.
>
> **✅ Fixed 2026-08-23**, exactly that way, and cheaply because C4 had already established the pattern.
> Three parts, none of which works alone: the seeded text is now `""`; the four repeater sub-fields that
> blocked it dropped their `.min(1)` (`faq.question`, `features.title`, `reviews.quote`, `reviews.author`);
> and `validate.ts` gained an `incomplete_section` error for any repeater row still holding blank text.
>
> Empty string is a reliable signal of "added, not yet written" because the text controls commit `undefined`
> for a cleared *optional* field, never `""`. This mirrors the `incomplete_link` rule that was already
> there — storable while you work, refused at the point of publishing.

### <a id="u5"></a>U5 — The select control coerces numeric-looking enum values (Low)

```ts
const numeric = Number(raw);
onChange(raw !== "" && !Number.isNaN(numeric) ? numeric : raw);
```

Correct for the column-count unions (`z.union([z.literal(2), z.literal(3)])`), which genuinely are numbers.
But it is applied to **every** select, so a future `z.enum(["1", "2"])` whose values are numeric *strings*
would silently be written as numbers and fail its own schema. Latent, not currently reachable — the nine
shipped schemas have no such enum.

*Preserved in the redesign.*

> **❌ Verified 2026-08-23 — present, unchanged, still unreachable.**
> `coerce` at [`SectionDrawer.tsx:1149`](../../../components/site-builder/builder/SectionDrawer.tsx#L1149) is
> byte-identical and is still applied to every select via `choose`. A grep of
> `lib/site-builder/sections/schemas/` for a `z.enum([...])` containing a numeric string returns nothing, so
> it remains latent. The durable fix is to carry the option's type on the `FieldControl` rather than to infer
> it from the string.

---

## Infrastructure

### <a id="i1"></a>I1 — A failed `renderCanvas` blanks the canvas with no error (Medium)

`render-canvas.tsx` returns `null` when auth or the site lookup fails. `useServerRender` treats that as a
successful render and calls `setCanvas(null)`, so the canvas falls back to its placeholder permanently. Only a
thrown error reaches the `catch` that shows a toast.

A dropped session or a transient database blip therefore presents as an editor that quietly went blank —
indistinguishable from a bug in the merchant's own page.

> **❌ Verified 2026-08-23 — present, unchanged, every link in the chain intact.**
> [`render-canvas.tsx:38`](../../../app/dashboard/website/pages/render-canvas.tsx#L38) and
> [`:44`](../../../app/dashboard/website/pages/render-canvas.tsx#L44) still `return null`;
> [`BuilderShell.tsx:208`](../../../components/site-builder/builder/BuilderShell.tsx#L208) still calls
> `setCanvas(node)` with no null check; [`Canvas.tsx:182`](../../../components/site-builder/builder/Canvas.tsx#L182)
> still renders `{canvas ?? <CanvasSkeleton />}`. The merchant sees a permanent skeleton.
>
> The narrow fix is for `renderCanvas` to throw rather than return `null` on the auth and site-lookup failures
> — the `catch` and its toast already exist — or for `useServerRender` to treat a `null` result as a failure
> and leave the previous canvas standing.
>
> **✅ Fixed 2026-08-23**, with the second option. `useServerRender` now throws on a `null` result, which
> routes it into the `catch` that was already there — one failure path, one message — and does so *before*
> `renderedDoc.current` advances, so the next edit retries a full render rather than patching text into a
> canvas that was never replaced. The merchant keeps the last good canvas and is told the preview did not
> update, instead of watching the page go blank.
>
> The first option was rejected: the route also awaits `renderCanvas` for the initial paint, where a throw
> would take out the whole page. Those `null` branches are unreachable there — `page.tsx` already redirects
> on a missing `orgId` and renders `NoStorefront` on a missing site — so the defensive check belongs at the
> client call site that can actually receive one.
>
> **Not covered by a test**, honestly: exercising it means rendering `BuilderShell` with a mocked server
> action and its full dependency graph, which is a brittle test for a one-line guard. Verified by reading
> the path.

### <a id="i2"></a>I2 — `h-[calc(100vh-4rem)]` hardcodes the dashboard header height (Low)

`BuilderShell` subtracted `4rem` to fit under the dashboard chrome. Correct at the time — the dashboard header
is `h-16` — but nothing connected the two, and the builder is the one route where being 8 px out means a
double scrollbar. A shared token or a `flex-1` parent would tie them together.

> **✅ Verified 2026-08-23 — fixed, with the second of the two suggested remedies.**
> `grep` for `100vh` across `components/site-builder/builder/` and `app/dashboard/website/` returns nothing.
> The editor is now a `fixed inset-0 z-50 flex flex-col` overlay
> ([`OverlayChrome.tsx:68`](../../../components/site-builder/shell/OverlayChrome.tsx#L68)) with a `shrink-0`
> header and a `min-h-0 flex-1` body, so it no longer knows or cares what the dashboard header measures — it
> covers it. The coupling is gone rather than tokenised.

---

## Not bugs, but worth stating

- **`export const dynamic = "force-dynamic"`** — deliberate, per handoff §5.3. No caching anywhere in the
  feature. Revisit alongside P1–P3, not before.
  *(Verified 2026-08-23: still set, at [`page.tsx:31`](../../../app/dashboard/website/pages/[pageId]/page.tsx#L31).)*
- **Everything under the migration is still unverified** (handoff §7). ~~This matters for C1/C2/C3
  specifically: all three are latent *only* because `noopSaveAdapter` is still in place. They activate
  together at Path A step 4.~~ **Superseded 2026-08-23** — the swap has happened; see
  [the premise that changed](#the-premise-that-changed).
- **No typecheck gate** (handoff §4.8). The recipe in §9 still works; this audit's changes were checked with
  a throwaway `tsconfig` extending the real one.
- ~~**22 pre-existing test failures** in `lib/menu/cascade-labels`, `AffectsTag`, and the a11y suite~~
  **Re-measured 2026-08-23:** `npx vitest run lib/menu/cascade-labels AffectsTag a11y` → **2 files failed,
  10 failed / 6 passed**. Still unrelated to the builder, still unfixed; the count in this document was stale.
  No file matched `a11y`.
- ~~**The site-builder suite is 169/169 green.**~~ **Re-measured 2026-08-23:**
  `npx vitest run lib/site-builder components/site-builder app/dashboard/website` → **44 files, 813 tests,
  all passing.**

---

## Suggested order (as filed, 2026-08-14 — superseded)

1. ~~**C1** — before `SaveDraft` is wired in, not after.~~ Done.
2. ~~**P3** — the cost the merchant pays on every edit.~~ Half done; see its note.
3. ~~**P1/P2** — one `React.cache()` on `loadSiteContext`.~~ Done.
4. ~~**U1** — the most visible everyday defect.~~ Done.
5. **I1**, then ~~C2~~ **C3/C4**, then the rest.

**Current order: see [Where to go next](#where-to-go-next).**
