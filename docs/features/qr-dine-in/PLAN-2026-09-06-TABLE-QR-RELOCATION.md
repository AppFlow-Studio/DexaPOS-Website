# Plan — Move table QR management out of Online Ordering into Tables

**Date:** 2026-09-06 · **Owner:** Ali Awdi
**Branch:** `feat/table-qr-under-tables` (off `dexaposwebsite-preview`)
**Feature folder:** [qr-dine-in](README.md) · touches [tables-floorplan](../tables-floorplan/README.md)

**Status:** implemented and browser-verified on `feat/table-qr-under-tables`, 2026-09-06.
No migration, no RLS change, no new RPC. Execution record and deviations in §9.

---

## 0. What this changes and why

Today the Online Ordering page carries two unrelated jobs in one tab. `TabsContent value="ordering"`
holds delivery radius, free-delivery threshold and store hours — a settings form with a global
Save/Discard bar — and, stapled underneath it, ~1,750 lines of per-table QR operations that fire
immediately: generate, reprint, revoke, PDF/PNG export.

Three concrete problems:

1. **The data is table-shaped, not store-shaped.** `QrTableManagerRow` is keyed by
   `floorPlanObjectId` and carries `zoneName`, `sectionId`, `capacity`
   ([actions.ts:57-73](../../../app/dashboard/online-ordering/actions.ts#L57-L73)). Those entities are
   owned by the floor plan editor. Adding a table there makes a `not_generated` row appear on a
   screen in a different nav group.
2. **Nobody finds it.** `grep -i qr` across [app/dashboard/tables/](../../../app/dashboard/tables/)
   returns zero hits. A manager who needs a replacement placard for table 12 goes to Tables and finds
   nothing pointing onward.
3. **Two interaction contracts on one screen.** The surrounding tab is a dirty-state form; revoke is
   irreversible and invalidates physical printed assets.

What stays in Online Ordering is the **policy**: enable QR ordering, kill switch, geofence,
fulfillment mode, service fee, tier gate. Those read `online_store_config` and belong with the
storefront. What moves is the **operation**.

The marketing QR does **not** move. It points at `/m/{code}` on the storefront
([store-url.ts:53](../../../app/sites/lib/store-url.ts#L53)), has no floor-plan dependency, and is
deliberately outside the tier gate.

---

## 1. Decisions taken

| # | Decision | Rationale |
|---|---|---|
| **R1** | New sibling route `/dashboard/tables/qr-codes`, **not** a tab inside the floor plan view | [RuntimeTablesView](../../../components/dashboard/tables/RuntimeTablesView.tsx) is a full-bleed `h-screen max-h-[90vh]` canvas with its own top bar and sidebar and no `PageShell`. A paginated table with search, filters and PDF export does not fit that chrome. It also answers a different question — the runtime view is "what is happening on my floor now", QR is "what do I need to print". |
| **R2** | `QrAnalyticsPanel` and `QrGuestAlertsPanel` move **with** the manager | Both are dine-in-QR-specific and read the same location. Keeping one coherent screen beats a third home. Reports is a later call, not this ticket. |
| **R3** | Server actions **stay** in `app/dashboard/online-ordering/actions.ts` | Moving ~700 lines buys no behaviour. Cross-route imports are already normal in this codebase. |
| **R4** | Lift the snapshot fetch to the page, one source of truth | Today the manager loads its own snapshot while the gate and `qrEnabled` arrive as props from the online-ordering Zustand store — two fetches that can disagree. On the new page there is no such store, so the fetch is lifted and every child reads one result. |
| **R5** | Location resolution copies the **Tables** page, not Online Ordering | Online Ordering dead-ends on `all` with a "select a location" panel ([page.tsx:1339-1356](../../../app/dashboard/online-ordering/page.tsx#L1339-L1356)). Tables falls back to `LocationListView` as a picker ([tables/page.tsx:17](../../../app/dashboard/tables/page.tsx#L17)). The picker is better here and keeps the two Tables screens behaving alike. |
| **R6** | `BrandedQrPreview` promoted to `components/dashboard/qr/` | It is shared by the manager (moving) and the marketing dialog + manager (staying). Mirrors the existing shared `lib/qr/` split. |

---

## 2. Target information architecture

```
Operations
└── Tables
    ├── Tables           /dashboard/tables                  floor plan, runtime status
    ├── QR Codes         /dashboard/tables/qr-codes         <- NEW: generate / reprint / revoke
    └── Service Charge   /dashboard/tables/service-charge

Management
└── Online Ordering      /dashboard/online-ordering
    ├── Ordering tab     QR policy block + link to QR Codes
    └── Marketing QR     own tab (see §11) — flyer/decal codes
```

`/dashboard/tables/service-charge` is the precedent for R1: a plain `PageShell` page, location-scoped,
sitting as a sub-item of the Tables nav group ([layout.tsx:137-148](../../../app/dashboard/layout.tsx#L137-L148)).

---

## 3. Work items

### 3.1 — Server action: make the snapshot self-sufficient

`app/dashboard/online-ordering/actions.ts`

- [x] Extend `QrTableManagerSnapshot` ([:87](../../../app/dashboard/online-ordering/actions.ts#L87)) with
      `locationName: string | null`, `storefrontEnabled: boolean`, `billingGate: QrBillingGateStatus`.
- [x] Add a private `emptyQrSnapshot(error?: string)` factory. `getQrTableManagerSnapshot` has **five**
      early-return object literals ([:1422](../../../app/dashboard/online-ordering/actions.ts#L1422),
      [:1447](../../../app/dashboard/online-ordering/actions.ts#L1447),
      [:1474](../../../app/dashboard/online-ordering/actions.ts#L1474),
      [:1490](../../../app/dashboard/online-ordering/actions.ts#L1490), plus the tables-error branch).
      Adding three fields to each by hand is how one gets missed — the factory is the fix, not a flourish.
- [x] In `getQrTableManagerSnapshot` ([:1419](../../../app/dashboard/online-ordering/actions.ts#L1419)),
      after `authorize_location_access`, look up `locations` for `merchant_id, name` — the same pattern
      the settings loader already uses ([:929-935](../../../app/dashboard/online-ordering/actions.ts#L929-L935)).
      This single query supplies both the location name and the merchant id.
- [x] Call the existing private `getQrBillingGateStatus(locationId, merchantId)`
      ([:331](../../../app/dashboard/online-ordering/actions.ts#L331)) and return it on the snapshot. It is
      in the same file, so no export is needed.
- [x] Add `is_active` to the `online_store_config` select
      ([:1468](../../../app/dashboard/online-ordering/actions.ts#L1468)) and return it as `storefrontEnabled`
      (the column behind `settings.enabled`, per [:836](../../../app/dashboard/online-ordering/actions.ts#L836)).

> The gate call adds one round trip to a snapshot that already issues four. It replaces a prop chain
> that could disagree with the rows it gates, so it is a net correctness win, not just tidying.

### 3.2 — New route

- [x] `app/dashboard/tables/qr-codes/page.tsx` — client page:
  - Resolve location exactly as [tables/page.tsx](../../../app/dashboard/tables/page.tsx) does:
    local `qrLocationId` state → `selectedLocationId !== 'all'` → `useGatedLocationId()`.
    No location ⇒ `PageShell` + `PageHeader` + `LocationListView onLocationSelect`.
  - Fetch once with React Query: key `["qr-table-manager", locationId]`, `queryFn` =
    `getQrTableManagerSnapshot(locationId)`, `enabled: Boolean(locationId)`.
  - Render `PageHeader` (title "QR Codes", `LocationIndicator isAllLocations={false}`) then
    `QrTableManager` → `QrAnalyticsPanel` → `QrGuestAlertsPanel`.
  - Feed `QrAnalyticsPanel qrEnabled={snapshot.acceptsDineIn}` from the same snapshot.
  - "Back to floor plan" link to `/dashboard/tables`.

### 3.3 — Component moves

- [x] `components/dashboard/qr/BrandedQrPreview.tsx` ← moved from
      `app/dashboard/online-ordering/components/BrandedQrPreview.tsx`. Update its three importers:
      `MarketingQrCreateDialog.tsx:19`, `MarketingQrManager.tsx:53`, `QrTableManager.tsx:24`.
- [x] `app/dashboard/tables/qr-codes/components/QrTableManager.tsx` ← moved. Imports of `../actions`
      become `@/app/dashboard/online-ordering/actions` (R3).
- [x] `app/dashboard/tables/qr-codes/components/QrAnalyticsPanel.tsx` ← moved, same import rewrite.
- [x] `app/dashboard/tables/qr-codes/components/QrGuestAlertsPanel.tsx` ← moved, same import rewrite.
- [x] Rewrite the `QrTableManager` prop contract per §4 and delete its internal loader: the
      `useState<QrTableManagerSnapshot>` / `isLoading` / `loadSnapshot` / `useEffect` block at
      [QrTableManager.tsx:176-213](../../../app/dashboard/online-ordering/components/QrTableManager.tsx#L176-L213).
      The five `loadSnapshot()` call sites (`:297`, `:318`, `:342`, `:354`, `:693`) become `await refresh()`.
      This deletes state rather than adding it.

### 3.4 — Online Ordering cleanup

`app/dashboard/online-ordering/page.tsx`

- [x] Delete lines [1203-1211](../../../app/dashboard/online-ordering/page.tsx#L1203-L1211) (`QrTableManager`),
      [1225-1228](../../../app/dashboard/online-ordering/page.tsx#L1225-L1228) (`QrAnalyticsPanel`) and
      [1230](../../../app/dashboard/online-ordering/page.tsx#L1230) (`QrGuestAlertsPanel`).
- [x] Keep `MarketingQrManager` ([:1219](../../../app/dashboard/online-ordering/page.tsx#L1219)) and
      **rewrite the comment above it** ([:1213-1218](../../../app/dashboard/online-ordering/page.tsx#L1213-L1218)).
      It currently reads "Deliberately OUTSIDE the qrEntitled gate **above**" — once the manager is gone that
      referent no longer exists on the page. The reasoning must survive the move or someone will gate it later.
- [x] Drop the three now-unused imports at [:43, :45, :46](../../../app/dashboard/online-ordering/page.tsx#L43-L46).
- [x] Keep the QR policy block ([:1104-1201](../../../app/dashboard/online-ordering/page.tsx#L1104-L1201)),
      including `qrControlsLocked` / `qrEnableSwitchDisabled` ([:303-330](../../../app/dashboard/online-ordering/page.tsx#L303-L330)).
- [x] Add a one-line link under the policy block: "Generate and print table QR codes →
      Tables › QR Codes". Update the block's own caption, which currently promises "QR codes, analytics,
      and deeper billing gates remain separate work" ([:1109-1111](../../../app/dashboard/online-ordering/page.tsx#L1109-L1111)).

### 3.5 — Navigation (three touches, not one)

`app/dashboard/layout.tsx`

- [x] Desktop sidebar: add `{ title: "QR Codes", url: "/dashboard/tables/qr-codes", icon: QrCode }` to the
      Tables `items` array ([:141-148](../../../app/dashboard/layout.tsx#L141-L148)), between Tables and
      Service Charge.
- [x] Mobile: add the matching row to `dashboardMoreItems` after
      [:1555](../../../app/dashboard/layout.tsx#L1555). The comment at
      [:1547-1548](../../../app/dashboard/layout.tsx#L1547-L1548) warns that a page missing here is
      unreachable on a phone — this is the step that gets forgotten.
- [x] Import `QrCode` from `lucide-react` in the layout if not already present.

### 3.6 — Cross-links

- [x] `components/dashboard/tables/TablesTopBar.tsx`: add a **QR Codes** outline button next to **Edit**
      ([:71-78](../../../components/dashboard/tables/TablesTopBar.tsx#L71-L78)), as
      `<Button asChild variant="outline">` wrapping a `Link` to `/dashboard/tables/qr-codes`. No location
      prop needed — drilling into a floor plan already calls `setSelectedLocation`
      ([tables/page.tsx:20](../../../app/dashboard/tables/page.tsx#L20)), so the QR page resolves the same one.

### 3.7 — Docs

- [x] Add this plan to the document list in [qr-dine-in/README.md](README.md).
- [x] Add a cross-reference line in [tables-floorplan/README.md](../tables-floorplan/README.md) pointing at
      this plan, so the Tables folder records that it now owns a QR surface.

---

## 4. Prop contract changes

**`QrTableManager` — before** ([:69-78](../../../app/dashboard/online-ordering/components/QrTableManager.tsx#L69-L78)):

```ts
locationId, locationName, storefrontEnabled, acceptsDineIn,
qrKillSwitch, qrEntitled, qrGateMessage
```

**after:**

```ts
snapshot: QrTableManagerSnapshot | null;   // lifted to the page (R4)
isLoading: boolean;
refresh: () => Promise<unknown>;
```

Everything the seven old props carried now rides on the snapshot: `storefrontEnabled`, `acceptsDineIn`
and `qrKillSwitch` gate the banners at [:755-780](../../../app/dashboard/online-ordering/components/QrTableManager.tsx#L755-L780),
`billingGate.entitled` / `.reason` replace `qrEntitled` / `qrGateMessage` at `:706`, `:767-772`, `:935`,
`:950`, `:963`, and `locationName` comes off the snapshot instead of the caller.

`QrAnalyticsPanel` and `QrGuestAlertsPanel` prop shapes are unchanged; only `qrEnabled`'s source moves.

---

## 5. What deliberately does not change

- No migration, no RPC, no RLS policy. `generate_table_qr_code`, revoke, token signing and
  `authorize_location_access` are all untouched.
- The four QR server actions keep their names, signatures and audit-log calls (R3).
- The tier gate keeps its server-side enforcement in the mutations
  ([:2118](../../../app/dashboard/online-ordering/actions.ts#L2118),
  [:2300](../../../app/dashboard/online-ordering/actions.ts#L2300)). The snapshot's copy is for UI only —
  it must not become the sole check.
- Marketing QR, its short codes and its ungated status.
- The public `/t/{token}` and `/m/{code}` storefront routes.

---

## 6. Risks and edge cases

| Risk | Handling |
|---|---|
| Bookmarks / links into the QR section of Online Ordering | Nothing deep-linked into it (it had no tab anchor of its own). The new link in the policy block covers the path people actually used. |
| Multi-location merchant on `all` | Location picker (R5), not a dead end. |
| Location with zero tables | Snapshot returns `success: true` with `tables: []`. The merchant lookup in §3.1 is on `locations`, **not** on the first floor-plan row, precisely so this case still resolves a name and a gate. |
| Snapshot fetch fails on the new page | Page renders `PageHeader` plus the manager's existing error state; the `emptyQrSnapshot` factory guarantees a well-formed shape with `billingGate` present, so the banners do not crash on `undefined`. |
| Prop rewrite silently drops a gate | §7 covers each of the four banner conditions explicitly. |
| Missed mobile nav row | §3.5 second checkbox; verified in QA at a phone viewport. |

---

## 7. Verification

Build and lint are weak signals here — `next.config.ts` sets `ignoreDuringBuilds` and
`ignoreBuildErrors`. Type-check the touched files directly.

- [x] `npx tsc --noEmit` scoped to the touched files (targeted recipe from the vitest lessons note).
- [x] `npm run lint`
- [x] `npm run test` — no existing test covers these components (`tests/` holds only
      `qr-branding-rules`, `qr-logo-plate`, `qr-render-*`, all `lib/qr` unit tests, untouched here).

Browser QA (Playwright, `channel: "chrome"`, `domcontentloaded`) on the merchant test login:

- [x] Sidebar shows Tables › QR Codes; it navigates and highlights correctly.
- [x] Phone viewport: the row is present in the More menu.
- [x] Floor plan → QR Codes button → correct location's codes.
- [x] Single-location merchant lands directly on the codes with no picker.
- [x] Multi-location on `all` gets the location picker, and selecting one loads that location's codes.
- [x] Revoke → Regenerate on one row: toast, Active 118→117→118, badge flipped, token v2→v3.
- [x] Export PNG via the QR assets menu — downloaded `uptown-branch-1.png`, so the branded render
      and the location-derived filename both survive the prop rewrite.
- [ ] Reprint and PDF export **not clicked** — they share the render path PNG exercised, but the
      print dialog is not drivable headless.
- [x] Bulk "generate missing" reports progress and settles.
- [x] All four gate banners still render on the right conditions: storefront disabled, dine-in off,
      kill switch on, tier not entitled (banner text and disabled buttons).
- [x] Analytics funnel and guest alerts render with the correct `qrEnabled` state.
- [x] Online Ordering › Ordering: policy toggles still save; marketing QR still creates and prints;
      no orphaned heading or gap where the manager used to be.
- [x] Zero console errors on both pages.

---

## 8. Out of scope / follow-ups

- Moving `QrAnalyticsPanel` to Reports › Online Ordering (revisit after R2 has lived a while).
- Splitting the QR actions into their own file — reconsider only if `actions.ts` is being refactored
  for another reason.
- Merchant-wide (all-locations) QR views.

---

## 9. Execution record — 2026-09-06

Implemented on `feat/table-qr-under-tables`. Six deviations from §3, each with its reason.

### D1 — Seven early returns, not five

§3.1 counted five bails in `getQrTableManagerSnapshot`. There are **seven**: the two extra were the
`qrCodesError` and `scanEventsError` branches after the `Promise.all`, both far enough down the
function to be missed by reading. `tsc` caught them as `TS2739 ... missing the following properties
from type 'QrTableManagerSnapshot': locationName, storefrontEnabled, billingGate` — exactly the
failure the factory was introduced to prevent, arriving as a compile error instead of a runtime
`undefined`. This is the argument for widening the type before touching the call sites.

The four post-config bails now spread a local `storeState` object rather than re-deriving the same
nine fields; `emptyQrSnapshot` covers the three that fire before config is read.

### D2 — `emptyQrSnapshot` takes an overrides object, not `(error, gate)`

Two of its three call sites need to report a real `locationName` and a real `billingGate` alongside
the error — the location resolves before the config read fails. A positional signature would have
grown a third and fourth parameter; `Partial<QrTableManagerSnapshot>` reads better at the call site.

### D3 — `unknownQrBillingGate()` extracted (not in the plan)

The "gate could not be computed" literal already existed inline in `mapConfigToSettings`
(nine fields, including the ask-HQ-to-seed-the-catalog copy). The snapshot needed the same value, so
rather than write it twice it is now one helper both call. Locked, never open: a caller that cannot
establish entitlement must not render an entitled UI.

### D4 — `QrTableManager` kept a `fallbackLocationName` prop

§4 specified `snapshot | isLoading | refresh` only. Browser QA showed the cost: the heading rendered
"…revoke table QR codes for ." for the length of the round trip, because the name now arrives with
the data instead of from the store. The page passes the store's name as `fallbackLocationName`; the
snapshot's own `locationName` still wins once it lands. The caption also falls back to "this
location" so the sentence is never left dangling.

### D5 — The four state banners are held back until the snapshot arrives

**Defect found in browser QA, not in review.** With every flag defaulting to `false`/not-entitled
while `snapshot` is null, the page opened with three alarming banners — *store disabled*, *QR
handling disabled*, *not available for the current subscription tier* — for a merchant who is none
of those things, then silently dropped them a second later. The safe default is right for
*disabling controls* and wrong for *asserting a state*: the component does not know these things
yet, so it must not claim them. Each banner is now `hasSnapshot && …`. The disabled-by-default
buttons are unchanged.

### D6 — Two banners rewrote their own copy

They pointed at switches "turned on above" — true on the Online Ordering tab, false the moment the
screen moved. Both now name Online Ordering and link to it, so the fix is one click from the
complaint. The page renders no error panel of its own: the manager already has one, and the page
only raises the toast the deleted loader used to raise.

---

## 10. Verification results

`npx tsc --noEmit`, `npm run lint`, `npm run test` — **no new failures**. Each pre-existing failure
was confirmed against a stashed working tree rather than assumed:

| Check | Result |
|---|---|
| `tsc` on touched files | clean. The 6 `layout.tsx` `Property 'icon' does not exist` errors and the `date-fns` TS7016 are on the baseline too (6 before, 6 after) |
| `eslint` on touched paths | 3 problems, all pre-existing and in code this change did not write (`layout.tsx:1302` set-state-in-effect, two `<img>` warnings in the online-ordering branding tab). `app/dashboard/tables/qr-codes/**` and `components/dashboard/qr/**` are clean |
| `npm run test` | 9 failed / 1880 passed. The same 9 fail on the stashed baseline (`cascade-labels`, `a11y/storefront`, `kds-routing-traceability-migration`, `orders`) — none QR-related |

Browser QA ran on the merchant test login (Joes Coffee Shop, 4 locations), Chrome via Playwright MCP,
desktop 1440×900 and phone 390×844. **Zero console errors on every page visited.**

Everything in §7 passed except the two lines left unchecked there. Worth calling out:

- **Revoke → Regenerate** on Uptown Branch table 1: toast fired, Active 118 → 117 → 118, badge
  flipped Active → Revoked → Active, token version v2 → v3, branded preview re-rendered. This is the
  proof that R4 works — the mutation's `refresh()` now goes through the page's React Query cache and
  reaches the stat tiles, the rows and the preview together.
- **PNG export** downloaded `uptown-branch-1.png`, so both the branded render and the
  location-derived filename survive the prop rewrite.
- **Picker path**: with scope on All Locations the page renders the four location cards instead of a
  dead end; selecting Downtown Hamra loaded its 4 tables, and that location's genuinely-off dine-in
  banner rendered with a working link.

### Known, pre-existing, not fixed here

In the phone **More** menu, opening `/dashboard/tables/qr-codes` highlights both *Tables* and
*QR Codes*. This is `MobileBottomNav`'s generic prefix match
([:173-175](../../../components/dashboard/MobileBottomNav.tsx#L173-L175)), and it was verified to do
the same thing on `/dashboard/tables/service-charge` before this change. Fixing it means changing
active-state matching for every nested route in the app — a separate ticket.

`LocationListView`'s caption still reads "…to view and manage its floor plans and tables" on the QR
picker. It is the shared component the floor-plan page also uses; the page's own subtitle above it
says the right thing.

---

## 11. Follow-up — 2026-09-06, same branch

Two changes after the original scope, both requested once the moved screen was in front of a person.

### 11.1 — Marketing QR is now its own tab

§3.4 kept `MarketingQrManager` where it was, at the bottom of the Ordering tab. That was the wrong
half of the original argument: the reason table QR did not belong under a settings form — *making
and printing a thing is not saving a setting* — applies to a flyer code just as much. It only ever
looked acceptable because the table manager was sitting above it doing the same wrong thing.

`Marketing QR` is now the fourth entry in the Online Ordering tab rail, between **Ordering** and
**OrderOut**, with its own `TabsContent value="marketing-qr"`. The Ordering tab now ends at the QR
Table Ordering policy block and runs straight into Store hours.

The tab rail needed no type work — `activeSection` is a plain `useState("store")` and the trigger
refs are a `Record<string, …>`, so a new entry is one line in the rail array plus one panel.

The comment explaining why the marketing manager is **not** behind `qrGate.entitled` moved with it
and was rewritten: it used to say "the gate above", which stopped being true when the policy block
ended up on a different tab. A flyer is not a billable multi-location dine-in feature, and gating it
would lock out exactly the single-location merchants who print flyers.

A side benefit: the preview panel sits at the top of its own tab, so it is on screen when you press
a row's Preview button. Under Ordering it could be scrolled well out of view.

### 11.2 — Bug: the Preview button did nothing

**Reported by the user; my earlier QA had wrongly called it working.**

Each row in the marketing list carried `onMouseEnter={() => setSelectedId(row.id)}`. Reaching for a
row's **Preview** button already selected that row, so the click set the id it had just been set to
and nothing visibly happened. The preview also drifted to whatever row the cursor crossed on its way
somewhere else, and nothing in the list marked which code was showing. Hover-to-select reaches
neither keyboard nor touch, so on a tablet the button was the only thing that worked and on a
desktop it was the only thing that didn't.

From `1f243a6b` (2026-09-03), not from this branch — the only change here to that file was the
`BrandedQrPreview` import path.

Fix: selection is by click only, and the selected row's button reads **Previewing** with a filled
variant and `aria-pressed`, so the effect is visible without hunting for the panel.

> **QA lesson.** I first reported this button working because I drove it with
> `page.evaluate(() => button.click())`. A scripted `.click()` dispatches no `mouseenter`, so the
> click genuinely changed the state — the exact thing a real pointer never lets happen. Any control
> whose behaviour depends on pointer state must be verified with a real `hover`/`click` that moves
> the mouse, not a synthetic DOM click.

Verified after the fix with real pointer events: hovering row 1 leaves the panel on the previously
clicked code, and clicking row 4's button switches the panel to exactly that code with a single
`Previewing` marker. Re-checked after the tab move. Zero console errors.

---

## 12. Bug — the QR funnel was counting marketing scans

Raised by the user asking a simple question: *is QR analytics about the table QR or the marketing
QR?* The honest answer turned out to be "mostly the table one, but not entirely", which is a bug.

### What was wrong

`resolve_marketing_qr` writes a flyer scan into **the same** `qr_scan_events` table the table funnel
reads, with `stage = 'scanned'` and `marketing_qr_code_id` set
([migration:368-378](../../../supabase/migrations/20260903120000_marketing_qr_codes.sql#L368-L378)).
`getQrAnalyticsSnapshot` selected scan events by `location_id` alone, so both kinds landed in
`stages.scanned` and in the by-hour chart.

Everything *below* the first step was always table-only — `trackQrFunnelEvent` needs a session token
and only the `/t/{token}` flow mints one, and the order figures filter on `order_type = 'dine_in'`
plus sessions with a table code. So the funnel had a top counting two things and a bottom counting
one:

- **Conversion was understated, and got worse the more flyers a merchant printed.** A marketing scan
  opens the storefront; it can never become a dine-in table order, so it inflated the denominator
  and could never reach the numerator.
- Marketing scans also fell into **Top tables as "Unknown table"**, since a flyer has no table.

`getQrTableManagerSnapshot`'s per-table 7-day counts were never affected — that loop already skips
rows with a null `table_qr_code_id` ([actions.ts:1635](../../../app/dashboard/online-ordering/actions.ts#L1635)).

### Why a filter, and not a second funnel

The obvious-looking alternative was to give marketing its own analytics panel. That is the wrong
shape. The insert above is the **only** writer that sets `marketing_qr_code_id`, and it hardcodes
`'scanned'` — a marketing code can never reach another stage. A six-step funnel for it would be
permanently stuck on step one: a chart that can only ever mislead.

So marketing gets a **count**, not a funnel, and it goes where the codes are.

### The change

1. `getQrAnalyticsSnapshot` adds `.is("marketing_qr_code_id", null)` to the scan-events query. The
   partial index `marketing_qr_code_id, occurred_at` already exists from the marketing migration.
2. The Marketing QR tab gained a three-tile rollup — **Codes / Active / Scans**, with "Last scan"
   beneath the figure — summed from `scanCount` / `lastScannedAt` the rows already carry. No new
   query.
3. `QrAnalyticsPanel`'s caption now says "Table QR funnel and dine-in order performance… Marketing QR
   scans are counted on the Marketing QR tab, not here", so the next person does not have to read
   the SQL to answer the question that started this.

### Verified against live data

A before/after on the dev merchant, not an assertion:

| | Table funnel "Scanned" | Marketing "Scans" |
|---|---|---|
| Before | 11 | 2 |
| After one real flyer scan (`curl` of `/m/Y47GPNTXNW`) | **11** | **3** |

The table funnel did not move; the marketing count did, and the Front Window row went to 3. No
"Unknown table" row in Top tables either time. `tsc` and `eslint` clean on the touched files, zero
console errors.

Those first two marketing scans were mine — the `curl` probes from §11's investigation. They were
sitting in the table funnel until this fix, which is how the bug surfaced.
