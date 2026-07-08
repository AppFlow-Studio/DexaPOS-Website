# [POS/Web] Location-level POS Settings surface + per-station overrides

## Scope

Website repo / web dashboard implementation only.

This implements the web/dashboard and database contract for setting a location's POS runtime config once in `locations.pos_config`, plus per-station overrides in `stations.pos_config_overrides`. No POS tablet repo changes are included in this pass.

## Implemented

- Added migration `supabase/migrations/20260630110000_location_pos_config_station_overrides.sql`.
- Added `stations.pos_config_overrides jsonb NOT NULL DEFAULT '{}'`.
- Added default POS config function:
  - `default_pos_config_v1()`
- Added recursive JSON merge function:
  - `pos_config_deep_merge(base, overlay)`
- Added exact resolver RPC required by the ticket:
  - `get_effective_pos_config(p_station_id uuid)`
- Added web write RPCs:
  - `set_location_pos_config_v1(p_location_id uuid, p_pos_config jsonb)`
  - `set_station_pos_config_overrides_v1(p_station_id uuid, p_overrides jsonb)`
- Preserved the older existing RPC:
  - `update_location_pos_config(p_location_id uuid, p_namespace text, p_config jsonb)`
- Added web shared config contract:
  - `lib/pos/pos-config.ts`
- Added dashboard server actions:
  - `app/dashboard/actions/pos-settings.ts`
- Added dashboard React Query hooks:
  - `app/dashboard/settings/pos/hooks/usePosSettings.ts`
- Added dashboard UI page:
  - `app/dashboard/settings/pos/page.tsx`
- Added Settings hub entry:
  - `/dashboard/settings` now links to `/dashboard/settings/pos`.
- Added Settings sidebar and global-search entries for `/dashboard/settings/pos`.
- Updated generated Supabase type metadata for `stations.pos_config_overrides` and the new POS config RPCs.

## Web Controls

Location-level defaults:

- Receipt/printing:
  - Show tax breakdown
  - Show itemized list
  - Show tip options
  - Footer message
- Kitchen ticket:
  - Show guest count
  - Show course number
- Payment:
  - Accept cash
  - Split by item
  - Split evenly
  - Split by amount
- Display:
  - UI scale
  - App theme
- Notifications:
  - Sound enabled
  - Volume

Station override v1:

- UI scale
- App theme
- Notification sounds
- Notification volume

## Resolution Contract

Effective POS config resolves in this order:

1. Hard default from `default_pos_config_v1()`
2. Location config from `locations.pos_config`
3. Station override from `stations.pos_config_overrides`

The web page mirrors this with `getEffectivePosConfig(...)` for preview, while the canonical backend resolver is `get_effective_pos_config(p_station_id)`.

## Security Notes

- New RPCs use `SECURITY DEFINER`.
- New RPCs pin `search_path = 'public', 'pg_temp'`.
- View access requires location membership or location management permission.
- Write access requires `location.manage` through `user_has_location_permission(...)`, which already includes merchant-admin fallback.
- Station overrides are intentionally constrained in SQL to `display` and `notifications` for v1.

## Out Of Scope

- POS tablet consumption of `get_effective_pos_config(...)`.
- Migrating all existing POS settings screens to this config.
- KDS configuration block.
- Hardware-specific station assignment:
  - receipt printer assignment
  - terminal pairing
  - drawer assignment
  - CFD pairing
  - view scope
  - station capabilities

Those remain in existing station settings surfaces or the POS repo.

## QA Checklist

1. Apply migration on staging.
2. Open merchant dashboard.
3. Select one concrete location in the dashboard location picker.
4. Go to `Settings > POS Settings` from the left sidebar, the Settings hub card, or global search.
5. Toggle location defaults and save.
6. Confirm `locations.pos_config` changes and `_version` increments.
7. Select a station.
8. Add UI/theme/sound/volume overrides and save.
9. Confirm `stations.pos_config_overrides` contains only `display` and/or `notifications`.
10. Run:

```sql
select public.get_effective_pos_config('<station_id>'::uuid);
```

11. Confirm effective config equals default + location + station override merge.
12. Clear station overrides using the inherit controls and save.
13. Confirm the station falls back to location defaults.

## Status

Implemented in website repo. Pending migration apply and manual QA.
