# Admin (Dexa HQ) Dashboard Guide

This document covers the admin-facing side of the Dexa POS web dashboard, accessible at `/manage/*`. Dexa HQ staff use this portal to manage merchants, carriers, platform analytics, team members, and system-wide settings.

---

## Table of Contents

- [Overview](#overview)
- [Authentication & RBAC](#authentication--rbac)
- [Permission Reference](#permission-reference)
- [Role Definitions](#role-definitions)
- [Dashboard Structure](#dashboard-structure)
- [Operations](#operations)
  - [Merchant Management](#merchant-management)
  - [Carrier / Organization Management](#carrier--organization-management)
  - [Merchant Creation Under Carrier](#merchant-creation-under-carrier)
  - [HQ User Management](#hq-user-management)
  - [Roles & Permissions](#roles--permissions)
  - [Analytics](#analytics)
  - [Transactions Oversight](#transactions-oversight)
  - [Audit Logs](#audit-logs)
- [Access Control Patterns](#access-control-patterns)
- [Key Files Reference](#key-files-reference)

---

## Overview

The Admin Portal serves as the command center for Dexa POS headquarters. It operates on a 3-tier business hierarchy:

```
Dexa HQ (Super Admin)
  └── Carriers (Resellers)
        └── Merchants (End Users — Restaurants/Retailers)
```

- **Dexa HQ** manages the entire platform: carriers, merchants, analytics, billing, and system configuration
- **Carriers** are reseller partners who onboard merchants and manage fleets
- **Merchants** are the end-user businesses running stores

---

## Authentication & RBAC

### HQ Organization Verification

Access to `/manage/*` requires membership in the Dexa HQ Clerk organization (identified by `NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID`).

**Flow:**

1. User signs in via Clerk
2. Middleware (`middleware.ts`) checks if user's `orgId` matches the HQ org ID
3. If match → allowed into `/manage/*`
4. If not → redirected to `/dashboard` (merchant side)

### Server-Side Auth

**Function:** `requireAdminAuth()` in `lib/auth/admin.ts`

Used in server actions to verify HQ access:

```typescript
// Validates current user is HQ admin, returns role + permissions
const auth = await requireAdminAuth()
```

**Function:** `assertHQPermission(permission)` in `lib/auth/admin.ts`

Throws an error if the user lacks a specific permission:

```typescript
await assertHQPermission('hq.merchant.delete')
```

### Client-Side Auth Hook

**File:** `lib/hooks/useAdminAuth.ts`

```typescript
const {
  isAuthenticated,   // User is logged in
  isLoading,         // Auth state loading
  isHQAdmin,         // User belongs to HQ org
  isSuperAdmin,      // User has hq.super_admin role
  role,              // HQRole object { role_code, role_name, level }
  permissions,       // HQPermission[] array
  hasPermission,     // (permission: HQPermission) => boolean
  // Convenience booleans:
  canViewMerchants,
  canCreateMerchants,
  canEditMerchants,
  canDeleteMerchants,
  canViewMerchantAnalytics,
  canViewMerchantTransactions,
  canManageMerchantTeam,
  canViewSupport,
  canManageSupport,
  canViewSystemAnalytics,
  canViewAuditLogs,
  canManageSystemConfig,
  canManageBilling,
  canViewTeam,
  canManageTeam,
  canViewOrganizations,
  canManageOrganizations,
} = useAdminAuth()
```

The hook fetches role and permissions from Supabase via RPC functions:
- `get_my_hq_role()` — Returns highest-level HQ role
- `get_my_hq_permissions()` — Returns all permission codes

---

## Permission Reference

**Type:** `HQPermission` in `types/admin.ts`

### Permission Codes by Category

| Category | Permission Code | Description |
|----------|----------------|-------------|
| **Merchant** | `hq.merchant.view` | View merchant list and details |
| | `hq.merchant.create` | Create new merchants |
| | `hq.merchant.update` | Edit merchant settings |
| | `hq.merchant.delete` | Delete merchants |
| | `hq.merchant.analytics` | View merchant analytics |
| | `hq.merchant.transactions` | View merchant transactions |
| | `hq.merchant.manage_team` | Manage merchant staff |
| **Support** | `hq.support.view` | View support tickets |
| | `hq.support.manage` | Manage support tickets |
| | `hq.support.access_data` | Access customer support data |
| **Team** | `hq.team.view` | View HQ team members |
| | `hq.team.manage` | Manage HQ team (invite, edit) |
| | `hq.team.assign` | Assign roles to team members |
| **Organization** | `hq.org.view` | View carrier organizations |
| | `hq.org.manage` | Manage carrier organizations |
| **System** | `system.analytics.view` | View platform-wide analytics |
| | `system.audit.view` | View system audit logs |
| | `system.config.manage` | Manage system configuration |
| | `system.billing.manage` | Manage billing settings |
| **Merchant Access** | `merchant.team.view` | View merchant team data |
| | `merchant.team.manage` | Manage merchant team |
| | `merchant.transactions.view` | View merchant transactions |
| | `merchant.analytics.view` | View merchant analytics |
| | `merchant.reports.view` | View merchant reports |
| | `merchant.reports.export` | Export merchant reports |

---

## Role Definitions

**Type:** `HQRoleCode` in `types/admin.ts`

| Role | Code | Level | Description |
|------|------|-------|-------------|
| **Super Admin** | `hq.super_admin` | 10 | Full system access — all permissions, including billing, system config, and merchant deletion |
| **Platform Admin** | `hq.platform_admin` | 8 | Platform management — merchant/team CRUD (no delete), support, analytics, audit logs |
| **Manager** | `hq.manager` | 5 | Operational management — view/edit assigned merchants, view team, view analytics |

### Permission Matrix

| Permission | Super Admin | Platform Admin | Manager |
|-----------|:-----------:|:--------------:|:-------:|
| `hq.merchant.view` | Yes | Yes | Yes |
| `hq.merchant.create` | Yes | Yes | - |
| `hq.merchant.update` | Yes | Yes | Yes |
| `hq.merchant.delete` | Yes | - | - |
| `hq.merchant.analytics` | Yes | Yes | Yes |
| `hq.merchant.transactions` | Yes | Yes | Yes |
| `hq.merchant.manage_team` | Yes | Yes | - |
| `hq.support.view` | Yes | Yes | Yes |
| `hq.support.manage` | Yes | Yes | - |
| `hq.support.access_data` | Yes | - | - |
| `hq.team.view` | Yes | Yes | Yes |
| `hq.team.manage` | Yes | Yes | - |
| `hq.team.assign` | Yes | - | - |
| `hq.org.view` | Yes | Yes | - |
| `hq.org.manage` | Yes | - | - |
| `system.analytics.view` | Yes | Yes | - |
| `system.audit.view` | Yes | Yes | - |
| `system.config.manage` | Yes | - | - |
| `system.billing.manage` | Yes | - | - |

### Role Invitation Rules

Users can only invite roles at or below their own level:

```typescript
// types/admin.ts
export function getInvitableRoles(currentUserLevel: number): HQRoleConfig[] {
  return Object.values(HQ_ROLES).filter(role => role.level <= currentUserLevel)
}
```

---

## Dashboard Structure

### Route Map

| Route | Description | Required Permission |
|-------|-------------|-------------------|
| `/manage` | Admin dashboard home — platform KPIs | `isHQAdmin` |
| `/manage/merchants` | Merchant listing with grid/list views | `hq.merchant.view` |
| `/manage/merchants/[merchantId]` | Merchant detail with tabbed view | `hq.merchant.view` |
| `/manage/transactions` | Cross-merchant transaction data | `hq.merchant.transactions` |
| `/manage/analytics` | Platform-wide analytics | `system.analytics.view` |
| `/manage/users` | HQ team member management | `hq.team.view` |
| `/manage/roles` | Role and permission management | `hq.team.view` |
| `/manage/audit-logs` | System-wide audit trail | `system.audit.view` |
| `/manage/organizations` | Carrier organization management | `hq.org.view` |
| `/manage/organizations/[orgId]` | Carrier detail with tabs | `hq.org.view` |

### Admin Sidebar

The sidebar (`app/manage/layout.tsx`) is permission-filtered:

- **Main:** Dashboard, Merchants, Transactions, Analytics
- **Internal:** Users, Roles & Permissions, Audit Logs
- Navigation items are conditionally rendered based on `useAdminAuth()` permissions

---

## Operations

### Merchant Management

**Route:** `/manage/merchants`
**Actions:** `app/manage/actions/merchants.ts`

#### Merchant Listing

- **Grid/List toggle** — Switch between card view and table view
- **Filtering** — By status (active, inactive, onboarding), search by name
- **Stats bar** — Total merchants, active count, new this month
- **Merchant creation** button (requires `hq.merchant.create`)

#### Merchant Stats

```typescript
// app/manage/actions/merchants.ts
export async function getMerchantStats(): Promise<{
  total: number
  active: number
  inactive: number
  newThisMonth: number
}>
```

#### Merchant Detail View

**Route:** `/manage/merchants/[merchantId]`

The merchant detail page uses a tabbed interface:

| Tab | Description |
|-----|-------------|
| **Overview** | Merchant summary, KPIs, location map |
| **Business Info** | Business details, contact info, settings |
| **Staff** | Staff list with PIN reset, status toggle, bulk operations |
| **Customers** | Customer profiles for this merchant |
| **Products** | Product/item catalog view |
| **Menu** | Menu management (admin perspective) |
| **Schedules** | Staff scheduling |
| **Discounts** | Discount/promotion management |
| **Online Store** | Online ordering configuration |
| **Devices** | POS device and station management |
| **Transactions** | Transaction history for this merchant |
| **Audit** | Audit log filtered to this merchant |
| **Settings** | Merchant-level settings |

#### Admin Merchant Actions

Each tab has corresponding server actions in `app/manage/actions/admin-merchant/`:

| File | Functions |
|------|-----------|
| `staff.ts` | `getAdminMerchantStaff`, `adminResetStaffPin`, `adminBulkResetPins`, `adminToggleStaffStatus`, `adminCreateStaff`, `getMerchantLocationsForStaff`, `getMerchantStaffRoles`, `getAdminMerchantStaffStats` |
| `orders.ts` | `getAdminOrders`, `getAdminOrderDetails`, `getAdminOrderStats`, `getAdminRecentOrders` |
| `discounts.ts` | `listAdminDiscounts`, `getAdminDiscountById`, `createAdminDiscount`, `updateAdminDiscount`, `toggleAdminDiscountActive`, `deleteAdminDiscount`, `bulkUpdateAdminDiscountStatus`, `bulkDeleteAdminDiscounts`, `getAdminDiscountUsage` |
| `schedules.ts` | `getAdminSchedules`, `getAdminScheduleWithMenus`, `getMenuSchedules`, `createAdminSchedule`, `updateAdminSchedule`, `deleteAdminSchedule` |
| `analytics.ts` | Admin view of merchant analytics |
| `menus.ts` | Admin menu management |
| `online-ordering.ts` | Admin online ordering config |
| `transactions.ts` | Transaction admin view |
| `tax-rates.ts` | Tax rate management |
| `stations.ts` | Station management |
| `payment-terminals.ts` | Terminal management |
| `timesheets.ts` | Timesheet admin view |

---

### Carrier / Organization Management

**Route:** `/manage/organizations`
**Actions:** `app/manage/actions/get-organizations.ts`, `app/manage/actions/get-organization-info.ts`

Carriers are reseller organizations that onboard and manage merchants.

#### Carrier Listing

- View all carrier organizations
- Carrier KPIs: merchant count, revenue, active locations

#### Carrier Detail View

**Route:** `/manage/organizations/[orgId]`

Tabbed interface with:

| Tab | Description |
|-----|-------------|
| **Overview** | Carrier summary, merchant stats, KPIs |
| **Members** | Carrier team members |
| **Roles** | Carrier-specific roles |
| **Invites** | Pending invitations |
| **Audit** | Carrier audit logs |
| **Settings** | Carrier settings |

#### Carrier Server Actions

| Action | Description |
|--------|-------------|
| `GetCarrierOrganizations()` | List all carrier orgs |
| `GetOrganizationInfo(orgId)` | Single carrier details |
| `getOrganizationUsers(orgId)` | Carrier team members |
| `DeleteOrganization(orgId)` | Delete carrier org |

---

### Merchant Creation Under Carrier

Creating a merchant under a carrier follows this workflow:

1. **Clerk Organization Creation** — Create a new Clerk org for the merchant
2. **Logo Upload** — Upload merchant logo/branding
3. **Owner Invitation** — Invite the merchant owner via email
4. **Database Provisioning** — Merchant record created in Supabase, linked to carrier

---

### HQ User Management

**Route:** `/manage/users`
**Actions:** `app/manage/actions/get-user-info.ts`, `app/manage/actions/remove-user.ts`

Manage Dexa HQ team members:

- View all HQ users with role badges
- Invite new team members with role assignment
- Remove users from HQ organization

#### User Info Actions

| Action | Description |
|--------|-------------|
| `GetUserInfo()` | Current user's basic info |
| `GetFullUserInfo()` | Full user profile with role and permissions |
| `GetFullUserInfoViaRPC()` | RPC-optimized full user fetch |
| `GetInfoOfUser(userId)` | Get info for a specific user |
| `RemoveUser(userId)` | Remove user from HQ org |

#### Invitation System

```typescript
// types/admin.ts
interface CreateAdminInviteParams {
  organizationId: string
  firstName: string
  lastName: string
  email: string
  roleCode: string          // e.g., 'hq.super_admin'
  levelType: string
  orgType: string
  merchantAccess: MerchantAccessAssignment[]
  invitedBy?: string
}
```

Invitations track status: `pending`, `accepted`, `revoked`, `expired`, `cancelled`, `failed`.

---

### Roles & Permissions

**Route:** `/manage/roles`
**Actions:** `app/manage/actions/get-roles-hq.ts`, `app/manage/actions/get-roles-with-permissions-hq.ts`

View and manage HQ roles:

| Action | Description |
|--------|-------------|
| `GetRolesHQ(role_types?)` | List HQ roles, optionally filtered by type |
| `GetRolesWithPermissionsHQ()` | Roles with full permission breakdown |

---

### Analytics

**Route:** `/manage/analytics`
**Actions:** `app/manage/actions/hq-platform/analytics.ts`

Platform-wide analytics for HQ staff:

| Function | Description |
|----------|-------------|
| `getPlatformKPIs()` | Revenue, merchant count, order volume, growth |
| `getPlatformSalesTrend()` | Time-series sales data |
| `getTopMerchants(limit?)` | Highest-performing merchants |
| `getPlatformAuditLogs(filters)` | Platform-wide audit trail |

---

### Transactions Oversight

**Route:** `/manage/transactions`
**Actions:** `app/manage/actions/hq-platform/transactions.ts`

Cross-merchant financial data:

```typescript
export async function getPlatformTransactions(
  limit: number = 50,
  offset: number = 0
): Promise<{ data: PlatformTransaction[], total: number }>
```

---

### Audit Logs

**Route:** `/manage/audit-logs`

System-wide audit trail with:

- **Severity levels:** info, warning, critical
- **Categories:** merchant, staff, menu, location, settings, authentication, order, etc.
- **Filtering:** By merchant, category, severity, date range, search text
- **Details:** Actor, action, resource, before/after changes

---

## Access Control Patterns

### PermissionGate Component

Wraps UI elements to conditionally render based on permissions:

```tsx
<PermissionGate permission="hq.merchant.create">
  <Button>Create Merchant</Button>
</PermissionGate>
```

### Sidebar Filtering

Navigation items in the admin sidebar are conditionally rendered based on `useAdminAuth()`:

```tsx
// Only show if user can view merchants
{canViewMerchants && (
  <SidebarItem href="/manage/merchants">Merchants</SidebarItem>
)}
```

### Merchant Access Restriction

Non-super-admin users may be restricted to specific merchants:

```typescript
interface AdminMerchantAccess {
  id: string
  adminUserId: string
  merchantId: string
  merchantName?: string
  grantedBy?: string
  grantedAt: string
  isActive: boolean
}
```

### Server-Side Permission Checks

Server actions validate permissions before executing:

```typescript
// In a server action
export async function deleteMerchant(merchantId: string) {
  await assertHQPermission('hq.merchant.delete')
  // ... proceed with deletion
}
```

---

## Key Files Reference

### Server Actions (`app/manage/actions/`)

| File | Purpose |
|------|---------|
| `merchants.ts` | Merchant listing, details, stats, settings |
| `get-organizations.ts` | Carrier organization listing |
| `get-organization-info.ts` | Carrier detail info |
| `get-organization-users.ts` | Carrier team members |
| `delete-organization.ts` | Delete carrier org |
| `get-user-info.ts` | HQ user info (multiple variants) |
| `get-info-of-user.ts` | Specific user info |
| `remove-user.ts` | Remove HQ user |
| `get-roles-hq.ts` | HQ role listing |
| `get-roles-with-permissions-hq.ts` | Roles with permissions |
| `get-merchant-id.ts` | Clerk org → merchant ID lookup |
| `get-merchant-info.ts` | Merchant info by Clerk org ID |

### Admin Merchant Actions (`app/manage/actions/admin-merchant/`)

| File | Purpose |
|------|---------|
| `staff.ts` | Merchant staff management from admin |
| `orders.ts` | Merchant order management from admin |
| `discounts.ts` | Merchant discount management from admin |
| `schedules.ts` | Merchant schedule management from admin |
| `analytics.ts` | Merchant analytics from admin |
| `menus.ts` | Merchant menu management from admin |
| `online-ordering.ts` | Online ordering from admin |
| `transactions.ts` | Transaction data from admin |
| `tax-rates.ts` | Tax rate management from admin |
| `stations.ts` | Station management from admin |
| `payment-terminals.ts` | Terminal management from admin |
| `timesheets.ts` | Timesheet data from admin |

### Platform Actions (`app/manage/actions/hq-platform/`)

| File | Purpose |
|------|---------|
| `analytics.ts` | Platform KPIs, sales trends, top merchants |
| `transactions.ts` | Cross-merchant transaction data |

### Auth & Hooks

| File | Purpose |
|------|---------|
| `lib/hooks/useAdminAuth.ts` | Client-side admin auth hook |
| `lib/auth/admin.ts` | Server-side auth helpers (`requireAdminAuth`, `assertHQPermission`) |

### Types

| File | Purpose |
|------|---------|
| `types/admin.ts` | HQ roles, permissions, auth context, invite types |
| `types/permissions.ts` | Carrier/merchant permission mapping |
| `types/merchant.ts` | Merchant and location summary types |

### Database

| File | Purpose |
|------|---------|
| `supabase/migrations/014_hq_permission_functions.sql` | `hq_has_permission`, `get_my_hq_permissions`, `get_my_hq_role` RPCs |
| `supabase/migrations/018_simplified_hq_roles.sql` | HQ role/permission schema |
