# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Start dev server with Turbopack (http://localhost:3000)
npm run build        # Production build with Turbopack
npm run lint         # ESLint
npm run test         # Vitest
npx supabase start   # Start local Supabase (port 54322 for DB, 54321 for API)
npx supabase db diff # Generate migration from local schema changes
```

**Note:** ESLint and TypeScript errors are ignored during builds (`next.config.ts` sets `ignoreDuringBuilds: true` and `ignoreBuildErrors: true`).

## Project Overview

Dexa POS is a multi-tenant Point of Sale ecosystem. This codebase is the **Web Dashboard** (Next.js 15, App Router) used by Merchants, Carriers, and Dexa HQ to manage operations. A separate React Native POS Tablet app consumes the data managed here.

### Business Hierarchy (3-Tier Tenancy)
1. **Dexa HQ (Super Admin)** - Routes: `/manage/*` - Manages carriers, system settings, cross-merchant analytics
2. **Carriers (Resellers)** - Partners who onboard merchants
3. **Merchants (End Users)** - Routes: `/dashboard/*` - Restaurants/retailers managing stores, menus, staff
4. **Storefronts (Public)** - Routes: `/sites/*` - Public online ordering pages

## Tech Stack

- **Framework:** Next.js 15 (App Router, Turbopack), React 19
- **Styling:** Tailwind CSS 4, Shadcn/UI (components in `components/ui/`)
- **Backend:** Supabase (PostgreSQL, RLS, Edge Functions, RPCs)
- **Auth:** Clerk (web session management) + custom DB auth (POS staff PIN login)
- **Server State:** TanStack Query v5 (React Query)
- **Client State:** Zustand v5 (persisted stores)
- **Forms:** React Hook Form + Zod validation
- **Path alias:** `@/*` maps to project root

## Architecture

### Routing & Middleware
- `middleware.ts` uses Clerk middleware to:
  - Redirect unauthenticated users
  - Require org selection (`/join-organization`)
  - Route HQ team members to `/manage`, merchants to `/dashboard`
  - HQ team identified by `DEXA_POS_INTERNAL_TEAM_ID` env var

### Server Actions (Primary Data Layer)
All data mutations and most queries use Next.js Server Actions (not API routes). Located in:
- `app/dashboard/actions/` - Merchant dashboard actions (~50 files)
- `app/manage/actions/` - HQ admin actions

**Pattern:**
```typescript
"use server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

export async function DoSomething(clerkOrgId: string, locationId?: string) {
  const supabase = createServerSupabaseClient();
  // 1. Look up merchant: .from("merchants").select("id").eq("clerk_org_id", clerkOrgId).single()
  // 2. Perform operation
  // 3. LogAuditEvent({ merchantId, action, actionCategory, ... })
  // 4. Return { data?, error? }
}
```

### Supabase Clients
Three client types in `lib/supabase/`:
- **`server.ts`** → `createServerSupabaseClient()` - Server actions, authenticated via Clerk token
- **`client.ts`** → `createBrowserSupabaseClient(token)` - Client-side authenticated queries
- **`service-role.ts`** → `createServiceRoleClient()` - Bypasses RLS, server-only elevated operations

### Location Scoping (Critical Pattern)
Data views are contextual based on the selected location. The Zustand store (`stores/location-store.ts`) tracks:
- `selectedLocationId`: `'all'` (merchant-wide) or a UUID (specific location)
- Persisted to localStorage and synced to a `x-location-id` cookie for server-side access

**Key hooks in `app/dashboard/hooks/useLocationScoped.ts`:**
- `useLocationScopedMenus()`, `useLocationScopedMenuItems()`, etc.
- `useClerkOrgId()` - Gets Clerk org ID from user info
- `useIsAllLocations()` - Whether viewing all locations
- `useSelectedLocation()` - Current location object

**React Query conventions:**
- Query keys: `["resource-name", clerkOrgId, locationId, "scoped"]`
- `enabled: !!clerkOrgId` (wait for auth)
- Mutations call `queryClient.invalidateQueries()` on success
- Toast via `sonner` on success/error

### HQ Admin Permissions
- `lib/hooks/useAdminPermissions.ts` - Fetches HQ role/permissions via Supabase RPCs
- `lib/queries/admin-keys.ts` - Query key factory for all admin data
- `stores/admin-permissions-store.ts` - Zustand store for HQ role state
- Permission check: `hasPermission('permission.code')`, `isAtLeast(level)`

### User Info
- `useUserInfo()` hook (in `app/manage/hooks/useUserInfo..ts` - note the double dot in filename) fetches current user data
- Used across both `/manage` and `/dashboard` layouts
- Returns org info, merchant info, role, avatar, etc.

## Database

### Schema & Migrations
- `schema.sql` - Full database schema (~2300 lines)
- `database.types.ts` - Auto-generated Supabase types (~12800 lines)
- `supabase/migrations/` - Ordered migration files
- `supabase/functions/` - Edge functions (clerk-webhooks, orderout-menu-webhook)

### Offline-Ready Design
The POS tablet must run offline, so the database schema is designed for efficient sync:
- Tables must have `updated_at` timestamps for delta sync
- Use `update_updated_at_column()` trigger function (already exists) for new tables
- Prefer flat, denormalized views over complex joins

### RLS & Auth Functions
- `is_merchant_admin(merchant_id)` - Admin access check
- `is_location_member(location_id)` - Location member check
- `user_has_location_permission(location_id, 'permission.code')` - Permission-based check
- `current_user_id()`, `is_merchant_owner()`, `get_location_role()`
- Enable RLS on all new tables

### Audit Logging
All mutations must call `LogAuditEvent()` from `app/dashboard/actions/audit-logs.ts`:
```typescript
await LogAuditEvent({
  clerkOrgId,
  locationId,
  action: "created_item",
  actionCategory: "menu",
  severity: "info",
  resourceType: "menu_item",
  resourceId: item.id,
  resourceName: item.name,
  changes: { before: oldData, after: newData },
});
```

### FK & Constraint Patterns
- `ON DELETE CASCADE` for parent relationships
- `ON DELETE SET NULL` for optional references
- Handle unique constraint violations with error code `23505`

## Key Zustand Stores

| Store | File | Purpose |
|-------|------|---------|
| Location | `stores/location-store.ts` | Dashboard location scoping (persisted) |
| Floor Plan | `stores/floor-plan-store.ts` | Table/floor plan editor state |
| Schedule | `stores/useScheduleStore.ts` | Employee scheduling state |
| Admin Perms | `stores/admin-permissions-store.ts` | HQ admin role/permissions |

## Navigation
- Merchant sidebar nav: defined in `app/dashboard/layout.tsx` (`navMain` array)
- HQ admin nav: defined in `app/manage/layout.tsx`
- Icons from `lucide-react`
- Sidebar uses Shadcn `SidebarMenuSubItem > SidebarMenuSubButton` pattern

## Environment Variables
Required (check `.env`):
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DEXA_POS_INTERNAL_TEAM_ID` / `NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID`
- Clerk keys (via `@clerk/nextjs`)

## Item Pricing Cascade
Menu items support a 5-level price override cascade:
1. **L1 (Global)** - Base item price
2. **L2 (Location)** - `location_item_overrides`
3. **L3 (Category)** - Category-level pricing
4. **L4 (Location+Category)** - Location-specific category pricing
5. **L5 (Location+Menu+Category)** - Most specific override


## Workflow Orchestration
## 1. Plan Mode Default
• Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
• If something goes sideways, STOP and re-plan immediately - don't keep pushing
• Use plan mode for verification steps, not just building
• Write detailed specs upfront to reduce ambiguity
## 2. Subagent Strategy
• Use subagents liberally to keep main context window clean
• Offload research, exploration, and parallel analysis to subagents
• For complex problems, throw more compute at it via subagents
• One task per subagent for focused execution
## 3. Self-Improvement Loop
• After ANY correction from the user: update tasks/lessons.md with the pattern
• Write rules for yourself that prevent the same mistake
• Ruthlessly iterate on these lessons until mistake rate drops
• Review lessons at session start for relevant project
## 4. Verification Before Done
• Never mark a task complete without proving it works
• Diff behavior between main and your changes when relevant
• Ask yourself: "Would a staff engineer approve this?"
• Run tests, check logs, demonstrate correctness
## 5. Demand Elegance (Balanced)
• For non-trivial changes: pause and ask "is there a more elegant way?"
• If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
• Skip this for simple, obvious fixes - don't over-engineer
• Challenge your own work before presenting it
## 6. Autonomous Bug Fixing
• When given a bug report: just fix it. Don't ask for hand-holding
• Point at logs, errors, failing tests - then resolve them
• Zero context switching required from the user
• Go fix failing Cl tests without being told how
##  Task Management
1. Plan First: Write plan to tasks/todo. md with checkable items
2. Verify Plan: Check in before starting implementation
3. Track Progress: Mark items complete as you go
4. Explain Changes: High-level summary at each step
5. Document Results: Add review section to tasks/todo.md
6. Capture Lessons: Update tasks/lessons. md after corrections
##  Core Principles
• Simplicity First: Make every change as simple as possible. Impact minimal code.
• No Laziness: Find root causes. No temporary fixes. Senior developer standards.
• Minimal Impact: Changes should only touch what's necessary. Avoid introducing bugs.