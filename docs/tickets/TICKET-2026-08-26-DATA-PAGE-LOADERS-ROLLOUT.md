# [WEB-UX] Dashboard data loaders - layout-preserving skeleton system and rollout

**Assignee:** Haidar
**Pilot implementer:** Ali Dika
**Verifier:** Ali Dika
**Priority:** Medium
**Surface:** Merchant dashboard and DEXA HQ web portal
**Repository baseline:** `DexaPOS-Website` `origin/dexaposwebsite-preview` at `38a7209c`
**Status:** Ready for rollout; two-page pilot implemented, manual QA pending

**Notion source:** `[WEB-UX] Dashboard data loaders — layout-preserving skeleton system + rollout`
**Notion page ID:** `3c88280c-1b1d-8100-8972-cf81c3210aa6`
**Notion URL:** https://app.notion.com/p/3c88280c1b1d81008972cf81c3210aa6?pvs=204

> **Product decision:** Replace generic centered spinners and disconnected
> `Loading...` states with skeletons that resemble the destination page. A full
> page skeleton is only for the initial load when no usable data exists.
> Background refreshes keep current data visible, and mutation buttons retain
> their local progress indicators.

---

## Problem

Data-heavy website routes currently use inconsistent waiting states. Some show
the legacy centered `PageLoader`, some render isolated spinners or loading text,
and others reveal the page one section at a time. This creates large layout
shifts and can make a healthy request look like a broken or empty page.

The loading UI also does not communicate what shape of content is coming. An
analytics page, a catalog, and a detail workspace should not all collapse into
the same empty screen and spinning ring.

## Expected behavior

1. Initial navigation or hard refresh shows a stable skeleton matching the
   destination page's approximate structure.
2. Real content replaces the skeleton without a major layout jump.
3. Cached content stays visible during filter changes, pagination, focus
   refetches, and manual refreshes.
4. Independent sections may resolve separately when partial rendering is useful;
   the page must not wait for an unrelated optional query.
5. Loading, empty, error, and populated states never render simultaneously.
6. The experience works on desktop, tablet, and 360px phone widths without
   horizontal overflow.
7. Screen readers receive meaningful loading status and reduced-motion users do
   not receive pulsing animation.

## Pilot already implemented

The pilot establishes the shared contract Haidar should reuse:

### `/dashboard/transactions`

- Uses the `analytics` loader shape.
- Covers the financial KPI, chart KPI, and order/transaction initial queries.
- Date-range refetches retain the current page instead of restoring the full
  skeleton.

### `/dashboard/menu/items`

- Uses the `catalog` loader shape.
- Covers identity, permissions, items, categories, modifier groups, tax rates,
  and location scope on first load.
- Existing error and empty states remain unchanged.

### Shared component

- `components/dashboard/loading/DataPageSkeleton.tsx`
- Current variants: `analytics` and `catalog`.
- Provides `role="status"`, `aria-live="polite"`, `aria-busy="true"`, meaningful
  screen-reader text, responsive geometry, and reduced-motion support.

## What ships

### Workstream A - audit and inventory

1. Open every target route under Slow 3G with cache disabled.
2. Record its initial loader, query dependencies, final page geometry, empty
   state, error state, and background-refetch behavior.
3. Classify each route as:
   - full-page structural skeleton,
   - section-level skeletons,
   - existing loader already acceptable,
   - no loader required because the route has no meaningful data wait.
4. Do not convert a page merely to satisfy a route count. The loader must solve
   a visible wait or layout-shift problem.

### Workstream B - Priority 1 merchant rollout

Audit and convert the highest-volume/data-heavy merchant routes first:

- `/dashboard/orders`
- `/dashboard/payments`
- `/dashboard/customers`
- `/dashboard/invoices`
- `/dashboard/subscriptions`
- `/dashboard/reports`
- `/dashboard/reports/comparison`
- `/dashboard/reports/cash-drawers`
- `/dashboard/menu/categories`
- `/dashboard/menu/modifiers`

### Workstream C - Priority 2 merchant operations

- `/dashboard/devices`
- `/dashboard/audit-logs`
- `/dashboard/support`
- `/dashboard/staff`
- `/dashboard/staff/timesheets`
- `/dashboard/inventory`
- `/dashboard/online-ordering`
- `/dashboard/locations`
- Data-heavy location, station, POS, and receipt-template settings

### Workstream D - DEXA HQ rollout

Prioritize the confirmed legacy `PageLoader` routes, then audit adjacent HQ
workspaces:

- `/manage/users`
- `/manage/users/[userId]`
- `/manage/roles-permissions`
- `/manage/merchants/[merchantId]`
- `/manage/subscriptions/[merchantId]`
- `/manage/merchants`
- `/manage/subscriptions`
- `/manage/transactions`
- `/manage/support`
- HQ reports and audit logs

### Workstream E - shared variant discipline

1. Reuse `analytics` and `catalog` when their geometry fits.
2. Add a new named variant only when the same structural shape is needed by at
   least two routes, such as `table`, `detail`, or `settings`.
3. Keep variants in the shared dashboard loading directory. Do not create a
   one-off component beside every page.
4. Keep skeleton styling aligned with the current flat dashboard language:
   restrained panels, muted blocks, existing spacing, and no nested bordered
   cards.

## Loading-state contract

- Use React Query `isLoading` or equivalent initial-pending state for the
  full-page skeleton.
- Do not replace usable cached data solely because `isFetching` is true.
- If a required identity or permission query gates the page, include it in the
  initial loading condition.
- Do not wait indefinitely on disabled or optional queries.
- Keep Save, Delete, Approve, Pay, Publish, and similar mutation feedback local
  to the triggering control.
- Preserve existing query keys, invalidation, pagination, permissions, error
  handling, and mutations.
- Do not add fake delays or minimum display timers.
- Do not add a loader package or change package/lockfiles.

## Scope

- Merchant dashboard and HQ portal data-loading presentation.
- Shared skeleton variants and route integrations.
- Responsive and accessibility behavior.
- Removal of legacy `PageLoader` usage where a structural replacement is
  approved by the route audit.
- Targeted tests for first load versus background refetch behavior.

## Non-scope

- POS/Expo application loaders.
- Query, RPC, schema, RLS, or migration changes.
- Pagination, caching-policy, or performance rewrites.
- Mutation/business-logic changes.
- Empty-state or error-state redesigns unrelated to loading.
- Replacing small button/action spinners.

## Acceptance criteria

- [x] One reusable, accessible skeleton system exists.
- [x] `/dashboard/transactions` uses the analytics pilot.
- [x] `/dashboard/menu/items` uses the catalog pilot.
- [ ] Every Priority 1 route is audited and its decision is recorded.
- [ ] Every Priority 1 route with a visible initial wait uses an appropriate
      page- or section-shaped skeleton.
- [ ] Priority 2 merchant routes and listed HQ routes are audited and converted
      where needed.
- [ ] The five confirmed HQ legacy `PageLoader` routes no longer use the generic
      centered spinner unless a documented exception is approved.
- [ ] Filter, pagination, focus-refetch, and manual-refresh actions preserve
      visible cached data.
- [ ] Existing empty and error states remain reachable and do not overlap the
      loading state.
- [ ] Disabled/optional queries cannot leave a route permanently skeletonized.
- [ ] Mutation controls retain local progress feedback and cannot be double
      submitted.
- [ ] All converted routes pass desktop, tablet, and 360px phone QA without
      horizontal overflow.
- [ ] All converted loaders expose meaningful assistive status and stop pulsing
      under reduced motion.
- [ ] Targeted automated tests cover initial loading, cached background refetch,
      and loader accessibility attributes.
- [ ] No package, lockfile, database, or POS changes are included.

## QA evidence matrix

| Recording | Required proof |
| --- | --- |
| 1 - pilot analytics | Slow 3G hard refresh on `/dashboard/transactions`; stable analytics skeleton; content replacement; date refetch keeps existing content. |
| 2 - pilot catalog | Slow 3G hard refresh on `/dashboard/menu/items`; catalog skeleton covers all required dependencies; content replaces it without layout jump. |
| 3 - merchant rollout | Representative table, report, detail, and settings routes at desktop, tablet, and 360px widths. |
| 4 - HQ rollout | A legacy `PageLoader` route before and after conversion, including success and error behavior. |
| 5 - accessibility | Screen-reader loading announcement and reduced-motion behavior on at least one merchant and one HQ route. |

## Verification procedure

1. Open Chrome DevTools, select **Slow 3G**, and enable **Disable cache**.
2. Hard-refresh the route and capture the first-load skeleton.
3. Confirm the skeleton resembles the final structure and produces no horizontal
   scroll.
4. Trigger filters, pagination, or refresh after data loads and confirm existing
   content remains visible.
5. Test an empty result and a failed request; confirm only the correct state is
   shown.
6. Repeat at desktop, tablet, and 360px phone widths.
7. Enable reduced motion and verify the layout remains visible without pulse.

## Definition of Done

- [ ] All acceptance criteria are checked with route-by-route evidence.
- [ ] Focused lint, loader tests, and the production build pass.
- [ ] Haidar documents every converted route and any approved exceptions.
- [ ] A reviewer other than Haidar records the pilot and representative rollout
      QA.
- [ ] Ali Dika verifies merchant and HQ loading behavior before Done.

## Pilot files

- `components/dashboard/loading/DataPageSkeleton.tsx`
- `app/dashboard/transactions/page.tsx`
- `app/dashboard/menu/items/page.tsx`
- `docs/tickets/TICKET-2026-08-26-DATA-PAGE-LOADERS-ROLLOUT.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`
