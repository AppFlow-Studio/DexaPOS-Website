# Website Popup Standardization

Date: 2026-03-28

## Scope

Requested UI change:

- Use a centered popup style like the reference image
- Blur the page background behind the popup
- Apply that style to create/edit popups across the website in a controlled rollout

## Current Bugs And Features In Scope

Completed in this pass:

1. HQ admin can create and link categories from the merchant menu detail page
2. HQ admin can add items from the merchant menu detail page
3. Fixed `addItemToCategory(...)` so `category_items.merchant_id` is written correctly

New feature request:

1. Standardize website popups to a centered modal style with blurred page backdrop

## Current Popup Patterns In The Codebase

Named popup-style components found:

- `Dialog`: 39
- `Modal`: 14
- `Sheet`: 37
- `Wizard`: 11
- `Popup`: 3
- Total named popup components: 104

Primitive usage found:

- `BottomSheet` usages: 34
- `DialogContent` usages: 127

Important observation:

- `components/ui/dialog.tsx` is already centered, but its overlay is not blurred
- `components/ui/bottom-sheet.tsx` already blurs the backdrop, but the content is anchored to the bottom

## Recommendation

Do not globally replace every popup primitive in one shot.

Reason:

1. Some components are true bottom sheets or detail drawers and should stay as sheets
2. Some are confirmation dialogs and should stay lightweight
3. A blind global change to `BottomSheet` would break detail viewers and nested sheet flows

Recommended rollout:

1. Create a shared centered modal style for create/edit flows
2. Pilot it on one small, common popup
3. If approved visually, migrate the similar form popups in batches

## Best First Test Popup

Recommended pilot:

- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryFormSheet.tsx`

Why this one:

1. It directly matches the user example: simple form, create/edit workflow, clear header/body/footer
2. It is used in the HQ admin menu workflow we just tested
3. It is much safer than starting with `ItemFormSheet`, which is larger and more complex

Second pilot candidate:

- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx`

## Phase 1 Conversion Candidates

These are the strongest “same kind of popup” candidates for the first migration wave.

### HQ Admin Merchant Menu

- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryFormSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuFormSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/AdminAddCategoryToMenuSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx`

### Merchant Dashboard Menu

- `components/dashboard/menu/CategoryFormSheet.tsx`
- `components/dashboard/menu/ItemFormSheet.tsx`
- `components/dashboard/menu/ModifierGroupFormSheet.tsx`
- `components/dashboard/menu/ScheduleFormSheet.tsx`
- `components/dashboard/menu/CreateScheduleSheet.tsx`
- `components/dashboard/menu/NewEditItemFormSheet.tsx`
- `components/dashboard/menu/AddCategoryToMenuWizard.tsx`
- `components/dashboard/menu/categories/AddItemToCategoryWizard.tsx`
- `components/dashboard/menu/items/CreateItemWizard.tsx`

### Staff / Invitations / Scheduling

- `app/manage/merchants/[merchantId]/components/AdminCreateStaffWizard.tsx`
- `app/manage/merchants/[merchantId]/components/AdminScheduleFormSheet.tsx`
- `app/manage/organizations/[organizationId]/components/AdminInviteWizard.tsx`
- `components/dashboard/staff/InviteUserWizard.tsx`
- `components/dashboard/tables/AddToWaitlistWizard.tsx`
- `components/scheduling/dashboard/AssignMenusSheet.tsx`
- `components/scheduling/OpenShiftsSheet.tsx`

## Likely Non-Phase-1 Popups

These should be reviewed separately and not blindly converted in the first pass.

### Confirmations

- `AlertDialog` based confirmations
- Delete / revoke / resend / discard changes confirmations

### Detail Viewers

- `CategoryDetailSheet`
- `ItemDetailSheet`
- `MenuDetailSheet`
- `ModifierGroupDetailSheet`
- `OrderDetailSheet`
- `TransactionDetailSheet`
- `LocationDetailSheet`

### Navigation / Side Panels

- `Sheet` side panels
- sidebar/mobile nav sheets

## Popup Inventory By Area

This is the working inventory of popup-style components that may need review during the rollout.

### App Dashboard

- `app/dashboard/customers/components/campaigns/CreateCampaignDialog.tsx`
- `app/dashboard/customers/components/CustomerProfileSheet.tsx`
- `app/dashboard/inventory/components/ActivityLogSheet.tsx`
- `app/dashboard/inventory/components/AddItemDialog.tsx`
- `app/dashboard/inventory/components/AddVendorDialog.tsx`
- `app/dashboard/inventory/components/AddVendorItemDialog.tsx`
- `app/dashboard/inventory/components/CreateExpenseDialog.tsx`
- `app/dashboard/inventory/components/CreatePurchaseOrderDialog.tsx`
- `app/dashboard/inventory/components/DeleteConfirmDialog.tsx`
- `app/dashboard/inventory/components/EditItemDialog.tsx`
- `app/dashboard/inventory/components/EditVendorDialog.tsx`
- `app/dashboard/inventory/components/LinkLocationDialog.tsx`
- `app/dashboard/inventory/components/LocationPricingSheet.tsx`
- `app/dashboard/inventory/components/PurchaseOrderDetailSheet.tsx`
- `app/dashboard/inventory/components/StockUpdateDialog.tsx`
- `app/dashboard/inventory/components/VendorDetailSheet.tsx`
- `app/dashboard/invoices/components/AddCustomItemDialog.tsx`
- `app/dashboard/invoices/components/QuickAddCustomerDialog.tsx`
- `app/dashboard/online-ordering/components/HoursConfigModal.tsx`
- `app/dashboard/settings/loyalty/components/ProgramAnalyticsSheet.tsx`
- `app/dashboard/settings/loyalty/components/ProgramWizard.tsx`
- `app/dashboard/settings/loyalty/components/PromotionDialog.tsx`
- `app/dashboard/settings/prep-stations/components/AddEditPrepStationDialog.tsx`
- `app/dashboard/settings/stations/components/AddStationDialog.tsx`
- `app/dashboard/settings/stations/[stationId]/components/AddPrinterDialog.tsx`
- `app/dashboard/settings/stations/[stationId]/components/AddStationDeviceDialog.tsx`
- `app/dashboard/settings/tips/components/TipOutRuleDialog.tsx`
- `app/dashboard/settings/tips/components/TipPoolDialog.tsx`
- `app/dashboard/tips/components/ManualAdjustmentDialog.tsx`

### HQ Manage Area

- `app/manage/devices/components/DeviceStatusTransitionDialog.tsx`
- `app/manage/merchants/[merchantId]/components/AddStationDialog.tsx`
- `app/manage/merchants/[merchantId]/components/AddTerminalDialog.tsx`
- `app/manage/merchants/[merchantId]/components/AdminCreateStaffWizard.tsx`
- `app/manage/merchants/[merchantId]/components/AdminCustomerProfileSheet.tsx`
- `app/manage/merchants/[merchantId]/components/AdminScheduleFormSheet.tsx`
- `app/manage/merchants/[merchantId]/components/BulkPinResetDialog.tsx`
- `app/manage/merchants/[merchantId]/components/CreateStaffDialog.tsx`
- `app/manage/merchants/[merchantId]/components/inventory/AdminAddItemDialog.tsx`
- `app/manage/merchants/[merchantId]/components/inventory/AdminEditItemDialog.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/AdminAddCategoryToMenuSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryDetailSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryFormSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuDetailSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuFormSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierGroupDetailSheet.tsx`
- `app/manage/merchants/[merchantId]/components/PinResultDialog.tsx`
- `app/manage/organizations/[organizationId]/components/AdminInviteWizard.tsx`
- `app/manage/organizations/[organizationId]/components/DeleteOrganizationDialog.tsx`
- `app/manage/organizations/[organizationId]/components/RemoveUserPopup.tsx`
- `app/manage/organizations/[organizationId]/components/ResendAdminInvitePopup.tsx`
- `app/manage/organizations/[organizationId]/components/RevokeAdminInvitePopup.tsx`
- `app/manage/transactions/components/TransactionDetailSheet.tsx`
- `app/manage/transactions/components/TransactionFilterSheet.tsx`

### Public Site / Checkout

- `app/sites/components/AuthDialog.tsx`
- `app/sites/components/CheckoutDialog.tsx`
- `app/sites/components/InfoSheet.tsx`
- `app/sites/components/ItemDetailsModal.tsx`
- `app/sites/components/OrdersSheet.tsx`

### Shared Dashboard Components

- `components/dashboard/locations/CreateLocationWizard.tsx`
- `components/dashboard/locations/LocationDetailSheet.tsx`
- `components/dashboard/menu/AddCategoryToMenuWizard.tsx`
- `components/dashboard/menu/categories/AddItemToCategoryWizard.tsx`
- `components/dashboard/menu/CategoryFormSheet.tsx`
- `components/dashboard/menu/CategoryOverrideSheet.tsx`
- `components/dashboard/menu/CreateScheduleSheet.tsx`
- `components/dashboard/menu/ItemFormSheet.tsx`
- `components/dashboard/menu/items/CreateItemWizard.tsx`
- `components/dashboard/menu/menuId/MenuPreviewModal.tsx`
- `components/dashboard/menu/ModifierGroupFormSheet.tsx`
- `components/dashboard/menu/ModifierItemOverrideDialog.tsx`
- `components/dashboard/menu/ModifierOverrideDialog.tsx`
- `components/dashboard/menu/NewEditItemFormSheet.tsx`
- `components/dashboard/menu/ScheduleDetailSheet.tsx`
- `components/dashboard/menu/ScheduleFormSheet.tsx`
- `components/dashboard/menu/ScheduleOverrideDialog.tsx`
- `components/dashboard/orders/AdjustTipModal.tsx`
- `components/dashboard/orders/AssignCustomerModal.tsx`
- `components/dashboard/orders/OrderDetailSheet.tsx`
- `components/dashboard/orders/ReceiptModal.tsx`
- `components/dashboard/orders/RefundModal.tsx`
- `components/dashboard/orders/SendReceiptModal.tsx`
- `components/dashboard/orders/VoidModal.tsx`
- `components/dashboard/staff/InviteUserWizard.tsx`
- `components/dashboard/staff/LocationAssignmentSheet.tsx`
- `components/dashboard/staff/StaffDetailSheet.tsx`
- `components/dashboard/tables/AddToWaitlistWizard.tsx`

### Scheduling

- `components/scheduling/dashboard/AssignMenusSheet.tsx`
- `components/scheduling/dashboard/DeleteScheduleDialog.tsx`
- `components/scheduling/DenyRequestModal.tsx`
- `components/scheduling/EditWeeklyScheduleModal.tsx`
- `components/scheduling/OpenShiftsSheet.tsx`
- `components/scheduling/PublishModal.tsx`
- `components/scheduling/ShiftModal.tsx`
- `components/scheduling/SwapProposalWizard.tsx`
- `components/scheduling/templates/ApplyTemplateDialog.tsx`
- `components/scheduling/templates/ConflictResolutionModal.tsx`
- `components/scheduling/templates/SaveTemplateDialog.tsx`

## Proposed Technical Direction

Preferred approach:

1. Keep `AlertDialog` for confirmations
2. Keep true side `Sheet` / sidebar patterns as-is
3. Introduce a reusable centered form modal shell with:
   - centered content
   - blurred backdrop
   - consistent header/body/footer spacing
   - responsive width
   - optional close button
4. Convert selected create/edit form popups to that shell one by one

Avoid:

1. Rewriting `components/ui/bottom-sheet.tsx` globally
2. Blindly changing every popup type at once
3. Mixing detail viewers and confirmation dialogs into the same rollout

## Next Step

If approved, the first UI test should be:

- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryFormSheet.tsx`

Success criteria for the pilot:

1. centered popup
2. blurred main-page backdrop
3. clean header/body/footer like the reference
4. desktop and mobile both still usable
5. no behavior regression in create/edit flows
