# QR Dine-In Foundation Plan

## Purpose

This document explains the QR dine-in ticket and turns it into a concrete implementation plan.

Use this as the working backend plan while the responsive audit and subscriptions QA happen in parallel.

---

## What This Ticket Is

This ticket builds the **structural backend foundation** for:

- scan a table QR
- open the merchant online store
- bind the guest session to a table
- place and pay on the guest phone
- route the paid order to staff/runners as a table-labelled dine-in order

This is **not** the final customer UI ticket.  
It is the database / RPC / security / billing / QA backbone that later tickets depend on.

---

## Core Product Model

### Important design decision

QR dine-in orders:

- **do not use `table_sessions`**
- **do not seize the floor-plan table state**
- **do not merge checks**

Instead:

- they are first-party online orders
- `order_type = 'qr_dine_in'`
- `orders.table_number` stores the resolved table label
- `orders.session_id` stays `NULL`

This means:

- multiple guests at the same table can place independent paid orders
- the only shared thing is the table label used by runners / KDS / operations

---

## What Your Scope Covers

This ticket covers:

1. schema
2. anon-safe QR/session RPCs
3. token security
4. realtime authorization
5. guest alert lifecycle
6. billing gating
7. retention / PII policy
8. E2E validation

This ticket does **not** cover:

- final customer-facing QR UX polish
- full KDS / Order Line UI implementation
- full printer workflow UX
- native apps

---

## Execution Order

## Phase 1 — P0 spine

### QR-1 — `qr_w1_schema`

Create additively on staging:

- `table_qr_codes`
- `online_store_config` QR columns
- `online_order_sessions` QR/table-binding columns
- enum value `order_type = 'qr_dine_in'`
- `qr_scan_events`
- `qr_guest_alerts`
- RLS for new QR tables

### QR-5 — HMAC token helpers

Implement:

- token signing
- token verification
- dual-secret support
- token version invalidation

### QR-2 — `resolve_table_qr`

Anon-safe RPC that:

1. validates store
2. validates QR token
3. validates QR row active state
4. optionally validates hours
5. creates / refreshes `online_order_sessions`
6. logs scan analytics
7. increments QR scan counters
8. rate limits by IP/table

### QR-4 — `get_qr_order_status`

Anon-safe status read for:

- live order status screen
- polling fallback

### QR-24 — token-scoped Realtime auth

Allow a guest session to subscribe only to:

- its own session/order events

No cross-session access.

---

## Phase 2 — guest assistance + platform controls

### QR-2b — guest alert RPCs

Implement:

- `raise_qr_guest_alert`
- `resolve_qr_guest_alert`

Rules:

- dedup by `alert_key`
- lifecycle is `open -> resolved`
- no acknowledge state in V1
- staff resolution is Clerk-gated
- broadcast to Order Line / KDS consumers

### QR-19 — billing gate

Treat QR dine-in as a billable service.

Do not add a random feature flag.

Gate it through:

- existing subscription service catalog
- merchant plan visibility layer

Provide:

- HQ override for pilot

### QR-22 — default blue cleanup

Change new-store default:

- from retired teal `#2DD4BF`
- to brand blue `#0C4FD1`

---

## Phase 3 — policy / integration verification

### QR-28 — PII / retention

Define and enforce:

- retention window for guest contact and scan events
- `ip_hash` only, never raw IP
- export safety

### QR-30 — tax / dual pricing rule

Validate and document:

- QR dine-in uses dine-in tax basis
- delivery pricing inheritance only when configured
- disclosure text behavior
- money math is numeric and truncated correctly

### QR-31 — refund validation

Verify:

- existing online NMI refund path works for `qr_dine_in`
- partial and full refunds succeed
- no QR-specific refund code needed

### QR-9b — loyalty validation

Verify:

- points accrue correctly on paid `qr_dine_in`
- if missing, document exact insertion point

---

## Phase 4 — final staging matrix

### QR-21 — E2E / race / load QA

Run the 22-row staging matrix with:

- real printed QR tent
- real Charcoal Gardinia-style staging flow
- Temur signoff

This is the final validation phase, not the first build phase.

---

## Key Architecture Rules

### Anonymous access rule

Guests must **never** get direct row access.

They access QR data only through:

- `resolve_table_qr`
- `get_qr_order_status`
- guest alert RPCs
- token-scoped Realtime

### Auth style rule

Mirror the validation style already proven in:

- `cancel_online_order_by_customer(...)`

Do not invent a new guest auth pattern.

### Idempotency rule

Reuse:

- `_idempotency_claim(p_key uuid, p_op text)`

Do not add a new `external_id` uniqueness scheme.

### Money rule

Use:

- `NUMERIC(12,2)`
- truncation / remainder distribution
- never floats

### Migration rule

Use:

- SQL editor on staging first
- SQL editor on prod second
- `supabase migration repair --status applied`

Do **not** use:

- `db push`

---

## Dependencies

### External dependency

- HMAC token secret from Temur

### Downstream dependencies

These later flows depend on the P0 spine:

- customer QR storefront work
- Order Line / KDS integration
- payment / tax validation
- guest alert UI
- kill switch operations

---

## Recommended Working Sequence

1. `QR-1` schema
2. `QR-5` token helpers
3. `QR-2` resolve RPC
4. `QR-4` status RPC
5. `QR-24` realtime auth
6. `QR-2b` guest alerts
7. `QR-19` billing gate
8. `QR-22` color default
9. `QR-28` retention policy
10. `QR-30` / `QR-31` / `QR-9b` validation
11. `QR-21` full staging matrix

---

## What “Done” Means

This ticket is not done when:

- schema exists only
- or one QR scan works once

It is done when:

- anon-safe scan/session bootstrapping works
- token security and rotation work
- status polling / realtime work
- guest alerts work
- billing gate works
- PII policy is defined
- the 22-row QA matrix passes

