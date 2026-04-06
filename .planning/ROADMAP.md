# Roadmap: Dexa POS Admin Portal Enhancement

## Overview

This roadmap transforms the HQ admin portal into a comprehensive merchant management system. Seven phases build from foundational menu management through operational setup (locations, staff, settings) to advanced analytics and reporting. Each phase delivers complete admin capabilities matching merchant dashboard functionality, culminating in detailed financial insights with export capabilities.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Menu Management (Admin)** - Full menu, category, item, and modifier management ✓
- [ ] **Phase 1.1: Support Ticketing UI/UX Overhaul** *(INSERTED)* - Comprehensive redesign of merchant and admin support ticket UI: message bubbles, date separators, drag-and-drop attachments, internal notes, KPI inbox cards, admin filter bar, and mobile sidebar
- [ ] **Phase 1.2: Merchant Reservations Management** *(INSERTED)* - Full reservations CRUD in the merchant dashboard: create/view/manage reservations, status lifecycle, history view, and sidebar navigation entry under Operations
- [ ] **Phase 2: Location & Floor Plan Management** - Location CRUD and table/floor plan administration
- [ ] **Phase 3: Staff Management (Admin)** - Staff CRUD, roles, PINs, and location assignments
- [ ] **Phase 4: Settings & Online Store** - Merchant settings and storefront configuration
- [ ] **Phase 5: Analytics Foundation** - Order breakdowns and financial metrics
- [ ] **Phase 6: Performance & Trends** - Staff performance and comparative analytics
- [ ] **Phase 7: Time Controls & Exports** - Time range selection and PDF/CSV exports

## Phase Details

### Phase 1: Menu Management (Admin)
**Goal**: Admin can view and fully manage any merchant's menu structure
**Depends on**: Nothing (first phase)
**Requirements**: MENU-01, MENU-02, MENU-03, MENU-04, MENU-05, MENU-06, MENU-07
**Success Criteria** (what must be TRUE):
  1. Admin can view merchant's complete menu hierarchy (menus, categories, items with all details)
  2. Admin can create, edit, and delete categories for a merchant
  3. Admin can create, edit, and delete menu items with full configuration (name, price, description, images)
  4. Admin can manage modifier groups and assign modifiers to items
  5. Admin can set pricing including base price, cash price, and location-specific overrides
  6. Admin can assign items to menus and control availability
  7. Admin can configure menu schedules (which menus are active during specific time periods)
**Plans**: 5

Plans:
- [x] PLAN-01: Modifier Group Management (wave 1) - Completed 2026-01-25
- [x] PLAN-02: Menu Schedule Management (wave 2) - Completed 2026-01-25
- [x] PLAN-03: Audit Information Display (wave 3) - Completed 2026-01-25
- [x] PLAN-04: Modifier Group Assignment to Items (wave 3) - Completed 2026-01-25
- [x] PLAN-05: Admin Menu Detail Page (wave 4) - Completed 2026-01-25

### Phase 1.1: Support Ticketing UI/UX Overhaul *(INSERTED)*
**Goal**: Both merchant and admin views of the support ticketing system are polished, intuitive, and visually consistent with the design system
**Depends on**: Phase 1
**Requirements**: User-provided spec (2026-03-19)
**Success Criteria** (what must be TRUE):
  1. Merchant ticket detail has role-differentiated bubbles (merchant=right indigo, admin=left grey), proper avatars, sender name + formatted timestamp on every message
  2. Date separators appear between messages from different days
  3. Ticket header has xl subject, pill badges with correct colors per status, metadata spaced below
  4. File upload zone is a dashed drag-and-drop area with thumbnail previews and ✕ remove
  5. Reply box has short placeholder, disabled send when empty, keyboard hint below
  6. Admin internal notes render as full-width amber cards with "🔒 Staff only" badge; textarea turns amber when internal mode is on
  7. Admin inbox has KPI cards (open, unassigned, avg response, avg resolution), filter bar (status tabs, priority, assignee, search), and clickable table rows with unread accent
  8. Admin sidebar shows rich merchant info (name, location, plan, submitted by, metadata context)
  9. Loading skeletons shown while data fetches; toast notifications for all actions
**Plans**: 4 plans

Plans:
- [ ] 01.1-01-PLAN.md — Drag-and-drop file upload zone + merchant empty state
- [ ] 01.1-02-PLAN.md — Admin inbox status tab bar + unread row accents
- [ ] 01.1-03-PLAN.md — Merchant ticket detail overhaul (bubbles, dates, header, reply)
- [ ] 01.1-04-PLAN.md — Admin ticket detail overhaul (internal notes, sidebar, merchant info)

### Phase 1.2: Merchant Reservations Management *(INSERTED)*
**Goal**: Merchants can create, view, and manage reservations from the web dashboard with full lifecycle control
**Depends on**: Phase 1
**Requirements**: User-provided Android reference (2026-04-05)
**Success Criteria** (what must be TRUE):
  1. "Reservations" entry appears under Operations in merchant sidebar
  2. Merchant can view today's reservations and navigate to any date
  3. Merchant can create a new reservation (party name, party size, phone, date/time, optional table assignment, VIP flag, notes)
  4. Merchant can update reservation status through the full lifecycle (pending → confirmed → arrived → seated → completed / cancelled / no_show)
  5. Merchant can view reservation history (completed, cancelled, no-show) with filtering
  6. Merchant can cancel a reservation with an optional reason
  7. Conflict detection warns when assigning tables that are already booked for overlapping time
**Plans**: 4 plans

Plans:
- [ ] 01.2-01-PLAN.md — Extend Reservation type + four server actions (CreateReservationAction, UpdateReservationStatusAction, CancelReservationAction, AssignReservationTablesAction)
- [ ] 01.2-02-PLAN.md — TanStack Query hooks (useReservations, useCreateReservation, etc.) + conflict detection utility
- [ ] 01.2-03-PLAN.md — Reservations page + CreateReservationDialog + ReservationCard + ReservationDetailSheet + CancelReservationDialog
- [ ] 01.2-04-PLAN.md — Sidebar nav entry (CalendarClock icon under Operations)

### Phase 2: Location & Floor Plan Management
**Goal**: Admin can manage merchant locations and their physical layouts
**Depends on**: Phase 1
**Requirements**: LOC-01, LOC-02, LOC-03, LOC-04, LOC-05, LOC-06, TABLE-01, TABLE-02, TABLE-03, TABLE-04
**Success Criteria** (what must be TRUE):
  1. Admin can view all locations for a merchant with summary information
  2. Admin can create new locations and edit existing location details (name, address, contact info)
  3. Admin can configure location operating hours and location-specific settings
  4. Admin can enable or disable locations
  5. Admin can view floor plans for each location
  6. Admin can add, edit, delete tables and organize them into sections with capacity attributes
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 3: Staff Management (Admin)
**Goal**: Admin can manage all staff members and their access for any merchant
**Depends on**: Phase 2
**Requirements**: STAFF-01, STAFF-02, STAFF-03, STAFF-04, STAFF-05, STAFF-06
**Success Criteria** (what must be TRUE):
  1. Admin can view all staff members for a merchant with role and status information
  2. Admin can create new staff members as either Clerk accounts or DB-only accounts
  3. Admin can edit staff details including roles and permissions
  4. Admin can manage staff PIN codes (view, reset individual, bulk reset)
  5. Admin can assign staff to specific locations
  6. Admin can deactivate and reactivate staff accounts
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 4: Settings & Online Store
**Goal**: Admin can configure merchant-wide and location-specific settings including online ordering
**Depends on**: Phase 3
**Requirements**: SET-01, SET-02, SET-03, SET-04, SET-05, STORE-01, STORE-02, STORE-03, STORE-04
**Success Criteria** (what must be TRUE):
  1. Admin can view and edit merchant-wide settings
  2. Admin can view and edit location-specific settings including tax configuration
  3. Admin can configure payment terminal settings and receipt templates
  4. Admin can view storefront configuration for online ordering
  5. Admin can edit storefront appearance (logo, colors, banners)
  6. Admin can manage online ordering settings (hours, delivery zones)
  7. Admin can enable or disable online ordering
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 5: Analytics Foundation
**Goal**: Admin can access detailed order breakdowns and financial metrics for any merchant
**Depends on**: Phase 4
**Requirements**: ANLYT-01, ANLYT-02, ANLYT-03, ANLYT-04, ANLYT-05, ANLYT-06, FIN-01, FIN-02, FIN-03, FIN-04, FIN-05, FIN-06
**Success Criteria** (what must be TRUE):
  1. Admin can view order summary with totals by time period
  2. Admin can view order breakdowns by item (top sellers, quantity, revenue)
  3. Admin can view order breakdowns by category, order type, payment method, and time patterns
  4. Admin can view total revenue with breakdown (gross, net, taxes)
  5. Admin can view tax collected by category, tips by staff and payment method
  6. Admin can view refunds, voids, discounts applied, and average order metrics
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 6: Performance & Trends
**Goal**: Admin can analyze staff performance and compare metrics across periods and locations
**Depends on**: Phase 5
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, TREND-01, TREND-02, TREND-03, TREND-04
**Success Criteria** (what must be TRUE):
  1. Admin can view sales by staff member (orders, revenue)
  2. Admin can view tips earned, transaction count, and average transaction value per staff
  3. Admin can view period-over-period comparisons (vs last week, month, year)
  4. Admin can view location comparison metrics side-by-side
  5. Admin can view trend visualizations (line and bar charts)
  6. Admin can see growth percentages and trend indicators
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 7: Time Controls & Exports
**Goal**: Admin can select custom time ranges and export all analytics data
**Depends on**: Phase 6
**Requirements**: TIME-01, TIME-02, TIME-03, TIME-04, PERM-01, PERM-02, PERM-03
**Success Criteria** (what must be TRUE):
  1. Admin can select preset time ranges (today, this week, this month, last 30 days)
  2. Admin can select custom date ranges for all analytics views
  3. Admin can export any analytics view to CSV format
  4. Admin can export formatted reports to PDF
  5. UI elements are hidden or shown based on HQ role permissions
  6. Edit actions are gated by appropriate permissions
  7. Support roles see only their assigned merchants
**Plans**: TBD

Plans:
- [ ] TBD
