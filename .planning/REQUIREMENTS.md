# Requirements: Dexa POS Admin Portal Enhancement

**Defined:** 2026-01-25
**Core Value:** HQ admins can fully manage any merchant's account and access detailed financial analytics

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Menu Management (Admin)

- [ ] **MENU-01**: Admin can view merchant's menu structure (menus, categories, items)
- [ ] **MENU-02**: Admin can create/edit/delete categories for a merchant
- [ ] **MENU-03**: Admin can create/edit/delete menu items with full details (name, price, description, image)
- [ ] **MENU-04**: Admin can manage modifier groups and modifiers for items
- [ ] **MENU-05**: Admin can set item pricing (base price, cash price, location overrides)
- [ ] **MENU-06**: Admin can assign items to menus and set availability
- [ ] **MENU-07**: Admin can manage menu schedules (which menus are active when)

### Location Management (Admin)

- [ ] **LOC-01**: Admin can view all merchant locations with summary info
- [ ] **LOC-02**: Admin can create new locations for a merchant
- [ ] **LOC-03**: Admin can edit location details (name, address, contact info)
- [ ] **LOC-04**: Admin can configure location operating hours
- [ ] **LOC-05**: Admin can manage location-specific settings (tax rates, receipts, etc.)
- [ ] **LOC-06**: Admin can enable/disable locations

### Floor Plan & Tables (Admin)

- [ ] **TABLE-01**: Admin can view floor plan for each location
- [ ] **TABLE-02**: Admin can add/edit/delete tables on floor plan
- [ ] **TABLE-03**: Admin can organize tables into sections
- [ ] **TABLE-04**: Admin can set table capacity and attributes

### Staff Management (Admin)

- [ ] **STAFF-01**: Admin can view all staff members for a merchant
- [ ] **STAFF-02**: Admin can create new staff members (Clerk or DB-only accounts)
- [ ] **STAFF-03**: Admin can edit staff details and roles
- [ ] **STAFF-04**: Admin can manage staff PIN codes (reset, bulk reset)
- [ ] **STAFF-05**: Admin can assign staff to specific locations
- [ ] **STAFF-06**: Admin can deactivate/reactivate staff accounts

### Settings Management (Admin)

- [ ] **SET-01**: Admin can view/edit merchant-wide settings
- [ ] **SET-02**: Admin can view/edit location-specific settings
- [ ] **SET-03**: Admin can configure payment terminal settings
- [ ] **SET-04**: Admin can manage receipt templates
- [ ] **SET-05**: Admin can configure tax settings

### Online Store (Admin)

- [ ] **STORE-01**: Admin can view storefront configuration
- [ ] **STORE-02**: Admin can edit storefront appearance (logo, colors, banners)
- [ ] **STORE-03**: Admin can manage online ordering settings (hours, delivery zones)
- [ ] **STORE-04**: Admin can enable/disable online ordering

### Analytics - Order Breakdowns

- [ ] **ANLYT-01**: View orders summary with totals by time period
- [ ] **ANLYT-02**: Breakdown orders by item (top sellers, quantity, revenue)
- [ ] **ANLYT-03**: Breakdown orders by category
- [ ] **ANLYT-04**: Breakdown orders by order type (dine-in, takeout, delivery)
- [ ] **ANLYT-05**: Breakdown orders by payment method (cash, card, etc.)
- [ ] **ANLYT-06**: Breakdown orders by time (hourly, daily patterns)

### Analytics - Financial Metrics

- [ ] **FIN-01**: Total revenue with breakdown (gross, net, taxes)
- [ ] **FIN-02**: Tax collected breakdown by tax category
- [ ] **FIN-03**: Tips collected (total, by staff, by payment method)
- [ ] **FIN-04**: Refunds and voids (count, amount, reasons)
- [ ] **FIN-05**: Discounts applied (count, amount, by discount type)
- [ ] **FIN-06**: Average order value and ticket metrics

### Analytics - Staff Performance

- [ ] **PERF-01**: Sales by staff member (orders, revenue)
- [ ] **PERF-02**: Tips earned by staff member
- [ ] **PERF-03**: Transaction count per staff
- [ ] **PERF-04**: Average transaction value per staff

### Analytics - Trends & Comparisons

- [ ] **TREND-01**: Period-over-period comparison (vs last week, month, year)
- [ ] **TREND-02**: Location comparison (side-by-side metrics)
- [ ] **TREND-03**: Trend visualization charts (line, bar)
- [ ] **TREND-04**: Growth percentages and indicators

### Analytics - Time & Export

- [ ] **TIME-01**: Preset time ranges (today, this week, this month, last 30 days)
- [ ] **TIME-02**: Custom date range picker
- [ ] **TIME-03**: Export to CSV format
- [ ] **TIME-04**: Export to PDF format (formatted report)

### Permission Integration

- [ ] **PERM-01**: UI elements hidden/shown based on HQ role permissions
- [ ] **PERM-02**: Edit actions gated by appropriate permissions
- [ ] **PERM-03**: Support roles see only assigned merchants

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Real-time Features

- **RT-01**: Live order feed for HQ monitoring
- **RT-02**: Real-time revenue ticker

### Advanced Analytics

- **ADV-01**: Predictive forecasting
- **ADV-02**: Inventory cost analysis
- **ADV-03**: Labor cost analysis

### Carrier-Level Analytics

- **CARR-01**: Aggregate analytics across carrier's merchants
- **CARR-02**: Carrier comparison dashboard

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile admin app | Web dashboard focus for this milestone |
| Merchant-facing analytics | This is HQ internal tool only |
| Real-time WebSocket updates | Pre-aggregated data sufficient |
| Carrier analytics | Per-merchant detail is focus |
| Automated alerting | Manual review sufficient for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MENU-01 | Phase 1 | Pending |
| MENU-02 | Phase 1 | Pending |
| MENU-03 | Phase 1 | Pending |
| MENU-04 | Phase 1 | Pending |
| MENU-05 | Phase 1 | Pending |
| MENU-06 | Phase 1 | Pending |
| MENU-07 | Phase 1 | Pending |
| LOC-01 | Phase 2 | Pending |
| LOC-02 | Phase 2 | Pending |
| LOC-03 | Phase 2 | Pending |
| LOC-04 | Phase 2 | Pending |
| LOC-05 | Phase 2 | Pending |
| LOC-06 | Phase 2 | Pending |
| TABLE-01 | Phase 2 | Pending |
| TABLE-02 | Phase 2 | Pending |
| TABLE-03 | Phase 2 | Pending |
| TABLE-04 | Phase 2 | Pending |
| STAFF-01 | Phase 3 | Pending |
| STAFF-02 | Phase 3 | Pending |
| STAFF-03 | Phase 3 | Pending |
| STAFF-04 | Phase 3 | Pending |
| STAFF-05 | Phase 3 | Pending |
| STAFF-06 | Phase 3 | Pending |
| SET-01 | Phase 4 | Pending |
| SET-02 | Phase 4 | Pending |
| SET-03 | Phase 4 | Pending |
| SET-04 | Phase 4 | Pending |
| SET-05 | Phase 4 | Pending |
| STORE-01 | Phase 4 | Pending |
| STORE-02 | Phase 4 | Pending |
| STORE-03 | Phase 4 | Pending |
| STORE-04 | Phase 4 | Pending |
| ANLYT-01 | Phase 5 | Pending |
| ANLYT-02 | Phase 5 | Pending |
| ANLYT-03 | Phase 5 | Pending |
| ANLYT-04 | Phase 5 | Pending |
| ANLYT-05 | Phase 5 | Pending |
| ANLYT-06 | Phase 5 | Pending |
| FIN-01 | Phase 5 | Pending |
| FIN-02 | Phase 5 | Pending |
| FIN-03 | Phase 5 | Pending |
| FIN-04 | Phase 5 | Pending |
| FIN-05 | Phase 5 | Pending |
| FIN-06 | Phase 5 | Pending |
| PERF-01 | Phase 6 | Pending |
| PERF-02 | Phase 6 | Pending |
| PERF-03 | Phase 6 | Pending |
| PERF-04 | Phase 6 | Pending |
| TREND-01 | Phase 6 | Pending |
| TREND-02 | Phase 6 | Pending |
| TREND-03 | Phase 6 | Pending |
| TREND-04 | Phase 6 | Pending |
| TIME-01 | Phase 7 | Pending |
| TIME-02 | Phase 7 | Pending |
| TIME-03 | Phase 7 | Pending |
| TIME-04 | Phase 7 | Pending |
| PERM-01 | Phase 7 | Pending |
| PERM-02 | Phase 7 | Pending |
| PERM-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 53 total
- Mapped to phases: 53 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-01-25*
*Last updated: 2026-01-25 after roadmap creation*
