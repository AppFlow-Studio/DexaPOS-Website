# Per-Location Menu Visibility by Platform - Website

## Ticket

- Contract: `[POS/Web - Menu Management] Per-location menu visibility by platform`
- Website implementer: Ali Dika
- Branch: `feat/menu-channel-visibility-web`
- Status: code complete and reconciled with current preview; shared migration deployment, generated types, and manual QA pending

## Source

- Related Notion page: `POS - Menu Rail: Portal-only menus render on POS - Whole Menu duplicates every category and rings a different price (Saucy)`
- Notion page ID: `3be8280c-1b1d-8188-a9e8-db438d92667a`
- Notion URL: `https://app.notion.com/p/3be8280c1b1d8188a9e8db438d92667a?pvs=204`

The older Notion discussion proposed a JSON channel contract. The current ticket and POS migration supersede it with three booleans on `location_menus`: `is_visible_on_pos`, `is_visible_on_kiosk`, and `is_visible_online`. No website schema migration was added or executed.

## Shared Dependency

The authoritative migration remains in the POS repository:

`utils/supabase/migrations/20260821120000_menu_channel_visibility.sql`

It must be deployed before write-path QA. Missing rows, missing visibility columns, and null values use visible defaults for backward compatibility. Unexpected authorization, network, and query failures fail closed so a hidden online menu cannot be exposed.

## Implemented

1. Added POS, Kiosk, and Online Ordering switches to both menu list layouts and the menu Settings tab.
2. Kept Active/Inactive independent and unchanged.
3. Added a location-scoped upsert keyed by `location_id + menu_id`; it updates only channel flags and preserves `is_active`, `display_order`, and other columns.
4. Fixed the location menu read path that incorrectly queried `menus` instead of `location_menus`.
5. Applied explicit-false defaults through a shared visibility normalizer.
6. Prevented online-hidden menus from merchant and HQ OrderOut designation, publication, and provider fan-out.
7. Removed online-hidden menus from hosted storefront menu results.
8. Invalidated menu and online-ordering query families after saves.
9. Added tests for independent combinations, defaults, online exclusion, and location isolation.
10. Reconciled the feature with the current preview menu redesign while retaining its borderless tiles, responsive table, and all-location availability column.
11. Hardened storefront and OrderOut reads so only the expected missing-column deployment case defaults to visible; all other visibility-query failures block publication or return no storefront menus.

`Whole Menu` remains an ordinary merchant-created menu. Delivery providers are integrations, not additional visibility switches.

## Changed Files

- `app/dashboard/actions/location-menus.ts`
- `app/dashboard/actions/menus.ts`
- `app/dashboard/actions/orderout.ts`
- `app/dashboard/menu/page.tsx`
- `app/dashboard/menu/[menuId]/page.tsx`
- `app/manage/actions/admin-merchant/orderout.ts`
- `app/sites/actions.ts`
- `components/dashboard/menu/MenuChannelVisibilityControls.tsx`
- `components/dashboard/menu/MenuListView.tsx`
- `components/dashboard/menu/menuId/MenuSettingsTab.tsx`
- `lib/menu/menu-channel-visibility.ts`
- `lib/menu/menu-channel-visibility.server.ts`
- `lib/menu/__tests__/menu-channel-visibility.test.ts`
- `docs/features/menu-management/README.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Automated Verification

- Focused Vitest: 1 file passed, 9 tests passed.
- Targeted ESLint: passed for the actions, helpers, tests, visibility control, merged menu list, and Settings tab.
- Large menu-page ESLint: existing React compiler/effect findings remain unchanged on preview.
- Full TypeScript: still fails on the preview branch's existing project-wide Clerk, Deno, form, and generated-type backlog. No new visibility-helper, list, Settings, storefront, or action errors were found. The existing menu creation form resolver errors remain.
- Next.js production build: passed on Next.js 16.2.12 after merging the current `dexaposwebsite-preview` branch.

## Manual QA

Prerequisite: deploy the shared migration to QA, then regenerate website Supabase TypeScript types.

1. Sign in as a merchant with two locations and a menu shared by both.
2. Open `/dashboard/menu` and select Location A.
3. Verify every menu row/card shows POS, Kiosk, and Online Ordering switches.
4. Test POS off, Kiosk on, Online on; reload and verify persistence.
5. Test POS on, Kiosk off, Online on; reload and verify persistence.
6. Test POS on, Kiosk on, Online off; reload and verify persistence.
7. Test all three off; reload and verify persistence.
8. Open the menu Settings tab and verify the same values and controls.
9. Select Location B and verify Location A's values did not leak.
10. Return to Location A and verify its values remain unchanged.
11. Hide Online Ordering, then try to designate or publish the menu. Verify it is unavailable or returns the explicit visibility error.
12. Open the hosted storefront and verify the hidden menu is absent.
13. Re-enable Online Ordering, publish, and verify designation and storefront visibility.
14. Set the menu inactive while all channel switches are on. Verify it remains unavailable.
15. Attach an unavailable schedule while all switches are on. Verify schedule availability still wins.
16. Verify POS and kiosk behavior on the tablet under the shared POS ticket.

## Supabase Verification

```sql
select
  location_id,
  menu_id,
  is_active,
  display_order,
  is_visible_on_pos,
  is_visible_on_kiosk,
  is_visible_online,
  updated_at
from public.location_menus
where menu_id = '<menu uuid>'
order by location_id;
```

Expected: one independently configurable row per location. Saving channel visibility must not change `is_active` or `display_order`.

## Remaining Work

1. Deploy the POS-owned shared migration through the approved database process.
2. Regenerate `database.types.ts` from the migrated environment; do not hand-edit generated types.
3. Run the full manual QA matrix and attach storefront, OrderOut, POS, and kiosk evidence.
