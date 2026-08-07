# Senior Handoff: Recent Three Ticket Streams

Date: 2026-06-10

Owner: Ali Dika

Audience: Senior review / merge readiness review

## Bundle Scope

This handoff bundles the three latest ticket streams worked through in the current cycle:

1. Dashboard Staff + Sidebar Polish
2. Single-Location Global Modifier And Recipe RPCs
3. Orders List Relabel: `Draft` -> `Open`, `Payment Pending` -> `Awaiting Payment`

This is a status and implementation handoff, not a sign-off that manual QA is complete.

## Executive Summary

| Ticket | Repo | Implementation Status | QA Status | Main Risk |
| --- | --- | --- | --- | --- |
| Dashboard Staff + Sidebar Polish | Website | Implemented | Manual QA pending | Visual-only regressions in the merchant staff detail sheet |
| Single-Location Global Modifier And Recipe RPCs | Website | Migration + caller alignment implemented | SQL audit / cleanup still pending | Incorrect overlay-row cleanup if run without staging-first review |
| Orders List Relabel (`Open` / `Awaiting Payment`) | Website + POS | Implemented | Manual QA pending on both surfaces | Vocabulary drift if future status maps bypass shared helpers |

## 1. Dashboard Staff + Sidebar Polish

### Goal

Clean up the merchant dashboard staff detail presentation and make the merchant dashboard sidebar visually calmer and more intentional, without changing backend behavior.

### What Was Implemented

1. Staff detail sheet was reworked into a sectioned layout instead of one long stacked column.
2. Internal plumbing fields were removed from the visible merchant staff detail UI.
3. Raw role codes were humanized in the visible UI.
4. Sidebar styling was retuned to use a lighter off-white surface with branded active-state treatment.

### Key Website Files

1. `components/dashboard/staff/StaffDetailSheet.tsx`
2. `app/dashboard/layout.tsx`
3. `app/globals.css`

### Verified Implementation Notes

1. The staff detail sheet now exposes user-facing sections such as:
   - `Personal & Contact Info`
   - `Permissions & Assignment`
   - `Employee Access Key`
   - `Dashboard Access`
2. The raw `Member ID` and `Staff Profile ID` rows were removed from the merchant detail UI.
3. The footer leak of internal member information was removed from the merchant-facing presentation.
4. Sidebar tokens in `app/globals.css` now use the scoped merchant-dashboard palette:
   - sidebar background `#F8FAFC`
   - active tint `#EEF3FE`
   - active foreground `#0C4FD1`

### Deliberate Scope Boundaries

1. `/dashboard/staff` list/table redesign was not part of this ticket.
2. HQ/admin `/manage/*` staff pages were not part of this ticket.
3. POS staff surfaces were not part of this ticket.
4. No backend, schema, auth, PIN, or password behavior changes were introduced.

### Remaining QA

1. Open dashboard staff detail for a dashboard user and confirm no raw IDs are visible.
2. Open a POS-only staff member and confirm dashboard-only sections behave correctly.
3. Check role labeling for owner/admin/staff variants.
4. Check sidebar active, hover, and grouped navigation states across `/dashboard/*`.

### Review Risk

Low. This is a presentation-layer ticket, but it touches a frequently used merchant detail surface and the shared dashboard sidebar.

## 2. Single-Location Global Modifier And Recipe RPCs

### Goal

Fix backend behavior so single-location merchants can omit `location_id` and still correctly write to the merchant-global/base records for modifier and recipe edits, while documenting and sequencing overlay-row cleanup safely.

### What Was Implemented

1. Added a canonical migration for the single-location modifier and recipe RPC cleanup.
2. Added the NULL/global path to `upsert_modifier_override(...)`.
3. Dropped stale `upsert_menu_item_with_recipe(...)` overloads and kept one canonical signature.
4. Updated dashboard caller alignment so recipe writes use `p_recipe_items`.
5. Added explicit safety behavior so global modifier edits do not silently accept location-only stock fields.

### Key Website Files

1. `supabase/migrations/20260606143000_single_location_global_modifier_recipe_rpcs.sql`
2. `app/dashboard/actions/menu-items-rpc.ts`
3. `app/dashboard/actions/recipes.ts`
4. `docs/features/menu-management/PLAN-2026-06-06-SINGLE-LOCATION-GLOBAL-MODIFIER-RECIPE-RPCS.md`

### Verified Implementation Notes

1. The migration explicitly documents and implements:
   - NULL/global path for `upsert_modifier_override(...)`
   - stale overload cleanup for `upsert_menu_item_with_recipe(...)`
2. `app/dashboard/actions/recipes.ts` now calls:
   - `upsert_menu_item_with_recipe`
   - with `p_recipe_items`
3. `app/dashboard/actions/menu-items-rpc.ts` now:
   - passes nullable `locationId`
   - guards against global stock-field writes for modifier edits
4. The overlay cleanup stream is documented as staging-first and split into:
   - safe auto-collapse rows
   - manual-review rows

### Deliberate Scope Boundaries

1. This ticket is backend/RPC-focused.
2. It is not a modifier UI redesign ticket.
3. It does not redesign RLS or policy structure beyond the affected function definitions.
4. It does not auto-run prod cleanup blindly.

### Remaining QA / Ops Work

1. Confirm the migration has been applied in the target Supabase environment.
2. Run the documented overlay-row audit in SQL editor.
3. Separate safe rows from manual-review rows before any prod cleanup.
4. Sequence Charcoal-specific cleanup separately if applicable.
5. Re-test single-location modifier and recipe edits after migration on staging or target env.

### Review Risk

Medium. The implementation itself is targeted, but the overlay cleanup step is operationally sensitive and must not be treated as a blind one-shot migration.

## 3. Orders List Relabel: `Draft` -> `Open`, `Payment Pending` -> `Awaiting Payment`

### Goal

Reduce merchant confusion in the orders list by changing status vocabulary only, without altering enums, reporting logic, or payment/order lifecycle behavior.

### What Was Implemented

1. Web dashboard order status display now renders `Open` for `order_status = 'draft'`.
2. Web dashboard payment status display now renders `Awaiting Payment` for `payment_status = 'pending'`.
3. Web orders list headers were clarified to `Order Type` and `Order Status`.
4. Leading dots were removed from web order-status pills.
5. POS order-list and order-badge surfaces were aligned to the same `Open` and `Awaiting Payment` vocabulary.
6. Shared website status constants were merged so `draft` now resolves to `Open` consistently.

### Key Website Files

1. `components/dashboard/orders/OrderStatusBadge.tsx`
2. `components/dashboard/orders/PaymentStatusBadge.tsx`
3. `components/dashboard/orders/OrdersDataTable.tsx`
4. `components/dashboard/orders/OrderStatusTimeline.tsx`
5. `lib/constants/order-status.ts`

### Key POS Files

1. `C:\Users\Ali DIka\Desktop\Dexa-POS\utils\orderStatusHelpers.ts`
2. `C:\Users\Ali DIka\Desktop\Dexa-POS\app\(main)\order-processing.tsx`
3. `C:\Users\Ali DIka\Desktop\Dexa-POS\components\order\OrderBadge.tsx`
4. `C:\Users\Ali DIka\Desktop\Dexa-POS\components\order\OrderCard.tsx`
5. `C:\Users\Ali DIka\Desktop\Dexa-POS\components\order\OrderLineMinimalCard.tsx`
6. `C:\Users\Ali DIka\Desktop\Dexa-POS\components\menu\OrdersTable.tsx`
7. `C:\Users\Ali DIka\Desktop\Dexa-POS\components\previous-orders\PreviousOrderRow.tsx`
8. `C:\Users\Ali DIka\Desktop\Dexa-POS\components\previous-orders\detail\OrderDetailHeader.tsx`

### Verified Implementation Notes

1. Website `ORDER_STATUS_LABELS` now maps `draft` to `Open`.
2. Website orders table now shows:
   - `Order Type`
   - `Order Status`
3. Website order-status pills no longer render the leading dot.
4. POS uses a shared payment-status formatter so `Pending` and `Unpaid` resolve to `Awaiting Payment` on the touched order-list surfaces.

### Deliberate Scope Boundaries

1. No enum rename was introduced.
2. No migration was introduced for `order_status` or `payment_status`.
3. No reporting, KDS, settlement, item-count, or lifecycle behavior was intentionally changed.
4. POS comparable header renaming was not forced where the POS surface is not a direct table match.

### Remaining QA

1. Website:
   - confirm orders list shows `Open`
   - confirm payment badge shows `Awaiting Payment`
   - confirm headers show `Order Type` and `Order Status`
   - confirm web order-status pills render without dots
2. Website detail flow:
   - confirm timeline/status history also says `Open`
3. POS:
   - confirm current-order badges/cards show `Open`
   - confirm unpaid/pending payment labels show `Awaiting Payment`
   - confirm previous-order surfaces use the same vocabulary

### Review Risk

Low. This is display-layer work, but it spans two repos and relies on shared label maps staying authoritative.

## Recommended Senior Review Order

1. Review the staff/sidebar ticket first because it is isolated UI polish with low data risk.
2. Review the orders relabel ticket next because it is display-only but cross-repo.
3. Review the single-location RPC ticket last because it has the highest operational sensitivity.

## Remaining Before Full Closure

1. Manual QA for the staff/sidebar ticket.
2. Manual QA for website and POS on the orders relabel ticket.
3. SQL audit and staged cleanup execution for the single-location overlay-row portion.

## Merge / Handoff Notes

1. This bundle is safe to share as a senior review summary.
2. It should not be treated as proof of final QA completion.
3. The single-location ticket in particular still depends on careful environment verification outside the code diff.
