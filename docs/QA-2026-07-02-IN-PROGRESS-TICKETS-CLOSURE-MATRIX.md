# QA Closure Matrix - In-Progress Tickets From July 2 Screenshots

Date: 2026-07-02

Purpose: map the visible in-progress tickets from Ali's board screenshots to the code/doc work that exists now, then give a concrete manual QA plan for dashboard, POS, and Supabase validation.

Important scope note: the screenshots show 13 visible tickets, while the board badge shows 17 in progress. The 4 hidden tickets are not covered here.

## Repos Checked

Website repo:

- `C:\Users\Ali DIka\Desktop\DexaPOS-Website`

POS repo:

- `C:\Users\Ali DIka\Desktop\Dexa-POS`
- Current branch observed: `Table-And-Order-Syncing`

## Status Map

| Ticket | Surface | Current status | Who owns next step | Video value |
| --- | --- | --- | --- | --- |
| End of Day - Review staff does not deep-link | POS | Implemented in POS branch, needs tablet QA | Ali QA | Medium |
| Daily Shift Report calendar off by one | POS | Implemented in POS branch, needs tablet QA | Ali QA | Medium |
| [POS] Remove "If paid by card" alternative-price line from printed receipt | POS | Implemented in POS branch, automated test noted, needs physical printer QA | Ali QA | High |
| QA: Table Merge & Transfer + POS Dates/Calendars | POS QA | Not implemented by me; looks like a QA checklist for table/order sync | Ali QA / owner branch | High if bugs found |
| [DATA] Owner mis-provisioned - Bay Ridge owner relink | Website + data | Plan/repair path documented; live Clerk/Supabase repair still required | Senior/prod-authorized repair | Low/Medium |
| [QA] Re-price stale manual-priced items after dual-pricing flip | POS/Web/data | Not present in current website repo; POS sweep says earlier work may exist but not in current POS branch | Find branch or implement | Medium |
| [POS Menu Grid] DESSERT duplicate card | POS/data | Not present in current website repo; POS sweep says earlier work may exist but not in current POS branch | Find branch or implement | Medium |
| [POS/Web] Location-level POS Settings + station overrides | Website dashboard + Supabase | Web part implemented; POS tablet consumption separate | Ali QA + migration apply | High |
| [POS+Web Orders/KDS] Delivery-platform logo everywhere | Website dashboard partial scope | Web part implemented; POS/KDS still separate | Ali QA for web, POS owner for POS | High |
| Timesheets - manual hour adjustment + configurable auto clock-out | Website dashboard + Supabase | Manual adjustment implemented; auto clock-out deferred | Ali QA + migration apply | High |
| P0 cash payment records $0.00 / Paid with balance | POS/backend | Not implemented in this website repo; needs backend/POS investigation | Owner branch / new work | High |
| POS offline order never syncs / pay-after-paid / clipped New Order | POS | Not implemented by me in website; likely current POS table-sync branch QA | POS owner / Ali QA | High |
| Order numbers reset at UTC midnight + Previous Orders newest-first | POS/backend | Not present in current POS branch per sweep; needs branch or new work | Find branch or implement | High |

## Website Tickets Ready For Dashboard QA

## 1. [POS/Web] Location-Level POS Settings + Per-Station Overrides

Ticket title:

- `[POS/Web] Location-level POS Settings surface + per-station overrides - set a location's POS config once (locations.pos_config), inherited by all stations; add stations.pos_config_overrides + resolution RPC`

Implemented in website repo:

- `docs/PLAN-2026-06-30-LOCATION-POS-CONFIG-STATION-OVERRIDES-WEB.md`
- `supabase/migrations/20260630110000_location_pos_config_station_overrides.sql`
- `lib/pos/pos-config.ts`
- `app/dashboard/actions/pos-settings.ts`
- `app/dashboard/settings/pos/page.tsx`

Scope:

- Web/dashboard settings only.
- Adds location defaults and station overrides.
- POS tablet consumption remains a separate POS repo pass.

Dashboard QA:

1. Apply the migration on staging first.
2. Open merchant dashboard as a merchant with at least one location and station.
3. Go to `/dashboard/settings/pos`.
4. Select a location.
5. Change a location-level setting such as app theme, UI scale, notification sound, or volume.
6. Save.
7. Refresh the page.
8. Expected: the location-level values persist.
9. Select a station.
10. Enable a station override for one setting.
11. Save.
12. Refresh the page.
13. Expected: station override persists and does not overwrite the location default.

Supabase QA:

```sql
SELECT id, name, pos_config
FROM public.locations
WHERE id = '<location_id>';

SELECT id, name, pos_config_overrides
FROM public.stations
WHERE location_id = '<location_id>';

SELECT public.get_effective_pos_config('<station_id>'::uuid);
```

Expected:

- `locations.pos_config` stores location defaults.
- `stations.pos_config_overrides` stores only station-specific overrides.
- `get_effective_pos_config(...)` returns a merged config.

Record video:

- Yes. This is a good senior-demo ticket because it shows location inheritance plus station override behavior.

## 2. [POS+Web Orders/KDS] Delivery-Platform Logo - Web Part

Ticket title:

- `[POS+Web - Orders/KDS] Render delivery-platform logo in every KDS state + POS previous-orders + web admin (shared, casing-normalized resolver)`

Implemented in website repo:

- `docs/PLAN-2026-06-29-DELIVERY-PLATFORM-LOGOS-WEB.md`
- `lib/orders/delivery-platform.ts`
- `components/dashboard/orders/DeliveryPlatformBadge.tsx`
- Merchant dashboard order list/detail surfaces.
- HQ merchant order list/detail surfaces.

Scope:

- Website/web admin only.
- POS/KDS and POS Previous Orders still belong to the POS repo.

Dashboard QA:

1. Find or create orders with delivery source values for Grubhub, DoorDash, and Uber Eats.
2. Open `/dashboard/orders`.
3. Confirm platform logo/badge appears in the Orders list.
4. Open each order detail.
5. Confirm the same platform logo/badge appears in details.
6. Impersonate/check HQ merchant order views if available.
7. Confirm first-party website/app orders do not show a broken third-party logo.
8. Confirm POS/in-store orders show no third-party logo.

Supabase QA:

```sql
SELECT id,
       order_number,
       order_source,
       delivery_platform,
       metadata->>'delivery_company' AS metadata_delivery_company
FROM public.orders
WHERE delivery_platform IS NOT NULL
   OR metadata ? 'delivery_company'
   OR order_source IN ('grubhub', 'GrubHub', 'doordash', 'DoorDash', 'ubereats', 'UBEREATS', 'website', 'app', 'pos')
ORDER BY created_at DESC
LIMIT 30;
```

Expected:

- Provider casing variants resolve to the same logo/badge.
- First-party sources use the agreed fallback.
- In-store `pos` orders show no delivery-platform logo.

Record video:

- Yes, if staging/prod has enough sample third-party orders to show the resolver working across list and detail.

## 3. Timesheets - Manual Hour Adjustment + Configurable Auto Clock-Out

Ticket title:

- `Timesheets - manual hour adjustment + configurable auto clock-out (web dashboard)`

Implemented in website repo:

- `docs/PLAN-2026-06-29-TIMESHEETS-MANUAL-ADJUSTMENT-AUTO-CLOCKOUT.md`
- `supabase/migrations/20260629120000_admin_adjust_staff_shift.sql`
- `app/dashboard/staff/timesheets/ShiftAdjustmentDialog.tsx`
- Timesheet page/table/export paths updated for adjusted values.

Scope:

- Manual manager corrections are implemented.
- Configurable auto clock-out is intentionally deferred because it overlaps with POS force-clock-out and scheduling behavior.

Dashboard QA:

1. Apply the migration on staging first.
2. Open `/dashboard/staff/timesheets`.
3. Pick a staff shift with clock-in and clock-out values.
4. Open the adjustment dialog.
5. Change clock-in, clock-out, and break minutes.
6. Add a manager reason/note.
7. Save.
8. Expected: table updates to adjusted hours.
9. Refresh page.
10. Expected: adjusted values persist.
11. Export timesheets if export is available.
12. Expected: export uses adjusted values.
13. Try invalid values, such as clock-out before clock-in.
14. Expected: clear validation error, no bad save.

Supabase QA:

```sql
SELECT proname
FROM pg_proc
WHERE proname = 'admin_adjust_staff_shift';

SELECT *
FROM public.staff_shifts
WHERE location_id = '<location_id>'
ORDER BY updated_at DESC
LIMIT 20;
```

Expected:

- RPC exists after migration.
- Adjusted shift row has the corrected values and audit fields expected by the migration.

Record video:

- Yes. This is one of the clearest dashboard demos: before hours, edit, save, refresh, export/check output.

## 4. Bay Ridge Owner Identity Relink

Ticket title:

- `[DATA] Owner mis-provisioned (pos_only, no Clerk link) - "Member not found" on reactivate - Bay Ridge House of Wings`

Documented in website repo:

- `docs/PLAN-2026-06-22-BAY-RIDGE-OWNER-IDENTITY-RELINK.md`

Scope:

- Data remediation and identity relink.
- No POS UI change is expected.
- POS is affected only because POS/dashboard access both depend on shared staff/member identity.

Current status:

- Not complete until live Clerk org membership and Supabase rows are repaired.
- Requires senior/prod-authorized execution.

Dashboard QA after repair:

1. Impersonate Bay Ridge House of Wings.
2. Open Staff & Access.
3. Find owner Moe Money.
4. Reactivate.
5. Expected: no `Member not found` toast.
6. Deactivate and reactivate again.
7. Expected: both transitions work.
8. Confirm owner can log into dashboard.
9. If POS PIN is needed, reset/generate PIN separately.

Supabase QA:

```sql
SELECT sp.id,
       sp.account_type,
       sp.user_id,
       sp.is_active,
       m.id AS member_id,
       m.organization_id,
       lm.id AS location_member_id,
       lm.role_code,
       lm.is_active AS location_member_active
FROM public.staff_profiles sp
LEFT JOIN public.members m
  ON m.staff_profile_id = sp.id
  OR m.user_id = sp.user_id
LEFT JOIN public.location_members lm
  ON lm.staff_profile_id = sp.id
WHERE sp.id = 'bf0234fb-3270-49d9-b1a4-2600a8973752';

SELECT sp.account_type, COUNT(*)
FROM public.staff_profiles sp
LEFT JOIN public.members m
  ON m.staff_profile_id = sp.id
  OR m.user_id = sp.user_id
WHERE m.id IS NULL
GROUP BY sp.account_type;
```

Expected:

- Bay Ridge owner has `account_type = 'clerk'`.
- `staff_profiles.user_id = 'user_3D36TxS8Ysfd4Qefg0kLOeXvAOi'`.
- A `members` row exists for the same Clerk user and Bay Ridge Clerk organization.
- No unintended dashboard/Clerk staff profiles are missing a `members` row.

Record video:

- Optional. Better evidence is SQL before/after plus a short dashboard reactivation screen recording.

## POS Tickets Ready For Tablet QA In The POS Repo

## 5. End of Day - Review Staff Deep Link

Ticket title:

- `End of Day - "Review staff" does not deep-link to the staff member blocking checkout`

Observed POS implementation:

- `components/settings/end-of-day/steps/EodStepOverview.tsx`
- `app/(profiles-and-timeclock)/timeclock.tsx`

Implementation behavior observed:

- `Shifts Reviewed` blocker card passes an action.
- `Review staff` quick action uses the same staff route.
- Timeclock reads:
  - `reviewMode`
  - `focusEmployeeIds`
  - `focusStaffProfileIds`
- Timeclock sorts/focuses unresolved rows and scrolls to the target row.

POS QA:

1. On the tablet, clock in one staff member and leave them active.
2. Open `Settings -> End of Day`.
3. Confirm Overview shows `Shifts Reviewed` as failed or blocked.
4. Tap `Review staff`.
5. Expected: Daily Shift Report opens in review-focus mode.
6. Expected: unresolved staff row is highlighted and scrolled into view.
7. Go back to Overview.
8. Tap the `Shifts Reviewed` blocker card itself.
9. Expected: same focused behavior.
10. Test with multiple active staff.
11. Expected: unresolved rows are surfaced, first target focused.
12. Test with no active blocker.
13. Expected: normal Timeclock screen with no stale focus banner.

Supabase QA:

```sql
SELECT id, staff_profile_id, location_id, status, clock_in_time, clock_out_time
FROM public.staff_shifts
WHERE location_id = '<location_id>'
ORDER BY clock_in_time DESC
LIMIT 20;
```

Record video:

- Yes. Short video from End of Day blocker to highlighted staff row is enough.

## 6. Daily Shift Report Calendar Off-By-One

Ticket title:

- `Daily Shift Report calendar is off by one - selecting a date loads the previous day`

Observed POS implementation:

- `app/(profiles-and-timeclock)/timeclock.tsx`

Implementation behavior observed:

- Calendar selection stores `day.dateString` directly.
- Selected date display uses a local date parser.
- Query bounds use the store timezone through Luxon where available.

POS QA:

1. Open `Timeclock -> Daily Shift Report`.
2. Tap today's date.
3. Expected: selected pill, calendar highlight, and rows all match today.
4. Tap yesterday.
5. Expected: no previous-day offset.
6. Tap the 1st of a month.
7. Tap the last day of a month.
8. If possible, test near local midnight.
9. Expected: selected date never rolls back one day.

Supabase QA:

```sql
SELECT id, staff_profile_id, location_id, clock_in_time, clock_out_time, status
FROM public.staff_shifts
WHERE location_id = '<location_id>'
ORDER BY clock_in_time DESC
LIMIT 30;
```

Expected:

- Rows shown by the tablet correspond to the selected merchant-local calendar date.

Record video:

- Yes. Useful evidence: tap 13, pill/highlight/list all show 13; test month boundary.

## 7. POS Printed Receipt - Remove Unused Alternative Pricing Line

Ticket title:

- `[POS] Remove "If paid by card" alternative-price line from printed receipt`

Observed POS task doc:

- `C:\Users\Ali DIka\Desktop\Dexa-POS\tasks\receipt-print-remove-alt-total-line.md`

Observed status:

- POS task doc says implementation completed.
- Targeted Jest verification noted: `npx jest __tests__/receipt-print-pricing-mode.test.ts`.
- Physical print QA is still required.

POS/device QA:

1. Create an order with dual-pricing enabled.
2. Pay fully with cash.
3. Print receipt on Star Micronics.
4. Expected: receipt shows cash total and amount paid only.
5. Expected: no `If paid by card` line.
6. Reprint the same receipt on Landi built-in printer if available.
7. Create or use a card-paid order.
8. Print receipt.
9. Expected: receipt shows card total and amount paid only.
10. Expected: no `If paid by cash` line.
11. Reprint a historical order.
12. Expected: no unused alternative pricing line.

Supabase QA:

```sql
SELECT id,
       order_number,
       payment_status,
       amount_paid,
       amount_due,
       cash_amount_due,
       total_amount,
       card_total,
       cash_total
FROM public.orders
WHERE id = '<order_id>';

SELECT id, order_id, payment_method, amount, tip_amount, is_cash_priced, status
FROM public.order_payments
WHERE order_id = '<order_id>'
ORDER BY created_at;
```

Record video:

- Yes. This is one of the best customer-facing proof videos. Include printer output for cash and card.

## Tickets Not Ready To Mark Done From Current Evidence

## 8. QA: Table Merge & Transfer + POS Dates/Calendars

Status:

- This appears to be a QA ticket for POS table/order sync and Previous Orders date/calendar behavior.
- I did not implement this in the website repo.

POS QA:

1. Create active order on Table A.
2. Create active order on Table B.
3. Merge Table A and Table B.
4. Expected: merged table state is clear and both checks/items are preserved.
5. Transfer the merged order to Table C.
6. Expected: Table A/B are released or show correct state; Table C owns the order.
7. Add an item after transfer.
8. Pay/close the order.
9. Open Previous Orders.
10. Expected: newest order appears first.
11. Use Previous Orders calendar/date picker for today and previous date.
12. Expected: order appears under the correct local date.

Supabase QA:

```sql
SELECT id, order_number, table_number, table_id, status, payment_status, created_at, closed_at
FROM public.orders
WHERE id = '<order_id>';

SELECT *
FROM public.order_items
WHERE order_id = '<order_id>'
ORDER BY created_at;
```

Record video:

- Yes if this is being closed, because merge/transfer is a complex flow.

## 9. Re-Price Stale Manual-Priced Items After Dual-Pricing Flip

Status:

- Not present in the current website repo.
- POS sweep says earlier work may exist but is not in the current POS branch.
- Do not mark Done until the implementation branch/migration is identified or the fix is rebuilt.

Dashboard/POS QA when implementation exists:

1. Pick an affected item with stale/manual cash price.
2. Confirm card price and cash price before fix.
3. Trigger the re-price path or apply the approved data correction.
4. Confirm card price remains unchanged.
5. Confirm cash price reflects the 4% discount rule.
6. Open POS menu and confirm same prices.
7. Add item to cart and verify totals.

Supabase QA:

```sql
SELECT id, name, price, cash_price
FROM public.menu_items
WHERE merchant_id = '<merchant_id>'
  AND cash_price IS NOT NULL
  AND cash_price >= price;

SELECT id, menu_item_id, custom_price, custom_cash_price
FROM public.menu_item_menus
WHERE custom_cash_price IS NOT NULL
  AND custom_cash_price >= custom_price;

SELECT id, menu_item_id, custom_price, custom_cash_price
FROM public.location_menu_item_overrides
WHERE custom_cash_price IS NOT NULL
  AND custom_cash_price >= custom_price;
```

Record video:

- Optional. Screenshots plus SQL before/after are usually enough unless the client needs a POS menu proof.

## 10. POS Menu Grid DESSERT Duplicate Card

Status:

- Not present in the current website repo.
- POS sweep says earlier dedupe work may exist but is not in the current POS branch.
- Treat as not ready until the implementation branch is found or a fix is added.

POS QA when implementation exists:

1. Open Saucy POS.
2. Go to `Order Line -> DESSERT -> Crepes & Waffles`.
3. Find the affected item.
4. Expected: item appears once.
5. Add it to the cart.
6. Expected: correct item ID, price, modifiers, and taxes.
7. Spot-check other categories for missing items.

Supabase QA:

```sql
SELECT menu_id, category_id, menu_item_id, COUNT(*)
FROM public.menu_item_menus
WHERE menu_id = '<menu_id>'
GROUP BY menu_id, category_id, menu_item_id
HAVING COUNT(*) > 1;
```

Expected:

- If source data has duplicates, UI/RPC should still dedupe by stable item key for rendering.
- If source data should be clean, resolve duplicate rows at the data layer.

Record video:

- Optional. A before/after screenshot is enough unless the duplicate was client-facing in a demo.

## 11. P0 Cash Payment Records $0.00 / Paid With Balance

Status:

- Not implemented in the website repo.
- Needs POS/backend/RPC investigation unless a separate branch already contains the fix.

POS QA when implementation exists:

1. Create an order with multiple items, tax, and service charge if applicable.
2. Pay full order with cash.
3. Expected: payment screen shows correct amount paid.
4. Expected: order closes as paid with zero balance.
5. Open Previous Orders.
6. Expected: paid amount is not `$0.00`.
7. Repeat with cash discount / dual-pricing enabled.
8. Repeat with tip if the flow supports it.

Supabase QA:

```sql
SELECT id,
       order_number,
       status,
       payment_status,
       amount_paid,
       amount_due,
       cash_amount_due,
       total_amount,
       card_total,
       cash_total
FROM public.orders
WHERE id = '<order_id>';

SELECT id, payment_method, amount, tip_amount, is_cash_priced, status
FROM public.order_payments
WHERE order_id = '<order_id>'
ORDER BY created_at;
```

Expected:

- Payment row amount is not `0.00`.
- Order is paid only if remaining balance is actually zero.
- Cash/card dual totals remain internally consistent.

Record video:

- Yes. This is P0 and should have POS payment proof plus Supabase proof.

## 12. POS Offline Order Never Syncs / Pay-After-Paid / Clipped New Order

Status:

- Not implemented in the website repo.
- Likely belongs to POS table/offline sync work.

POS QA:

1. Start online.
2. Create an order.
3. Disable network.
4. Add items while offline.
5. Confirm offline/queued state is visible.
6. Re-enable network.
7. Expected: order syncs with real items, not an empty server shell.
8. Pay the order.
9. Attempt a pay-after-paid edge path.
10. Expected: duplicate payment is blocked or safely reconciled.
11. Check `New Order` button at target tablet resolution.
12. Expected: button is not clipped.

Supabase QA:

```sql
SELECT id, order_number, status, payment_status, amount_paid, total_amount, created_at, updated_at
FROM public.orders
WHERE order_number = '<order_number>'
ORDER BY created_at DESC;

SELECT id, order_id, menu_item_id, quantity, unit_price
FROM public.order_items
WHERE order_id = '<order_id>';
```

Expected:

- No empty order shell after reconnect.
- Synced order has item rows and correct totals.
- Paid order cannot be paid again.

Record video:

- Yes. This is high-value because it proves offline queue, reconnect, and payment guard behavior.

## 13. Order Numbers Reset At UTC Midnight + Previous Orders Newest-First

Status:

- Not present in the current POS branch according to the existing POS sweep.
- Needs implementation branch or new backend/POS work.

POS QA when implementation exists:

1. Confirm location timezone.
2. Create orders before and after UTC midnight but before local midnight.
3. Expected: sequence does not reset at UTC midnight.
4. Create orders across local midnight.
5. Expected: sequence resets only at the merchant-local business date boundary.
6. Open Previous Orders.
7. Expected: newest order first.
8. Use calendar/date picker.
9. Expected: local dates match order business date.

Supabase QA:

```sql
SELECT pg_get_functiondef('public.generate_order_number(uuid, uuid)'::regprocedure);

SELECT id, order_number, location_id, created_at, closed_at
FROM public.orders
WHERE location_id = '<location_id>'
ORDER BY created_at DESC
LIMIT 50;
```

Expected:

- Order-number function uses location timezone/local business date, not raw `CURRENT_DATE`.
- Previous Orders sorts newest-first.

Record video:

- Yes if implementation exists. Otherwise capture SQL/function proof and Previous Orders sort proof after fix.

## What To Test First

1. POS tablet: End of Day Review staff deep link.
2. POS tablet: Daily Shift Report date selector.
3. POS physical printer: printed receipt alternate-price removal.
4. Website dashboard: Timesheets manual adjustment after staging migration.
5. Website dashboard: POS settings location/station override after staging migration.
6. Website dashboard: delivery-platform logo web surfaces.
7. Data/admin: Bay Ridge relink only after senior/prod authorization.

## Best Tickets For Senior/Customer Video

1. POS printed receipt alternate-price removal.
2. Website POS settings inheritance and station overrides.
3. Timesheets manual shift adjustment.
4. End of Day Review staff deep link.
5. Daily Shift Report no off-by-one.
6. Delivery-platform logo web sweep, if you have Grubhub/DoorDash/Uber Eats sample orders.
7. Cash payment P0, offline sync, and order-number midnight tickets only after their implementation branch is confirmed.

