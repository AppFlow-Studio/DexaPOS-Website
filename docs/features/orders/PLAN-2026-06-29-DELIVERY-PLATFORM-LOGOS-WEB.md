# Delivery Platform Logos - Web Scope

## Ticket

Render delivery-platform identity consistently in website order views using a shared, casing-normalized resolver.

Parent ticket also includes POS/KDS. This document covers the website repo only.

## Web Surfaces

- Merchant dashboard Orders list
- Merchant dashboard Order Details sheet
- Merchant dashboard Order Details full page
- HQ/admin merchant Orders list
- HQ/admin merchant Order Details surfaces that reuse the shared dashboard components

## Resolver Contract

Shared resolver:
- `lib/orders/delivery-platform.ts`

Known platform aliases normalize casing, spacing, underscores, and hyphens:
- Grubhub
- DoorDash
- Uber Eats

Resolver field priority:
1. `orders.delivery_platform`
2. `orders.metadata.delivery_company`
3. `orders.metadata.delivery_platform`
4. `orders.metadata.online_order_provider`
5. optional app-level aliases
6. `orders.order_source`

Fallback behavior:
- first-party `website` / `app` / online-store values render a generic online badge
- unresolved online source values render a generic online badge, not a broken image
- `order_source = 'pos'` and related in-store aliases render no platform badge

## Implementation Files

- `lib/orders/delivery-platform.ts`
- `components/dashboard/orders/DeliveryPlatformBadge.tsx`
- `components/dashboard/orders/OrdersDataTable.tsx`
- `components/dashboard/orders/OrderDetailSheet.tsx`
- `components/dashboard/orders/OrderDetailFullPage.tsx`
- `app/manage/actions/admin-merchant/orders.ts`
- `app/manage/merchants/[merchantId]/components/OrdersTab.tsx`
- `types/order-management.ts`

## QA

- Merchant dashboard `/dashboard/orders`: Grubhub / DoorDash / Uber Eats orders show platform badge in the Order Type column.
- Merchant dashboard order detail sheet: same order shows platform badge in the header.
- Merchant dashboard full order detail page: same order shows platform badge in the Type card.
- HQ merchant Orders tab: same badges appear after admin data mapping.
- `order_source = 'pos'`: no platform badge.
- `order_source = 'website'` or `order_source = 'app'`: generic online badge.
- casing variants such as `grubhub`, `GrubHub`, `UBEREATS`, `Uber Eats`, `door_dash`, `DoorDash` resolve correctly.
