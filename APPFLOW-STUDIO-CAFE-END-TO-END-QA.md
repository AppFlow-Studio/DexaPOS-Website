# Appflow Studio Cafe End-to-End QA

## Ticket Summary

End-to-end developer QA for Appflow Studio Cafe, from admin invite through live POS smoke flow.

## Run Info

- Date: 2026-03-09
- Last updated: 2026-03-13
- Tester: Ali
- Environment: Local/Dev
- Merchant under test: Appflow Studio Cafe
- Status: In progress (Flows 1-4 passed; Flow 5 payment/receipt pending)

## Senior Handoff Summary (2026-03-13)

### Confirmed Passed

- Flow 1 passed end-to-end (invite, acceptance, DB org association, dashboard access).
- Flow 2 passed end-to-end (owner/staff/access management checks completed).
- Flow 3 passed except one pending check: menu appearance cross-check on both dashboard and POS.
- Flow 4 passed end-to-end (location creation + inheritance + overrides + owner assignment validation).
- Admin merchant list now shows onboarding/non-active statuses correctly.
- Location manager invite path retested successfully (previous RLS failure not reproduced).
- New location creation works, and per-location menu/category setup works.

### Open / Not Fully Closed

- Flow 3: `Menu appears in dashboard + POS` not yet completed in this pass.
- Flow 5: smoke test payment + receipt are still pending.

### Deferred in This Pass

- Full Flow 5 closure remains deferred until payment + receipt integration is finalized.

## Accounts You Need Before Starting

Use this table first. Mark each row before running Flow 1.

| Account Type | Purpose | Email/User | Access Confirmed |
|---|---|---|---|
| HQ admin (`hq.platform_admin` or `hq.super_admin`) | Send owner invite from internal admin | | [ ] |
| Owner test account #1 | Accept invite and run merchant dashboard setup | | [ ] |
| Owner test account #2 | Validate owner-to-owner invite flow | | [ ] |
| Employee test account(s) | Validate role-based staff invite flow (manager/cashier/server) | | [ ] |
| POS-capable location + device/tablet | Validate PIN login + order/payment flow | | [ ] |

## Where To Run Each Flow

- Admin invite flow: `/manage/users`
- Merchant dashboard landing: `/dashboard`
- Staff/invite management: `/dashboard/staff`
- Menu setup: `/dashboard/menu`, `/dashboard/menu/categories`, `/dashboard/menu/items`, `/dashboard/menu/modifiers`
- Location management: `/dashboard/locations`, `/dashboard/locations/new`, `/dashboard/locations/[locationId]/settings`
- Web order history check: `/dashboard/orders`

## Database Checks (Copy/Paste)

Replace placeholders before running.

### 1) Owner linked to merchant org

```sql
with target_merchant as (
  select id, name, clerk_org_id
  from merchants
  where lower(name) like lower('%Appflow Studio Cafe%')
  limit 1
),
target_user as (
  select id, email
  from users
  where lower(email) = lower('<OWNER_EMAIL>')
  limit 1
)
select
  tm.id as merchant_id,
  tm.name as merchant_name,
  tm.clerk_org_id,
  tu.id as user_id,
  tu.email,
  m.role as org_role
from target_merchant tm
left join target_user tu on true
left join members m
  on m.organization_id = tm.clerk_org_id
 and m.user_id = tu.id;
```

### 2) Owner has `location_members` + `staff` at every location

```sql
with target_merchant as (
  select id, clerk_org_id
  from merchants
  where lower(name) like lower('%Appflow Studio Cafe%')
  limit 1
),
target_owner as (
  select u.id, u.email
  from users u
  join target_merchant tm on true
  join members m
    on m.user_id = u.id
   and m.organization_id = tm.clerk_org_id
  where m.role = 'merchant.owner'
  limit 1
)
select
  l.id as location_id,
  l.name as location_name,
  exists (
    select 1
    from location_members lm
    join target_owner o on true
    where lm.location_id = l.id
      and lm.user_id = o.id
      and coalesce(lm.is_active, true) = true
  ) as has_location_member,
  exists (
    select 1
    from staff s
    join target_owner o on true
    where s.location_id = l.id
      and (
        s.user_id = o.id
        or lower(coalesce(s.email, '')) = lower(o.email)
      )
      and coalesce(s.is_active, true) = true
  ) as has_staff
from locations l
join target_merchant tm on tm.id = l.merchant_id
order by l.name;
```

### 3) Orders/payment smoke verification

```sql
with target_merchant as (
  select id
  from merchants
  where lower(name) like lower('%Appflow Studio Cafe%')
  limit 1
)
select
  o.id as order_id,
  o.created_at,
  o.status as order_status,
  op.id as payment_id,
  op.status as payment_status,
  op.payment_method,
  op.total_amount
from orders o
left join order_payments op on op.order_id = o.id
join target_merchant tm on tm.id = o.merchant_id
order by o.created_at desc
limit 20;
```

## Flow 1: Admin -> Owner Onboarding

- Historical blocker (`merchants_clerk_org_id_fkey`) is resolved.

- [x] Admin invites owner from internal admin dashboard
- [x] Invite email received and link works
- [x] Clerk auth flow completes without errors
- [x] Owner lands on merchant dashboard successfully
- [x] Owner dashboard sections load (locations, staff, menu, orders, reporting, settings)
- [x] DB confirms owner is linked to merchant org (`members`)

## Flow 2: Owner -> Staff and Access Management

- Historical owner role-mapping blocker is resolved in retest.

- [x] Owner invites second owner
- [x] Second owner accepts and sees same merchant dashboard
- [x] Owner invites employees for role types (manager/cashier/server)
- [x] Owner sets own 4-digit POS PIN
- [x] Owner has `location_members` at every location
- [x] Owner has `staff` at every location
- [x] Owner can authenticate on POS at any location with PIN

## Flow 3: Menu Setup

- [x] Create menu (for example Main Menu / Drinks Menu)
- [x] Create categories and confirm order
- [x] Create menu items with pricing/tax/photo
- [x] Create modifier groups/options
- [x] Assign modifiers to relevant items
- [x] Configure menu schedule (if used)
- [ ] Menu appears in dashboard + POS
- [x] POS item totals include modifier pricing correctly
- [x] Schedule visibility is correct by time window

## Flow 4: Location Management

- [x] Create second location with address/tax/settings
- [x] Verify location has access to merchant menu
- [x] Override item price/availability at location level
- [x] Override modifier behavior at location level
- [x] Override/reorder/hide categories at location level
- [x] Verify owner auto-added as staff + location member at new location

## Flow 5: POS Smoke Test

- [x] Login to POS at Studio Cafe using owner PIN
- [x] Create cart with item + modifiers
- [x] Apply discount (if enabled)
- [ ] Process card payment successfully
- [ ] Print/view receipt
- [x] Verify order appears in POS history
- [x] Verify order appears in web dashboard order history
- [ ] Verify receipt data totals/fields are accurate

## Live Feedback Log

| Time | Flow/Step | Result (Pass/Fail/Blocked) | Evidence | Notes |
|---|---|---|---|---|
| 2026-03-10 | Flow 1 / Step 1 (Admin invites owner) | Blocked | Error popup / server response | `insert or update on table "merchants" violates foreign key constraint "merchants_clerk_org_id_fkey"` |
| 2026-03-10 | Flow 2 / Step 1 (Owner invites second owner) | Blocked | Second email login succeeded, role check failed | User can access account but is not mapped as `merchant.owner` |
| 2026-03-11 | Admin merchant detail page open | Blocked -> Retest Pending | Next compile error: missing modules `resend` and `twilio` from `app/actions/orders/send-receipt.ts` | Installed dependencies locally via `pnpm add resend twilio`; verify page load again |
| 2026-03-11 | Flow 1 / Steps 1-2 + DB association | Pass | Merchant created from wizard, invite accepted, DB role row present | FK blocker resolved; original blocker kept for defect history |
| 2026-03-11 | Admin merchants list visibility | Pass | Merchant list now includes onboarding/non-active statuses | Fixed client-side over-scoping so non-manager admins can see full merchant list |
| 2026-03-11 | Location wizard manager invite | Blocked -> Fix Applied (retest pending) | RLS error on `location_invites` insert (`42501`); no invite email sent | Patched invite flow to send Clerk org invitation + service-role tracking insert with server-side permission check |
| 2026-03-12 | Merchant invitation retest (another merchant) | Pass | User confirmation | Invitation flow worked in latest QA run |
| 2026-03-12 | Flow 4 / New location with menu + categories | Pass | User confirmation | New location creation succeeded and per-location menu/category setup worked |
| 2026-03-12 | Flow 4 / Location wizard manager invite retest | Pass | User confirmation | Invite path now works in QA run (no RLS failure observed) |
| 2026-03-13 | Flow 1 + Flow 2 full regression | Pass | User confirmation | Foreign-key/invite path stable; owner/staff/access flow completed successfully |
| 2026-03-13 | Flow 3 completion pass | Partial Pass | User confirmation | All Flow 3 checks passed except `Menu appears in dashboard + POS` |
| 2026-03-13 | Flow 5 smoke pass | Partial Pass | User confirmation | Smoke checks passed except payment + receipt items |

## Bug/Blocker Log

| ID | Flow | Severity | Issue | Repro Steps | Screenshot/Link | Status |
|---|---|---|---|---|---|---|
| QA-001 | Flow 1 | High | Merchant invite fails on `merchants_clerk_org_id_fkey` FK constraint | 1) Go to `/manage/users` 2) Start invite/new merchant flow 3) Submit merchant invite 4) Observe FK error | Pending user evidence | Fixed (2026-03-11) |
| QA-002 | Flow 2 | High | Owner-to-owner invite acceptance does not map second user to `merchant.owner` | 1) Invite second owner email 2) Accept invite/login 3) Run role query in DB 4) Observe no `merchant.owner` row | Pending user evidence | Fixed (2026-03-13, retest passed) |
| QA-003 | Admin merchant details access | Medium | Merchant details page failed to compile due missing packages `resend` and `twilio` imported by `send-receipt.ts` | 1) Open `/manage/merchants/<org_id>` 2) Observe module-not-found error 3) Install deps | Logged in QA, local env patched, pending retest |
| QA-004 | Admin merchants list | Medium | Merchant list showed only active merchants; onboarding/suspended/cancelled were hidden | 1) Login as platform admin 2) Open `/manage/merchants` 3) Set status `All` 4) Observe only active merchants | Pending user evidence | Fixed (2026-03-11) |
| QA-005 | Flow 4/Location wizard | High | Assign-manager invite failed with RLS (`42501`) and no invitation email | 1) Create new location 2) Choose `Invite new manager` 3) Submit 4) Observe RLS error + no inbox email | User console log captured | Fixed (2026-03-12, retest passed) |

## Final Signoff

- [ ] All five flows passed end-to-end (Flow 3 dashboard/POS visibility check and Flow 5 payment/receipt still pending)
- [ ] All blockers documented with repro and evidence
- [ ] Ready for real merchant onboarding
