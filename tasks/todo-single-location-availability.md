# Fix: single-location dashboard can't read/clear per-location item availability

## Problem (confirmed on prod)
Item "311" at Charcoal Gardenia (single-location merchant) is off on POS/online
(`location_item_overrides.is_available = false`, `snoozed_until = null`) but the
web dashboard shows it "Available" and offers no way to turn it back on.

## Root cause
Availability is a **per-location** field, but the dashboard resolves its location
inconsistently for single-location accounts:

- **86 control** (`ItemSnoozeControl`) -> `useGatedLocationId()` -> writes the L2
  override (`location_item_overrides.is_available`). CORRECT.
- **"Available for sale" toggle** (`AvailabilitySection.tsx:30`,
  `NewEditItemFormSheet` save at `:1412`) -> `isAllLocations || isSingleLocation ? null`
  -> writes **global** `menu_items.availability`, never the override. BUG.

So the two controls target different rows. When 86-coupling (or a POS-direct
turn-off) sets the override `is_available=false` and the snooze later clears, a
single-loc merchant has:
- **Read:** global `availability=true` shown (override never fetched at `'all'`
  scope -- `menu-items.ts:115` returns global items and skips overrides).
- **Write:** the availability toggle writes global, so it can't clear the override.

The write action ALREADY routes availability to `location_item_overrides` whenever a
concrete `locationId` is passed (`menu-items-rpc.ts:1143`, `upsert_category_item_override`).
The only defect is the UI passing `null` for single-location. Precedent for the fix
already exists: prep-station (location-only) routes via `gatedLocationId`
(`NewEditItemFormSheet.tsx:1438-1440`).

## Fix -- resolve availability's location via `useGatedLocationId()` (read + write)
Mirror the 86 control. For availability specifically (NOT price/core fields):
- specific location selected -> that UUID (unchanged)
- multi-location on "All" -> null -> global core (unchanged)
- single-location (`'all'` + one active loc) -> that one location -> L2 override (NEW)

### Changes
1. **`components/dashboard/menu/item-edit/sections/AvailabilitySection.tsx`**
   - Replace `locationId` (`:30`) with `useGatedLocationId()` for the availability save.
   - Seed the toggle from the per-location override for the gated location (read fix),
     not `item.availability`.
2. **`components/dashboard/menu/NewEditItemFormSheet.tsx`**
   - Route `availability` in the save through the gated location (split it out of the
     global `updateItemOverride(locationId=null)` call, like prep-station), so single-loc
     writes the override. Keep price/core global.
   - Seed the availability toggle (`:1121`) from effective/override availability for the
     gated location instead of global `editItem.availability`.
3. **Read plumbing (single source):** extend `getItemSnooze` (already reads the override
   row) to also return `is_available`, exposing one hook the availability toggle seeds
   from -- avoids a second per-location fetch. (`app/dashboard/actions/item-snooze.ts`,
   `lib/queries/use-snoozes.ts`.)
4. **Global-mask safety (single-loc):** when writing the override for a single-loc
   account, also normalize global `menu_items.availability=true` so a stale global=false
   can't keep masking the item. (Decision below.)

## Guardrail so it "never happens again"
5. **Out-of-stock page visibility** (`app/dashboard/menu/out-of-stock/page.tsx`):
   currently keys off `snoozed_until` only. Also surface override rows with
   `is_available=false AND snoozed_until IS NULL` ("Turned off", not a timed 86) so a
   stuck manual-off is always visible and restorable from the web. Closes the class of
   bug, not just item 311.

## Out of scope / separate
- **Restoring 311 right now** needs a prod write (MCP is read-only, local env=staging).
  Turn it back on from the POS, or run the one-line UPDATE with a prod write connection.
  The code fix makes it self-serviceable from web going forward, but won't retro-flip it.

## Open decision
- Step 4: for single-loc, write override-only, or override + normalize global=true?
  Recommend **override + normalize global=true** (prevents a lingering global false from
  masking; keeps effective = global AND override coherent).

## Test plan
- Single-loc: 86 then let snooze expire (or POS-direct off) -> item shows "Unavailable"
  in editor + Out-of-stock page -> toggle On -> override `is_available=true`, item live.
- Multi-loc "All": availability still writes global (no regression).
- Multi-loc specific location: availability still writes that location's override.
- `npm run test` (transform-menu / snooze suites) + `npm run build`.

## Review (implemented)
Decisions taken: **core fix + guardrail**, and **override + normalize global=true**.

Changed files:
- `app/dashboard/actions/item-snooze.ts` — `getItemSnooze` now also returns
  `is_available` (null = no override → inherit global). New `getTurnedOffItems(locationId)`
  reader (is_available=false AND snoozed_until IS NULL, joined to menu_items).
- `app/dashboard/actions/menu-items-rpc.ts` — new `setItemAvailabilityScoped()`:
  surgical availability writer. locationId null → global L1; locationId set → direct
  upsert of ONLY is_available on the L2 override (deliberately NOT the cascade RPC,
  which would delete the row and drop prep_station/snooze/flags); normalizeGlobal lifts
  a stale global mask when enabling for single-loc. Audit-logged.
- `lib/queries/use-snoozes.ts` — extended `useItemSnooze` type; new `useTurnedOffItems`
  query + `useSetItemAvailability` mutation; `invalidate()` now also refreshes
  `['turned-off-items']`.
- `components/dashboard/menu/item-edit/sections/AvailabilitySection.tsx` — reads/writes
  availability via the gated location (single-loc → its one store's override).
- `components/dashboard/menu/NewEditItemFormSheet.tsx` — plain-item scope routes
  availability through `setItemAvailabilityScoped` + seeds the toggle from the gated
  override; category/menu scope unchanged (still cascade RPC).
- `app/dashboard/menu/out-of-stock/page.tsx` — new "Turned off" section listing
  is_available=false/no-snooze items with a one-click "Turn on".

Verification: `vitest` orderout suite 37/37 green; `tsc --noEmit` clean on all touched
files; VS Code diagnostics clean on all six files.

Key subtlety found during impl: `upsert_category_item_override` treats
"is_available=true, no price" as an empty override and DELETES the whole
location_item_overrides row — which would drop prep_station_id/snooze/flags. Avoided by
using a direct surgical upsert in `setItemAvailabilityScoped`. This also latently
protected the multi-location specific-location path.

Status of item 311 (Charcoal Gardenia): re-confirmed `is_available=true` on prod — it
was turned back on out of band during this session, so it is live again. The code fix is
the durable guardrail so this can't strand a single-location merchant again.

Not deployed yet — staging-first per rollout convention.
