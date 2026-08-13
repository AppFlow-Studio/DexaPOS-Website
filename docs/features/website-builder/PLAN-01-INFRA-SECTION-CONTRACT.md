# Infra Plan 01 — The Section Contract

**Stage 1** · ✅ **BUILT 2026-08-13** · **No database, no UI, no network.** Pure TypeScript + Vitest.
Parent: [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md)

> **Status.** Shipped as [lib/site-builder/](../../../lib/site-builder/) — 55 vitest tests passing, strict
> typecheck clean, lint clean, plus [scripts/site-builder-smoke.ts](../../../scripts/site-builder-smoke.ts).
>
> **Delivered against this plan with three deliberate reductions**, per the "pick the simplest option, change it
> later" call on 2026-08-13:
>
> | Planned | Built | Why |
> |---|---|---|
> | 17 section kinds | **9** — `header`, `hero`, `content`, `gallery`, `popular-items`, `features`, `faq`, `location`, `footer` | A complete restaurant homepage. The rest are additive: one schema file + one registry entry each, no migration |
> | `review` binding type | **Cut** | There is no reviews table in this repo and no Google Business Profile integration. The binding type had no source — see §10.5 |
> | `reservations` kind | **Cut** | `lib/reservations/` is a single file (`conflict-detection.ts`); there is not yet enough system to bind to |
>
> Also added beyond plan: `mutations.ts` (pure `(doc, args) => doc` reducers), because zone and singleton rules
> need enforcing *before* the server sees a document, and because they are the API a future AI generator or
> conversational editor will drive (VISION-UNBOUNDED §6).

> This is the highest-leverage work in the project. Every later stage — the DB column type, the editor's form
> controls, the renderer's props, the version diff, the publish validator — is derived from what is decided here.
> Getting it wrong is a JSONB migration across live merchant sites. Getting it right makes four later stages
> mechanical.

---

## 1. Goal

A standalone, dependency-free module that can:

- describe every section kind and its fields in one place
- construct a valid empty page
- validate an arbitrary blob and tell you precisely what is wrong with it
- repair and forward-migrate a document written by an older version of the code
- round-trip a document through `JSON.stringify` → `parse` → `validate` with zero loss

**Definition of done:** `npx tsx scripts/site-builder-smoke.ts` builds a 12-section page, mutates it, validates it,
serializes it, re-parses it, runs it through a simulated old-schema migration, and prints ✅. Plus a Vitest suite.

> **Environment note (resolved 2026-08-13).** Vitest could not run locally — the rolldown win32 binding was a
> truncated download (2.4 MB against a published 20.5 MB), which surfaces as a misleading "not a valid Win32
> application". Fixed by removing that one package and re-running `npm install`. The smoke script is kept anyway:
> it is readable output that demonstrates the contract without a test runner, which is useful in review.
>
> Fixing it exposed **22 pre-existing failures** in `lib/menu/cascade-labels`, `AffectsTag`, and the a11y suite
> (which needs `vitest.a11y.config.mts`). None relate to the builder; none were introduced here; none are fixed.

---

## 2. Why a discriminated union (fixing ANALYSIS F1)

The mock's `BuilderSection` carries **all 14 settings blobs on every section** regardless of kind — an FAQ section
hauls an unused hero config and an empty events array. The ticket says the types "port over unchanged." They must
not. Porting that shape into Postgres:

- makes every version diff meaningless — every row touches every field
- makes the editor unable to know which fields are real
- multiplies stored bytes per page by roughly the number of kinds
- makes it impossible for the renderer to be type-safe about its own props

A discriminated union costs a day now and cannot be retrofitted once merchants have pages.

```ts
// lib/site-builder/sections/kinds.ts
export const SECTION_KINDS = [
  "header", "hero", "content", "gallery", "popular-items", "features",
  "cards", "faq", "location", "form", "pdf", "reservations", "reviews",
  "scrolling-banner", "video", "events", "footer",
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];
```

## 3. The section shape

Every section is: an identity envelope + a `kind` discriminant + a `props` bag typed by that kind.

```ts
// lib/site-builder/sections/types.ts
export interface SectionBase {
  /** Stable across edits and versions. nanoid(12). Never reused, never reordered into. */
  id: string;
  kind: SectionKind;
  /** Merchant can hide without deleting. Hidden sections are stored, not rendered. */
  hidden?: boolean;
  /** Optional per-instance style escape hatch. Constrained set — NOT free CSS. */
  style?: SectionStyle;
}

export type Section =
  | { kind: "hero";           props: HeroProps }
  | { kind: "popular-items";  props: PopularItemsProps }
  | { kind: "faq";            props: FaqProps }
  // …one per kind
  ;
// intersected with SectionBase at the registry boundary
```

Two rules that pay off later:

1. **`props` is a closed object per kind.** No `[key: string]: unknown`. If a field is not in the schema it does not
   survive a save. That is what makes the editor generatable and the diff readable.
2. **`style` is an enum-constrained token set**, never raw CSS —
   `{ background?: 'default'|'muted'|'brand'|'dark'; spacing?: 'compact'|'normal'|'loose'; align?: … }`.
   Free-form CSS from a merchant is an XSS and a design-consistency problem, and it makes the "your site looks
   professional" promise unkeepable. See [VISION-UNBOUNDED.md](VISION-UNBOUNDED.md) §3 for where this goes later.

### 3.1 Zones — encoding the locked header/hero/footer rule

The mock locks `header` / `hero` / `footer` so reordering cannot cross them. Encode it in data, not in canvas logic,
so the *server* can enforce it too:

```ts
export type Zone = "masthead" | "body" | "colophon";

// registry declares: header → masthead, hero → masthead, footer → colophon, rest → body
```

A `PageDocument` stores sections in zone order; validation rejects a `footer` in `body`. The canvas then gets its
constraint for free, and so does any future API or AI generator that writes pages without going through the canvas.

## 4. The registry

Generalizes the proven `SECTION_META` pattern from [lib/cms/cms-sections.ts](../../../lib/cms/cms-sections.ts)
(see [FINDING §3.2](FINDING-2026-08-12-EXISTING-CMS-PRIOR-ART.md)), upgraded with Zod and a renderer handle.

```ts
// lib/site-builder/sections/registry.ts
export interface SectionDefinition<K extends SectionKind> {
  kind: K;
  label: string;                 // "Popular Items"
  description: string;           // shown in the Add Section modal
  icon: LucideIcon;
  zone: Zone;
  /** Only one per page (header, hero, footer). */
  singleton: boolean;
  /** Merchant may add it from the Add Section modal. Resolves ANALYSIS F9. */
  addable: boolean;
  /** Merchant may delete it. */
  deletable: boolean;
  schema: z.ZodType<PropsOf<K>>;
  defaults: () => PropsOf<K>;
  /** Which platform records this kind can bind to. Drives PLAN-03's collector. */
  bindingTypes: readonly BindingType[];
  /** Live-data policy for D6. See §5. */
  liveFields: readonly string[];
  /** Server component. Registered here so dispatch is exhaustive and type-safe. */
  render: SectionRenderer<K>;
  /** Optional bespoke editor; omitted means "generate the form from `schema`". */
  Editor?: React.ComponentType<EditorProps<K>>;
}

export const SECTION_REGISTRY: { [K in SectionKind]: SectionDefinition<K> } = { … };
```

**Why the registry earns its keep:** adding section kind #18 later means adding *one file* and one registry entry.
No switch statement to find, no editor to wire, no validator to extend, no Add-Section modal to update. The
`{ [K in SectionKind]: … }` mapped type makes a missing kind a compile error.

### 4.1 Registry-derived, not hand-maintained

| Consumer | Derives from |
|---|---|
| Add Section modal | `addable` + `label` + `icon` + `description` |
| Editor form controls | `schema` (Zod introspection) or `Editor` |
| Save-time validation | `schema` |
| Read-time repair | `schema` + `defaults()` |
| Renderer dispatch | `render` |
| Binding collection (PLAN-03) | `bindingTypes` |
| Reorder legality | `zone` + `singleton` |
| Publish validator (PLAN-04) | `schema` + `bindingTypes` |

## 5. Encoding D6 — bindings vs. literals, per kind

Decision **D6** says: snapshot the structure, resolve volatile fields live. In the contract this becomes a hard type
distinction. A field is either a **literal** (merchant typed it, it is stored) or a **binding** (a typed reference,
resolved at render).

```ts
// lib/site-builder/bindings/types.ts
export type BindingType = "menu_item" | "menu_category" | "location" | "hours" | "reservation_config" | "review";

export interface Binding<T extends BindingType = BindingType> {
  type: T;
  id: string;
  /** Merchant override of a resolved field — the one legal way to shadow live data. */
  overrides?: { label?: string; caption?: string };
}
```

Worked example, `popular-items`:

```ts
interface PopularItemsProps {
  heading: string;                 // literal — merchant typed "Guest Favorites"
  subheading?: string;             // literal
  layout: "grid-3" | "grid-4" | "carousel";  // literal
  items: Binding<"menu_item">[];   // binding — order is stored, everything else is live
  showPrices: boolean;             // literal
  ctaLabel?: string;               // literal
}
```

Nothing named `price`, `name`, `imageUrl`, or `available` appears in props. **That is the enforcement of D6** — it is
structurally impossible to snapshot a price, because there is nowhere to put one.

### 5.1 Per-kind live-data policy (ratify in Stage 0)

The D6 residual question — does an address change hit the live site instantly? — answered per kind:

| Kind | Bindings | Live-resolves | Republish needed for |
|---|---|---|---|
| `popular-items` | `menu_item[]` | name, description, price, image, availability, 86/snooze | which items, order, heading |
| `location` | `location` | address, phone, coordinates | heading, map style, which location |
| `reservations` | `reservation_config` | party sizes, lead time, availability windows | heading, copy, layout |
| `hours` (in `location`/`footer`) | `hours` | the hours themselves | label |
| `reviews` | `review[]` | review text, rating, author | which source, count, layout |
| `hero`, `content`, `gallery`, `faq`, `features`, `cards`, `video`, `events`, `pdf`, `scrolling-banner` | none | nothing | everything |
| `header`, `footer` | `location`, `hours` | address/phone/hours only | nav, logo, layout |

**Recommendation: address, phone, and hours propagate immediately.** They are facts about the business, and a stale
address on a live site is worse than an unexpected update. Merchants do not think of their phone number as page
content and will not republish to fix it.

## 6. Normalization and forward migration — the thing that gets invented too late

Stored JSONB written by v1 of the code will be read by v9 of the code. Design for it now.

Every document carries `schemaVersion`. On **read**, before anything else:

```ts
export function normalizePage(raw: unknown): PageDocument {
  const doc = coercePageShell(raw);              // never throws — worst case, an empty page
  const migrated = runMigrations(doc);            // v1→v2→…→current, pure functions, one per bump
  return {
    ...migrated,
    sections: migrated.sections
      .map(normalizeSection)                      // repair each
      .filter((s): s is Section => s !== null),   // drop the unsalvageable
  };
}

function normalizeSection(raw: unknown): Section | null {
  const def = SECTION_REGISTRY[raw?.kind];
  if (!def) return null;                          // unknown kind → dropped, logged, not thrown
  const parsed = def.schema.safeParse(raw.props);
  if (parsed.success) return { ...raw, props: parsed.data };
  return { ...raw, props: { ...def.defaults(), ...pickValidFields(raw.props, def.schema) } };
}
```

Three non-negotiables, each learned from the CMS's `normalizeSection` / `mergeCanonicalSections`:

1. **Read never throws.** A malformed document must degrade to a renderable page, never a 500 on a merchant's public
   site. Log it, repair it, render what survives.
2. **Migrations are pure and versioned.** `migrations/v1_to_v2.ts` etc., each with a test that feeds it a real
   captured v1 document. Never mutate stored JSONB in a SQL migration — migrate on read, and let a background job
   rewrite lazily if you want the storage cleaned.
3. **Unknown kinds are dropped, not preserved.** Preserving them means the renderer must handle them. Dropping them
   means a rollback to a version containing a since-removed kind degrades gracefully.

## 7. The page document

```ts
// lib/site-builder/page-document.ts
export interface PageDocument {
  schemaVersion: number;            // bump = write a migration
  sections: Section[];              // zone-ordered: masthead → body → colophon
  seo: {
    title?: string;
    description?: string;
    ogImage?: AssetRef;
    noindex?: boolean;
  };
  settings: {
    theme?: ThemeOverride;          // page-level override of site theme
  };
}
```

Site-wide concerns — nav, brand colors, fonts, favicon — live on the **site**, not the page
([PLAN-02](PLAN-02-INFRA-DATA-MODEL.md) §3.1). A page document is only what is unique to that page. This keeps
version diffs meaningful: changing the brand color should not create a version of every page.

## 8. Files to create

```
lib/site-builder/
├── sections/
│   ├── kinds.ts              # SECTION_KINDS, SectionKind, Zone
│   ├── types.ts              # SectionBase, Section union, SectionStyle
│   ├── schemas/
│   │   ├── hero.ts           # HeroProps + heroSchema + heroDefaults
│   │   ├── popular-items.ts
│   │   └── …one per kind
│   └── registry.ts           # SECTION_REGISTRY (imports schemas + renderers)
├── bindings/
│   └── types.ts              # BindingType, Binding, AssetRef
├── page-document.ts          # PageDocument, createPage, emptyPage
├── normalize.ts              # normalizePage, normalizeSection
├── migrations/
│   ├── index.ts              # runMigrations
│   └── v1_to_v2.ts           # (added when the first bump happens)
├── validate.ts               # validatePage → { errors[], warnings[] } for the publish gate
└── __tests__/
    ├── round-trip.test.ts
    ├── normalize.test.ts
    └── registry.test.ts
```

Note `registry.ts` importing renderers creates a lib→components edge. Keep the renderers out of Stage 1 by typing
`render` as a lazily-supplied handle and wiring it in `components/site-builder/registry.tsx` during Stage 4 — so
Stage 1 stays pure and testable with no React import.

## 9. Tests that must exist before Stage 2 starts

| Test | Asserts |
|---|---|
| Round-trip | `parse(stringify(doc))` deep-equals `doc` for a page containing all 17 kinds |
| Registry exhaustiveness | Every `SectionKind` has a registry entry (compile-time via mapped type + a runtime assertion) |
| Unknown kind survives | A document with `kind: "tiktok-feed"` normalizes to a valid page with that section dropped |
| Malformed props survive | `{ kind: "hero", props: { heading: 42 } }` yields a hero with default heading, not a throw |
| Zone enforcement | `validatePage` rejects a `footer` in the body zone and a second `hero` |
| Forward migration | A captured v1 document migrates to current and validates |
| No live fields storable | Type-level: `PopularItemsProps` has no `price`/`name`/`image` key (assert via `Expect<Not<HasKey<…>>>`) |
| Binding shape | Every kind's `bindingTypes` matches the binding types actually reachable in its schema |

## 10. Open questions for this stage

1. **Multi-page in v1?** The mock has a pages nav but only persists home (ANALYSIS **F2**). The data model supports
   multi-page from day one at near-zero cost; the *builder* can ship home-only. **Recommendation: model multi-page in
   Stage 1–2, ship single-page in the Stage 8 UI**, enable later with no migration.
2. **`custom_html` / `pdf` sections.** `pdf` is in the 17. `custom_html` is not — keep it that way in v1. Merchant
   HTML on a public domain is the highest-severity thing in this feature.
3. **Does `style` get a `customCss` escape hatch for HQ?** Useful for support ("just fix my site"). If yes, gate it
   behind an HQ-only flag and never expose it to merchants.
4. **Section-level A/B variants** — do not build, but leave `Section.id` stable and unique so
   [VISION-UNBOUNDED.md](VISION-UNBOUNDED.md) §5 can add them without a migration. *(Honoured — see the comment on
   `SectionBase.id`.)*
5. **Where do reviews come from?** ⚠️ **Blocking the `reviews` kind, which is why it is cut from v1.** There is no
   reviews table in `schema.sql` and no Google Business Profile integration anywhere in the repo. This is a scope
   decision, not an engineering one: either integrate GBP (an external, rate-limited, cached integration — size it
   separately) or build a native reviews table. Until one is chosen, the section has nothing to render.
