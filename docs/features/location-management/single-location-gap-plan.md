# Single-Location Gap — Implementation Plan

## Goal
The 11 location-gated pages show a "Select a Location" picker for single-location
merchants (locked to `selectedLocationId === "all"`). Auto-resolve them to the one
active location WITHOUT changing the global scope (menu/items must stay on the
"all"/core scope — see ticket1-single-location-menu).

## Approach
Additive resolver hooks + "shadow the variable" per page. No change to the store's
`selectedLocationId` value, so menu/category/item scoping is untouched.

Resolver semantics:
- specific location selected      -> that UUID
- single active location ("all")  -> that one location's UUID   (NEW behavior)
- multi-location on "all"         -> null  (picker still shown, unchanged)

For multi-location accounts the resolver returns null/"all", identical to today.
Only single-location accounts gain behavior. Zero blast radius for multi-location.

These 11 pages are inherently per-location (no "core" concept like menu items),
so writing with the single location's id is correct — no override-row risk.

## Steps

### 1. Add resolver hooks — stores/location-store.ts
Add two exports next to `useIsSingleLocation`:
- `useGatedLocationId(): string | null`
- `useGatedLocation(): Location | null`
Both: if `selectedLocationId !== "all"` use it; else if exactly one active
location, return it; else null. (`Location` type already imported.)

### 2. Per-page edits (shadow the variable — only the hook reads at top change)
- [ ] tables/page.tsx           — `effectiveLocationId = ... || gatedLocationId`
- [ ] settings/page.tsx (Tax)   — `isAllLocations -> !gatedLocationId`, `selectedLocation -> useGatedLocation()` (+ step 3)
- [ ] settings/stations         — source of selectedLocationId/isAllLocations/selectedLocation
- [ ] settings/prep-stations    — same
- [ ] settings/receipt-templates— same (handleSave/handleUseDefault `=== "all"` guards keep working via shadowed id)
- [ ] settings/customer-display — same (fetch effect + guard)
- [ ] settings/tips             — source of selectedLocationId (`=== "all"` checks keep working)
- [ ] tips                      — same
- [ ] cash-drawers             — source of selectedLocationId/isAllLocations/selectedLocation (dialog locationId inherits)
- [ ] online-ordering           — source of selectedLocationId/selectedLocation/isAllLocations (child props inherit)
- [ ] staff/timesheets          — isAllLocations/selectedLocation

Shadow pattern per page:
```ts
const gatedLocationId = useGatedLocationId();
const selectedLocationId = gatedLocationId ?? "all"; // keeps "=== 'all'" guards correct
const isAllLocations = !gatedLocationId;
const selectedLocation = useGatedLocation();
```
(keep `setSelectedLocation` etc. from the store where still needed, e.g. tables)

### 3. Tax hooks — app/dashboard/hooks/useTaxRates.ts  (SPECIAL CASE)
These read the store internally and gate on "all", so the page guard alone is not
enough. Replace each `const { selectedLocationId } = useLocationStore()` with
`const selectedLocationId = useGatedLocationId() ?? "all"` in the page-facing hooks
(`useLocationTaxRates`, `useUpsertTaxRate`, `useDeactivateTaxRate`).
Multi-location behavior unchanged (still "all" -> bail); single-loc now resolves.

### 4. Verify shared components
Confirm the gated pages' dialogs (AddStationDialog, AddEditPrepStationDialog,
CashDrawerFormDialog, etc.) are NOT reused by menu pages (grep before finishing).

### 5. Verify
- [ ] npm run lint
- [ ] npm run build
- [ ] Sanity: menu/items pages still read useIsAllLocations/useSelectedLocation unchanged.

## Rejected
- Option A (flip store `selectedLocationId` to UUID for single-loc): would make menu
  edits write L2 location_item_overrides instead of the core — regresses the
  single-location menu design.

## Review (implemented)

Done:
- stores/location-store.ts: added `useGatedLocationId()` + `useGatedLocation()`.
- 11 pages updated via shadow-the-variable (tables, settings/Tax, stations,
  prep-stations, receipt-templates, customer-display, settings/tips, tips,
  cash-drawers, online-ordering, staff/timesheets).
- app/dashboard/hooks/useTaxRates.ts: all internal store reads now resolve via
  the gated resolver (special case — page guard alone was insufficient).
- tables/page.tsx keeps `useLocationStore` (needs `setSelectedLocation` + its own
  picker state) — intentional.

Verification:
- `npx tsc --noEmit`: zero type errors in any edited file (pre-existing errors
  elsewhere are unrelated).
- `npm run build`: ✓ Compiled successfully (all edited modules resolve/typecheck).
  Build later fails collecting page data for /sign-up/[[...sign-up]] with
  `d.createContext is not a function` — a Clerk/React SSR env issue on an
  UNTOUCHED auth route; that route imports none of the changed files.
- Menu/items/categories pages untouched — they still read useIsAllLocations /
  useSelectedLocation and the store value stays 'all' (core scope preserved).

Not done / follow-up:
- Manual UI smoke test as a single-location merchant (dev login available) to
  confirm each page lands on its location instead of the picker.
