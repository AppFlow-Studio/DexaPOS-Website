# Internal Tracker: Appflow Studio Cafe End-to-End QA

## Objective

Track live QA execution for the full merchant lifecycle:
admin invite -> owner onboarding -> staff/access -> menu -> locations -> POS smoke.

## Scope Source

Source ticket: user-provided E2E QA checklist (March 9, 2026).

## Test Environment

- Date: 2026-03-09
- Tester: Ali
- Assistant support: Codex
- Merchant target: Appflow Studio Cafe

## Required Access Matrix

| Role | Needed For | User | Ready |
|---|---|---|---|
| HQ admin (`hq.platform_admin` or `hq.super_admin`) | Flow 1 invite + org verification | TBD | [ ] |
| Merchant owner #1 | Flow 1/2/3/4/5 execution | TBD | [ ] |
| Merchant owner #2 | Flow 2 owner-to-owner validation | TBD | [ ] |
| Employee accounts | Flow 2 role invite validation | TBD | [ ] |
| POS device/location | Flow 5 PIN + order/payment | TBD | [ ] |

## Execution Plan

1. Validate access matrix.
2. Execute Flow 1 fully before Flow 2.
3. Execute Flow 3 before Flow 4 (so inheritance tests have menu data).
4. Execute Flow 5 last (depends on prior setup).
5. Capture evidence inline and mirror summary to user-facing doc.

## Flow Status Board

| Flow | Name | Status | Notes |
|---|---|---|---|
| 1 | Admin -> Owner Onboarding | In Progress | FK blocker resolved; step 1/2 and DB association passed, continue remaining checks |
| 2 | Owner -> Staff and Access Management | Blocked | Second invited email can log in but is not mapped to `merchant.owner` |
| 3 | Menu Setup | Pending |  |
| 4 | Location Management | In Progress | New location creation and per-location menu/category setup confirmed |
| 5 | Core POS Smoke Test | Pending |  |

## High-Risk Assertions

1. Owner membership mapping in `members` must be correct after invite acceptance.
2. Owner must exist in both `location_members` and `staff` for all locations.
3. Location-level menu/modifier/category overrides must not leak across locations.
4. POS totals (item + modifier + tax + discount) must match dashboard history.

## SQL Verification Pack

### A) Owner membership to merchant org

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

### B) Owner coverage across all locations

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

### C) POS smoke order/payment confirmation

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

## Live QA Log

| Timestamp | Flow | Step | Result | Evidence | Follow-up |
|---|---|---|---|---|---|
| 2026-03-10 | 1 | Admin invite owner | Blocked | Error: `insert or update on table "merchants" violates foreign key constraint "merchants_clerk_org_id_fkey"` | No fix yet, document-only per request |
| 2026-03-10 | 2 | Owner invite second owner | Blocked | Invite accepted/login works, but DB role check has no `merchant.owner` for second email | Keep as blocker, continue other non-owner-dependent checks |
| 2026-03-11 | Admin merchant detail open | Blocked -> Retest Pending | Module-not-found for `resend` and `twilio` from `app/actions/orders/send-receipt.ts` | Added packages locally (`pnpm add resend twilio`), re-test page load |
| 2026-03-11 | 1 | Steps 1-2 + owner membership check | Pass | Merchant wizard create/invite succeeded; owner linked in `members` | Keep original blocker log entry as historical evidence |
| 2026-03-11 | Admin merchants list visibility | Pass | Non-active merchants now visible in admin merchant list | Fixed client-side scoping to apply only for `hq.manager` |
| 2026-03-11 | Location wizard manager invite | Blocked -> Fix Applied (retest pending) | Error `42501`: new row violates RLS policy for `location_invites`; no email sent | Patched manager-invite path to create Clerk invitation + service-role DB insert + explicit permission check |
| 2026-03-12 | 1/2 | Merchant invitation retest (another merchant) | Pass | User confirmation | Invitation flow worked in latest QA run |
| 2026-03-12 | 4 | New location with menu + categories | Pass | User confirmation | Location creation succeeded; menu/category setup worked for that location |
| 2026-03-12 | 4 | Location wizard manager invite retest | Pass | User confirmation | Invite path now works in QA run; prior `42501` not reproduced |

## Defects

| ID | Severity | Flow | Summary | Repro | Status | Owner |
|---|---|---|---|---|---|---|
| BUG-001 | High | 1 | Merchant invite fails due FK `merchants_clerk_org_id_fkey` on `merchants` insert/update | `/manage/users` -> invite/create new merchant -> submit | Fixed (2026-03-11) | Ali |
| BUG-002 | High | 2 | Owner-to-owner flow fails role mapping: accepted second invite does not produce `merchant.owner` role | Invite second owner -> accept -> login -> query `members.role` by email | Open | Ali |
| BUG-003 | Medium | Admin merchant detail | Missing runtime deps (`resend`, `twilio`) caused compile failure on merchant detail route | Open `/manage/merchants/<org_id>` -> Next compile fails in `app/actions/orders/send-receipt.ts` | Retest Pending | Ali |
| BUG-004 | Medium | Admin merchants list | Merchant list showed only active merchants due non-manager users being over-scoped by client access filter | Login as platform admin -> open `/manage/merchants` -> onboarding/non-active rows missing | Fixed (2026-03-11) | Ali |
| BUG-005 | High | Location wizard manager invite | Invite flow failed with `location_invites` RLS violation (`42501`) and no invitation email dispatch | Create location -> Assign Manager `invite_new` -> submit | Fixed (2026-03-12, retest passed) | Ali |

## Exit Criteria

- [ ] All checklist items passed or explicitly accepted as known issues.
- [ ] Critical/high defects either fixed or deferred with owner/date.
- [ ] Final result copied to user-facing QA doc.
