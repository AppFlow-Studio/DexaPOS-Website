# Architecture Overview

This document covers the shared technical infrastructure of the Dexa POS web dashboard, including the tech stack, project structure, authentication, database, state management, and key architectural patterns.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Authentication System](#authentication-system)
- [Database](#database)
- [State Management](#state-management)
- [Server Actions Pattern](#server-actions-pattern)
- [Menu System Architecture](#menu-system-architecture)
- [Offline-Ready Design](#offline-ready-design)
- [Audit Logging](#audit-logging)
- [Key Types](#key-types)

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js (App Router) | 15.5.9 |
| **Runtime** | React | 19.1.0 |
| **Language** | TypeScript | - |
| **Styling** | Tailwind CSS | 4 |
| **UI Components** | Shadcn/UI (New York style) | - |
| **Icons** | Lucide React, Tabler Icons | - |
| **Backend** | Supabase (PostgreSQL, RLS, Edge Functions) | 2.75.0 |
| **Auth** | Clerk | 6.33.3 |
| **Server State** | TanStack Query | 5.90.2 |
| **Client State** | Zustand | 5.0.9 |
| **Tables** | TanStack Table | 8.21.3 |
| **Forms** | React Hook Form + Zod | 7.65.0 / 3.25.76 |
| **Charts** | Recharts | 2.15.4 |
| **Animations** | Motion | 12.23.24 |
| **Drag & Drop** | dnd-kit | 6.3.1 |
| **Dates** | date-fns | 4.1.0 |
| **Toasts** | Sonner | 2.0.7 |

---

## Project Structure

```
dexapos-website/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout (Clerk + TanStack providers)
│   ├── dashboard/                    # Merchant dashboard (/dashboard/*)
│   │   ├── layout.tsx                # Merchant layout (sidebar, location indicator)
│   │   ├── page.tsx                  # Dashboard home
│   │   ├── actions/                  # ~43 server action files
│   │   ├── hooks/                    # Location-scoped query hooks
│   │   ├── locations/                # Location pages
│   │   ├── menu/                     # Menu management pages
│   │   ├── orders/                   # Order pages
│   │   ├── staff/                    # Staff pages
│   │   ├── schedules/                # Schedule pages
│   │   ├── tables/                   # Floor plan pages
│   │   ├── reports/                  # Report pages
│   │   ├── settings/                 # Settings pages
│   │   ├── transactions/             # Transaction pages
│   │   ├── customers/                # Customer pages
│   │   ├── discounts/                # Discount pages
│   │   ├── inventory/                # Inventory pages
│   │   ├── online-ordering/          # Online ordering pages
│   │   ├── payments/                 # Payment pages
│   │   └── audit-logs/               # Audit log pages
│   ├── manage/                       # Admin/HQ dashboard (/manage/*)
│   │   ├── layout.tsx                # Admin layout (permission-filtered sidebar)
│   │   ├── page.tsx                  # Admin dashboard home
│   │   ├── actions/                  # Admin server actions
│   │   │   ├── admin-merchant/       # Per-merchant admin actions
│   │   │   └── hq-platform/          # Platform-wide actions
│   │   ├── merchants/                # Merchant management pages
│   │   ├── organizations/            # Carrier management pages
│   │   ├── users/                    # HQ team pages
│   │   ├── roles/                    # Role management pages
│   │   ├── analytics/                # Platform analytics
│   │   ├── transactions/             # Cross-merchant transactions
│   │   └── audit-logs/               # System audit logs
│   ├── sites/                        # Public storefronts (/sites/*)
│   ├── sign-up/                      # Clerk sign-up page
│   ├── sign-in/                      # Clerk sign-in page
│   └── join-organization/            # Org selection page
├── components/                       # Reusable React components
│   ├── ui/                           # Shadcn/UI base components (~43 components)
│   ├── dashboard/                    # Merchant-specific components
│   │   ├── locations/                # Location wizard, detail sheet, tabs
│   │   ├── menu/                     # Menu forms, modifier dialogs
│   │   ├── staff/                    # Staff invite wizard, data table
│   │   └── tables/                   # Floor plan canvas, interactive editing
│   └── manage/                       # Admin-specific components
├── lib/                              # Library utilities
│   ├── supabase/                     # Supabase client setup
│   │   ├── client.ts                 # Public browser client
│   │   ├── server.ts                 # Server-side authenticated client
│   │   ├── service-role.ts           # Service role client (bypasses RLS)
│   │   └── queries/                  # Reusable database queries
│   ├── auth/                         # Auth utilities
│   │   └── admin.ts                  # requireAdminAuth, assertHQPermission
│   ├── hooks/                        # Shared hooks
│   │   └── useAdminAuth.ts           # Client-side admin auth
│   ├── queries/                      # TanStack Query key factories
│   │   └── admin-keys.ts             # Admin query key hierarchy
│   └── utils.ts                      # General utilities (cn, etc.)
├── stores/                           # Zustand state stores
│   ├── location-store.ts             # Location selection and scoping
│   ├── floor-plan-store.ts           # Floor plan editing + real-time sync
│   ├── useScheduleStore.ts           # Staff scheduling state
│   └── useScheduleTemplateStore.ts   # Schedule templates
├── types/                            # TypeScript type definitions
│   ├── admin.ts                      # HQ roles, permissions, auth context
│   ├── menu.ts                       # Menu, item, modifier, price types
│   ├── merchant.ts                   # Merchant summary types
│   ├── merchant_locations.ts         # Location types
│   ├── staff.ts                      # Staff and assignment types
│   ├── audit-log.ts                  # Audit log types
│   └── permissions.ts                # Permission constants
├── utils/                            # Helper utilities
│   └── tanstackquery.tsx             # TanStack Query provider + config
├── supabase/                         # Database
│   └── migrations/                   # SQL migration files
├── database.types.ts                 # Auto-generated Supabase types
├── middleware.ts                     # Clerk middleware + route guards
├── components.json                   # Shadcn/UI config
├── tailwind.config.ts                # Tailwind configuration
├── next.config.ts                    # Next.js configuration
└── tsconfig.json                     # TypeScript configuration
```

---

## Authentication System

### Clerk Middleware

**File:** `middleware.ts`

The middleware handles route-based authentication:

```
Request → Clerk Auth Check
  ├── Public routes (/sign-in, /sign-up, /sites/*) → Allow
  ├── /manage/* → Check if orgId === HQ_ORG_ID
  │     ├── Yes → Allow (admin access)
  │     └── No → Redirect to /dashboard
  ├── /dashboard/* → Check if authenticated
  │     ├── Yes → Allow (merchant access)
  │     └── No → Redirect to /sign-in
  └── No org selected → Redirect to /join-organization
```

**Route Matchers:**
- `isInternalTeamRoutes` — `/manage(.*)`
- `isMerchantRoutes` — `/dashboard(.*)`
- `isStorefrontRoutes` — `/sites(.*)`
- `isOrgSelectionRoute` — `/join-organization(.*)`

### Hybrid Auth System

The platform uses two auth methods for different user types:

| Auth Type | Web Dashboard | POS Tablet | How It Works |
|-----------|:------------:|:----------:|-------------|
| **Clerk Accounts** | Yes | PIN/Badge | Full email+password auth via Clerk; synced to DB |
| **DB-Only Accounts** | No | PIN Only | Stored in `staff` table; no Clerk account |

### Session Flow

1. User authenticates via Clerk (email + password)
2. Clerk issues a session token
3. Server-side: `createServerSupabaseClient()` passes the Clerk token to Supabase
4. Supabase validates the token and applies RLS policies
5. Client-side: `createBrowserSupabaseClient(token)` for direct Supabase calls

### Root Layout Provider Chain

**File:** `app/layout.tsx`

```tsx
<ClerkProvider signInForceRedirectUrl={"/manage"}>
  <html>
    <body>
      <TanstackProvider>
        {children}
        <Toaster position="top-center" richColors closeButton duration={4000} />
      </TanstackProvider>
    </body>
  </html>
</ClerkProvider>
```

---

## Database

### Supabase Setup

Three client types are used depending on the context:

#### 1. Public Browser Client

**File:** `lib/supabase/client.ts`

```typescript
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)
```

- Used for public data (storefronts, public menus)
- No authentication — subject to public RLS policies

#### 2. Server-Authenticated Client

**File:** `lib/supabase/server.ts`

```typescript
export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      async accessToken() {
        return (await auth()).getToken()
      },
    },
  )
}
```

- Used in server actions and server components
- Authenticates via Clerk session token
- Full RLS enforcement — users only see their own data

#### 3. Service Role Client

**File:** `lib/supabase/service-role.ts`

```typescript
export function createServiceRoleClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
```

- **Bypasses all RLS policies** — use with extreme care
- Server-side only (never expose to client)
- Used for privileged operations (admin actions, cross-tenant queries)
- Requires `SUPABASE_SERVICE_ROLE_KEY` environment variable

### Key Database Tables

Based on `database.types.ts` and migration files:

| Table | Purpose |
|-------|---------|
| `merchants` | Merchant organizations |
| `merchant_locations` | Physical locations for merchants |
| `menus` | Menu definitions |
| `menu_categories` | Categories within menus |
| `menu_items` | Individual menu items |
| `category_items` | Item-to-category assignments |
| `modifier_groups` | Modifier group definitions (e.g., "Size") |
| `modifier_items` | Individual modifier options |
| `location_menu_item_overrides` | Location-specific price/availability overrides |
| `location_item_overrides` | Location-level item overrides |
| `location_modifier_group_overrides` | Location modifier group visibility |
| `location_modifier_item_overrides` | Location modifier item overrides |
| `staff_profiles` | POS staff profiles (DB-only accounts) |
| `staff_members` | Staff membership records |
| `orders` | Order records |
| `order_items` / `order_line_items` | Order contents |
| `payments` | Payment records |
| `transactions` | Financial transactions |
| `audit_logs` | Activity audit trail |
| `floor_plans` | Restaurant floor plan definitions |
| `floor_plan_objects` | Tables, walls, objects in floor plans |
| `table_sessions` | Active dining sessions |
| `waitlist` | Waitlist queue |
| `reservations` | Booking records |
| `schedules` | Staff schedules |
| `schedule_shifts` | Individual shift records |
| `devices` | POS devices |
| `stations` | POS stations |
| `payment_terminals` | Payment terminal config |
| `roles` | Role definitions |
| `user_roles` | User-to-role assignments |
| `role_permissions` | Role-to-permission mappings |

### Row Level Security (RLS)

RLS policies enforce the 3-tier hierarchy:

- **Merchant isolation** — Merchants can only access their own data
- **Carrier scope** — Carriers see only their assigned merchants' data
- **HQ access** — HQ staff can access all data (via service role or `is_dexapos_admin()`)

Key RLS helper functions (defined in migrations):

| Function | Purpose |
|----------|---------|
| `current_user_id()` | Get authenticated user's ID from JWT |
| `is_dexapos_admin()` | Check if user belongs to HQ org |
| `hq_has_permission(code)` | Check specific HQ permission |
| `get_my_hq_permissions()` | Get all permissions for current user |
| `get_my_hq_role()` | Get user's highest-level HQ role |

### Key Migrations

| Migration | Purpose |
|-----------|---------|
| `002_merchant_menu_system.sql` | Core menu schema |
| `003_merchant_locations_schema.sql` | Multi-location support |
| `004_menu_item_management.sql` | Items and categories |
| `005_location_menu_and_item.sql` | Location overrides |
| `006_modifier_groups_location_support.sql` | Modifiers with location awareness |
| `009_staff_profiles_and_members_refactor.sql` | Unified staff system |
| `012_floor_and_table_management.sql` | Floor plans and tables |
| `014_hq_permission_functions.sql` | HQ permission RPCs |
| `015_employee_scheduling.sql` | Scheduling system |
| `018_simplified_hq_roles.sql` | HQ role/permission model |
| `supabase_rpc_functions.sql` | Business logic RPC functions |

---

## State Management

### TanStack Query (Server State)

**File:** `utils/tanstackquery.tsx`

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes
      gcTime: 10 * 60 * 1000,           // 10 minutes (garbage collection)
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,             // Refetch if stale
      retry: 1,
      retryDelay: 1000,
    },
  },
})
```

#### Query Key Factory

**File:** `lib/queries/admin-keys.ts`

Hierarchical query key pattern for organized cache management:

```typescript
const adminKeys = {
  all: ['admin'],
  merchants: () => [...adminKeys.all, 'merchants'],
  merchantList: (filters, page) => [...adminKeys.merchants(), 'list', filters, page],
  merchantDetail: (id) => [...adminKeys.merchants(), 'detail', id],
  // Nested keys for menus, items, orders, transactions, etc.
}
```

### Zustand Stores (Client State)

| Store | File | Purpose |
|-------|------|---------|
| **Location Store** | `stores/location-store.ts` | Selected location, location list, persistence to localStorage + cookie |
| **Floor Plan Store** | `stores/floor-plan-store.ts` | Floor plan editing with undo/redo, real-time Supabase subscriptions |
| **Schedule Store** | `stores/useScheduleStore.ts` | Staff scheduling with template support, conflict detection |
| **Schedule Template Store** | `stores/useScheduleTemplateStore.ts` | Reusable shift template management |

#### Location Store Detail

The location store is the most critical client-side state:

```typescript
interface LocationState {
  selectedLocationId: string    // 'all' or UUID
  locations: Location[]
  isLoading: boolean
  isInitialized: boolean
}

// Actions
setSelectedLocation(id)         // Change location + sync cookie + dispatch event
setLocations(locations)         // Update list with validation
validateSelectedLocation()      // Auto-fallback to primary location
initialize()                    // Mark store ready
reset()                         // Clear state
```

**Persistence:** `localStorage` via Zustand `persist` middleware (only `selectedLocationId`)
**Cookie Sync:** Updates `x-location-id` cookie for server-side audit logging
**Event System:** Dispatches `locationChanged` custom DOM event for cross-component sync

---

## Server Actions Pattern

### Naming Conventions

- Located in `app/*/actions/` directories
- Prefixed with capital action verbs: `Get`, `Create`, `Update`, `Delete`, `Log`, `Toggle`
- Examples: `GetMenuWithCategories`, `CreateLocation`, `UpdateMenuItem`, `ToggleLocationActive`, `LogAuditEvent`

### Location-Scoping Pattern

Most server actions accept an optional `locationId` parameter:

```typescript
export async function GetData(clerkOrgId: string, locationId?: string) {
  const supabase = createServerSupabaseClient()

  // Convert 'all' to null for global queries
  const effectiveLocationId = locationId === 'all' ? null : locationId

  if (effectiveLocationId) {
    // Fetch location-specific data (with overrides)
    const { data } = await supabase.rpc('get_data_for_location', {
      p_location_id: effectiveLocationId,
    })
    return data
  } else {
    // Fetch global/merchant-wide data
    const { data } = await supabase
      .from('table')
      .select('*')
      .eq('merchant_id', merchantId)
    return data
  }
}
```

### Effective Price Calculation

When fetching menu items with location context:

1. Fetch global item data (base price)
2. If `locationId` provided, fetch location overrides
3. Merge: override price takes precedence over base price
4. Return "effective" data with both `price` (effective) and `base_price` (original) fields
5. Client displays effective price and shows "overridden" badge when different

---

## Menu System Architecture

### 5-Level Price Cascade

```
Level 1: Base Price
  └── menu_items.price
Level 2: Location Item Override
  └── location_item_overrides.custom_price
Level 3: Category Custom Price
  └── category_items.custom_price
Level 4: Location Category Override
  └── location_category_item_overrides.custom_price
Level 5: Location Menu Item Override
  └── location_menu_item_overrides.custom_price
```

The effective price is resolved by taking the highest applicable override level. Each level can independently set:
- Card price
- Cash price (for dual pricing)
- Availability (show/hide at location)
- Stock tracking mode

### Price Source Tracking

```typescript
type PriceSource =
  | "base"              // Level 1
  | "location_item"     // Level 2
  | "category"          // Level 3
  | "location_category" // Level 4
  | "location_menu"     // Level 5

interface PriceBreakdown {
  level_1_base: number
  level_2_location_item: number | null
  level_2_modifier: number | null
  level_3_category: number | null
  level_4_location_category: number | null
  level_5_location_menu: number | null
}
```

### RPC Functions

Menu data is primarily fetched via Supabase RPC functions for optimal performance:

- `get_menu_with_categories(p_menu_id, p_location_id)` — Full menu tree with categories, items, and location overrides
- Returns denormalized data ready for client consumption

### Menu Sync

When a global menu is created, it's auto-synced to all locations via `SyncMenuToAllLocations`:

```
CreateMenu()
  → Insert into menus table
  → SyncMenuToAllLocations()
    → For each location: create location_menu entry
  → LogAuditEvent()
```

---

## Offline-Ready Design

The POS tablet must work offline, so the database schema prioritizes sync-friendly structures.

### Materialized Views & Sync Tables

- **Flat Views:** Complex relationships (Categories → Items → Modifiers) are pre-joined into flat views
- **Single Fetch:** POS can hydrate its local database from a single endpoint
- **Delta Sync:** All tables include `updated_at` timestamps for efficient delta updates

### Sync Strategy

```
POS Tablet Startup
  1. Check last_sync_timestamp
  2. Fetch all records WHERE updated_at > last_sync_timestamp
  3. Merge into local SQLite database
  4. Update last_sync_timestamp

POS Offline Operation
  1. Write operations queued locally
  2. On reconnect: sync queue uploaded to server
  3. Conflict resolution based on timestamps
```

### Design Principles

- Prefer denormalized views over complex joins
- Every table has `updated_at` for delta sync
- Avoid client-side (tablet) joins where possible
- Pre-compute effective prices server-side

---

## Audit Logging

### LogAuditEvent

**File:** `app/dashboard/actions/audit-logs.ts`

```typescript
export async function LogAuditEvent(params: {
  clerkOrgId?: string
  merchantId?: string
  locationId?: string | null
  action: string                    // Human-readable action description
  actionCategory: string            // "menu", "staff", "location", etc.
  severity?: "info" | "warning" | "critical"
  resourceType?: string             // "menu", "staff_member", "location"
  resourceId?: string               // UUID of the resource
  resourceName?: string             // Display name
  changes?: {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    reason?: string
  }
  metadata?: Record<string, unknown>
}): Promise<{ success?: boolean; logId?: string; error?: string }>
```

### How It Works

1. **Merchant Lookup** — Auto-resolves `merchantId` from `clerkOrgId` if not provided
2. **Location Awareness** — Reads `x-location-id` cookie if `locationId` not passed
3. **User Attribution** — Extracts actor info from Clerk `currentUser()`
4. **Data Sanitization** — Strips technical IDs, UUIDs, and timestamps from stored diffs
5. **Diff Computation** — Computes and stores only changed fields (shallow comparison)

### Audit Categories

`inventory`, `purchase_order`, `expense`, `staff`, `menu`, `settings`, `authentication`, `order`

### Integration Points

Audit logging is called from virtually all mutation server actions:

```typescript
// Example from location creation
export async function CreateLocation(clerkOrgId: string, data: CreateLocationInput) {
  // ... create location ...

  await LogAuditEvent({
    clerkOrgId,
    locationId: newLocation.id,
    action: `Created location "${data.name}"`,
    actionCategory: "location",
    resourceType: "location",
    resourceId: newLocation.id,
    resourceName: data.name,
    changes: { after: data },
  })
}
```

---

## Key Types

### Primary Type Files

| File | Contents |
|------|----------|
| `types/admin.ts` | `HQRoleCode`, `HQPermission`, `HQ_ROLES`, `AdminAuthContext`, `ServerAdminAuth`, invite types |
| `types/menu.ts` | `MenuModifierItem`, `MenuModifierGroup`, `PriceBreakdown`, `PriceSource`, `StockTrackingMode` |
| `types/merchant.ts` | `MerchantSummary`, `LocationSummary` |
| `types/merchant_locations.ts` | `Location` interface with full location properties |
| `types/staff.ts` | `UnifiedStaffMember`, `LocationAssignment` |
| `types/audit-log.ts` | `AuditLog`, `AuditLogFilters`, `AuditCategory`, `AuditSeverity` |
| `types/permissions.ts` | `Permissions` constants, `RolePermissions` mapping |
| `database.types.ts` | Auto-generated Supabase schema types (all tables, views, RPCs) |

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only) | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key | Yes |
| `CLERK_SECRET_KEY` | Clerk secret key | Yes |
| `NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID` | HQ Clerk org ID | Yes |
