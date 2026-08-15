# Plan 06 — The Builder Frontend

**Stage 8** · 🟡 **CANVAS BUILT 2026-08-13 — NOT PERSISTED** · Stage 9 not started
Parent: [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md)

> ### Status — working canvas, verified in a browser
>
> **167 tests, typecheck clean, lint clean, and driven end-to-end in Chrome** against merchant
> *Joes Coffee Shop / Downtown Hamra*: sections selected, settings edited, canvas re-rendered with the change.
>
> | Artifact | |
> |---|---|
> | [builder/store.ts](../../../components/site-builder/builder/store.ts) | Zustand; document is the only state; 50-step undo/redo |
> | [builder/Canvas.tsx](../../../components/site-builder/builder/Canvas.tsx) | Canvas + overlay (rings, floating controls, measurement) |
> | [builder/SectionList.tsx](../../../components/site-builder/builder/SectionList.tsx) | dnd-kit reorder + keyboard + move buttons |
> | [builder/SettingsPanel.tsx](../../../components/site-builder/builder/SettingsPanel.tsx) | **Generated from the Zod schemas** |
> | [builder/Toolbar.tsx](../../../components/site-builder/builder/Toolbar.tsx) | Undo/redo, device, live validation, Add Section modal |
> | [schema-introspect.ts](../../../lib/site-builder/schema-introspect.ts) | Zod → form controls, + 30 tests pinning the classification |
> | [render-canvas.tsx](../../../app/dashboard/website/builder/render-canvas.tsx) | Server Action returning the rendered canvas |
>
> **Not persisted.** The save adapter is a no-op — autosave timing, save-state transitions and the conflict path
> are all wired, but nothing is stored, so edits are lost on refresh. `SaveDraft` drops in behind `SaveAdapter`
> once the Stage 2 migration is applied. Publish is deliberately disabled (Stage 5).
>
> #### The architectural correction that mattered
>
> §2.2 below proposes re-rendering the canvas by POSTing the document to a route that returns HTML from
> `renderToStaticMarkup`. **That does not work.** Next refuses `react-dom/server` anywhere in the app-directory
> module graph — it fails in a page *and* in a route handler, regardless of client components.
>
> The working answer is better: **a Server Action that returns JSX.** Its return value is serialized as an RSC
> payload, so the client holds a server-rendered React tree in state and drops it into the canvas. No HTML
> strings, no `dangerouslySetInnerHTML`, no serialization round-trip — and still exactly one `PageRenderer`.
> The first paint is rendered by the page as a Server Component and passed down as a prop (a client component may
> *receive* a server tree; it just may not import one).
>
> #### A constraint this creates
>
> The FAQ accordion was written as a `"use client"` island and turned out to need nothing from the client —
> `<details>`/`<summary>` is natively interactive. It is now a server component, and a test enforces that
> **nothing under `components/site-builder/` outside `builder/` is a client component**.
>
> That is load-bearing: the moment a section genuinely needs client JavaScript, prefer a CSS/native-HTML solution.
> If one truly needs an island, the canvas must move to an iframe fed by a real route — a change confined to
> `Canvas.tsx`.
>
> #### Deviations from the plan below
>
> | Planned | Built | Why |
> |---|---|---|
> | iframe canvas (§2.3) | **Same-document** | Sections style themselves through `--site-*` custom properties scoped to the shell and the only global CSS is class-scoped `.site-prose`, so isolation was not needed. Removes the whole postMessage geometry protocol |
> | Drag-and-drop on the canvas | **Drag in the layers panel** | dnd-kit's sortable gives keyboard reordering for free, so this is simultaneously the simplest and the accessible implementation. Canvas dragging can follow |
> | Fast-path text patching (§2.2) | **Not built** | 400 ms debounce on everything, shipped first to find out whether the optimisation is actually needed |
> | TipTap for rich text | **Textarea** | TipTap is already in the repo and drops in; the markup passes the same sanitizer either way, so it is a UI upgrade, not a behavioural one |
>
> #### Found while verifying
>
> **`.env` has two `NEXT_PUBLIC_SUPABASE_URL` lines.** The second (prod, `hifouuofcaytijrkbvcy`) wins while every
> key is staging (`dfwqakoyittmrwbqvxgw`), so every Clerk-authed Supabase read fails with `Invalid API key`
> locally. Pre-existing, unrelated to the builder, and **not fixed** — it is your env file. Verification ran with
> a shell override.

> Deliberately later. By the time this starts, a real site is already live on a real domain with versioning,
> rollback, and live prices — so this stage is *pure UI over a proven API*, which is the cheapest possible way to
> build a drag-and-drop editor. Everything here assumes the section registry, the server renderer, and the
> overlay protocol from [PLAN-03](PLAN-03-INFRA-RESOLVER-RENDERER.md) §5 already exist.
>
> **The MockBuilder prototype is the visual spec** (**D3**). Design QA is closed. Do not redesign; do not port its
> source.

---

## 1. What is already decided by the infrastructure

Worth stating, because it removes most of the usual builder design debate:

| Question a builder project normally agonizes over | Already answered |
|---|---|
| How do we render both editable and public versions? | One server render + a client overlay ([PLAN-03](PLAN-03-INFRA-RESOLVER-RENDERER.md) §5) |
| What does a section look like in state? | `PageDocument` ([PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md)) |
| Where do the settings-panel fields come from? | Generated from the registry's Zod schema |
| What can be dragged where? | Zone + `singleton` on the registry entry |
| How do we save? | `SaveDraft(pageId, doc, revision)` with optimistic concurrency |
| What happens on conflict? | Server returns `stale`; UI prompts |
| How does preview work? | It is the same route the public uses, with `mode: "preview"` |

The builder's job reduces to: **edit a JSON document, and show the server's render of it.**

---

## 2. Architecture

```
app/dashboard/website/
├── page.tsx                       # site overview: pages list, publish state, domain, quick actions
├── [pageId]/
│   ├── page.tsx                   # server: loads draft + site, renders <BuilderShell>
│   └── BuilderShell.tsx           # "use client" — the ONLY stateful client root
├── forms/                         # submissions inbox (PLAN-05 §4.3)
├── seo/                           # seoRating panel over published content
├── promos/                        # popup authoring
└── settings/                      # theme, nav, domain, integrations
components/site-builder/builder/
├── Canvas.tsx                     # iframe host + overlay
├── Overlay.tsx                    # hover/select rings, floating controls, drop indicators
├── SectionList.tsx                # outline / layers panel — the accessible reorder path
├── AddSectionModal.tsx            # registry-driven
├── SettingsPanel.tsx              # registry-driven field forms
├── DevicePreviewBar.tsx           # desktop / tablet / mobile
└── PublishBar.tsx                 # save state, validation warnings, publish, version history
```

### 2.1 State — one store, one document

```ts
interface BuilderState {
  doc: PageDocument;          // the single source of truth
  revision: number;           // from the server; optimistic-concurrency token
  selectedId: string | null;
  past: PageDocument[];       // undo, capped at 50 (the mock's depth)
  future: PageDocument[];
  saveState: "idle" | "dirty" | "saving" | "saved" | "conflict" | "offline";
}
```

Zustand, matching the repo's convention. **The document is the only state.** Nothing derived is stored — selection is
an id, not a section object; validation is computed. This is what makes undo/redo a two-line operation (push the
previous doc, pop it back) instead of a command-pattern project.

**All mutations go through pure reducers** in `lib/site-builder/mutations.ts` — `addSection`, `removeSection`,
`moveSection`, `updateProps`, `toggleHidden`, `duplicateSection`. Pure functions of `(doc, args) → doc`. They are
unit-testable without React, they are reusable by a future AI generator or import tool, and they are where zone and
singleton rules get enforced *before* the server ever sees an illegal document.

### 2.2 The render loop

The hard problem: the renderer is on the server, but typing must feel instant.

**Two-speed approach.**

- **Fast path (every keystroke):** for text and simple scalar props, patch the DOM node directly via its
  `data-sb-field` attribute. Zero round trip. Feels native.
- **Slow path (debounced ~400 ms, and always on structural change):** post the document to a render endpoint, get
  HTML back, swap the iframe body. Structural changes — add, delete, reorder, layout-variant switch — always take
  this path because they change markup, not text.

```
app/dashboard/website/[pageId]/render/route.ts   # POST doc → server-rendered HTML fragment
```

This route renders with the *same* `PageRenderer` in `mode: "builder"`. There is still exactly one renderer.

**If the fast path proves fiddly, drop it.** A 400 ms debounce on everything is acceptable and simpler; ship that
first and add the fast path only if typing feels laggy in real use.

### 2.3 Canvas: iframe

Recommended, for three concrete reasons: merchant CSS and fonts cannot leak into the dashboard; device preview is a
width change rather than a media-query simulation; and the public render is byte-identical to what the merchant sees.

Costs: drag-and-drop crosses a document boundary, and coordinates need translating. Both are solved problems —
`dnd-kit` supports custom collision detection over translated rects, and the overlay lives in the parent document
positioned over the iframe using `getBoundingClientRect()` offsets from `postMessage`.

**Message protocol** (typed, versioned, in `lib/site-builder/builder/messages.ts`):

| Direction | Message | Payload |
|---|---|---|
| iframe → parent | `sb:ready` | — |
| iframe → parent | `sb:geometry` | `{ sections: [{ id, rect }] }` on scroll/resize/render |
| iframe → parent | `sb:select` | `{ sectionId, field? }` on click |
| parent → iframe | `sb:highlight` | `{ sectionId \| null }` |
| parent → iframe | `sb:patch-text` | `{ sectionId, path, value }` (fast path) |
| parent → iframe | `sb:scroll-to` | `{ sectionId }` |

### 2.4 Drag and drop

`@dnd-kit/core` + `@dnd-kit/sortable`. Not Puck or a full builder framework — the mock proved a bespoke canvas is
achievable, and a framework would fight the server-rendered/overlay architecture that the rest of this plan depends on.

Rules come from the registry, not from the DnD code:
- Sections drag only within their zone (`masthead` / `body` / `colophon`)
- Locked sections (`deletable: false`) show a lock affordance and refuse drag
- Drop indicators render as a line between sections in the overlay layer

**Accessibility is not optional and is not free.** A pointer-only canvas excludes keyboard users, and there is a real
legal dimension for a tool that builds public-facing commerce sites. Ship the `SectionList` outline panel as a
first-class reorder path (up/down buttons + keyboard) alongside dragging — it is also faster for long pages and it
makes the whole feature testable without simulating pointer events.

### 2.5 The settings panel — generated, not hand-written

Introspect the registry's Zod schema and map types to controls:

| Schema | Control |
|---|---|
| `z.string()` | text input |
| `z.string()` + `meta.richText` | TipTap ([components/cms/TipTapEditor.tsx](../../../components/cms/TipTapEditor.tsx)) |
| `z.enum([...])` | segmented control or select |
| `z.boolean()` | switch |
| `z.number().min().max()` | slider |
| `AssetRef` | image picker + alt-text field + focal point |
| `Binding<'menu_item'>[]` | item multi-select from the live menu, drag-reorderable |
| `z.array(z.object())` | repeater with add/remove/reorder |

`SectionDefinition.Editor` overrides this for the handful of kinds that need bespoke UI (`form`, `location` map
picker, `reservations`). Everything else is free — **which is the whole payoff of the registry**, and the reason
section kind #18 costs a day instead of a week.

### 2.6 Autosave & offline

- Debounce 1.5 s; hard flush at 20 s, on blur, and on `visibilitychange`
- `saveState` is visible in the PublishBar at all times — merchants do not trust invisible saves
- On `stale`, show a modal: reload theirs / keep mine / view diff. **Never auto-merge**
- Mirror the document to `localStorage` per `{pageId, revision}` for crash and offline recovery only. On load, if a
  local doc exists at the same revision and differs, offer restore. **`localStorage` is never authoritative** — that
  was the mock's fatal design (ANALYSIS §2.2) and the single easiest mistake to repeat

---

## 3. Build order

1. Read-only canvas: iframe + server render + geometry messages. No editing
2. Selection + overlay rings + floating controls (edit / delete / up / down)
3. Settings panel for `hero` and `content` only — prove the generated-form approach
4. Autosave + save-state UI + conflict handling
5. Add Section modal (registry-driven) + delete + duplicate
6. Drag-and-drop reorder + the `SectionList` keyboard path
7. Undo/redo (50 steps)
8. Device preview
9. Remaining settings panels across all 17 kinds
10. PublishBar: validation warnings, publish, version history, rollback with the D6 copy from [PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §3.3
11. Pages manager (create / rename / delete / set home / reorder nav)
12. Site settings: theme, nav, domain ([PLAN-05](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md) §3), integrations

Steps 1–4 are the risky ones. If the canvas architecture is wrong, it shows by step 4 — before any per-kind work has
been invested.

---

## 4. Starter templates (B11)

**B11 is unscoped design work and it is on the critical path for launch quality.** A blank canvas is a bad first
experience; nobody builds a good restaurant site from nothing.

**Recommendation:** ship 3–5 curated starters as `PageDocument` **fixtures** — plain JSON in
`lib/site-builder/starters/`, not a database concept. Applying one is `setDoc(starter)`.

Two things to solve early because they have lead times:
1. **Licensed imagery.** Every starter needs food photography with commercial rights. Budget for a stock license or
   commission a shoot. Do not ship placeholder images that merchants forget to replace — a live restaurant site
   showing someone else's burger is a real problem.
2. **Seeding from live data.** A starter should hydrate with the merchant's actual name, logo, address, hours, and
   top items on apply. That turns "here is a template" into "here is your website," which is a materially different
   first impression and is the nearest, cheapest step toward what Owner.com sells
   ([RESEARCH-OWNER-COM.md](RESEARCH-OWNER-COM.md) §4).

The four existing storefront templates (Classic / Hero / Market / Boutique) are the obvious first four starters —
which is also the graceful answer to **B3/D5**: a merchant "upgrades" from template mode to builder mode and lands on
a builder page that looks like the site they already had.

---

## 5. Remaining surfaces (B4)

Assuming [PLAN-00](PLAN-00-GENERAL.md) §4.1's recommended scope.

| Surface | Scope | Notes |
|---|---|---|
| **Website** | ✅ Build | This document |
| **SEO** | ✅ Build | Port the mock's `seoRating.ts` (345 lines, pure, genuinely good). Score published content. Add the field editors the score complains about |
| **Forms** | ✅ Build | Definition editor + inbox ([PLAN-05](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md) §4). Port the mock's 4 templates |
| **Promo Popups** | ✅ Build (small) | A popup is a section kind with display rules (delay, scroll %, frequency cap, date window). Reuse everything |
| **Analytics** | 🔗 Link, don't build | `app/dashboard/reports/` exists. Add site-specific metrics there; the builder links to it. **Do not build a second analytics surface** |
| **Storefront** | ❌ Drop | Collides with `menu_items`; the mock's SKU/weight/dimension model is a hardware distributor's |
| **Store Orders** | ❌ Drop | Collides with existing orders + online-ordering. FedEx rating and NYS Pub 718 county tax do not apply |
| **Support** | ⏸ Defer | `support-messaging` already exists for merchant↔HQ. A merchant↔diner support desk is a separate product |
| **Careers** | ⏸ Defer | Plausible for restaurants (hiring is a real pain point) but it is a job board, not a website builder. Revisit post-launch |

Dropping Storefront + Store Orders removes ~3,500 LOC of the mock and the entire Phase 6 commerce surface. **This is
the single biggest scope lever in the project** and is why **B4** must be answered in Stage 0.

---

## 6. Verification

- [ ] Add, edit, reorder, delete, undo, redo, refresh — the page is exactly as left
- [ ] Two tabs editing the same page: the second save is refused, no work lost, the merchant is told clearly
- [ ] Reload on a different device shows saved work (ticket acceptance criterion)
- [ ] Full reorder flow completes with keyboard only, no mouse
- [ ] Locked `header` / `hero` / `footer` cannot be dragged out of their zone, deleted, or duplicated
- [ ] Adding a second `hero` is impossible (`singleton`)
- [ ] A binding to a since-deleted menu item shows an in-canvas warning and a publish-time warning
- [ ] Device preview widths match real breakpoints, and the mobile render matches a real phone
- [ ] Merchant theme CSS does not leak into dashboard chrome
- [ ] Editing feels responsive: text < 50 ms perceived, structural change < 500 ms
- [ ] A 40-section page does not degrade — measure, do not assume
- [ ] The builder renders correctly against the MockBuilder screenshots (**D3**: the mock is the visual spec)
- [ ] `npm run lint` + `npx tsc --noEmit` pass

## 7. Open questions

1. **Multi-page in the v1 UI?** Data model supports it ([PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md) §10).
   Recommend shipping home-only first — it halves the surface — with the pages manager as fast-follow.
2. **Mobile-specific overrides** (hide a section on mobile, different hero image). Merchants ask immediately.
   Cheap if `SectionStyle` carries `hideOn?: ('mobile'|'tablet'|'desktop')[]` from day one. Recommend adding the
   field in Stage 1 even if the UI ships later.
3. **Can HQ edit a merchant's site?** For support, yes — via the existing impersonation model, with every action
   audit-logged and attributed to the HQ user, never the merchant.
4. **Section templates / saved blocks** — "save this section to reuse." Natural once documents are JSON. Post-v1.
5. **Real-time collaboration.** Out of scope; optimistic concurrency is the v1 answer. See
   [VISION-UNBOUNDED.md](VISION-UNBOUNDED.md) §6 for what it becomes.
