# Appflow Studio Cafe End-to-End QA

## Ticket Summary

End-to-end developer QA for Appflow Studio Cafe, from admin invite through live POS smoke flow.

## Run Info

- Date: 2026-03-09
- Tester: Ali
- Environment: Local/Dev
- Merchant under test: Appflow Studio Cafe
- Status: Blocked on Flow 1 (merchant invite creation FK error)

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

- Current blocker: inviting a new merchant fails with DB error  
  `insert or update on table "merchants" violates foreign key constraint "merchants_clerk_org_id_fkey"`.

- [ ] Admin invites owner from internal admin dashboard
- [ ] Invite email received and link works
- [ ] Clerk auth flow completes without errors
- [ ] Owner lands on merchant dashboard successfully
- [ ] Owner dashboard sections load (locations, staff, menu, orders, reporting, settings)
- [ ] DB confirms owner is linked to merchant org (`members`)

## Flow 2: Owner -> Staff and Access Management

- Current blocker: second invited email can log in, but does not resolve to `merchant.owner` role after acceptance.

- [ ] Owner invites second owner
- [ ] Second owner accepts and sees same merchant dashboard
- [ ] Owner invites employees for role types (manager/cashier/server)
- [ ] Owner sets own 4-digit POS PIN
- [ ] Owner has `location_members` at every location
- [ ] Owner has `staff` at every location
- [ ] Owner can authenticate on POS at any location with PIN

## Flow 3: Menu Setup

- [ ] Create menu (for example Main Menu / Drinks Menu)
- [ ] Create categories and confirm order
- [ ] Create menu items with pricing/tax/photo
- [ ] Create modifier groups/options
- [ ] Assign modifiers to relevant items
- [ ] Configure menu schedule (if used)
- [ ] Menu appears in dashboard + POS
- [ ] POS item totals include modifier pricing correctly
- [ ] Schedule visibility is correct by time window

## Flow 4: Location Management

- [ ] Create second location with address/tax/settings
- [ ] Verify location has access to merchant menu
- [ ] Override item price/availability at location level
- [ ] Override modifier behavior at location level
- [ ] Override/reorder/hide categories at location level
- [ ] Verify owner auto-added as staff + location member at new location

## Flow 5: POS Smoke Test

- [ ] Login to POS at Studio Cafe using owner PIN
- [ ] Create cart with item + modifiers
- [ ] Apply discount (if enabled)
- [ ] Process card payment successfully
- [ ] Print/view receipt
- [ ] Verify order appears in POS history
- [ ] Verify order appears in web dashboard order history
- [ ] Verify receipt data totals/fields are accurate

## Live Feedback Log

| Time | Flow/Step | Result (Pass/Fail/Blocked) | Evidence | Notes |
|---|---|---|---|---|
| 2026-03-10 | Flow 1 / Step 1 (Admin invites owner) | Blocked | Error popup / server response | `insert or update on table "merchants" violates foreign key constraint "merchants_clerk_org_id_fkey"` |
| 2026-03-10 | Flow 2 / Step 1 (Owner invites second owner) | Blocked | Second email login succeeded, role check failed | User can access account but is not mapped as `merchant.owner` |

## Bug/Blocker Log

| ID | Flow | Severity | Issue | Repro Steps | Screenshot/Link | Status |
|---|---|---|---|---|---|---|
| QA-001 | Flow 1 | High | Merchant invite fails on `merchants_clerk_org_id_fkey` FK constraint | 1) Go to `/manage/users` 2) Start invite/new merchant flow 3) Submit merchant invite 4) Observe FK error | Pending user evidence | Open |
| QA-002 | Flow 2 | High | Owner-to-owner invite acceptance does not map second user to `merchant.owner` | 1) Invite second owner email 2) Accept invite/login 3) Run role query in DB 4) Observe no `merchant.owner` row | Pending user evidence | Open |

## Final Signoff

- [ ] All five flows passed end-to-end
- [ ] All blockers documented with repro and evidence
- [ ] Ready for real merchant onboarding
