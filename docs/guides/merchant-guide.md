# Merchant Dashboard Guide

This document covers the merchant-facing side of the Dexa POS web dashboard, accessible at `/dashboard/*`. Merchants (restaurants, retailers) use this dashboard to manage their stores, menus, staff, orders, and operations.

---

## Table of Contents

- [Overview](#overview)
- [Authentication & Onboarding](#authentication--onboarding)
- [Dashboard Structure](#dashboard-structure)
- [Multi-Location System](#multi-location-system)
- [Operations](#operations)
  - [Location Management](#location-management)
  - [Menu Management](#menu-management)
  - [Staff Management](#staff-management)
  - [Order Management](#order-management)
  - [Transactions & Analytics](#transactions--analytics)
  - [Online Ordering](#online-ordering)
  - [Customers](#customers)
  - [Discounts](#discounts)
  - [Inventory](#inventory)
  - [Schedules](#schedules)
  - [Tables & Floor Plans](#tables--floor-plans)
  - [Reports](#reports)
  - [Settings](#settings)
  - [Audit Logs](#audit-logs)
- [Key Files Reference](#key-files-reference)

---

## Overview

The Merchant Dashboard is the primary interface for restaurant/retail owners and managers to operate their business through Dexa POS. It supports multi-location businesses with location-specific overrides for menus, pricing, staff, and settings.

### Who Uses It

| Role | Auth Method (Web) | Auth Method (POS) | Dashboard Access |
|------|-------------------|-------------------|------------------|
| **Owner** (`merchant.owner`) | Email + Password (Clerk) | PIN or Badge | Full access, all locations |
| **Admin** (`merchant.admin`) | Email + Password (Clerk) | PIN or Badge | Admin privileges, assigned locations |
| **Manager** | Email + Password (Clerk) | PIN or Badge | Manager privileges at assigned locations |
| **Shift Mgr / Cashier / Staff** | No web access | PIN Only | No dashboard access (POS only) |

---

## Authentication & Onboarding

### Sign-Up Flow

1. Merchant visits `/sign-up` and creates a Clerk account (email + password)
2. Clerk handles email verification and account creation
3. Post-signup, a merchant record is provisioned in Supabase
4. User is redirected to `/dashboard` where they can create their first location

**Key File:** `app/sign-up/page.tsx`

### Login & Routing

- Clerk middleware (`middleware.ts`) validates authentication and routes users
- HQ staff (identified by `DEXA_POS_INTERNAL_TEAM_ID`) are redirected to `/manage`
- Merchant users are routed to `/dashboard`
- Users without an active organization are sent to `/join-organization`

---

## Dashboard Structure

### Route Map

| Route | Description |
|-------|-------------|
| **Operations** | |
| `/dashboard` | Home — KPIs, revenue trends, recent orders, quick links |
| `/dashboard/locations` | Manage all merchant locations |
| `/dashboard/locations/new` | Create a new location (wizard) |
| `/dashboard/orders` | View and filter all orders |
| `/dashboard/orders/[orderId]` | Individual order details |
| `/dashboard/orders/analytics` | Order analytics |
| `/dashboard/orders/reports` | Order reports |
| `/dashboard/tables` | Dine-in table/floor plan management |
| **Menus & Products** | |
| `/dashboard/menu` | List all menus |
| `/dashboard/menu/[menuId]` | Edit a specific menu (categories, items) |
| `/dashboard/menu/items` | Menu items library |
| `/dashboard/menu/items/[itemId]` | Edit a menu item |
| `/dashboard/menu/categories` | Category management |
| `/dashboard/menu/modifiers` | Modifier groups and items |
| `/dashboard/discounts` | Discount/promotion management |
| `/dashboard/discounts/new` | Create a new discount |
| `/dashboard/discounts/[id]` | View discount details |
| `/dashboard/discounts/[id]/edit` | Edit a discount |
| **Management** | |
| `/dashboard/staff` | Staff management (Clerk + DB-only accounts) |
| `/dashboard/staff/timesheets` | Timesheet tracking |
| `/dashboard/schedules` | Staff schedule management |
| `/dashboard/schedules/[scheduleId]` | Edit a schedule |
| `/dashboard/schedules/templates` | Schedule templates |
| `/dashboard/schedules/templates/create` | Create template |
| `/dashboard/schedules/templates/[templateId]` | Edit template |
| `/dashboard/customers` | Customer profiles |
| `/dashboard/inventory` | Inventory/stock management |
| `/dashboard/online-ordering` | Online ordering configuration |
| `/dashboard/audit-logs` | Activity audit trail |
| **Reports** | |
| `/dashboard/reports` | Reports home |
| `/dashboard/reports/financials` | Financial reports |
| `/dashboard/reports/comparison` | Location comparison |
| `/dashboard/reports/sales-by-items` | Item-level sales data |
| `/dashboard/reports/cash-management` | Cash reconciliation |
| `/dashboard/reports/voids` | Void/refund analysis |
| **Financial** | |
| `/dashboard/transactions` | Transaction history |
| `/dashboard/payments` | Payment processing |
| **Settings** | |
| `/dashboard/settings` | General settings |
| `/dashboard/settings/devices` | Device management |
| `/dashboard/settings/devices/[deviceId]` | Device details |
| `/dashboard/settings/stations` | POS station management |
| `/dashboard/settings/stations/[stationId]` | Station configuration |
| `/dashboard/settings/customer-display` | Customer-facing display settings |

### Layout & Navigation

The dashboard layout (`app/dashboard/layout.tsx`) provides:

- **Sidebar** — Collapsible navigation organized into: Operations, Menus & Products, Management, Financial, Settings
- **Location Indicator** — Dropdown to switch between locations or "All Locations" (owner only)
- **Header** — Theme toggle, search, notifications
- **Main Content Area** — Page-specific content

### Dashboard Home Page

The home page (`app/dashboard/page.tsx`) displays:

- **KPI Cards** — Total Revenue (7 days), Orders Today, Team Members/Active Locations, Growth %
- **Revenue Trend Chart** — Time-series revenue visualization
- **Order Type Breakdown** — Distribution across order types
- **Best-Selling Items** — Top items by sales volume
- **Recent Orders Table** — Latest orders with status
- **Quick Links** — Navigation to Menus, Schedules, Locations, Team

---

## Multi-Location System

The multi-location system is a core architectural pattern that scopes all data views based on the selected location.

### How It Works

1. **Location Store** (`stores/location-store.ts`) — Zustand store managing `selectedLocationId`
2. **Two Modes:**
   - `selectedLocationId === 'all'` — Global/merchant-wide view (owner only)
   - `selectedLocationId === UUID` — Location-specific view with overrides
3. **Persistence** — Selected location persists to `localStorage` and syncs to a cookie (`x-location-id`) for server-side audit logging
4. **Validation** — Auto-validates selection on load; falls back to primary location if invalid

### Location Store State

```typescript
// stores/location-store.ts
interface LocationState {
  selectedLocationId: string   // 'all' or UUID
  locations: Location[]        // Cached merchant locations
  isLoading: boolean
  isInitialized: boolean
}
```

### Selector Hooks

| Hook | Returns |
|------|---------|
| `useSelectedLocation()` | Current `Location` object or `null` |
| `useIsAllLocations()` | `true` if `selectedLocationId === 'all'` |
| `useLocationById(id)` | Specific location by UUID |
| `useHasLocations()` | `true` if merchant has any locations |

### Location-Scoped Query Hooks

These hooks automatically scope data to the selected location:

**File:** `app/dashboard/hooks/useLocationScoped.ts`

| Hook | Purpose |
|------|---------|
| `useLocationScopedMenus()` | Menus scoped to selected location |
| `useLocationScopedMenuItems()` | Items with effective prices (global + overrides) |
| `useLocationScopedMenuItemsWithCategories()` | Flat list with category associations |
| `useLocationScopedCategories(menuId?)` | Categories for location |
| `useLocationScopedSchedules()` | Schedules scoped to location |
| `useMenuWithLocationContext(menuId)` | Single menu with location overrides |
| `useMenuItemWithLocationContext(itemId)` | Single item with pricing context |

**File:** `app/dashboard/hooks/useLocationScopedModifiers.ts`

| Hook | Purpose |
|------|---------|
| `useLocationScopedModifierGroups()` | Modifier groups with location overrides |
| `useModifierGroupWithLocationContext(id)` | Single group with overrides |
| `useModifierItemOverrideMutation()` | Update modifier price/visibility/stock at location |
| `useResetModifierItemMutation()` | Reset modifier item to global |
| `useResetModifierGroupMutation()` | Reset group visibility to global |

### Location-Aware Mutations

| Hook | Purpose |
|------|---------|
| `useLocationAwareMenuItemMutation()` | Routes to global update or location override |
| `useLocationMenuItemOverrideMutation()` | Price/availability override at location |
| `useResetToGlobalMutation()` | Remove location override, revert to global |

### Server Action Pattern

Server actions accept an optional `locationId` parameter. When provided, they fetch/write location-specific data:

```typescript
// Example pattern from app/dashboard/actions/menus.ts
export async function GetMenuWithCategories(
  menuId: string,
  locationId?: string | null,
) {
  const supabase = createServerSupabaseClient()
  const location_Id = locationId === 'all' ? null : locationId

  const { data } = await supabase.rpc("get_menu_with_categories", {
    p_menu_id: menuId,
    p_location_id: location_Id || null,
  })
  // Returns data with effective prices (global + overrides merged)
}
```

---

## Operations

### Location Management

**Route:** `/dashboard/locations`
**Actions:** `app/dashboard/actions/locations.ts`

#### Creating a Location

The location creation wizard (`components/dashboard/locations/CreateLocationWizard.tsx`) guides merchants through:

1. **Basic Details** — Name, address, city, state, zip, phone, email
2. **Hours & Timezone** — Business hours, timezone selection
3. **Menu Mode** — Global menu (shared) vs location-specific menu
4. **Pricing Strategy** — Manual, auto percentage, or markup; dual pricing configuration
5. **Review & Create** — Summary and confirmation

#### Location Properties

```typescript
interface Location {
  id: string
  merchant_id: string
  name: string
  code?: string
  phone?: string
  email?: string
  address_line1: string
  city: string
  state: string
  postal_code: string
  timezone: string
  pricing_strategy: "manual" | "auto_percentage" | "markup"
  dual_pricing_percentage: number
  is_active: boolean
  is_accepting_orders: boolean
  business_hours: Record<string, { open: string; close: string }>
  uses_global_menu: boolean
}
```

#### Key Operations

| Action | Description |
|--------|-------------|
| `CreateLocation(clerkOrgId, data)` | Create location with timezone, pricing, hours |
| `UpdateLocation(locationId, data)` | Update with diff-based audit logging |
| `ToggleLocationActive(locationId)` | Enable/disable location |
| `ToggleLocationOrders(locationId)` | Toggle order acceptance |
| `DeleteLocation(locationId)` | Permanent deletion with audit log |

#### Editing Locations

Existing locations are edited via `LocationDetailSheet.tsx` with tabs:

- **Details** — Name, address, contact info
- **Settings** — Pricing strategy, order acceptance
- **Team** — Staff assigned to this location
- **Hours** — Business hours configuration

---

### Menu Management

**Routes:** `/dashboard/menu/*`
**Actions:** `app/dashboard/actions/menus.ts`, `app/dashboard/actions/menu-items.ts`, `app/dashboard/actions/categories.ts`, `app/dashboard/actions/modifier-groups.ts`

#### Menu Hierarchy

```
Merchant
  └── Menus (e.g., "Breakfast Menu", "Dinner Menu")
        └── Categories (e.g., "Appetizers", "Entrees")
              └── Items (e.g., "Caesar Salad", "Steak")
                    └── Modifier Groups (e.g., "Size", "Toppings")
                          └── Modifier Items (e.g., "Small", "Large")
```

#### 5-Level Price Cascade

Prices are resolved through a cascade, where each level can override the previous:

| Level | Source | Table |
|-------|--------|-------|
| L1 | Base Price | `menu_items.price` |
| L2 | Location Item Override | `location_item_overrides.custom_price` |
| L3 | Category Custom Price | `category_items.custom_price` |
| L4 | Location Category Override | `location_category_item_overrides.custom_price` |
| L5 | Location Menu Item Override | `location_menu_item_overrides.custom_price` |

The **effective price** is the highest applicable level. The UI shows an "overridden" badge when a location override is active.

#### Menu Server Actions

| Action | Description |
|--------|-------------|
| `GetMenus(clerkOrgId, locationId?)` | All menus or location-scoped |
| `GetMenuWithCategories(menuId, locationId?)` | Menu + categories + items via RPC |
| `CreateMenu(clerkOrgId, data)` | Create menu, auto-sync to all locations |
| `UpdateMenu(menuId, data, locationId?)` | Update menu properties |
| `UpdateMenusOrder(menuOrders[], locationId?)` | Batch reorder menus |
| `ToggleMenuActive(menuId, locationId?)` | Enable/disable menu |
| `DeleteMenu(menuId, locationId?)` | Delete menu with audit log |

#### Menu Item Server Actions

| Action | Description |
|--------|-------------|
| `GetMenuItems(clerkOrgId, locationId?)` | All items or location-scoped |
| `GetMenuItemWithLocationContext(itemId, locationId?)` | Item with overrides |
| `UpdateMenuItem(itemId, data, locationId?)` | Update globally or at location |
| `UpsertLocationMenuItemOverride(locationId, itemId, data)` | Set location price |
| `DeleteLocationMenuItemOverride(locationId, itemId)` | Remove override |

#### Modifier Groups

Modifiers follow the same global/location override pattern:

| Action | Description |
|--------|-------------|
| `GetModifierGroups(clerkOrgId, locationId?)` | All groups |
| `CreateModifierGroup(clerkOrgId, data)` | Create group |
| `UpsertLocationModifierGroupOverride()` | Location visibility toggle |
| `UpsertLocationModifierItemOverride()` | Modifier item price/visibility/stock |
| `DeleteLocationModifierGroupOverride()` | Reset to global |

---

### Staff Management

**Route:** `/dashboard/staff`
**Actions:** `app/dashboard/actions/staff.ts`, `app/dashboard/actions/unified-staff.ts`
**Hooks:** `app/dashboard/hooks/useStaff.ts`

#### Hybrid Account System

| Account Type | Auth Method | Dashboard Access | POS Access | Storage |
|-------------|-------------|------------------|------------|---------|
| **Clerk Accounts** | Email + Password | Yes | PIN or Badge | Clerk + DB sync |
| **DB-Only Accounts** | PIN only | No | Yes | `staff` table only |

#### Staff Hooks

| Hook | Purpose |
|------|---------|
| `useUnifiedStaff()` | Location-scoped unified view (Clerk + DB-only) |
| `useStaffMember(memberId)` | Single staff member details |
| `useCreatePOSStaff()` | Add POS-only staff with PIN |
| `useCreateClerkUserDirectly()` | Create Clerk user (immediate) |
| `useInviteClerkStaff()` | Send email invitation |
| `useUpdateStaffAssignment()` | Update location/role assignment |
| `useResetStaffPIN()` | Reset or generate new PIN |
| `useDeactivateStaff()` | Deactivate staff member |
| `useReactivateStaff()` | Reactivate staff member |
| `useUpgradePOSToClerk()` | Upgrade POS-only to dashboard access |

#### Inviting Staff

The `InviteUserWizard` component (`components/dashboard/staff/InviteUserWizard.tsx`) handles:

```typescript
interface InviteStaffParams {
  merchantId: string
  email?: string
  phone?: string
  firstName: string
  lastName: string
  roleCode: string
  locationAssignments: {
    locationId: string
    roleCode?: string
    isPrimary?: boolean
    hourlyRate?: number
    pinCode?: string
  }[]
  employmentType: string
  hourlyRate: number
  employeeId: string
  invited_by_user_id: string
}
```

- Routes based on `role.requires_clerk_account` — Clerk invite for dashboard users, DB-only for POS staff
- Supports location assignments with role overrides per location
- Credential toast notifications display PIN/password after creation

#### Timesheets

**Route:** `/dashboard/staff/timesheets`
**Actions:** `app/dashboard/actions/timesheets.ts`

View and manage staff time tracking, clock-in/out records, and hours worked.

---

### Order Management

**Route:** `/dashboard/orders`
**Actions:** `app/dashboard/actions/order.ts`, `app/dashboard/actions/order-analytics.ts`

- **Order List** — View all orders with filtering by status, date, order type
- **Order Details** — Individual order with line items, payment status, customer info
- **Order Analytics** — Trends, breakdowns by type, peak hours
- **Order Reports** — Exportable order data

---

### Transactions & Analytics

**Route:** `/dashboard/transactions`
**Actions:** `app/dashboard/actions/` (various analytics files)

The dashboard home page displays key financial metrics:

- Revenue trends (7-day and custom ranges)
- Order counts and growth percentages
- Best-selling items
- Financial KPIs fetched via RPC for accurate aggregation

---

### Online Ordering

**Route:** `/dashboard/online-ordering`

Configure online ordering per location:

- Enable/disable online store
- Set up online menu availability
- Configure order acceptance settings

---

### Customers

**Route:** `/dashboard/customers`
**Actions:** `app/dashboard/actions/customers.ts`
**Hooks:** `app/dashboard/customers/hooks/`

Manage customer profiles, order history, and contact information.

---

### Discounts

**Routes:** `/dashboard/discounts`, `/dashboard/discounts/new`, `/dashboard/discounts/[id]/edit`
**Actions:** `app/dashboard/actions/discounts.ts`

Create and manage discounts and promotions with:

- Percentage or fixed-amount discounts
- Date range validity
- Menu item/category restrictions
- Active/inactive toggle

---

### Inventory

**Route:** `/dashboard/inventory`
**Actions:** `app/dashboard/actions/inventory.ts`, `app/dashboard/actions/stock.ts`

Track stock levels per location:

- Stock tracking modes: `quantity`, `in_stock`, `out_of_stock`
- Purchase orders (`app/dashboard/actions/purchase-orders.ts`)
- Vendor items (`app/dashboard/actions/vendor-items.ts`)

---

### Schedules

**Routes:** `/dashboard/schedules/*`
**Actions:** `app/dashboard/actions/schedules.ts`
**Store:** `stores/useScheduleStore.ts`

Staff scheduling with:

- Period-based and weekly schedule views
- Shift creation and assignment
- Template system with three application modes:
  - `replace-all` — Overwrite entire schedule
  - `merge` — Overwrite same employee/day, keep others
  - `fill-gaps` — Only add non-conflicting shifts
- Drop requests, swap requests, PTO management
- Open shift assignment
- Conflict detection

---

### Tables & Floor Plans

**Route:** `/dashboard/tables`
**Store:** `stores/floor-plan-store.ts`
**Actions:** `app/dashboard/actions/floor-plan-*.ts`

Interactive floor plan management:

- Drag-and-drop table placement via interactive canvas
- Design mode vs view mode
- Real-time Supabase subscriptions for table sessions, waitlist, reservations
- Undo/redo support (20-action history)
- Batch operations for performance

**Key Components:**
- `components/dashboard/tables/FloorPlanCanvasView.tsx`
- `components/dashboard/tables/RuntimeFloorPlanView.tsx`
- `components/dashboard/tables/InteractiveCanvas.tsx`
- `components/dashboard/tables/TablesSidebar.tsx`

---

### Reports

**Route:** `/dashboard/reports/*`

| Report | Route | Description |
|--------|-------|-------------|
| Financials | `/dashboard/reports/financials` | Revenue, expenses, profit summaries |
| Location Comparison | `/dashboard/reports/comparison` | Side-by-side location performance |
| Sales by Items | `/dashboard/reports/sales-by-items` | Item-level sales data |
| Cash Management | `/dashboard/reports/cash-management` | Cash reconciliation |
| Voids | `/dashboard/reports/voids` | Void/refund analysis |

---

### Settings

**Route:** `/dashboard/settings/*`

| Setting | Route | Description |
|---------|-------|-------------|
| General | `/dashboard/settings` | Core merchant settings |
| Devices | `/dashboard/settings/devices` | POS device management |
| Stations | `/dashboard/settings/stations` | POS station configuration |
| Customer Display | `/dashboard/settings/customer-display` | Customer-facing display |
| Taxes | `/dashboard/settings/taxes` | Tax rate configuration |

**Related Actions:**
- `app/dashboard/actions/station-devices.ts`
- `app/dashboard/actions/stations.ts`
- `app/dashboard/actions/payment-terminals.ts`
- `app/dashboard/actions/tax-rates.ts`

---

### Audit Logs

**Route:** `/dashboard/audit-logs`
**Actions:** `app/dashboard/actions/audit-logs.ts`

All create, update, and delete operations are logged with:

- Actor identification (user name, role)
- Action category (menu, staff, location, settings, etc.)
- Severity level (info, warning, critical)
- Resource type and ID
- Before/after change diffs
- Location context
- Timestamp

Filtering supports: location, category, severity, resource type, date range, full-text search.

---

## Key Files Reference

### Server Actions (`app/dashboard/actions/`)

| File | Purpose |
|------|---------|
| `menus.ts` | Menu CRUD with location awareness |
| `menu-items.ts` | Menu item CRUD and pricing |
| `menu-items-rpc.ts` | RPC-based item fetching (optimized) |
| `categories.ts` | Menu category management |
| `modifier-groups.ts` | Modifier group/item CRUD |
| `locations.ts` | Location CRUD |
| `get-locations.ts` | Location fetching |
| `staff.ts` | Staff invite and management |
| `unified-staff.ts` | Unified staff view (Clerk + DB-only) |
| `order.ts` | Order operations |
| `order-analytics.ts` | Analytics data |
| `audit-logs.ts` | Audit trail logging and querying |
| `discounts.ts` | Discount/promotion logic |
| `inventory.ts` | Stock management |
| `stock.ts` | Stock tracking |
| `schedules.ts` | Schedule CRUD |
| `timesheets.ts` | Timesheet data |
| `floor-plan-*.ts` | Floor plan CRUD |
| `stations.ts` | POS station config |
| `station-devices.ts` | Station device management |
| `payment-terminals.ts` | Payment terminal config |
| `payments.ts` | Payment processing |
| `tax-rates.ts` | Tax configuration |
| `customers.ts` | Customer data |
| `recipes.ts` | Recipe management |
| `modifier-recipes.ts` | Modifier recipe logic |
| `purchase-orders.ts` | Purchase order management |
| `vendor-items.ts` | Vendor product catalog |
| `location-members.ts` | Location team assignments |
| `location-analytics.ts` | Location-specific analytics |
| `item-assignments.ts` | Category-item relationships |
| `location-*.ts` | Location-specific overrides |

### Hooks (`app/dashboard/hooks/`)

| File | Purpose |
|------|---------|
| `useLocationScoped.ts` | Location-scoped menu/item/schedule queries |
| `useLocationScopedModifiers.ts` | Location-scoped modifier queries |
| `useLocations.ts` | Fetch merchant locations |
| `useStaff.ts` | Unified staff queries and mutations |

### Stores (`stores/`)

| File | Purpose |
|------|---------|
| `location-store.ts` | Location selection and scoping |
| `floor-plan-store.ts` | Floor plan editing with real-time sync |
| `useScheduleStore.ts` | Staff scheduling state |
| `useScheduleTemplateStore.ts` | Schedule template management |

### Components (`components/dashboard/`)

| Directory | Purpose |
|-----------|---------|
| `locations/` | Location wizard, detail sheet, tabs |
| `menu/` | Menu forms, modifier dialogs, schedule overrides |
| `staff/` | Invite wizard, staff data table |
| `tables/` | Floor plan canvas, interactive editing |

### Types (`types/`)

| File | Purpose |
|------|---------|
| `menu.ts` | Menu, item, modifier, price types |
| `merchant_locations.ts` | Location types |
| `staff.ts` | Staff and assignment types |
| `audit-log.ts` | Audit log and filter types |
