# Codebase Concerns

**Analysis Date:** 2026-01-25

## Tech Debt

**Extensive Console.log statements in production code:**
- Issue: 746+ console.log, console.error, and console.warn statements scattered throughout app code, many marked as DEBUG statements
- Files: `app/dashboard/menu/ScheduleFormSheet.tsx`, `app/sites/actions.ts`, `app/dashboard/actions/schedules.ts`, and dozens of others
- Impact: Pollutes browser console, impacts performance in production, leaks implementation details
- Fix approach: Implement structured logging utility with levels (DEBUG, INFO, ERROR); use environment variables to enable debug logging only in development; remove all DEBUG prefixed logs

**Unresolved TODO comments scattered across codebase:**
- Issue: 15+ TODO/FIXME comments indicating incomplete features and architectural decisions
- Files:
  - `components/dashboard/staff/InviteUserWizard.tsx` (line 719): Role selection needs pruning
  - `supabase/functions/clerk-webhooks/index.ts` (lines 4, 6, 527): Missing metadata synchronization and admin logic
  - `app/dashboard/menu/[menuId]/page.tsx` (lines 924-926): Location-specific menu editing not fully implemented
  - `app/dashboard/actions/location-menus.ts` (lines 143, 145, 225): Database triggers for automatic sync not implemented
  - `components/dashboard/locations/tabs/SettingsTab.tsx`: Tax rate configuration missing
  - `app/dashboard/menu/items/page.tsx`: Items detailed page incomplete
  - `app/sites/components/OrdersPanel.tsx` (line 22): Order tracking system not integrated
- Impact: Features may not work as intended; inconsistent experience across features
- Fix approach: Create a tracking ticket for each TODO; prioritize by feature area; establish enforcement that all TODOs must reference a ticket number

**TypeScript type bypasses with `any` casts:**
- Issue: 30+ instances of `any` type annotations and `as any` casts
- Files: `app/manage/organizations/create-organization/page.tsx`, `app/dashboard/schedules/templates/create/page.tsx`, `app/dashboard/actions/menu-items.ts`, `app/dashboard/actions/categories.ts`, and form rendering code
- Impact: Loss of type safety; potential runtime errors; harder to refactor
- Fix approach: Replace `any` with proper types; use Zod schemas for form field validation; extract reusable form field components with proper typing

## Known Bugs

**Location schedule override logic potentially incorrect:**
- Symptoms: When viewing location-specific schedules, merging of overrides may not properly handle all edge cases
- Files: `app/dashboard/actions/schedules.ts` (lines 57-70)
- Trigger: When a schedule has location overrides and is viewed from location-specific view
- Workaround: Use global view to see actual schedule; override logic is secondary
- Impact: Location-specific schedule visibility might show stale or incorrect data

**Middleware authentication redirect loop risk:**
- Symptoms: User may not be properly redirected to appropriate dashboard
- Files: `middleware.ts` (lines 17-34)
- Cause: Simple string comparison for org ID without fallback; if DEXA_POS_INTERNAL_TEAM_ID env var is misconfigured, redirect logic breaks
- Trigger: Environment misconfiguration or Clerk org ID mismatch
- Workaround: Verify DEXA_POS_INTERNAL_TEAM_ID env var is set correctly
- Fix approach: Add null checks and logging; implement fallback to /dashboard

**Location store rehydration race condition:**
- Symptoms: Selected location may reset on page load if locations haven't loaded yet
- Files: `stores/location-store.ts` (lines 101-127)
- Cause: `validateSelectedLocation` called in `onRehydrateStorage` before locations are fetched; if selected location was persisted but locations array is empty, validation fails
- Trigger: Fast page reload with location already selected
- Workaround: Reload page again to restore selection
- Impact: User loses location context on page refresh

## Security Considerations

**RLS policies not enforced on all queries:**
- Risk: Some server actions may bypass Row Level Security if not properly checking merchant_id ownership
- Files: Multiple action files - `app/dashboard/actions/menu-items.ts`, `app/dashboard/actions/inventory.ts`, `app/dashboard/actions/schedules.ts`
- Current mitigation: `assertMerchantPermission` checks used in 97 places; some queries don't verify ownership before returning data
- Vulnerability: If permission check is missing or bypassed, unauthorized data access possible
- Recommendations:
  - Add RLS policies at database level as defense-in-depth
  - Use `createServiceRoleClient` only in webhook handlers; prefer regular client for user actions
  - Audit all `supabase.from()` calls to ensure merchant_id filtering

**Clerk webhook handler missing org_id validation:**
- Risk: Organization creation/update webhook could be exploited to create unintended org metadata
- Files: `supabase/functions/clerk-webhooks/index.ts` (line 146)
- Issue: `event.data.public_metadata.org_type` is used without validation that metadata came from authorized source
- Current mitigation: Webhook signature verified but metadata is trusted as-is
- Recommendations: Validate org_type is one of expected values (carrier, merchant, hq); restrict who can set public_metadata

**Service Role Key used in webhook handler:**
- Risk: Service role key provides unrestricted database access
- Files: `supabase/functions/clerk-webhooks/index.ts` (line 24)
- Current mitigation: Only used in Edge Function (server-side only)
- Issue: If webhook endpoint is compromised, full database access is exposed
- Recommendations: Implement request signature verification; use limited-scope keys; add audit logging for all webhook operations

**Environment variable management:**
- Risk: DEXA_POS_INTERNAL_TEAM_ID and other config vars not validated at startup
- Files: `middleware.ts` (line 18), multiple config locations
- Issue: No verification that required env vars are set; undefined values silently fail
- Recommendations: Add environment validation schema at app startup; log missing vars clearly; fail fast on config errors

**Location store uses localStorage for tenant context:**
- Risk: Client-side storage of location preference could be manipulated
- Files: `stores/location-store.ts` (lines 110-111)
- Issue: Selected location persisted to localStorage; user could manually modify to access another location's data
- Current mitigation: Server-side permission checks should prevent unauthorized data access
- Recommendations: Validate location ownership server-side on every query; don't trust client-side location selection for authorization

## Performance Bottlenecks

**N+1 query pattern in schedule fetching:**
- Problem: Getting schedules fetches all data, then for location-specific view, makes additional query for overrides
- Files: `app/dashboard/actions/schedules.ts` (lines 57-70)
- Cause: Separate queries for schedules and overrides; loop through data to merge
- Improvement path: Use single database query with left join to fetch schedules and overrides together; materialize as view

**Merchant lookup on every server action:**
- Problem: Every action function retrieves merchant ID from clerk_org_id with separate query
- Files: Repeated pattern in `app/dashboard/actions/menu-items.ts`, `app/dashboard/actions/inventory.ts`, `app/dashboard/actions/schedules.ts`
- Impact: High volume of repeated queries; slows down actions significantly
- Improvement path: Cache merchant context in request scope or session; create a utility that returns merchant ID with single lookup per request

**Category and menu item fetching without pagination:**
- Problem: GetMenuItems and GetCategoriesWithItems fetch all records without limit
- Files: `app/dashboard/actions/menu-items.ts` (lines 32-98), related category functions
- Impact: Large merchants with thousands of items will load entire dataset into memory; slow page loads
- Improvement path: Implement cursor-based pagination; add search filtering; fetch items on-demand

**Location validation on every store update:**
- Problem: Each location change triggers validation loop through locations array
- Files: `stores/location-store.ts` (lines 52-70)
- Impact: With many locations, causes performance lag in UI
- Improvement path: Use Map for O(1) lookup; validate only when locations list changes structure

**Console logging performance impact:**
- Problem: 746+ console.log calls execute even in production, some with complex object serialization
- Files: Throughout codebase
- Impact: In browser with many debug statements, console operations can slow rendering
- Fix approach: Strip debug logs in production build; use lazy evaluation for expensive logs

## Fragile Areas

**Large page components with mixed concerns:**
- Files:
  - `app/dashboard/menu/[menuId]/page.tsx` (1229 lines): Menu editing, categories, items, schedules, settings all in one component
  - `app/dashboard/menu/items/page.tsx` (1797 lines): Item list, creation, editing, inventory
  - `app/dashboard/menu/categories/page.tsx` (1686 lines): Category list and management
  - `app/manage/actions/admin-merchant/menus.ts` (2050 lines): Large action file with complex type definitions
- Why fragile: Hard to test in isolation; side effects spread across many hooks; refactoring risks breaking unrelated functionality; state management scattered
- Safe modification:
  - Extract components into separate files before modifying
  - Add unit tests for isolated functions before refactoring
  - Use Zustand for shared state instead of prop drilling
- Test coverage: Limited test coverage for complex page logic; no integration tests for menu editing flows

**Complex location-scoped menu price cascade:**
- Files: `app/manage/actions/admin-merchant/menus.ts` (types 124-132), action files
- Why fragile: 5-level price override system (base -> location item -> modifier -> category -> location category -> location menu); unclear which level wins; price calculation logic duplicated across files
- Risk: Price calculations inconsistent; merchants see wrong prices; revenue impact
- Safe modification: Create centralized price calculation utility; test with edge cases (all levels set, conflicting overrides, etc.)

**Schedule time slots deletion without cascade validation:**
- Files: `app/dashboard/actions/schedules.ts` (line 1146-1159)
- Why fragile: Deleting schedule time slots without verifying they're not referenced elsewhere
- Risk: Orphaned references; broken schedule assignments
- Safe modification: Add database-level cascade delete or validate references before deletion

**Clerk webhook handler with multiple organization type handlers:**
- Files: `supabase/functions/clerk-webhooks/index.ts` (lines 130-527)
- Why fragile: Long switch statement; different logic for carrier vs merchant vs hq org creation; state mutations in webhook
- Risk: Missing case handlers; logic divergence as features add
- Safe modification: Extract each org type into separate handler function; add enum validation

**Floor plan store with 32KB size:**
- Files: `stores/floor-plan-store.ts`
- Why fragile: Large state object with complex nested structure; potential for state inconsistency
- Risk: Performance issues in components watching store; hard to debug state mutations
- Safe modification: Break into smaller stores per concern (tables, sections, grid); use immer middleware for immutability

## Scaling Limits

**No pagination implemented for list views:**
- Current capacity: Lists work for <100 items; UI becomes sluggish at 500+ items
- Limit: Merchant with 1000+ menu items will see severe performance degradation
- Scaling path: Implement React Table with server-side pagination; add search/filter to reduce dataset; virtualize lists

**localStorage used for location preference state:**
- Current capacity: Works for <10 locations per merchant
- Limit: If merchant has 50+ locations, localStorage lookups and validation become slow
- Scaling path: Move to database-backed location preference; cache in Redis; use IndexedDB for larger data

**Materialized views not created for sync tables:**
- Current capacity: POS tablet sync works with <500 items per location
- Limit: Large merchants with thousands of menu items will have slow sync; complex joins on client
- Scaling path: Create materialized views per location (view_menu_full_tree_location_X); implement efficient delta sync; use CRDT for offline-ready sync

**Audit logging not asynchronous:**
- Current capacity: Audit log writes inline with operations; acceptable for <100 changes/min
- Limit: Peak traffic periods (lunch/dinner rush) will slowdown dashboard
- Scaling path: Queue audit events to background job; batch inserts; separate read/write databases

## Fragility from Database Schema Design

**Location menu overrides stored separately from base menus:**
- Risk: Inconsistent state if override created without verifying base menu exists
- Impact: Orphaned overrides; complex query logic needed to merge data
- Recommendation: Consider denormalization or materialized view to keep data together

## Dependencies at Risk

**@supabase/ssr (0.7.0) and @supabase/supabase-js (2.75.0) version mismatch:**
- Risk: SSR and JS clients may have incompatible behaviors; unclear which version is source of truth
- Impact: Server-side and client-side Supabase operations may diverge
- Migration plan: Consolidate to single client implementation; add integration tests to verify both work together

**Zustand version 5.0.9 with localStorage persistence:**
- Risk: Major version; localStorage serialization could break with data structure changes
- Impact: Users lose persisted state on updates; location selection reset
- Mitigation: Add migration handler in store initialization
- Migration plan: Version the localStorage schema; implement migrate function for major changes

**React 19.1.0 with legacy component patterns:**
- Risk: Still using class components or old hooks patterns; May have issues with concurrent rendering
- Impact: Potential subtle bugs with state updates; increased re-renders
- Recommendation: Audit for class components; convert to functional components; ensure hooks follow rules

**Clerk v6.33.3 with heavy use of public_metadata:**
- Risk: Clerk auth updates may change how metadata is handled
- Impact: Organization sync webhook could break on Clerk updates
- Recommendation: Monitor Clerk changelog; implement metadata validation schema; test webhook on every Clerk update

## Missing Critical Features

**No offline mode for web dashboard:**
- Problem: Dashboard requires constant connectivity; merchant loses access if connection drops
- Blocks: Can't manage operations during outages; can't validate inventory changes offline
- Impact: Operational downtime = lost revenue
- Priority: HIGH - Core business continuity feature

**Tax rate configuration not implemented:**
- Problem: Tax calculation hardcoded or incomplete
- Files: `components/dashboard/locations/tabs/SettingsTab.tsx` (marked TODO)
- Blocks: Can't adjust tax rates per location; incorrect tax calculations
- Impact: Compliance risk; revenue impact from incorrect taxes
- Priority: HIGH - Revenue and compliance critical

**Order tracking integration incomplete:**
- Problem: OrdersPanel shows placeholder; not actually integrated with order system
- Files: `app/sites/components/OrdersPanel.tsx` (line 22)
- Blocks: Merchants can't track order status from web dashboard
- Impact: Poor customer experience; manual workarounds needed
- Priority: MEDIUM - Feature completeness

**PTO (Paid Time Off) support stubbed out:**
- Problem: Scheduling rules reference PTO but it's not implemented
- Files: `lib/scheduling-rules.ts` (line 39)
- Blocks: Can't manage staff time off; scheduling conflicts not detected
- Impact: Staff scheduling conflicts; compliance issues
- Priority: MEDIUM - Staff management

## Test Coverage Gaps

**Untested area: Location-scoped operations:**
- What's not tested: Multi-location price override logic; location menu syncing; location-specific schedule assignment
- Files: `app/dashboard/actions/menu-items.ts`, `app/dashboard/actions/location-menu-overrides.ts`, `app/dashboard/actions/schedules.ts`
- Risk: Price calculations wrong per location; merchants see incorrect data
- Priority: HIGH - Core feature affects revenue

**Untested area: Clerk webhook handlers:**
- What's not tested: User creation/update/deletion flows; organization membership sync; pending invite acceptance
- Files: `supabase/functions/clerk-webhooks/index.ts`
- Risk: User sync failures silent; user loses access; organization membership out of sync
- Priority: HIGH - Authentication critical

**Untested area: Permission validation:**
- What's not tested: assertMerchantPermission, assertHQPermission edge cases; cross-merchant data access attempts
- Files: `lib/admin/auth.ts` and permission check functions
- Risk: Authorization bypass; data leaks to other merchants
- Priority: CRITICAL - Security critical

**Untested area: Inventory and stock tracking:**
- What's not tested: Stock calculations; inventory sync with POS; low stock alerts
- Files: `app/dashboard/inventory/page.tsx`, `app/dashboard/actions/inventory.ts`
- Risk: Inventory counts drift from reality; overselling on POS
- Priority: MEDIUM - Operational impact

**Only one test file in codebase:**
- What's not tested: Complex state management (Zustand stores); page navigation flows; form submissions
- Files: Single file at `tests/orders.test.ts` with incomplete test coverage
- Risk: Regressions introduced without detection; difficult refactoring
- Priority: HIGH - Code quality and maintainability

**No E2E tests:**
- What's not tested: Full user workflows; cross-feature interactions; responsive design
- Risk: UI breaks silently; features work in dev but fail in production
- Priority: MEDIUM - Production stability

## Implementation Debt

**Mixed client/server concerns in page components:**
- Issue: Pages use both 'use client' and server actions; unclear data fetch vs mutation patterns
- Impact: Hard to trace data flow; potential double-renders; confused loading states
- Files: `app/dashboard/menu/[menuId]/page.tsx` and similar large pages
- Fix: Extract server action orchestration layer; use TanStack Query for consistency

**Zustand stores without reset/cleanup:**
- Issue: Floor plan and schedule stores accumulate state across navigation
- Impact: Memory leaks over time; stale state on page revisit
- Files: `stores/floor-plan-store.ts`, `stores/useScheduleStore.ts`
- Fix: Implement cleanup on page unmount; add reset action called on route changes

---

*Concerns audit: 2026-01-25*
