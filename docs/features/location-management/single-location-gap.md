# Single-Location Gap: Location-Gated Pages

## Problem

The single-location task locks the header picker to a static store name badge and scopes menu/item data to the "all" (core) scope. However, several pages are **location-gated** — they require a specific `locationId` to render content and fall back to a "Select a Location" prompt when `isAllLocations === true`.

For a single-location merchant, `selectedLocationId` is forced to `"all"` by the store, so these pages always hit the fallback — even though there is only one possible location to pick. The user is stuck seeing a location picker with one item in it, on every single one of these pages.

---

## Affected Pages (11 total)

| Page | URL | Fallback shown |
|---|---|---|
| **Tables** | `/dashboard/tables` | Location list — must click through to see tables |
| **Tax Settings** | `/dashboard/settings` | "Select a Location" prompt |
| **Stations** | `/dashboard/settings/stations` | "Select a Location" prompt |
| **Prep Stations** | `/dashboard/settings/prep-stations` | "Select a Location" prompt |
| **Receipt Templates** | `/dashboard/settings/receipt-templates` | "Select a Location" prompt |
| **Customer Display** | `/dashboard/settings/customer-display` | "Select a Location" prompt |
| **Tips (Settings)** | `/dashboard/settings/tips` | Yellow warning card: "Select a Location" |
| **Tips (Operations)** | `/dashboard/tips` | Yellow warning card: "Select a Location" |
| **Cash Drawers** | `/dashboard/cash-drawers` | "Select a Location" prompt |
| **Online Ordering** | `/dashboard/online-ordering` | "Select a Location" prompt |
| **Staff Timesheets** | `/dashboard/staff/timesheets` | "Select a Location" prompt |

---

## Root Cause

Each page checks `isAllLocations` (or `effectiveLocationId === null`) and renders a location picker when true:

```ts
// tables/page.tsx
const effectiveLocationId = tablesLocationId || (selectedLocationId !== 'all' ? selectedLocationId : null)
if (!effectiveLocationId) return <LocationListView ... />

// All other pages above follow the same pattern:
if (isAllLocations) return <SelectALocationPrompt />
```

Since single-location accounts have `selectedLocationId === "all"` in the store (locked there by the single-location logic in `layout.tsx:1218`), all these guards fire.

---

## Proposed Fix

When `isSingleLocation === true`, these pages should auto-resolve to the single active location ID instead of showing the picker.

**Option A — Fix in the store (recommended)**
In `stores/location-store.ts` or in `layout.tsx`, when `activeLocationCount === 1`, set `selectedLocationId` to that location's ID instead of `"all"`. All 11 pages inherit the fix with no changes.

**Option B — Fix per page**
In each page, read `useIsSingleLocation()` + `useActiveLocations()` and auto-derive `effectiveLocationId` from the single location when `isAllLocations` is true. More surgical but requires touching 11 files.
