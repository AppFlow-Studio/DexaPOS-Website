# ADM Transactions Tickets - Implementation Status
> Last updated: 2026-02-15

---

## ADM-001 - Transaction Detail Drawer

### Done
| Feature | Notes |
|---------|-------|
| Detail sheet component | Added `app/manage/transactions/components/TransactionDetailSheet.tsx` |
| Row action wiring | Added `View Details` in transaction row actions |
| Server detail action | Added `getPlatformTransactionDetails(transactionId)` in `app/manage/actions/hq-platform/transactions.ts` |
| Query hook | Added `usePlatformTransactionDetails` in `lib/queries/use-platform-analytics.ts` |
| Data coverage | Merchant/location/customer, payment fields, order totals, line items, timeline, notes, and error flags |
| UX behavior | Loading/error/empty states in drawer and header spacing to avoid close-icon overlap |

---

## ADM-004 - Refund Action from Row Menu

### Done
| Feature | Notes |
|---------|-------|
| Refund confirmation dialog | Added `AlertDialog` confirmation flow on `/manage/transactions` |
| Refund action wiring | `Refund` menu item now opens confirmation and executes server action |
| Platform refund server action | Added `refundPlatformTransaction(transactionId, reason)` in `app/manage/actions/hq-platform/transactions.ts` |
| Reuse existing refund pipeline | Delegates to `refundAdminOrder(merchantId, orderId, reason)` for order/payment updates + audit logging |
| Post-refund refresh | Invalidates platform transactions + KPI query caches |
| Safety guard | Refund option is enabled only for `captured` statuses |

---

## ADM-006 - Advanced Filter Panel

### Done
| Feature | Notes |
|---------|-------|
| Slide-out filter sheet | `app/manage/transactions/components/TransactionFilterSheet.tsx` |
| Merchant + Location filter | Cascading locations based on selected merchants |
| Date range + presets | Uses existing `DateRangePicker` |
| Payment method + card type filters | Multi-select |
| Order status + payment status filters | Multi-select |
| Amount range (min/max) | Numeric min/max inputs |
| Apply / Cancel / Clear all | URL-driven filter state |
| Active filter count badge | Visible on trigger button |
| URL sync | Filter state survives refresh/shareable URL |
| Filter sheet re-sync on open | Local state matches current URL |
| UX polish on sheet spacing | Added inner padding and structured layout |
| Fixed close icon overlap | Header layout updated so close X no longer overlaps "Clear all" |
| Dropdown layering fix | `z-200` -> `z-[200]` |

### Not Done
| Feature | Reason |
|---------|--------|
| Staff filter | Deferred (needs staff source and scope rules) |

---

## ADM-007 - Global Search Bar

### Done
| Feature | Notes |
|---------|-------|
| Search bar component | `TransactionSearchBar` |
| 300ms debounce + min 2 chars | Prevents noisy refetching |
| Clear button + Cmd/Ctrl+K | UX shortcuts implemented |
| URL sync + highlight | Search term is URL source of truth |
| Full-column search via view | Added `vw_platform_transactions` query path |
| Search by customer/order fields | `customer_name`, `order_number`, plus card/auth/ref and merchant/location |
| Safe fallback | If view is missing, action falls back to legacy join query |

### Migration
- Added migration: `supabase/migrations/021_platform_transactions_view.sql`
- View must be applied in each environment (staging/prod/local DBs).

---

## Related Improvements (During ADM Work)

| Item | Status | Notes |
|------|--------|-------|
| ADM-005 export behavior | Done | Export now fetches all filtered rows in batches, not only current page |
| Refund data fix | Partial hardening | Removed incorrect `refunded_amount: 0` placeholder write in admin refund update |
| Card type filter compatibility | Partial (deferred revisit) | `Visa` works; `Mastercard`/others still inconsistent in some data patterns and needs exact DB value mapping |
| Card brand display parity | Done | Reused dashboard `CardBrandIcon` in manage table + detail drawer |
| Table sorting parity | Done | Added sortable headers for `Order #` and `Date` in manage transactions table |
| Manual refresh | Done | Added refresh button to re-fetch transactions + KPI data |

---

## Overall ADM Ticket Coverage

| Ticket | Status | Description |
|--------|--------|-------------|
| ADM-001 | Done | Transaction detail drawer |
| ADM-002 | Not started | Stats cards with real DB aggregates |
| ADM-003 | Not started | Revenue/volume charts |
| ADM-004 | Done | Refund action from row menu |
| ADM-005 | Done | Export with filters applied (all filtered rows) |
| ADM-006 | Done | Advanced filter panel |
| ADM-007 | Done | Global search with full-column support via view |

---

## Suggested Next Work Order
1. ADM-002 - Real DB aggregate cards
2. ADM-003 - Revenue/volume charts


