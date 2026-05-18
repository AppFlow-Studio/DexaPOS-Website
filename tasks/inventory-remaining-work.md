# Inventory System — Remaining Work

> Status doc derived from the Inventory Management audit ticket (DEXA vs Toast/Clover).
> Created: 2026-05-18 • Scope: DexaPOS Web Dashboard repo only.
> POS tablet (React Native) screens live in a separate repo and are **out of scope** here.

## Legend

- ✅ Done — implemented and applied to DB
- 🟡 Partial — some layers done, others missing
- ❌ Not started — nothing exists in this repo

---

## Audit Snapshot (verified 2026-05-17/18)

| Phase | DB / RPCs | Web UI | Status |
| --- | --- | --- | --- |
| Phase 0 — Security & Foundations | ✅ Done | n/a | 🟡 `item_stock` not dropped |
| Phase 1 — Waste & Count Sheets | ✅ Done | ❌ Missing | 🟡 UI + server actions needed |
| Phase 2 — Reporting & Analytics | ❌ None | ❌ None | ❌ Not started |
| Phase 3 — Multi-Location Ops | ❌ None | ❌ None | ❌ Not started |
| Phase 4 — Advanced Features | ❌ None | ❌ None | ❌ Not started |

What already exists and works:
- RLS on all 11 inventory tables (`inventory_items`, `location_inventory_stock`, `location_inventory_overrides`, `vendors`, `vendor_items`, `location_vendors`, `location_vendor_pricing`, `purchase_orders`, `purchase_order_items`, `purchase_order_payments`, `stock_update_log`).
- `recipe_items.inventory_item_id` FK + `process_order_inventory_deduction()` traversing recipe-based path.
- Tables `waste_logs`, `inventory_counts`, `inventory_count_items` + RLS.
- RPCs `log_waste()`, `create_inventory_count()`, `submit_inventory_count()`.
- Web inventory dashboard with 3 tabs: Catalog, Vendors, Purchase Orders (`app/dashboard/inventory/page.tsx`).

---

## Phase 0 — Cleanup (small, finish first)

### T0.1 — Deprecate & drop `item_stock` legacy table
- [ ] Audit any remaining reads/writes of `item_stock` (location_id, menu_item_id, quantity).
- [ ] Confirm all active stock data lives in `location_inventory_stock`.
- [ ] Write migration: migrate residual data → `location_inventory_stock`, then `DROP TABLE public.item_stock`.
- [ ] Remove `item_stock` references from `database.types.ts` (regenerate types).
- **Files:** new migration in `supabase/migrations/`, `schema.sql`, `database.types.ts`.
- **Risk:** low. Verify the POS tablet repo no longer queries it before dropping.

### T0.2 — Migration folder hygiene (process note)
- [ ] Phase 0/1 SQL currently lives only in `utils/migrations/` (`20260324_phase0_*`, `20260325_phase1_*`); it reached the DB via the `20260413` remote-schema dump.
- [ ] Decide canonical location and stop the split so future diffs are reproducible.

---

## Phase 1 — Waste & Count Sheets (Web UI) ✅ (implemented 2026-05-18)

**Goal:** Surface the already-built `waste_logs` / `inventory_counts` DB layer in the dashboard.

**Delivered:**
- `app/dashboard/actions/waste.ts` — `GetWasteLogs`, `LogWaste`.
- `app/dashboard/actions/inventory-counts.ts` — `GetInventoryCounts`,
  `GetInventoryCountDetail`, `CreateInventoryCount`, `SubmitInventoryCount`,
  `ApproveInventoryCount`.
- `app/dashboard/inventory/hooks/useWasteAndCounts.ts` — React Query hooks.
- Components: `WasteTab`, `LogWasteDialog`, `CountsTab`, `CreateCountDialog`,
  `CountDetailSheet`.
- `page.tsx` — new **Waste** and **Counts** tabs.

**Still optional (deferred):** T1.6 — routing `StockUpdateDialog`'s
"Waste / Spoilage" reason through `log_waste()` (decision pending).

### T1.1 — Server actions for waste
- [ ] Create `app/dashboard/actions/waste.ts` (`"use server"`).
- [ ] `LogWaste(clerkOrgId, locationId, payload)` → calls `log_waste()` RPC.
- [ ] `GetWasteLogs(clerkOrgId, locationId, dateRange)` → list/filter waste events.
- [ ] Each mutation calls `LogAuditEvent({ actionCategory: "inventory", action: "logged_waste", ... })`.
- [ ] Follow the standard action pattern: look up merchant via `clerk_org_id`, return `{ data?, error? }`.

### T1.2 — Server actions for inventory counts
- [ ] Create `app/dashboard/actions/inventory-counts.ts`.
- [ ] `CreateInventoryCount(clerkOrgId, locationId, payload)` → `create_inventory_count()` (snapshots stock).
- [ ] `SubmitInventoryCount(countId, items[])` → `submit_inventory_count()` (variance + optional stock adjust).
- [ ] `GetInventoryCounts(clerkOrgId, locationId)` / `GetInventoryCountDetail(countId)`.
- [ ] `ApproveInventoryCount(countId)` — if approval mutates status/stock.
- [ ] Audit-log every mutation.

### T1.3 — React Query hooks
- [ ] Add to `app/dashboard/inventory/hooks/` (e.g. `useWaste.ts`, `useInventoryCounts.ts`).
- [ ] Query keys: `["waste-logs", clerkOrgId, locationId, "scoped"]`, `["inventory-counts", clerkOrgId, locationId, "scoped"]`.
- [ ] `enabled: !!clerkOrgId`; invalidate on mutation; `sonner` toasts.

### T1.4 — Waste Logging UI
- [ ] New **"Waste"** tab in `app/dashboard/inventory/page.tsx` `TabsList`.
- [ ] Waste log table: item, quantity, reason, estimated cost, logged by, date.
- [ ] "Log Waste" dialog: item picker (search), quantity + unit display, reason select
      (spoilage / overproduction / spill / theft / damaged / expired / other), notes, date.
- [ ] Header card: today's / period waste cost total.
- [ ] Date-range filter.

### T1.5 — Count Sheet UI
- [ ] New **"Counts"** tab in inventory page.
- [ ] Count list with status badges: draft (gray) / in_progress (amber) / completed (blue) / approved (green).
- [ ] "Create Count" dialog: name, item selection (full catalog or by category), assignee.
- [ ] Count detail / review view: per-line `expected` vs `counted` vs `variance` vs `variance_cost`,
      color-coded variance rows, approve/reject with comments.
- [ ] On approval, auto-adjust stock (via `submit_inventory_count()` behavior).

### T1.6 — Wire `StockUpdateDialog` "Waste / Spoilage" reason
- [ ] Currently `StockUpdateDialog.tsx` has a "Waste / Spoilage" reason that writes a generic stock log.
- [ ] Decide: route that path through `log_waste()` so it lands in `waste_logs`, OR keep separate and
      document the distinction. (Recommended: route through `log_waste()` to avoid double bookkeeping.)

### Phase 1 Acceptance
- [ ] A merchant can log waste and see it reflected in stock + waste totals.
- [ ] A merchant can create, fill, submit, and approve a count sheet; variances adjust stock.
- [ ] All mutations appear in audit logs and respect location scoping + RLS.

---

## Phase 2 — Reporting & Analytics ❌

**Goal:** COGS visibility and food-cost control. Nothing exists yet.

### T2.1 — `get_cogs_report()` RPC
- [ ] New migration. Signature: `(merchant_id, location_id, start_date, end_date)`.
- [ ] Formula: beginning inventory + purchases (from received POs) − ending inventory.
- [ ] Return per-category and per-item breakdown.
- [ ] `SECURITY DEFINER` with merchant/location auth checks.

### T2.2 — `get_food_cost_analysis()` RPC
- [ ] Theoretical cost = recipes × sales (via `menu_item_recipes` / `recipe_items`).
- [ ] Actual cost = beginning stock + purchases − ending stock − waste.
- [ ] Return variance (theoretical vs actual) to expose shrinkage / theft / recipe drift.

### T2.3 — Server actions + hooks
- [ ] `app/dashboard/actions/inventory-reports.ts` wrapping both RPCs.
- [ ] Query hooks with date-range params.

### T2.4 — Inventory Dashboard (KPI page)
- [ ] New route or section: total inventory value, low-stock count, today's waste cost,
      open PO count + pending amount.
- [ ] COGS trend chart (last 4 weeks, line).
- [ ] Top 5 items by cost (bar).

### T2.5 — COGS & Food Cost Report page
- [ ] Date-range picker (This Week / This Month / Custom).
- [ ] Summary cards: Total COGS, COGS %, Revenue, Gross Profit.
- [ ] Category breakdown table: theoretical vs actual.
- [ ] Actual vs Theoretical grouped bar chart by week.
- [ ] Item-level drill-down.

### T2.6 — Waste Analytics
- [ ] Waste by reason / by item / by period charts.

### Phase 2 Acceptance
- [ ] COGS report numbers reconcile against PO + stock data for a known date range.
- [ ] Food-cost variance is non-zero only when real shrinkage/recipe drift exists.

---

## Phase 3 — Multi-Location Operations ❌

**Goal:** Inter-location stock movement, par levels, unit conversions. Nothing exists yet.

### T3.1 — `inventory_transfers` + `inventory_transfer_items` tables
- [ ] `inventory_transfers`: merchant_id, from_location_id, to_location_id, status
      (draft / in_transit / received / cancelled), transfer_number (TRF-001),
      initiated_by_user_id, received_by_user_id, timestamps.
- [ ] `inventory_transfer_items`: transfer_id, inventory_item_id, quantity_sent, quantity_received.
- [ ] `updated_at` columns + `update_updated_at_column()` trigger (offline-sync requirement).
- [ ] RLS: scope by `merchant_id` / location membership.

### T3.2 — Transfer RPCs
- [ ] `initiate_transfer()` — decrements source location stock, sets `in_transit`.
- [ ] `receive_transfer()` — increments destination stock, supports partial receives + discrepancy logging.
- [ ] Both log to `stock_update_log` with `update_source = 'transfer'`.

### T3.3 — `unit_conversions` table
- [ ] Columns: merchant_id, inventory_item_id (NULL = global rule), from_unit, to_unit, conversion_factor.
- [ ] RLS + apply conversions in PO receiving / counts where relevant.

### T3.4 — `par_level` on `inventory_items`
- [ ] `ALTER TABLE inventory_items ADD COLUMN par_level numeric;` (distinct from `reorder_point`).
- [ ] Update types + item add/edit dialogs.

### T3.5 — Transfer UI
- [ ] Transfer management page: list with status badges, create transfer (source/destination/items),
      receive transfer (sent vs received compare, accept-all).

### T3.6 — Auto-PO generation from par levels
- [ ] Suggest/generate draft POs when stock falls below `par_level`.

### Phase 3 Acceptance
- [ ] Stock decremented at source and incremented at destination with no net loss.
- [ ] Partial receives reconcile correctly.

---

## Phase 4 — Advanced Features ❌

Lower priority; differentiators beyond Toast.

- [ ] T4.1 — Invoice scanning / OCR (camera + AI extraction).
- [ ] T4.2 — Barcode scanning for physical counts.
- [ ] T4.3 — Supplier price history & trend charts.
- [ ] T4.4 — Menu price suggestions from food-cost targets.
- [ ] T4.5 — Accounting integration (QuickBooks export).
- [ ] T4.6 — AI reorder suggestions from sales velocity / seasonality.

---

## Recommended Order of Execution

1. **T0.1** — drop `item_stock` (quick, removes ambiguity).
2. **Phase 1 web UI (T1.1–T1.6)** — unlocks already-built DB layer; highest ROI.
3. **Phase 2 (T2.1–T2.6)** — COGS/food-cost reporting; the main competitive selling point.
4. **Phase 3 (T3.1–T3.6)** — transfers + par levels for multi-location merchants.
5. **Phase 4** — advanced/differentiator features as capacity allows.

## Conventions Reference (from CLAUDE.md)

- Server actions: `"use server"`, look up merchant by `clerk_org_id`, return `{ data?, error? }`.
- All mutations call `LogAuditEvent()` (`app/dashboard/actions/audit-logs.ts`).
- New tables: enable RLS, add `updated_at` + `update_updated_at_column()` trigger.
- React Query keys: `["resource", clerkOrgId, locationId, "scoped"]`, `enabled: !!clerkOrgId`.
- Design system: teal `#2DD4BF` actions; status colors — green in-stock, amber low, red out,
  blue in-transit, gray neutral.

## Open Questions

- [ ] Does the POS tablet repo still read `item_stock`? (blocks T0.1)
- [ ] Should `StockUpdateDialog` "Waste / Spoilage" route through `log_waste()`? (T1.6)
- [ ] Count approval: who can approve — owner/admin only, or a permission code?
- [ ] COGS revenue source: orders table totals for the period — confirm which status counts as "sold".
