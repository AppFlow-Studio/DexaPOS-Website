# Dashboard Domain Status Extraction

## Goal

Make inventory, device, and cash-drawer status rules independently testable and use those rules as the single source of truth in their dashboard interfaces.

## Architecture

Create three focused, framework-independent modules under `lib/constants`:

- `inventory-status.ts` classifies inventory stock and supplies purchase-order badge metadata.
- `device-status.ts` classifies warranties and supplies device lifecycle badge metadata.
- `cash-drawer-status.ts` derives the effective drawer state from activation and session state.

Each module accepts primitive domain values and returns typed semantic states or presentation metadata. The modules must not import React or dashboard components.

## Inventory Integration

`inventoryStockState` returns `out_of_stock`, `low_stock`, or `in_stock`. An explicit `out_of_stock` mode always wins, an explicit `in_stock` mode remains in stock regardless of quantity, and tracked stock uses zero and reorder-point boundaries.

The inventory page keeps its multi-location breakdown because that UI represents aggregate location data. Its single-location stock badge uses the extracted classification. Purchase-order badges use shared label and style metadata, including a neutral fallback for unknown values.

## Device Integration

`deviceWarrantyState` normalizes the supplied comparison date and expiry date to calendar-day boundaries. It returns an unknown, expired, expiring, or active state together with the existing user-facing label and a soft badge style. Expirations from today through 60 days are on warranty watch; expired warranties remain visible in that watch.

Device lifecycle presentation moves to the shared device module. The dashboard device page uses it for lifecycle badges, warranty badges, and warranty filtering. Existing category and timeline helpers remain in `lib/device-registry/presentation.ts` because they are unrelated to status derivation.

## Cash-Drawer Integration

`cashDrawerStatus` returns `inactive`, `open`, or `closed`. Inactive status has precedence over session state. `CashDrawerCard` derives the state once and uses it for badge text, action visibility, and inactive visual treatment without changing existing user actions.

## Error Handling and Compatibility

Unknown purchase-order and device lifecycle values receive neutral presentation instead of throwing or leaking invalid class names. Missing or invalid warranty dates produce the unknown state. Public helper inputs accept the nullable or string values already produced by dashboard queries.

## Testing and Verification

The existing `tests/dashboard-domain-statuses.test.ts` is the behavioral contract and has already been observed failing because the modules are absent. Implementation follows red-green-refactor:

1. Add the minimal pure helpers required by the test.
2. Run the focused test until green.
3. Replace inline dashboard logic with the helpers without changing behavior.
4. Add boundary coverage only where integration reveals an uncovered rule.
5. Run the focused test, relevant existing tests, lint for changed files, and TypeScript or production-build verification.

## Scope

This work does not redesign page layouts, change backend schemas, alter query behavior, or consolidate unrelated domain statuses.
