# Bug audit — Website Builder

**Date:** 2026-08-14
**Scope:** `/dashboard/website/builder` — the route, the render path, and `components/site-builder/builder/`
**Method:** read of the builder + resolver code, plus `.next/dev/trace` (43,239 events, 8,599 tagged `builder`)
**Status:** **Nothing in this file is fixed.** It is a report. Two items marked *(fixed incidentally)* were
corrected only because the UI redesign rewrote the component that contained them; they are called out so the
next reader is not confused by finding them already gone.

Related: [HANDOFF-2026-08-13-BUILD-SESSION.md](HANDOFF-2026-08-13-BUILD-SESSION.md) — §6b covers the render-cost
work this audit extends, §7 covers what is still unverified.

---

## Summary

| # | Title | Severity | Ships as a user-visible bug when… |
|---|---|---|---|
| [P1](#p1) | Every builder open loads its site context twice | **High** | Now |
| [P2](#p2) | Every builder open fetches the 354 KB menu twice | **High** | Now |
| [P3](#p3) | Every canvas re-render repeats P1 + P2 | **High** | Now — on every edit |
| [P4](#p4) | Cold dev compile dominates first open | Info | Dev only, never in prod |
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

### <a id="p1"></a>P1 — Every builder open loads its site context twice (High)

[`app/dashboard/website/builder/page.tsx:38`](../../../app/dashboard/website/builder/page.tsx#L38) calls
`loadSiteContext`, which issues two queries (`merchants`, then `online_store_config`).

Then line 67 awaits `renderCanvas(doc, site.locationId)`, and
[`render-canvas.tsx:37`](../../../app/dashboard/website/builder/render-canvas.tsx#L37) calls `loadSiteContext`
**again** — a second `merchants` query and a second `online_store_config` query.

There is no deduplication: `grep -rn "cache(" lib/site-builder/ app/dashboard/website/` returns **nothing**.
React's `cache()` is not used anywhere in the feature.

Handoff §6b measured `online_store_config` at **913 ms** against staging. This duplicate alone is therefore
worth roughly **0.9–1.8 s** on every builder open.

> **Note on the handoff's stated reason.** §6b says the duplicate is unavoidable because "`renderCanvas` is a
> Server Action that constructs its own sources and a memo cannot cross that boundary." That is true for the
> *client-invoked* re-renders, which really are separate requests. It is **not** true for the first load:
> `page.tsx` awaits `renderCanvas(...)` as a direct in-process function call inside the same request, so a
> `React.cache()` wrapper on `loadSiteContext` would dedupe it. The first-load half of this is recoverable.

### <a id="p2"></a>P2 — Every builder open fetches the 354 KB menu twice (High)

The memo in `createSupabaseResolverSources`
([`supabase-sources.ts:66`](../../../lib/site-builder/bindings/supabase-sources.ts#L66)) is **per sources
instance**. `page.tsx:51` builds one instance for `loadSampleMenuItemIds`; `render-canvas.tsx:43` builds a
second, whose memo starts empty. So `get_menus_for_location` runs twice — measured at ~493 ms and 354 KB each.

Handoff §6b flags this as "~500 ms once per builder open." That is accurate for the menu RPC in isolation but
understates the total, because it omits P1.

**Full per-open server cost as it stands:**

| Query | Times issued | Approx. cost each |
|---|---|---|
| `merchants` | 2 | — |
| `online_store_config` | 2 | 913 ms |
| `get_menus_for_location` | 2 | 493 ms / 354 KB |
| `locations` | 1 | 405 ms |

### <a id="p3"></a>P3 — Every canvas re-render repeats all of it (High)

`useServerRender` ([`BuilderShell.tsx:133`](../../../components/site-builder/builder/BuilderShell.tsx#L133))
debounces 400 ms and then calls `renderCanvas`, which re-runs `loadSiteContext` **and** the full 354 KB menu
RPC — to redraw a heading the merchant just typed.

So the felt slowness during editing is not the 400 ms debounce; it is ~1.4 s of database work behind every
pause in typing. This is the one worth fixing first: it is the cost the merchant pays repeatedly, where P1/P2
are paid once.

PLAN-06 §2.2's keystroke-level fast path (patch the text node by `data-sb-field`) was deliberately deferred,
and the comment above `useServerRender` says so. This finding is the evidence that it is now needed — or,
more cheaply, that `renderCanvas` should not re-resolve bindings the document did not change.

---

## Correctness

### <a id="c1"></a>C1 — Autosave silently discards edits made during an in-flight save (High)

[`BuilderShell.tsx:166-173`](../../../components/site-builder/builder/BuilderShell.tsx#L166-L173)

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

### <a id="c2"></a>C2 — Autosave can fire twice for one change (Medium)

[`BuilderShell.tsx:190-194`](../../../components/site-builder/builder/BuilderShell.tsx#L190-L194)

```ts
const timer = setTimeout(flush, 1500);
const onHide = () => {
  if (document.visibilityState === "hidden") void flush();   // does not clear `timer`
};
```

Hiding the tab within the 1.5 s window runs `flush` twice with the same `revision`. Against a real optimistic-
concurrency check the second write conflicts, so the merchant gets a spurious "changed in another window"
prompt caused by their own tab.

### <a id="c3"></a>C3 — `replaceDoc` marks the freshly-loaded server document dirty (Medium)

[`store.ts:223-231`](../../../components/site-builder/builder/store.ts#L223-L231) always sets
`saveState: "dirty"`. But one of its two callers is the conflict resolution path — "Load theirs"
([`BuilderShell.tsx:181`](../../../components/site-builder/builder/BuilderShell.tsx#L181)) — where the
document being loaded *is* the server's. Marking it dirty immediately re-saves the server's own content back
to the server and bumps the revision for nothing.

`replaceDoc` needs to distinguish "replaced with something new" (starter template → dirty) from "replaced with
what the server already has" (conflict resolution → clean).

### <a id="c4"></a>C4 — `normalizePage` can wipe a location binding during repair (Medium)

[`normalize.ts:139`](../../../lib/site-builder/normalize.ts#L139)

```ts
props = { ...def.defaults(), ...pickValidFields(def.schema, raw.props) };
```

`def.defaults()` is called with **no context**. For `location` and `footer`, the registry declares
`defaults: (ctx) => locationDefaults(ctx?.locationId)`
([registry.ts:193](../../../lib/site-builder/sections/registry.ts#L193),
[:208](../../../lib/site-builder/sections/registry.ts#L208)), and
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

### <a id="c5"></a>C5 — Undo/redo always marks dirty (Low)

[`store.ts:197`](../../../components/site-builder/builder/store.ts#L197) and
[`:209`](../../../components/site-builder/builder/store.ts#L209) set `saveState: "dirty"` unconditionally.
Undoing back to the last-saved state schedules a redundant save. Harmless, but it makes the save indicator
lie about whether there is anything to save.

---

## UX

### <a id="u1"></a>U1 — Required text fields cannot be cleared (Medium)

`SettingsPanel` text and richtext controls emit `onChange(e.target.value || undefined)`. Clearing the input
sends `undefined`, which merges into the candidate props, fails the Zod parse in `updateSectionProps`
([mutations.ts:190](../../../lib/site-builder/mutations.ts#L190)), and is **refused**.

Because the refusal leaves state untouched and the input is fully controlled, the old text snaps straight
back. From the merchant's side the field is simply broken: select-all, delete, and nothing happens except a
toast. There is no way to retype a heading from scratch — only to edit it in place.

*Deliberately preserved byte-for-byte in the redesign so the UI change stays presentation-only.*

### <a id="u2"></a>U2 — Changing a link's destination discards the URL already typed (Medium)

The `link` control's `<select>` handler emits `{ label, target: { kind: e.target.value } }` — with no
`target.value`. Typing a URL, switching to "Call us", then switching back to "External link" loses the URL.

*Deliberately preserved in the redesign.*

### <a id="u3"></a>U3 — Move up/down offered for moves that are always refused *(fixed incidentally)*

Both the canvas overlay and the layers panel disabled move buttons only at the **document** boundaries
(`index === 0`, `index === total - 1`). Zone rules are enforced in `moveSectionBy`, so pressing "Move up" on
the first body section — legal-looking, since it is not index 0 — produced a refusal toast instead of a
disabled control. The merchant learned the zone rule by being told "no".

Fixed by the redesign because it rewrote both components: `Canvas.tsx` now derives `canMoveUp`/`canMoveDown`
from the neighbours' zones, and `SectionList.tsx` groups rows by zone and makes only the body group sortable,
so a cross-zone drag is no longer offerable.

### <a id="u4"></a>U4 — New repeater rows are seeded with the literal "New" (Low)

`blankRow` in `SettingsPanel` assigns `"New"` to every required non-boolean, non-number, non-link,
non-select sub-field. For an FAQ that means a question reading `New` and an answer reading `New`. Placeholder
text or an empty string with a validation hint would be better; `"New"` is content that can be published by
accident.

*Preserved in the redesign.*

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

---

## Infrastructure

### <a id="i1"></a>I1 — A failed `renderCanvas` blanks the canvas with no error (Medium)

[`render-canvas.tsx:34`](../../../app/dashboard/website/builder/render-canvas.tsx#L34) and
[`:38`](../../../app/dashboard/website/builder/render-canvas.tsx#L38) `return null` when auth or the site
lookup fails. `useServerRender` treats that as a successful render and calls `setCanvas(null)`, so the canvas
falls back to its placeholder permanently. Only a thrown error reaches the `catch` that shows a toast.

A dropped session or a transient database blip therefore presents as an editor that quietly went blank —
indistinguishable from a bug in the merchant's own page.

### <a id="i2"></a>I2 — `h-[calc(100vh-4rem)]` hardcodes the dashboard header height (Low)

[`BuilderShell.tsx:88`](../../../components/site-builder/builder/BuilderShell.tsx#L88) subtracts `4rem` to fit
under the dashboard chrome. Correct today — [`app/dashboard/layout.tsx:1358`](../../../app/dashboard/layout.tsx#L1358)
is `h-16` — but nothing connects the two, and the builder is the one route where being 8 px out means a
double scrollbar. A shared token or a `flex-1` parent would tie them together.

---

## Not bugs, but worth stating

- **`export const dynamic = "force-dynamic"`** ([page.tsx:25](../../../app/dashboard/website/builder/page.tsx#L25))
  — deliberate, per handoff §5.3. No caching anywhere in the feature. Revisit alongside P1–P3, not before.
- **Everything under the migration is still unverified** (handoff §7). This matters for C1/C2/C3
  specifically: all three are latent *only* because `noopSaveAdapter` is still in place. They activate
  together at Path A step 4.
- **No typecheck gate** (handoff §4.8). The recipe in §9 still works; this audit's changes were checked with
  a throwaway `tsconfig` extending the real one.
- **22 pre-existing test failures** in `lib/menu/cascade-labels`, `AffectsTag`, and the a11y suite
  (handoff §4.6) — unrelated to the builder, still unfixed. The site-builder suite itself is **169/169 green**.

---

## Suggested order

1. **C1** — before `SaveDraft` is wired in, not after. It is the only item here that destroys merchant work.
2. **P3** — the cost the merchant pays on every edit.
3. **P1/P2** — one `React.cache()` on `loadSiteContext` recovers the first-load half of P1 cheaply.
4. **U1** — the most visible everyday defect; the field genuinely appears broken.
5. **I1**, then **C2/C3/C4**, then the rest.
