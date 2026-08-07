# Subscription Tier Video Flow + Responsive Audit Checklist

## Purpose

This document combines:

1. the **merchant/HQ subscription tier QA + video recording flow**
2. the **admin web responsive audit checklist**

Use this as the working checklist while recording and auditing.

---

## Part 1 — Subscription Tier Video Flow

### Goal

Show the merchant-tier visibility flow and the HQ assignment flow end-to-end without changing or deleting existing merchant locations.

### Ground Rules

- Do **not** delete any existing test locations.
- Tier limits in V1 are **warning-only**, not hard blocking.
- Existing location-based SaaS billing remains separate from merchant-tier visibility.

### Routes

#### Merchant

- `/dashboard/subscriptions`
- `/dashboard/billing` should redirect to `/dashboard/subscriptions`

#### HQ

- `/manage/subscriptions`
- `/manage/subscriptions/<merchantId>`

### Recording Order

#### 1. Merchant with no assigned tier

Merchant view:

- open `/dashboard/subscriptions`

Expected:

- merchant has **no active plan**
- three tier cards visible:
  - `Basic`
  - `Multi-Location`
  - `Franchise`
- each card has `Contact Dexa`
- locations / devices / transactions / invoices still render

#### 2. HQ assigns a tier

HQ view:

- open `/manage/subscriptions/<merchantId>`
- go to `Merchant Tier`
- select a tier card
- set status to `Active`
- save

Expected:

- tier persists after refresh

#### 3. Merchant refresh after assignment

Merchant view:

- refresh `/dashboard/subscriptions`

Expected:

- current tier visible
- location coverage visible
- next charge visible
- `Manage plan` button visible

#### 4. Overage behavior

Use an over-limit merchant:

- `Basic` with 2 active locations
- or `Multi-Location` with 6 active locations

Expected:

- overage banner visible
- suggested upgrade visible
- no hard blocking

#### 5. Suspended tier

HQ:

- set merchant tier status to `Suspended`

Merchant:

- refresh `/dashboard/subscriptions`

Expected:

- suspended banner visible
- contact flow still available

#### 6. Route behavior

Merchant:

- open `/dashboard/billing`

Expected:

- redirect to `/dashboard/subscriptions`

### Quick QA Matrix

| Scenario | Expected |
| --- | --- |
| No tier assigned | 3 tier cards visible |
| Basic, 1 location | normal tier display |
| Basic, 2 locations | overage banner |
| Multi-Location, 5 locations | at-cap state |
| Multi-Location, 6 locations | overage banner |
| Franchise, 17 locations | no overage |
| Suspended | suspended banner |
| 0 devices | device empty state |

### Sign-Off Notes

Record:

- merchant route works
- HQ assignment works
- no location deletion needed
- overage is warning-only

---

## Part 2 — Admin Responsive Audit

### Goal

Audit the **admin web** across required breakpoints and produce a clean build spec for downstream implementation.

### This Is an Audit Ticket

For this ticket:

- audit
- screenshot
- classify
- recommend

Do **not** treat this as full responsive implementation.

### Breakpoints

| Breakpoint | Width | Target |
| --- | --- | --- |
| Mobile | 375px | iPhone portrait |
| Tablet portrait | 810px | iPad portrait |
| Tablet landscape | 1080px | iPad landscape |
| Desktop | 1920px | laptop / desktop |

### Severity Labels

- `P0` = broken / unusable / critical action inaccessible
- `P1` = functional but confusing / cramped / poor hierarchy
- `P2` = polish / spacing / visual cleanup

### What To Capture Per Screen

For each `(view x breakpoint)` capture:

- screenshot
- what is broken
- severity
- what must remain visible
- what can be hidden
- what should become:
  - card list
  - accordion
  - full-screen modal
  - larger-screen notice

### Core Design Rules

- mobile: single column
- tablet portrait: compact two-column or collapsed sidebar
- desktop: full layout
- no horizontal scroll
- no clipped dialogs
- touch targets >= 44x44
- hide secondary metadata instead of compressing everything

### Views To Audit

Audit all relevant admin web views:

1. HQ dashboard
2. merchants list
3. merchant detail
4. merchant subscriptions
5. merchant billing
6. locations list / location detail
7. menu management
8. staff directory
9. settings home
10. orders
11. reports / analytics
12. online ordering management
13. stations
14. printers
15. payment terminals
16. discounts
17. inventory
18. disputes / settlements if active

### Priority Info By View

#### Merchants list

Mobile:

- merchant name
- status
- location count

Tablet:

- carrier
- last activity

Desktop:

- created date
- MRR
- full table

#### Merchant detail

Mobile:

- name
- status
- today sales
- support tickets count

Tablet:

- quick links
- weekly chart

Desktop:

- full widgets

#### Merchant subscriptions / billing

Mobile:

- merchant name
- plan tier
- billing status
- next charge
- payment issue banner

Tablet:

- location breakdown
- invoices summary

Desktop:

- full workspace

#### Locations

Mobile:

- name
- city
- status

Tablet:

- stations count
- today orders

Desktop:

- full metadata

#### Menu management

Mobile:

- categories accordion
- item edit full-screen modal

Tablet:

- two-pane

Desktop:

- three-pane

#### Staff

Mobile:

- name
- role
- active toggle

Tablet:

- email
- last sign-in

Desktop:

- full table

#### Orders / reports

Mobile:

- cards with order number
- status
- total

Tablet:

- sortable list

Desktop:

- full table

#### Online ordering

Mobile:

- pause/resume
- prep time
- pending orders

Tablet:

- menu visibility
- recent orders

Desktop:

- full dashboard

#### Stations / Printers / Payment Terminals

Mobile:

- read-only summary
- larger-screen notice for configuration

Tablet:

- full configuration if stable

Desktop:

- full configuration

### Suggested Notion Row Format

Use one row per `(view x breakpoint)`:

| View | Breakpoint | Screenshot | Broken Now | Severity | Must Keep | Can Hide | Recommended Mobile Pattern | Larger-Screen Notice Needed? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

### Output Goal

At the end of the audit you should have:

- screenshot evidence
- severity per issue
- exact mobile/tablet behavior recommendation
- clear handoff for downstream implementation

