# Sprint Plan: Stream D Device Registry Admin UI

**Sprint focus date:** March 16, 2026  
**Scope:** Device Registry admin UI epic on top of the completed database foundation  
**Primary surfaces:** `/manage/devices`, `/dashboard/devices`, registry detail flows, shared device-registry UI components

## Summary

This follow-up ticket turns the completed device-registry schema into real product surfaces, starting with HQ and extending to the merchant read-only view where the route model already exists cleanly.

This is a UI epic, but it should still be approached in slices:

1. Shared registry primitives
2. Inventory list
3. Detail page
4. Transition workflows
5. Overview/dashboard widgets
6. Bulk import and advanced UX

The first implementation pass should prioritize the HQ inventory list and the shared data/UI layer that the later screens depend on.

## Status Update

### Implemented

1. Shared registry types, presentation helpers, and HQ data actions
2. `/manage/devices` inventory list with KPI cards, search, status/category filters, and empty states
3. `/manage/devices/[deviceId]` detail shell with overview and unified activity timeline
4. Status transition modal wired to `assign_device(...)`
5. `/manage/devices/overview` with KPI and chart surfaces
6. Shared section navigation across inventory, overview, and catalog
7. `/manage/device-catalog` alignment work:
- shared registry navigation
- KPI cards
- registry-vs-catalog guidance
- scrollable grouped list container
8. Reusable component hardening:
- shared `DeviceRegistryPageHeader`
- shared `DeviceRegistryMetricCard`
- inventory, overview, and catalog now reuse the same top-of-page/header and metric-card patterns
9. Registry command palette:
- registry-only palette provider mounted in `/manage`
- `Ctrl/Cmd+K` shortcut on registry routes
- page jumps for inventory, overview, and catalog
- live device lookup to matching detail pages
10. Merchant progressive-disclosure surface:
- read-only `/dashboard/devices`
- card-first hardware grid scoped by the dashboard location selector
- support-history sheet per device
- merchant-only data actions and hooks using existing RLS

### Remaining In This Ticket

1. DR-05 Bulk Import Wizard
- CSV upload
- validation preview
- import confirmation flow

2. DR-09 Role-Based Progressive Disclosure
- merchant simplified surface is now implemented
- carrier read-only simplification remains open because the repo does not yet have a clean carrier shell or route model

### Deferred By Instruction

1. Manual registry population
2. Bulk inventory work until the final stage of this ticket

## Repo Baseline

The repo already has:

1. Device-registry foundation migration:
- `supabase/migrations/046_device_registry_foundation.sql`

2. Validation packs:
- `supabase/validation/046_device_registry_foundation_01_schema_checks.sql`
- `supabase/validation/046_device_registry_foundation_02_behavior_checks.sql`
- `supabase/validation/046_device_registry_foundation_03_manual_rls_checks.sql`

3. Existing admin catalog page:
- `/manage/device-catalog`

4. Existing admin patterns to reuse:
- server actions under `app/manage/actions/*`
- HQ auth via `assertHQPermission(...)`
- shadcn table/card/sheet/command primitives

## Locked Decisions

1. Stay inside `/manage`, not `/admin`.
2. Reuse the existing admin auth and permission model.
3. Build HQ inventory list first before the rest of the epic.
4. Do not add merchant/carrier UI unless the sub-ticket explicitly requires it.
5. Reuse the completed schema and helper views rather than adding parallel tables.
6. Prefer reusable registry primitives over page-local one-off mappings.

## First Pass Scope

### Shared

1. Status token map
2. Category icon map
3. Shared formatters/helpers
4. Typed server reads for:
- `admin_device_inventory`
- `admin_device_summary`
- `device_assignments`
- `device_config_history`
- `device_notes`

### DR-01 Inventory List

1. Add `/manage/devices`
2. KPI summary row
3. Search input
4. Status filter
5. Category filter
6. Dense table list
7. Row link to device detail
8. Empty state

### Optional if time remains

1. Detail page shell at `/manage/devices/[deviceId]`
2. Hero section
3. Unified activity timeline foundation

## Out of Scope For The First Pass

1. CSV import wizard
2. Command palette
3. Keyboard shortcuts
4. Carrier-specific UI
5. Merchant simplified UI
6. Advanced charts
7. Full transition modal
8. Inline editing / bulk operations

## Route Plan

1. `/manage/devices`
- HQ inventory list

2. `/manage/devices/[deviceId]`
- HQ detail page

3. `/manage/devices/overview`
- HQ overview dashboard

4. Keep existing:
- `/manage/device-catalog`
5. Added for DR-09:
- `/dashboard/devices`

## Acceptance For The First Pass

1. HQ can navigate to `/manage/devices`
2. Inventory data loads from registry tables/views, not mocks
3. KPI counts render from real summary data
4. Search and filters narrow the table correctly
5. Rows link to a real detail route
6. No new schema changes are required for the UI slice

## Sequencing After This Pass

1. DR-09 merchant simplified surface
2. DR-05 Bulk Import Wizard
3. Carrier progressive disclosure after a dedicated carrier shell decision
