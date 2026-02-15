# ADM-006 + ADM-007 — Implementation Status
> Last updated: 2026-02-15

---

## ADM-006 — Advanced Filter Panel

### ✅ Done
| Feature | Notes |
|---------|-------|
| Slide-out Sheet panel (right side) | `TransactionFilterSheet.tsx` |
| Merchant multi-select | Loads from `getPlatformMerchants()` |
| Location multi-select (cascading) | Loads from `getPlatformLocations()`, disabled until merchant selected |
| Date Range with presets | Reused `<DateRangePicker />` — Today, Last 7d, Last 30d, This Month, Last Month, Custom |
| Payment Method multi-select | Cash, Card, Card (SpinAPI), Card (DVPay), Gift Card, House Account |
| Card Type multi-select | Visa, Mastercard, Amex, Discover, Other |
| Order Status multi-select | Draft, Pending, Preparing, Ready, Completed, Cancelled, Refunded, Void |
| Payment Status multi-select | Captured, Authorized, Refunded, Partial Refund, Declined, Void |
| Amount Range (min/max) | Two number inputs with `$` prefix |
| Apply Filters button | Writes all selections to URL params, closes sheet |
| Cancel button | Closes sheet without applying |
| Clear All Filters | Resets URL to `?` |
| Active filter count badge | Shows count of active filter groups on the Filters button |
| URL param sync | Filters survive page refresh + are shareable via URL |
| Re-sync on open | Sheet always reflects currently-applied filters when reopened |
| Filters return correct data | **User confirmed ✅** |

### ❌ Not Done
| Feature | Reason |
|---------|--------|
| Staff filter | Not implemented — requires fetching staff per merchant/location; deferred |

---

## ADM-007 — Global Search Bar

### ✅ Done
| Feature | Notes |
|---------|-------|
| `TransactionSearchBar` component | Replaces the old plain `<Input>` |
| 300ms debounce | Uses `useDebounce()` from `lib/hooks/useDebounce.ts` |
| Min 2 chars before triggering | Passes empty string to parent if < 2 chars |
| × Clear button | Clears query and re-fetches |
| Cmd+K / Ctrl+K focus shortcut | Keyboard shortcut to jump to search |
| URL sync | Search term in `?search=` param (shareable, back-button safe) |
| `highlightText()` helper | Exported — wraps matches in `<mark>` in table cells |
| Text highlighting in table | Applied to Order #, Merchant, Customer, Card last 4 columns |
| Placeholder | "Search by order #, auth code, card last 4, customer..." |

### ⚠️ Partially Done
| Feature | Current State | What's Missing |
|---------|--------------|----------------|
| Search actually finds results | Only searches `card_last_four`, `authorization_code`, `reference_number` | Cannot search `customer_name` or `order_number` — these are on the `orders` embedded table; PostgREST `.or()` can't span primary + related table columns in a single query |

### Fix Required
To search `customer_name` and `order_number`, a **Supabase flat view** is needed:

```sql
CREATE OR REPLACE VIEW vw_platform_transactions AS
SELECT
  op.id, op.order_id, op.payment_method, op.amount, op.tip_amount,
  op.total_amount, op.status, op.card_type, op.card_last_four,
  op.authorization_code, op.reference_number, op.captured_at, op.initiated_at,
  o.order_number, o.display_number, o.merchant_id, o.location_id,
  o.customer_name, o.status AS order_status, o.created_at,
  m.name AS merchant_name,
  l.name AS location_name
FROM order_payments op
JOIN orders    o ON o.id = op.order_id
JOIN merchants m ON m.id = o.merchant_id
LEFT JOIN locations l ON l.id = o.location_id;
```

Then the server action queries `vw_platform_transactions` directly instead of `order_payments` with embedded joins — enabling full `.or()` search across all columns.

---

## Overall ADM Ticket Coverage

| Ticket | Status | Description |
|--------|--------|-------------|
| ADM-001 | ❌ Not started | Transaction detail drawer (click row → side panel with full details) |
| ADM-002 | ❌ Not started | Stats cards with real DB aggregates (total volume, avg order, etc.) |
| ADM-003 | ❌ Not started | Revenue / volume charts |
| ADM-004 | ❌ Not started | Refund action from transaction row |
| ADM-005 | ❌ Not started | Export with filters applied (currently exports current page only) |
| **ADM-006** | **✅ Done** | Advanced Filter Panel |
| **ADM-007** | **~90% Done** | Global Search — search bar ✅, full-column search needs DB view ❌ |
