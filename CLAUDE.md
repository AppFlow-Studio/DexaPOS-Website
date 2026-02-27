# CLAUDE.md

This file provides context and guidance for Claude Code when working on the **Dexa POS Admin Dashboard** repository.

## 1. Project Overview & Scope

Dexa POS is a multi-tenant Point of Sale ecosystem. This codebase primarily handles the **Web Dashboard** (Next.js 15) used by Merchants, Carriers, and Dexa HQ to manage operations.

*Note: While the POS Tablet runs on React Native (separate environment), this web dashboard manages the data structure and API that the POS consumes.*

### Business Hierarchy (3-Tier Model)
The system operates on three distinct levels of tenancy:
1.  **Dexa HQ (Super Admin):** Manages Carriers and system-wide settings.
    * *Route:* `/manage/*`
2.  **Carriers (Resellers):** Partners who resell the POS, onboard merchants, and manage fleets.
3.  **Merchants (End Users):** Restaurants/Retailers managing stores, menus, and staff.
    * *Route:* `/dashboard/*`

## 2. Tech Stack (Web Dashboard)

-   **Framework:** Next.js 15 (App Router), React 19.
-   **Styling:** Tailwind CSS, Shadcn/UI.
-   **Backend:** Supabase (PostgreSQL, RLS, Edge Functions).
-   **Auth:** Clerk (Session Management) + Custom DB Auth (for POS users).
-   **State:** TanStack Query (Server state), Zustand (Client state).

## 3. Database Strategy: "Offline-Ready" Design

**CRITICAL ARCHITECTURAL REQUIREMENT:**
Since the POS tablet must run offline, the database schema managed here must be designed for efficient synchronization. We cannot rely on complex joins on the client side (Tablet).

### A. Materialized Views & Sync Tables
When designing tables or writing queries, prioritize structures that are easy to cache:
-   **Use Views/Materialized Views:** Create flat, denormalized views for complex relationships (e.g., `view_menu_full_tree` that joins Categories -> Items -> Modifiers).
-   **Benefit:** The POS can fetch a single endpoint/table to "hydrate" its local database rather than firing 50 different dependent queries.
-   **Sync Efficiency:** Ensure tables have `updated_at` timestamps so the POS can perform delta updates (fetching only what changed since the last sync).

### B. Row Level Security (RLS)
-   Strict isolation is mandatory. A "Carrier" user must never see data from another Carrier's merchants.
-   RLS policies must account for the hierarchy: HQ -> Carrier -> Merchant.

## 4. Authentication & RBAC (Hybrid System)

We utilize a **Hybrid Account System** to support different user types.

### Account Types
| Account Type | Role | Auth Method (Web) | Auth Method (POS) | Storage |
| :--- | :--- | :--- | :--- | :--- |
| **Clerk Accounts** | Owner, Admin, Manager | Email + Password | PIN or Badge | Clerk + DB (Sync) |
| **DB-Only Accounts** | Shift Mgr, Cashier, Staff | *No Access* | PIN Only | Supabase `staff` table |

*Note: The Web Dashboard is primarily accessed by Clerk Accounts. However, the Dashboard must provide UI to create and manage DB-Only accounts (e.g., "Create New Cashier").*

## 5. Web Architecture & Patterns

### Multi-Location Scoping
**Critical Pattern:** Data views are contextual based on the `location-store`.
1.  **Global View:** `selectedLocationId === 'all'` (Merchant-wide settings).
2.  **Location View:** `selectedLocationId === UUID` (Location-specific overrides).

**Implementation:**
-   **Hooks:** `useLocationScopedMenus()`, `useLocationScopedMenuItems()`.
-   **Logic:** Queries must always return the **Effective Price** (Base Price + Location Override).
-   **Server Actions:** Actions typically accept an optional `locationId`. If present, apply logic to fetch/write to `location_menu_item_overrides`.

### Server Actions Pattern
```typescript
// server-action.ts
export async function GetData(orgId: string, locationId?: string) {
  // 1. Fetch Global Data
  // 2. If locationId provided, Fetch Overrides
  // 3. Merge and return "Effective" data object
}