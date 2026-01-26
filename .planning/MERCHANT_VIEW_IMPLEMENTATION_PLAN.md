# Merchant Dashboard (Admin View) Implementation Plan

**Objective**: Ensure the Admin Merchant View (`/manage/merchants/[merchantId]`) has full feature parity with the actual Merchant Dashboard, allowing admins to view/manage specific merchant data seamlessly.

## 🟢 Completed Tasks

### 1. Infrastructure & Hooks

- [x] **`useOrderAnalytics.ts`**: Updated `useOrderAnalytics`, `useSalesByDateRange`, `useBestSellingItems`, etc., to accept optional `orgIdOverride` and `locationIdOverride`.
- [x] **`useOrder.ts`**: Updated `useOrders` hook to accept optional `orgIdOverride` and `locationIdOverride`.
- [x] **`useAuditLogs.ts`**: Updated `useAuditLogs` hook to accept optional `orgIdOverride`.
- [x] **`use-admin-inventory.ts`**: Implemented `useAdminInventoryItems`, `useAdminVendors`, `useAdminInventoryStats` hooks (with types).
- [x] **`use-admin-customers.ts`**: Implemented `useAdminCustomers`, `useAdminCustomerProfile`, and mutation hooks.
- [x] **`use-admin-merchant.ts`**: Confirmed admin Menu hooks (`useAdminMenus`, etc.) exist.
- [x] **`use-admin-online-ordering.ts`**: Confirmed admin Online Ordering hooks exist.

### 2. Page & Layout

- [x] **`app/manage/merchants/[merchantId]/page.tsx`**:
  - Updated to pass `merchantInfo` prop to all tabs.
  - Added **Menu Tab** and **Online Store Tab** to the view.
  - Handled top-level Merchant loading errors.

### 3. Tabs Implementation

- [x] **Analytics Tab**:
  - Updated to accept `merchantInfo` prop.
  - Verified usage of `useAdmin...` specific hooks.
- [x] **Transactions Tab**:
  - Uses `useOrders` and `useFinancialKPIs` hooks with `orgIdOverride`.
  - Layout verified.
- [x] **Audit Logs Tab**:
  - Uses `useAuditLogs` with `orgIdOverride`.
- [x] **Staff Tab**:
  - Uses `useAdminMerchantStaff` hooks.
- [x] **Devices Tab**:
  - Uses `useAdminMerchantStations` / `useAdminMerchantTerminals` hooks.
- [x] **Overview Tab** (`OverviewTab.tsx`)
  - Verified usage of `useAdminOrderAnalytics`, `useAdminFinancialKPIs` etc.
- [x] **Menu Tab** (`MenuTab/`)
  - Verified usage of `useAdminMenuStats`, `useAdminMenus` etc.
- [x] **Products Tab** (`ProductsTab.tsx`)
  - Uses restored `useAdminInventoryItems` hooks.
- [x] **Online Store Tab** (`OnlineStoreTab.tsx`)
  - Uses `useAdminOnlineOrderingOverview` hooks.
  - Added as top-level tab.
- [x] **Customers Tab** (`CustomersTab.tsx`)
  - Uses restored `useAdminCustomers` hooks.
  - Includes `AdminCustomerProfileSheet`.
- [x] **Settings Tab** (`SettingsTab.tsx`)
  - Verified tax settings and general settings.
  - Removed duplicate "Online Store" nested tab.

### 4. Code Quality & Fixes

- [x] **Global Error Handling**: Top-level page handles merchant load failures. Individual tabs have skeleton/empty states.
- [x] **Visual Polish**: Verified layout consistency. `TransactionsTab` has specific fixed height for its complex view, others use flow layout.
- [x] **Type Safety**: Fixed `LocationSummary` vs `Location` type mismatch in `page.tsx`.

---

## 🏁 Status: Complete

All planned tasks for the Merchant View (Admin) are considered complete. The tabs are fully wired to Admin-specific hooks or adapted dashboard hooks with override capabilities.
