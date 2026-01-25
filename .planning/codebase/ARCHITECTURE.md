# Architecture

**Analysis Date:** 2026-01-25

## Pattern Overview

**Overall:** Next.js App Router with hybrid server/client architecture, multi-tenant context-driven data access, location-scoped state management.

**Key Characteristics:**
- Server Actions for all mutations and secure data operations
- Client-side state via TanStack Query (remote) + Zustand (UI state)
- Multi-level tenancy: HQ > Carrier > Merchant > Location
- Location-scoped data views with client-side overrides support
- RLS (Row Level Security) enforced at Supabase layer
- Middleware-based role-based routing
- Three distinct application contexts routable from root layout

## Layers

**Layout & Routing Layer:**
- Purpose: Multi-context entry points with role-based redirection
- Location: `middleware.ts`, `app/layout.tsx`
- Contains: Route matchers, context detection, page structure
- Depends on: Clerk auth, environment config
- Used by: All downstream routes

**Context-Specific Layouts:**
- Purpose: Dashboard shell with navigation, location scoping, authentication state
- Location: `app/dashboard/layout.tsx` (Merchant), `app/manage/layout.tsx` (HQ)
- Contains: Sidebar navigation, location selector, header with auth controls
- Depends on: Zustand stores, Clerk session, dashboard hooks
- Used by: All pages within that context

**Page Layer (Route Handlers):**
- Purpose: Define UI entry points for features
- Location: `app/dashboard/**/page.tsx`, `app/manage/**/page.tsx`
- Contains: Layout composition, feature component integration
- Depends on: Custom hooks, server actions, components
- Used by: Browser routing

**Server Action Layer:**
- Purpose: Secure server-side data mutations and fetches enforcing RLS
- Location: `app/dashboard/actions/*.ts`, `app/manage/actions/*.ts`, `app/sites/actions.ts`
- Contains: Server functions marked with `"use server"`, Supabase queries
- Depends on: `lib/supabase/server.ts`, types, environment
- Used by: Client components via queries/mutations, direct invocation from pages

**Data Query Layer:**
- Purpose: Fetch and cache remote state via TanStack Query
- Location: `app/dashboard/hooks/use*.ts`, `app/manage/hooks/use*.ts`, `lib/queries/use-*.ts`
- Contains: useQuery/useMutation definitions, query key patterns
- Depends on: Server actions, TanStack Query, Zustand stores
- Used by: Page and component layers

**Client State Layer:**
- Purpose: Manage UI/location-scoped client state across the app
- Location: `stores/*.ts` (Zustand), context hooks
- Contains: Location selection, floor plan state, schedule templates
- Depends on: localStorage, custom events
- Used by: Hooks, components, layout

**Component Layer:**
- Purpose: UI elements and feature-specific compositions
- Location: `components/dashboard/*`, `components/admin/*`, `components/ui/*`
- Contains: React components (client or server), forms, tables, dialogs
- Depends on: Hooks, Zustand stores, shadcn/ui primitives
- Used by: Pages

**Type Layer:**
- Purpose: TypeScript definitions for database models and domain entities
- Location: `types/*.ts`
- Contains: Database model extensions, union types, enums
- Depends on: Nothing (foundational)
- Used by: All layers

**Utility & Library Layer:**
- Purpose: Reusable helpers and utilities
- Location: `lib/`, `utils/`, `lib/supabase/`
- Contains: Supabase client factories, validation helpers, hooks
- Depends on: External packages, environment
- Used by: All layers

## Data Flow

**Read Flow (Server Action → Client):**

1. Page/Component calls `useQuery()` hook
2. Hook triggers server action with query key
3. Server action creates authenticated Supabase client
4. Supabase query executed with RLS enforced
5. Result cached in TanStack Query
6. UI re-renders with fresh data

**Write Flow (Client → Server Action → Supabase):**

1. User interaction triggers mutation
2. Component calls `useMutation()` hook
3. Mutation invokes server action with new data
4. Server action validates input (Zod if applicable)
5. Server action calls Supabase with auth context
6. RLS policies evaluated server-side
7. On success: `queryClient.invalidateQueries()` refetch affected data
8. Toast notification to user
9. UI updates via revalidatePath or query invalidation

**Location-Scoped Data Flow:**

1. User selects location in header (LocationIndicator component)
2. Selection stored in Zustand: `useLocationStore().setSelectedLocation(id)`
3. Persisted to `localStorage` and `x-location-id` cookie
4. Location-scoped hooks read from store via `useSelectedLocation()`
5. Server actions receive `locationId` parameter
6. Queries filter data at Supabase layer (with location overrides merged)
7. "All Locations" view (`selectedLocationId === 'all'`) returns merchant-wide aggregates

**State Management:**

**Remote State (TanStack Query):**
- Server state from Supabase
- Query keys: `[resource, scoping_ids..., 'scoped']` for location-aware queries
- Stale time: 5-10 minutes, no window focus refetch
- Auto-invalidation on mutations

**Local UI State (Zustand):**
- Location selection (core state)
- Floor plan drawing state
- Schedule templates
- Persisted via localStorage

**Server State (Supabase):**
- All domain data: menus, items, locations, staff, orders
- RLS policies control visibility per user/org/location
- Audit tables track all mutations

## Key Abstractions

**Location Scoping Pattern:**
- Purpose: Isolate data views by merchant location with fallback to global
- Examples: `useLocationScopedMenus()`, `useLocationScopedMenuItems()`, `useMenuItemWithLocationContext()`
- Pattern: Hook reads `selectedLocationId` from store, passes to server action, which returns location-specific data merged with overrides

**Multi-Tenant Isolation:**
- Purpose: Enforce Clerk org-based data boundaries
- Examples: `app/dashboard` for merchants, `app/manage` for HQ
- Pattern: Middleware routes based on `org_id`, server actions filter by `merchant_id` or `organization_id`

**Override/Effective Value Pattern:**
- Purpose: Support global + location-specific settings (e.g., menu prices)
- Examples: Base menu item price + location override = effective price
- Pattern: Query returns base data, merges location overrides, returns "effective" value

**Server Action as Gateway:**
- Purpose: Single RLS-enforced entry point for all mutations
- Examples: `SaveOnlineOrderingSettings()`, `UpsertLocationMenuItemOverride()`
- Pattern: Always returns `{ success, error }` tuple, validates auth context in middleware layer

**Permission-Based UI Rendering:**
- Purpose: Hide/show features based on admin permissions
- Examples: `canViewMerchants`, `canManageTeam` (from `useAdminAuth()`)
- Pattern: HQ permissions fetched via RPC, mapped to boolean helpers

## Entry Points

**Root Layout:**
- Location: `app/layout.tsx`
- Triggers: Page load
- Responsibilities: Clerk provider, TanStack provider, toast provider

**Middleware:**
- Location: `middleware.ts`
- Triggers: All route transitions
- Responsibilities: Detect user role, route to `/manage` (HQ) or `/dashboard` (Merchant), guard access

**Dashboard Layout (Merchant):**
- Location: `app/dashboard/layout.tsx`
- Triggers: Navigation to `/dashboard/*`
- Responsibilities: Load locations, initialize location store, render sidebar, location selector

**Manage Layout (HQ):**
- Location: `app/manage/layout.tsx`
- Triggers: Navigation to `/manage/*`
- Responsibilities: Fetch admin role/permissions, render HQ sidebar, guard admin routes

**Feature Pages:**
- Location: `app/dashboard/**/page.tsx` (e.g., `/dashboard/menu/page.tsx`)
- Triggers: Route navigation
- Responsibilities: Compose feature UI, call hooks, pass data to components

## Error Handling

**Strategy:** Centralized error collection with user feedback via toast notifications, server-side logging.

**Patterns:**

**Server Action Errors:**
- Pattern: `{ success: false, error: string }` response tuple
- Example: `SaveOnlineOrderingSettings()` catches Supabase errors and returns `{ error: "Location update failed: ..." }`
- Caught in mutation hook `onError` or mutation result check

**Query Errors:**
- Pattern: TanStack Query `useQuery()` tracks `error` state automatically
- Fallback: Components check `isError` and display skeleton or error UI

**Validation Errors:**
- Pattern: Zod validation (if applicable) returns field-level errors
- Displayed in form components as inline messages

**Supabase RLS Violations:**
- Pattern: Attempts to query/mutate unauthorized data return `PGRST403` error
- Handled: Caught in server action, logged, user sees generic "Access Denied" toast

**Logging:**
- Pattern: `console.error()` for server-side errors with context
- Example: `[GetLocations] Error getting merchant: ...`
- No client-side error tracking (Sentry, etc.) detected

## Cross-Cutting Concerns

**Logging:**
- Console.error for server actions with context prefix
- Pattern: `[FunctionName] Description: error_object`
- No centralized logging detected

**Validation:**
- Zod schemas in `lib/validations/` if present
- Server actions validate input before mutation
- RLS policies enforce final validation at DB layer

**Authentication:**
- Clerk for web authentication (email/password, OAuth)
- Session token passed to Supabase for RLS evaluation
- HQ users also fetch role/permissions via RPC (`get_my_hq_role`, `get_my_hq_permissions`)

**Authorization:**
- Middleware checks Clerk org membership against HQ team ID
- Server actions implicitly RLS-checked via Supabase session
- Admin routes require `useAdminAuth()` with permission checks

**Location Context:**
- Location selection via header dropdown
- Persisted in Zustand store + localStorage
- Passed as parameter to location-aware server actions
- Enables switching views between global and per-location

---

*Architecture analysis: 2026-01-25*
