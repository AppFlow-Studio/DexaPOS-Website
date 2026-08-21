# Dashboard Domain Statuses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract inventory, device, and cash-drawer status rules into tested domain helpers and update their dashboard interfaces to use those helpers.

**Architecture:** Three pure modules under `lib/constants` own semantic state derivation and badge metadata. Existing dashboard components import those functions, while multi-location inventory aggregation and non-status device presentation remain local to their current modules.

**Tech Stack:** TypeScript 6, React 19, Next.js 16, Vitest 4, Tailwind CSS 4

## Global Constraints

- Preserve current backend schemas, query behavior, actions, and page layouts.
- Unknown statuses and invalid warranty dates must degrade to neutral presentation.
- Inactive cash drawers take precedence over open-session state.
- Inventory multi-location breakdown remains unchanged.
- No new runtime dependencies.

---

### Task 1: Implement Pure Domain Status Helpers

**Files:**
- Create: `lib/constants/inventory-status.ts`
- Create: `lib/constants/device-status.ts`
- Create: `lib/constants/cash-drawer-status.ts`
- Test: `tests/dashboard-domain-statuses.test.ts`

**Interfaces:**
- Produces: `inventoryStockState(stockMode: string | null | undefined, currentStock: number, reorderPoint: number): InventoryStockState`
- Produces: `purchaseOrderStatusStyle(status: string | null | undefined): StatusBadgeStyle`
- Produces: `purchaseOrderStatusLabel(status: string | null | undefined): string`
- Produces: `deviceWarrantyState(date: string | null | undefined, today?: Date): DeviceWarrantyPresentation`
- Produces: `deviceLifecycleStatusStyle(status: string | null | undefined): StatusBadgeStyle`
- Produces: `deviceLifecycleStatusLabel(status: string | null | undefined): string`
- Produces: `deviceNeedsAttention(status: string | null | undefined): boolean`
- Produces: `deviceWarrantyIsOnWatch(date: string | null | undefined, today?: Date): boolean`
- Produces: `cashDrawerStatus(isActive: boolean, isOpen: boolean): CashDrawerState`

- [ ] **Step 1: Confirm the existing contract is red**

Run: `npm test -- --run tests/dashboard-domain-statuses.test.ts`

Expected: FAIL because the three imported modules do not exist.

- [ ] **Step 2: Implement inventory status derivation and metadata**

Create typed stock states and purchase-order style maps. Tracked stock at zero is out, tracked stock at or below the reorder point is low, and explicit modes override quantity. Return slate presentation for unknown purchase-order states.

- [ ] **Step 3: Implement device status derivation and metadata**

Normalize valid expiry and comparison dates to local midnight before computing whole calendar days. Return `unknown` for null or invalid dates, `expired` below zero days, `expiring` from zero through 60 days, and `active` above 60. Map every `DeviceLifecycleStatus` to a label and `{ dot, text, bg }`, with neutral fallback.

- [ ] **Step 4: Implement drawer status precedence**

Return `inactive` when `isActive` is false; otherwise return `open` or `closed` from `isOpen`.

- [ ] **Step 5: Verify the pure helpers are green**

Run: `npm test -- --run tests/dashboard-domain-statuses.test.ts`

Expected: 5 tests PASS.

### Task 2: Wire Inventory Presentation to Shared Helpers

**Files:**
- Modify: `app/dashboard/inventory/page.tsx`
- Test: `tests/dashboard-domain-statuses.test.ts`

**Interfaces:**
- Consumes: `inventoryStockState`, `purchaseOrderStatusLabel`, and `purchaseOrderStatusStyle` from Task 1.

- [ ] **Step 1: Replace local single-location stock branching**

Derive one semantic state in `StockStatusBadge` and render the existing destructive, amber, or emerald badge from that state. Leave the global location-count branch unchanged.

- [ ] **Step 2: Replace local purchase-order style map**

Use the shared PO label/style object and render the standard soft-tint badge with a status dot. Unknown values must receive the shared neutral fallback.

- [ ] **Step 3: Verify inventory integration**

Run: `npx eslint app/dashboard/inventory/page.tsx lib/constants/inventory-status.ts tests/dashboard-domain-statuses.test.ts`

Expected: exit code 0.

### Task 3: Wire Device Presentation to Shared Helpers

**Files:**
- Modify: `app/dashboard/devices/page.tsx`
- Modify: `lib/device-registry/presentation.ts`
- Test: `tests/dashboard-domain-statuses.test.ts`

**Interfaces:**
- Consumes: device lifecycle labels/styles, attention classification, and warranty presentation/watch helpers from Task 1.

- [ ] **Step 1: Remove duplicated device page rules**

Delete the page-local attention and warranty helpers. Use `deviceWarrantyState` for row badges, `deviceWarrantyIsOnWatch` for filters and counts, and `deviceNeedsAttention` for attention filters and indicators.

- [ ] **Step 2: Use lifecycle metadata for every device badge**

Render lifecycle badges using the extracted label and `{ dot, text, bg }` presentation in activity rows, dialogs, and device rows.

- [ ] **Step 3: Keep compatibility exports focused**

Update `lib/device-registry/presentation.ts` to delegate `formatDeviceStatus` and `getDeviceStatusClasses` to the shared module if other consumers still use those public helpers; leave category, money, and timeline helpers intact.

- [ ] **Step 4: Verify device integration**

Run: `npx eslint app/dashboard/devices/page.tsx lib/constants/device-status.ts lib/device-registry/presentation.ts tests/dashboard-domain-statuses.test.ts`

Expected: exit code 0.

### Task 4: Wire Cash-Drawer Presentation to Shared State

**Files:**
- Modify: `app/dashboard/cash-drawers/components/CashDrawerCard.tsx`
- Test: `tests/dashboard-domain-statuses.test.ts`

**Interfaces:**
- Consumes: `cashDrawerStatus` and `CashDrawerState` from Task 1.

- [ ] **Step 1: Derive drawer state once per component path**

Use the helper in `DrawerStatus`, `DrawerActions`, and `CashDrawerCard`. Inactive drawers show only the inactive badge even if stale data says a session is open.

- [ ] **Step 2: Replace boolean branches with semantic state checks**

Use `open`, `closed`, and `inactive` for primary actions, deactivation availability, and muted card/row styling. Preserve callbacks and markup structure.

- [ ] **Step 3: Verify cash-drawer integration**

Run: `npx eslint app/dashboard/cash-drawers/components/CashDrawerCard.tsx lib/constants/cash-drawer-status.ts tests/dashboard-domain-statuses.test.ts`

Expected: exit code 0.

### Task 5: Full Verification

**Files:**
- Verify all files changed by Tasks 1-4.

- [ ] **Step 1: Run the focused behavioral contract**

Run: `npm test -- --run tests/dashboard-domain-statuses.test.ts`

Expected: all tests PASS with no warnings.

- [ ] **Step 2: Run the complete unit test suite**

Run: `npm test -- --run`

Expected: all tests PASS. Any pre-existing unrelated failure must be reported separately with its exact test name.

- [ ] **Step 3: Run lint on every changed production and test file**

Run: `npx eslint lib/constants/inventory-status.ts lib/constants/device-status.ts lib/constants/cash-drawer-status.ts lib/device-registry/presentation.ts app/dashboard/inventory/page.tsx app/dashboard/devices/page.tsx app/dashboard/cash-drawers/components/CashDrawerCard.tsx tests/dashboard-domain-statuses.test.ts`

Expected: exit code 0.

- [ ] **Step 4: Run TypeScript verification**

Run: `npx tsc --noEmit`

Expected: exit code 0. Any pre-existing unrelated error must be reported with its exact file and diagnostic.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only the planned source, test, design, and plan files appear.
