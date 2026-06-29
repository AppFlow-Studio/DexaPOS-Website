# Senior Handoff - Latest Ticket Work Summary

Date: 2026-06-30

Purpose: summarize the latest tickets worked in this repo, what shipped in code, what still needs migration/manual QA, and what should not be claimed complete yet.

## Executive Summary

Most recent work is implemented in code but not fully manually QA'd. Treat the current state as "implementation ready for staging validation", not "fully closed".

Main risk areas:

- Several tickets include SQL migrations that must be applied on staging before QA.
- Some parent tickets include POS/KDS work, but this repo only contains the web/dashboard part.
- QR and identity relink both require hosted/prod-like validation, not just local testing.
- Auto clock-out is intentionally not shipped until ownership with scheduling/POS force-clock-out is confirmed.

## Ticket Status Table

| Ticket | Repo Scope | Code Status | Migration | Manual QA | Remaining Work |
| --- | --- | --- | --- | --- | --- |
| `[POS/Web] Location-level POS Settings surface + per-station overrides` | Website/web dashboard only | Implemented | Pending apply | Pending | POS tablet consumption is separate |
| `[POS+Web / Orders/KDS] Render delivery-platform logo...` | Website web surfaces only | Implemented | None | Pending | POS/KDS rendering still separate |
| `Timesheets - manual hour adjustment + configurable auto clock-out` | Website dashboard | Manual adjustment implemented | Pending apply | Pending | Auto clock-out deferred |
| `Bay Ridge Owner Identity Relink` | Website + live data repair | Guard/script implemented | No app migration | Pending prod repair | Clerk/Supabase live repair required |
| `QR Dine-In Unified` | Website | Mostly implemented | Confirm target env | Hosted QA pending | Payment whitelist/prod dummy/POS follow-up |
| `Dashboard Staff + Sidebar Polish` | Website dashboard only | Implemented | None | Pending | Confirm UX in impersonation |
| `Modifier Display Order Alignment` | Website dashboard/menu | Implemented | Applied per latest note | Pending | Validate `/items` modifiers + reorder persistence |
| `Single-Location Global Modifier And Recipe RPCs` | Website backend/RPC | Implemented | Applied per latest note | Pending | Overlay cleanup/audit still sensitive |

## 1. [POS/Web] Location-level POS Settings surface + per-station overrides

Plan doc:

- `docs/PLAN-2026-06-30-LOCATION-POS-CONFIG-STATION-OVERRIDES-WEB.md`

Implemented:

- Added `stations.pos_config_overrides`.
- Added backend resolver `get_effective_pos_config(p_station_id)`.
- Added location save RPC `set_location_pos_config_v1(...)`.
- Added station override save RPC `set_station_pos_config_overrides_v1(...)`.
- Added shared web config contract:
  - `lib/pos/pos-config.ts`
- Added dashboard actions:
  - `app/dashboard/actions/pos-settings.ts`
- Added dashboard page:
  - `app/dashboard/settings/pos/page.tsx`
- Linked Settings hub to `/dashboard/settings/pos`.

Important scope boundary:

- This is web/dashboard only.
- POS tablet consumption of `get_effective_pos_config(...)` is not implemented in this repo.
- KDS config and hardware assignment are intentionally out of v1.

Needs before close:

- Apply `supabase/migrations/20260630110000_location_pos_config_station_overrides.sql` on staging.
- Manual QA `/dashboard/settings/pos`.
- Verify SQL resolver output:

```sql
select public.get_effective_pos_config('<station_id>'::uuid);
```

## 2. [POS+Web / Orders/KDS] Render delivery-platform logo in every KDS state + POS previous-orders + web admin

Plan doc:

- `docs/PLAN-2026-06-29-DELIVERY-PLATFORM-LOGOS-WEB.md`

Implemented in web:

- Shared web resolver:
  - `lib/orders/delivery-platform.ts`
- Shared badge:
  - `components/dashboard/orders/DeliveryPlatformBadge.tsx`
- Merchant dashboard order list/detail surfaces updated.
- HQ merchant order list/detail surfaces updated.
- Platform normalization handles common casing/provider variants.

Important scope boundary:

- Parent ticket includes POS/KDS and POS previous orders.
- This repo implements web surfaces only.
- POS/KDS rendering still needs POS repo work.

Needs before close:

- Manual QA in merchant `/dashboard/orders`.
- Manual QA in HQ merchant Orders tab.
- Confirm Grubhub/DoorDash/Uber Eats badges render on live/staging data.
- Confirm first-party website/app orders use fallback/no broken image.

## 3. Timesheets " manual hour adjustment + configurable auto clock-out

Plan doc:

- `docs/PLAN-2026-06-29-TIMESHEETS-MANUAL-ADJUSTMENT-AUTO-CLOCKOUT.md`

Implemented:

- Manual shift adjustment path for `/dashboard/staff/timesheets`.
- Adjustment dialog:
  - `app/dashboard/staff/timesheets/ShiftAdjustmentDialog.tsx`
- RPC migration:
  - `supabase/migrations/20260629120000_admin_adjust_staff_shift.sql`
- Timesheet page/table/export hooks updated for corrected shift values.

Important scope boundary:

- Manual correction is implemented first.
- Configurable auto clock-out is intentionally gated because it overlaps with scheduling auto-close and POS force-clock-out behavior.

Needs before close:

- Apply migration on staging.
- QA manager adjustment flow:
  - edit clock-in/clock-out/breaks
  - confirm recalculated hours
  - confirm export reflects adjusted hours
- Decide owner/behavior for auto clock-out before implementing scheduler/worker.

## 4. Bay Ridge Owner Identity Relink

Plan doc:

- `docs/PLAN-2026-06-22-BAY-RIDGE-OWNER-IDENTITY-RELINK.md`

Implemented:

- Documented root cause for owner `pos_only` + missing `members` row.
- Added guard against creating dashboard-owner roles through HQ POS-only path:
  - `app/manage/actions/admin-merchant/staff.ts`
- Added repair utility:
  - `scripts/repair-staff-clerk-link.ts`

Important scope boundary:

- This is not complete until live Clerk/Supabase data repair is executed.
- POS repo does not need code for the relink itself.
- PIN login remains separate and may still need reset after relinking.

Needs before close:

- Senior/prod-authorized repair against live Bay Ridge data.
- Clerk org membership must exist.
- `staff_profiles`, `members`, and `location_members` must all be linked.
- Verify dashboard login.
- Verify Staff Directory deactivate/reactivate no longer shows `Member not found`.

## 5. QR Dine-In Unified

Plan doc:

- `docs/PLAN-2026-05-27-QR-DINE-IN-UNIFIED.md`

Runbook:

- `docs/RUNBOOK-PAYMENT-WHITELIST-SYNC.md`

Implemented:

- QR storefront table route and guest ordering flow.
- Dashboard QR manager.
- QR analytics panel.
- Guest alerts panel.
- Better unavailable-state messages.
- Copy-link action.
- Guest call-server accessibility and validation improvements.

Important scope boundary:

- Code-side web work is mostly complete.
- Do not mark fully done without hosted/prod-like end-to-end validation.

Needs before close:

- Confirm all required QR migrations are applied to target environment.
- Deploy web changes.
- Validate payment-origin whitelist/NMI portal setup.
- Test hosted flow:
  - scan QR
  - open table page
  - place paid order
  - confirm order appears in dashboard
  - confirm QR analytics paid/revenue values update
  - confirm guest alert/realtime behavior
- POS follow-up remains separate if POS needs table-order awareness.

## 6. Dashboard Staff + Sidebar Polish

Plan doc:

- `docs/PLAN-2026-06-02-DASHBOARD-STAFF-SIDEBAR-POLISH.md`

Implemented:

- Merchant dashboard staff detail sheet redesigned.
- Added internal section navigator instead of long stacked cards.
- Reduced duplicated header/profile information after QA feedback.
- Sidebar polish stream tracked separately.

Important scope boundary:

- Merchant dashboard staff detail sheet only.
- `/dashboard/staff` list/table was not the redesign target.
- HQ/admin `/manage/*` staff pages were not the redesign target.
- No POS work.
- No backend/schema change.

Needs before close:

- Manual QA in impersonation:
  - staff detail opens
  - section navigation works
  - no duplicate contact/role blocks in the header
  - POS PIN/password/demote actions still visible where expected

## 7. Modifier Display Order Alignment

Plan doc:

- `docs/PLAN-2026-06-04-MODIFIER-DISPLAY-ORDER-ALIGNMENT.md`

Implemented:

- Backend migration for modifier display-order alignment.
- Merchant-facing reorder controls exist in:
  - item edit for attached modifier groups
  - modifier group sheet for option order
  - modifiers page for guarded library group order
- Uses existing display-order columns; no schema redesign beyond required RPC/order handling.

Important scope boundary:

- Website repo only for this phase.
- Modifier semantics/pricing/default options were not changed.
- This is a sensitive menu flow because modifiers are connected to item, menu, and POS rendering.

Needs before close:

- Manual QA with two items sharing one modifier group.
- Reorder group on Item A and confirm Item B remains unchanged.
- Reorder options inside a group and confirm persistence after reload.
- Confirm `/items` route still shows modifiers after merge.
- Confirm POS sync/rendering if senior expects POS parity.

## 8. Single-Location Global Modifier And Recipe RPCs

Plan doc:

- `docs/PLAN-2026-06-06-SINGLE-LOCATION-GLOBAL-MODIFIER-RECIPE-RPCS.md`

Implemented:

- Backend/RPC stream for single-location menu model.
- Fixes missing global modifier path when `location_id` is omitted.
- Removes/defends against recipe overload ambiguity.
- Preserves location-scoped modifier behavior for multi-location merchants.

Important scope boundary:

- Backend-focused ticket.
- Overlay cleanup must be careful, staging-first.
- Charcoal cleanup should be sequenced separately.

Needs before close:

- Confirm staging migration applied.
- Run overlay audit.
- Validate single-location global modifier edit writes base record.
- Validate multi-location override behavior is not regressed.
- Confirm no RLS/policy regression around modifiers.

## Do Not Claim Complete Yet

Do not claim these are fully closed until verified:

- QR Dine-In hosted end-to-end payment and analytics.
- Timesheets manual adjustment after migration apply.
- POS Settings station override resolver after migration apply.
- Bay Ridge owner relink before live data repair.
- Delivery platform logos for POS/KDS.
- Auto clock-out scheduler/worker.
- Modifier reorder after manual QA against shared groups.

## Recommended QA Order

1. Apply required staging migrations:
   - `supabase/migrations/20260629120000_admin_adjust_staff_shift.sql`
   - `supabase/migrations/20260630110000_location_pos_config_station_overrides.sql`
2. QA POS Settings page at `/dashboard/settings/pos`.
3. QA Timesheets manual adjustment at `/dashboard/staff/timesheets`.
4. QA Delivery Platform logo web surfaces.
5. QA Modifier reorder/display order.
6. QA Staff detail polish in impersonation.
7. QA QR hosted flow last because it depends on deploy/payment-origin/NMI setup.
8. Run Bay Ridge relink only with prod-authorized access and senior approval.

## Validation Already Attempted

- `git diff --check` passed for latest POS settings files.
- Targeted TypeScript syntax transpile passed for latest POS settings files.
- Full lint/typecheck was blocked locally:
  - `npm run lint` failed because `next` is not available on PATH in this workspace.
  - direct `tsc` failed before project files due local `node_modules/typescript/lib/lib.dom.d.ts` parse error.

## Current Working Tree Note

There are multiple uncommitted ticket streams in the working tree. Do not assume every changed file belongs to one ticket. Before opening a PR, group files by ticket or explicitly state this is a combined PR containing:

- POS settings web
- delivery platform logos web
- timesheets manual adjustment
- any remaining earlier uncommitted stream files

