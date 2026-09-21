# Per-Station Menu Scope - Website

## Ticket

- Contract: `[POS/Web - Menu Management] Per-station menu scope` (Kiosk 1 → Sushi only)
- Builds on: `3be8280c` Per-location menu visibility by platform (Done)
- Owner: Ali Jaffal (end to end). Reviewers: Ali Dika (migration, RLS, RPC); Haidar + Abubeckr (placement of the station-editor section)
- Status: code complete; shared migration deployment, manual QA, screen recording to Abubeckr and second-reviewer sign-off pending

POS half: `Dexa-POS/docs/features/menu-management/per-station-menu-scope.md`.

## Shared migration

`supabase/migrations/20260919120000_station_menu_scope.sql` (byte-identical copy in
`Dexa-POS/utils/supabase/migrations/`). Staging first, then production. Not executed
from this repository.

What it changes:

1. `stations.menu_scope text NOT NULL DEFAULT 'all'` with `chk_station_menu_scope`
   (`all | selected`). Every existing station reads `all`; no behaviour changes
   until a toggle.
2. `station_menus (station_id, menu_id, location_id, merchant_id, created_at)`, PK
   `(station_id, menu_id)`, FKs cascade on station and menu delete, indexes on
   `location_id` and `menu_id`. A `BEFORE INSERT OR UPDATE` trigger fills the
   denormalized columns from the station and rejects a menu from another merchant,
   a menu owned by another location, or a KDS station.
3. RLS mirrors `location_menus`: `location.menu.view` to read,
   `location.menu.manage` to insert / update / delete.
4. `get_station_menu_scope_watermark_v1(location)` — md5 over every non-KDS
   station's `(id, menu_scope, ordered menu_ids)`. A content hash, not
   `max(updated_at)`: `stations.updated_at` moves on every heartbeat.
5. `get_pos_bootstrap_v2` gains `station_menu_scopes` (`station_id → { scope,
   menu_ids }`) and its version suffix becomes
   `-channels-v3-station-scopes-<hash>`, so every device rebuilds once and every
   later scope edit moves the version.
6. `get_pos_menu_version_v2` = `get_pos_menu_version_v1 || '-' || hash`. The tablet
   polls this now. v1 is untouched and stays in lockstep with bootstrap v1.
7. `set_station_menu_scope(p_station_id, p_scope, p_menu_ids)` — SECURITY DEFINER,
   `search_path = 'public', 'pg_temp'`, identity `auth.jwt()->>'sub'`, authorization
   `user_has_location_permission(location, 'location.menu.manage')`. Delete +
   insert + scope update in one transaction. `all` clears the rows.

Rollback and manual verification queries are at the head and foot of the file.

## Implemented

1. **Menus tab** on the station editor (`/dashboard/settings/stations/[stationId]`):
   All menus / Selected menus radio, a checklist of every menu the station could
   render, explicit Save. Hidden for `kds` stations through the existing
   `TABS_HIDDEN_BY_STATION_TYPE` map.
2. Inline warning on a selected menu whose channel flag is off for this station's
   type ("Hidden on Kiosk … will not show on this station even though it is
   selected"). The channel toggle wins; the warning says so.
3. Warning, not a block, for Selected with nothing visible: the station renders
   "No menus assigned to this station" — the fail-closed contract.
4. Undeployed-migration fallback: `42703 / 42P01 / 42883 / PGRST202 / PGRST204`
   mentioning the new objects renders "not deployed to this environment yet" with
   the controls disabled. Any other error surfaces.
5. Audit log on every save (`Updated Station Menus: <name>`, category `settings`,
   resource `station`, before/after scope + ids).
6. `Station.menu_scope?` on the shared station type; absent reads as `all`.
7. **Station coverage pill on the menu page** (added after review: the team's
   habit is to hide menus from the Menus section, and nothing there said a
   station could narrow the switches further). Under the POS / Kiosk / Online
   switches on the grid card, the table row and the menu Settings tab, a
   read-only "All 4 stations" / "2 of 4 stations" / "None of 4 stations" pill
   opens a popover listing every active non-KDS station at the selected location
   with why it does or does not show the menu ("Shown", "Hidden on Kiosk",
   "Not selected"), each row linking to that station's Menus tab. One
   location-wide fetch (`getLocationStationMenuCoverage`), joined per menu on
   the client. Hidden when no location is selected. Editing stays on the
   station: changing it from the menu side would have to flip an "All menus"
   station to "Selected" behind the manager's back.

Two switches, one rule, no conflict: a menu shows on a station iff its channel
flag is on for that station's type AND (scope is All OR the menu is selected).
Both only narrow. The channel toggle is the location-wide default; the station
scope is the per-device exception.

Placement of the section is Abubeckr's call. It ships as a tab immediately after
Overview and moves with a one-line change in `TABS`.

## Changed files

- `supabase/migrations/20260919120000_station_menu_scope.sql`
- `lib/stations/station-menu-scope.ts` (+ `lib/stations/__tests__/station-menu-scope.test.ts`)
- `app/dashboard/actions/station-menus.ts`
- `app/dashboard/actions/stations.ts` (`menu_scope` on `Station`)
- `app/dashboard/settings/stations/hooks/useStationMenuScope.ts`
- `app/dashboard/settings/stations/[stationId]/components/StationMenusTab.tsx`
- `app/dashboard/settings/stations/[stationId]/page.tsx`
- `components/dashboard/menu/MenuStationCoverage.tsx` (coverage pill + popover)
- `components/dashboard/menu/MenuListView.tsx` (`stationCoverageLocationId` prop, pill on card and row)
- `components/dashboard/menu/menuId/MenuSettingsTab.tsx` (pill under the switches)
- `app/dashboard/menu/page.tsx` (passes the gated location id)

## Verification

- `npx tsc --noEmit`, `npm run lint` on the changed files, `npx vitest run
  lib/stations` — results recorded in the PR.
- Generated `database.types.ts` is NOT hand-edited: both Supabase clients in this
  repo are untyped, so `.from('station_menus')` and `.rpc('set_station_menu_scope')`
  type-check today. Regenerate after the migration lands.

## Manual QA

1. Open a register and a self-service station in the editor. KDS shows no Menus tab.
2. Kiosk 1 → Selected → tick Sushi → Save. Toast; reload keeps the selection.
3. Untick everything → warning "This station will show no menus" appears; Save is
   still allowed.
4. On the Menu page switch Sushi off for Kiosk; back on the station the Sushi row
   carries "Hidden on Kiosk" and, when ticked, the inline explanation.
5. Delete a menu that is selected on a throwaway staging station; the station's
   list drops it and `station_menus` has no orphan row.
6. As a user without `location.menu.manage` (a server role), saving fails with the
   permission message and nothing is written.
7. Menu page, one location selected: every menu row shows the stations pill.
   After step 2 the Sushi row reads "1 of N stations" (or the matching count);
   open the popover; Kiosk 1 reads "Shown", a Selected station without Sushi
   reads "Not selected", and switching Sushi off for Kiosk turns the kiosk rows
   to "Hidden on Kiosk". Each row navigates to the station's Menus tab. On
   "All locations" the pill is absent.
8. Screen recording: portal toggle → two kiosks side by side → offline cold start.
   Send to Abubeckr. The ticket does not move to Done until reviewed.

## Remaining work

- Deploy the migration to staging, then production (outside this repo).
- Regenerate `database.types.ts` after deployment.
- Abubeckr: confirm or move the tab.
- Second reviewer sign-off before Done.
