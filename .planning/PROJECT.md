# Dexa POS Admin Portal Enhancement

## What This Is

Enhancement to the Dexa POS Admin Portal (`/manage/merchants/[merchantId]/`) to give HQ admins full merchant management capabilities — matching what merchants can do in their own dashboard — plus comprehensive analytics and financial reporting with export functionality. This enables HQ to support merchants directly and gain detailed insights into merchant operations.

## Core Value

HQ admins can fully manage any merchant's account (menus, locations, staff, settings) and access detailed financial analytics — all without the merchant needing to be involved.

## Requirements

### Validated

<!-- Existing capabilities from codebase -->

- ✓ Multi-tenant architecture (HQ → Carrier → Merchant → Location) — existing
- ✓ Clerk authentication with org-based access control — existing
- ✓ Merchant dashboard with full self-service capabilities — existing
- ✓ Admin HQ portal with merchant list and basic tabs — existing
- ✓ Permission system with 8 HQ roles (super_admin through support roles) — existing
- ✓ Basic admin merchant view with overview, business info, devices tabs — existing
- ✓ Orders and payments database schema with full transaction details — existing
- ✓ Audit logging for admin actions — existing

### Active

<!-- Current scope for this milestone -->

**Admin Merchant Management (Full Parity)**

- [ ] Menu management: CRUD for categories, items, modifier groups, pricing
- [ ] Location management: CRUD for locations, operating hours, settings
- [ ] Table/floor plan management: View and edit floor plans per location
- [ ] Staff management: Create staff, manage roles, PIN codes, assignment to locations
- [ ] Settings management: Merchant-wide and location-specific settings
- [ ] Online store management: Storefront configuration and customization

**Detailed Analytics & Financials (HQ Only)**

- [ ] Order breakdowns: By item, category, time period, order type, payment method
- [ ] Financial metrics: Revenue, tax collected, tips, refunds, discounts applied
- [ ] Staff performance: Sales per staff member, tips earned, transaction counts
- [ ] Trend comparisons: Period-over-period, location comparisons
- [ ] Time range support: Daily/weekly/monthly presets + custom date ranges
- [ ] Export functionality: PDF and CSV export for all analytics views

**Permission Integration**

- [ ] UI respects HQ role permissions (super_admin has all, others scoped)
- [ ] Support/account managers see only assigned merchants
- [ ] Edit capabilities gated by appropriate permissions

### Out of Scope

- Real-time live dashboard — Pre-aggregated data is sufficient, no WebSocket needed
- Carrier-level analytics — Focus is per-merchant detail for HQ
- Mobile admin app — Web dashboard only for this milestone
- Merchant-facing analytics — HQ internal tool only

## Context

This is a brownfield project. The Dexa POS web dashboard is a mature Next.js 15 application with:

- **Frontend**: React 19, Tailwind CSS, Shadcn/UI, TanStack Query, Zustand
- **Backend**: Supabase (PostgreSQL with RLS), Clerk for auth
- **Existing admin tabs**: Some functionality exists but needs enhancement
- **Permission system**: Already implemented in `types/permissions.ts` with role-permission mappings

Key existing files:
- `app/manage/merchants/[merchantId]/page.tsx` — Current admin merchant page
- `app/manage/merchants/[merchantId]/components/` — Existing tab components
- `app/dashboard/` — Merchant dashboard (reference implementation)
- `types/permissions.ts` — HQ role permission definitions

The merchant dashboard (`/dashboard/`) serves as the reference implementation. Admin tabs should mirror that functionality with permission checks.

## Constraints

- **Tech stack**: Must use existing stack (Next.js 15, Supabase, Clerk, TanStack Query)
- **Permissions**: Must respect existing HQ role system from `types/permissions.ts`
- **RLS**: All data access must respect Supabase Row Level Security policies
- **Audit**: Admin actions on merchant data must be logged to `audit_logs`
- **Pattern consistency**: Follow existing server action patterns in `app/manage/actions/`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tab-based architecture matching existing | Consistency with current `[merchantId]/components/` structure | — Pending |
| Server actions for all mutations | Existing pattern, RLS enforcement, audit logging | — Pending |
| Recharts for analytics visualizations | Already in dependencies, used elsewhere | — Pending |

---
*Last updated: 2026-01-25 after initialization*
