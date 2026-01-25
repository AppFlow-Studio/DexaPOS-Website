# Codebase Structure

**Analysis Date:** 2026-01-25

## Directory Layout

```
dexapos-website/
├── app/                           # Next.js App Router pages and layouts
│   ├── layout.tsx                # Root layout with Clerk + TanStack providers
│   ├── dashboard/                # Merchant dashboard (role: merchant.owner, manager, etc.)
│   │   ├── layout.tsx           # Merchant shell with sidebar & location selector
│   │   ├── hooks/               # Dashboard-specific query hooks
│   │   ├── actions/             # Server actions for merchant operations
│   │   ├── menu/                # Menu management pages
│   │   ├── locations/           # Location management
│   │   ├── staff/               # Staff/user management
│   │   ├── orders/              # Order management & analytics
│   │   ├── reports/             # Reporting pages
│   │   ├── inventory/           # Inventory tracking
│   │   ├── discounts/           # Discount management
│   │   ├── schedules/           # Staff scheduling
│   │   ├── audit-logs/          # Audit log viewer
│   │   ├── online-ordering/     # Online ordering configuration
│   │   ├── customers/           # Customer management
│   │   ├── transactions/        # Transaction history
│   │   ├── settings/            # Merchant settings
│   │   ├── tables/              # Table management
│   │   └── page.tsx             # Dashboard home
│   ├── manage/                   # HQ admin dashboard (role: HQ team members)
│   │   ├── layout.tsx           # HQ shell with admin-specific sidebar
│   │   ├── hooks/               # HQ-specific query hooks
│   │   ├── actions/             # Server actions for HQ operations
│   │   ├── merchants/           # Merchant CRUD & management
│   │   ├── organizations/       # Organization (Carrier) management
│   │   ├── audit-logs/          # System audit logs
│   │   ├── users/               # HQ team member management
│   │   ├── roles-permissions/   # HQ role & permission editor
│   │   ├── transactions/        # Financial/transaction reports
│   │   ├── create-merchant/     # Merchant onboarding
│   │   ├── unauthorized/        # 403 error page
│   │   └── page.tsx             # HQ dashboard home
│   ├── sites/                    # Storefront/online ordering public pages
│   │   ├── actions.ts           # Storefront page server actions
│   │   └── page.tsx             # Storefront pages
│   ├── sign-up/                  # Public sign-up flow
│   ├── join-organization/        # Organization invitation flow
│   ├── office/                   # (Staff terminal / POS?)
│   └── globals.css              # Global Tailwind styles
│
├── components/                    # React components (UI + feature-specific)
│   ├── ui/                       # Shadcn/UI primitives (button, card, sidebar, etc.)
│   ├── dashboard/                # Merchant dashboard feature components
│   ├── admin/                    # HQ admin feature components
│   ├── manage/                   # Manage section components
│   ├── discounts/                # Discount-related components
│   ├── scheduling/               # Staff scheduling components
│   ├── office/                   # Office/staff terminal components
│   └── AuditLogViewer.tsx        # Audit log display component
│
├── app/dashboard/hooks/          # Location: app/dashboard/hooks/
│   ├── useLocations.ts           # Get all merchant locations
│   ├── useMenu.ts                # Get menus
│   ├── useMenuItems.ts           # Get menu items
│   ├── useCategories.ts          # Get menu categories
│   ├── useModifierGroups.ts      # Get modifier groups
│   ├── useLocationScoped.ts      # Location-aware query/mutation hooks (core)
│   ├── useLocationScopedSchedules.ts  # Location-scoped schedules
│   ├── useStaff.ts               # Get staff list
│   ├── useTaxRates.ts            # Get tax rates
│   ├── useAuditLogs.ts           # Get audit logs
│   ├── useItemStock.ts           # Get item stock status
│   ├── useFloorPlan.ts           # Get floor plan
│   ├── useDashboard.ts           # Dashboard analytics data
│   └── use*.ts                   # 20+ other specialized hooks
│
├── app/manage/hooks/             # HQ admin hooks
│   ├── useUserInfo.ts            # Get current user info
│   └── (more as needed)
│
├── app/dashboard/actions/        # Merchant server actions
│   ├── get-locations.ts          # Fetch locations with RLS
│   ├── menus.ts                  # Menu CRUD operations
│   ├── menu-items.ts             # Menu item CRUD
│   ├── menu-items-rpc.ts         # RPC-based menu item queries
│   ├── categories.ts             # Category operations
│   ├── location-menu-overrides.ts # Location-specific price overrides
│   ├── schedules.ts              # Schedule CRUD
│   ├── staff-dashboard.ts        # Staff operations
│   ├── inventory.ts              # Inventory operations
│   ├── customers.ts              # Customer data
│   └── (more for other features)
│
├── lib/                          # Shared libraries and utilities
│   ├── supabase/
│   │   ├── server.ts             # Server Supabase client factory
│   │   ├── client.ts             # Browser Supabase client factory
│   │   ├── service-role.ts       # Service role client (admin operations)
│   │   └── queries/              # Reusable Supabase queries
│   ├── queries/                  # Admin-specific TanStack queries
│   │   ├── use-admin-merchant.ts
│   │   ├── use-admin-staff.ts
│   │   └── use-*.ts
│   ├── hooks/
│   │   ├── useAdminAuth.ts       # HQ auth & permissions
│   │   └── useDebounce.ts        # Debounce utility hook
│   ├── admin/                    # HQ-specific logic
│   ├── storage/                  # Local storage helpers
│   ├── validations/              # Zod schemas
│   ├── scheduling-rules.ts       # Scheduling business logic
│   ├── supabase-orders.ts        # Order-specific queries
│   └── utils.ts                  # Utility functions (e.g., cn())
│
├── stores/                       # Zustand client state stores
│   ├── location-store.ts         # Location selection state (core)
│   ├── floor-plan-store.ts       # Floor plan editor state
│   ├── useScheduleStore.ts       # Schedule editor state
│   └── useScheduleTemplateStore.ts
│
├── types/                        # TypeScript type definitions
│   ├── admin.ts                  # HQ admin types
│   ├── merchant.ts               # Merchant types
│   ├── merchant_locations.ts     # Location types (largest, most detailed)
│   ├── menu.ts                   # Menu & item types
│   ├── staff.ts                  # Staff/user types
│   ├── order-management.ts       # Order types
│   ├── db-modles.ts              # Database model base types
│   ├── analytics.ts              # Analytics/reporting types
│   ├── audit-log.ts              # Audit log types
│   ├── customer.ts               # Customer types
│   ├── discount.ts               # Discount types
│   ├── inventory.ts              # Inventory types
│   ├── schedule.ts               # Schedule types
│   ├── site.ts                   # Storefront/site types
│   ├── tax.ts                    # Tax types
│   ├── user.ts                   # User/identity types
│   ├── permissions.ts            # Permission enums
│   ├── floor-plan.ts             # Floor plan types
│   ├── storefront.ts             # Storefront config
│   └── clerk-metadata.ts         # Clerk custom metadata shape
│
├── utils/                        # Utility functions
│   ├── supabase/                 # Supabase-specific utilities
│   ├── tables/                   # Table column definitions
│   ├── get-user-role.tsx         # Role detection utility
│   ├── exportTimesheets.ts       # Schedule export
│   └── tanstackquery.tsx         # TanStack Query provider setup
│
├── supabase/                     # Supabase project files
│   ├── migrations/               # SQL migrations
│   ├── functions/
│   │   └── clerk-webhooks/       # Clerk webhook handler
│   └── .temp/
│
├── public/                       # Static assets
├── middleware.ts                 # Route protection & redirection logic
├── next.config.ts                # Next.js configuration
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Dependencies
└── .planning/codebase/          # GSD documentation (this file)
```

## Directory Purposes

**`app/`:**
- Purpose: Next.js App Router page structure with nested layouts
- Contains: Three main contexts (dashboard, manage, sites) + authentication flows
- Key files: `layout.tsx` files for context-specific shells

**`app/dashboard/`:**
- Purpose: Merchant-facing dashboard
- Contains: Feature pages (menu, staff, orders, etc.) and their server actions
- Route prefix: `/dashboard/*`
- Auth: Requires non-HQ Clerk org membership

**`app/manage/`:**
- Purpose: HQ admin interface for system-wide operations
- Contains: Merchant management, org management, system audit logs
- Route prefix: `/manage/*`
- Auth: Requires HQ Clerk org membership

**`app/dashboard/hooks/` and `app/manage/hooks/`:**
- Purpose: Centralized query hooks for each context
- Contains: `useQuery`/`useMutation` wrappers around server actions
- Pattern: File-per-domain (e.g., `useMenuItems.ts`, `useLocations.ts`)

**`app/dashboard/actions/` and `app/manage/actions/`:**
- Purpose: Server-side data operations enforcing RLS
- Contains: `"use server"` functions for CRUD and reads
- Pattern: Grouped by domain (menus, staff, schedules, etc.)
- No client-side code; all executed on server with Clerk token

**`lib/supabase/`:**
- Purpose: Supabase client factories and utilities
- Contains: Server client, browser client, service role client
- Key functions: `createServerSupabaseClient()`, `createBrowserSupabaseClient()`

**`lib/queries/` and `lib/hooks/`:**
- Purpose: Shared query hooks and auth utilities
- Contains: Admin-specific TanStack queries, `useAdminAuth()` hook
- Location of: Permission checking, role fetching

**`stores/`:**
- Purpose: Client-side state via Zustand
- Contains: Location selection (persisted), floor plan state, schedule templates
- Persistence: `location-store.ts` persists to localStorage + syncs to cookie

**`types/`:**
- Purpose: TypeScript definitions for all domain entities
- Contains: Database models, API response shapes, union types
- Pattern: One file per domain (merchant, staff, menu, etc.)

**`components/`:**
- Purpose: Reusable React components
- Subdirectories: `ui/` (primitives), `dashboard/`, `admin/`, feature-specific folders
- Pattern: Co-located with their contexts or in `ui/` for shared primitives

**`supabase/`:**
- Purpose: Supabase project metadata
- Contains: SQL migrations, Edge Function code (webhooks)
- Key: `migrations/` defines all database schema

## Key File Locations

**Entry Points:**
- `app/layout.tsx`: Root layout with Clerk provider, TanStack provider
- `middleware.ts`: Route protection and role-based redirection
- `app/dashboard/layout.tsx`: Merchant dashboard layout
- `app/manage/layout.tsx`: HQ admin layout

**Core State Management:**
- `stores/location-store.ts`: Location selection state (Zustand)
- `app/dashboard/hooks/useLocationScoped.ts`: Location-aware queries and mutations

**Core Server Operations:**
- `lib/supabase/server.ts`: Server Supabase client
- `app/dashboard/actions/get-locations.ts`: RLS-enforced location fetch
- `app/dashboard/actions/menus.ts`: Menu CRUD server actions

**Core UI Shells:**
- `app/dashboard/layout.tsx`: Merchant sidebar + location selector
- `app/manage/layout.tsx`: HQ sidebar + permission-based navigation

**Configuration:**
- `middleware.ts`: Route matchers and HQ org detection
- `next.config.ts`: Next.js build config
- `tsconfig.json`: TypeScript paths (imports)

**Hooks (Client-side queries):**
- `app/dashboard/hooks/useLocationScoped.ts`: Master location-aware hooks
- `app/dashboard/hooks/useLocations.ts`: Get user's locations
- `app/dashboard/hooks/useMenuItems.ts`: Get menu items with location scoping
- `lib/hooks/useAdminAuth.ts`: HQ admin permissions

## Naming Conventions

**Files:**
- Pages: `page.tsx` (Next.js convention)
- Layouts: `layout.tsx`
- Server actions: `[feature].ts` or `[action-name].ts` (e.g., `menus.ts`, `staff-dashboard.ts`)
- Custom hooks: `use[Feature].ts` (e.g., `useMenuItems.ts`, `useAdminAuth.ts`)
- Components: PascalCase `[Feature].tsx` or `[Feature][SubFeature].tsx` (e.g., `MenuItemCard.tsx`)
- Zustand stores: `[feature]-store.ts` (e.g., `location-store.ts`)
- Types: `[domain].ts` (e.g., `merchant.ts`, `menu.ts`)

**Directories:**
- Feature folders: kebab-case `[feature]` (e.g., `menu`, `staff`, `audit-logs`)
- Utility folders: lowercase `[category]` (e.g., `hooks`, `actions`, `queries`)

## Where to Add New Code

**New Merchant Feature:**
1. Create page: `app/dashboard/[feature]/page.tsx`
2. Add hook: `app/dashboard/hooks/use[Feature].ts` (calls server action)
3. Add server action: `app/dashboard/actions/[feature].ts`
4. Add component: `components/dashboard/[Feature][Component].tsx`
5. Add types (if needed): `types/[feature].ts`
6. Update sidebar nav in `app/dashboard/layout.tsx`

**New Admin (HQ) Feature:**
1. Create page: `app/manage/[feature]/page.tsx`
2. Add hook: `app/manage/hooks/use[Feature].ts`
3. Add server action: `app/manage/actions/[feature].ts`
4. Add component: `components/admin/[Feature][Component].tsx`
5. Update sidebar nav in `app/manage/layout.tsx`

**New Shared Component:**
- Location: `components/ui/[ComponentName].tsx` (primitives from shadcn/ui)
- Or: `components/[feature]/[ComponentName].tsx` (feature-specific)

**New Query/Hook:**
- Dashboard queries: `app/dashboard/hooks/use[Feature].ts`
- Admin queries: `app/manage/hooks/use[Feature].ts` or `lib/queries/use-admin-[feature].ts`
- Shared utilities: `lib/hooks/[utility].ts`

**New Server Action:**
- Dashboard: `app/dashboard/actions/[feature].ts`
- Admin: `app/manage/actions/[feature].ts`
- Always marked with `"use server"` at top

**New Type Definition:**
- If extends domain model: `types/[domain].ts`
- If completely new domain: Create `types/[new-domain].ts`

## Special Directories

**`node_modules/`:**
- Purpose: Installed npm dependencies
- Generated: Yes
- Committed: No

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No

**`supabase/migrations/`:**
- Purpose: SQL migration files for database schema
- Generated: Via `supabase migration new [name]`
- Committed: Yes
- Note: Migrations are applied in order by version number

**`supabase/functions/`:**
- Purpose: Edge functions (serverless)
- Key: `clerk-webhooks/` handles Clerk user lifecycle events
- Committed: Yes

**`.planning/`:**
- Purpose: GSD (Get Shit Done) planning documents
- Generated: By Claude agents
- Committed: Yes (shared with team)

---

*Structure analysis: 2026-01-25*
