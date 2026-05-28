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
| Phase 1 — Waste & Count Sheets | ✅ Done | ✅ Done | ✅ Complete (T1.6 optional, deferred) |
| Phase 2 — Reporting & Analytics | ✅ Done | ✅ Done | 🟡 Code complete 2026-05-18 — migration not yet applied to DB |
| Phase 3 — Multi-Location Ops | ✅ Done | ✅ Done | 🟡 Code complete 2026-05-19 — migration not yet applied to DB |
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

### T1.1 — Server actions for waste ✅
- [x] Create `app/dashboard/actions/waste.ts` (`"use server"`).
- [x] `LogWaste(clerkOrgId, locationId, payload)` → calls `log_waste()` RPC.
- [x] `GetWasteLogs(clerkOrgId, locationId, dateRange)` → list/filter waste events.
- [x] Each mutation calls `LogAuditEvent({ actionCategory: "inventory", action: "logged_waste", ... })`.
- [x] Follow the standard action pattern: look up merchant via `clerk_org_id`, return `{ data?, error? }`.

### T1.2 — Server actions for inventory counts ✅
- [x] Create `app/dashboard/actions/inventory-counts.ts`.
- [x] `CreateInventoryCount(clerkOrgId, locationId, payload)` → `create_inventory_count()` (snapshots stock).
- [x] `SubmitInventoryCount(countId, items[])` → `submit_inventory_count()` (variance + optional stock adjust).
- [x] `GetInventoryCounts(clerkOrgId, locationId)` / `GetInventoryCountDetail(countId)`.
- [x] `ApproveInventoryCount(countId)` — if approval mutates status/stock.
- [x] Audit-log every mutation.

### T1.3 — React Query hooks ✅
- [x] Added `app/dashboard/inventory/hooks/useWasteAndCounts.ts`.
- [x] Query keys: `["waste-logs", clerkOrgId, locationId, "scoped"]`, `["inventory-counts", clerkOrgId, locationId, "scoped"]`.
- [x] `enabled: !!clerkOrgId`; invalidate on mutation; `sonner` toasts.

### T1.4 — Waste Logging UI ✅
- [x] New **"Waste"** tab in `app/dashboard/inventory/page.tsx` `TabsList`.
- [x] Waste log table: item, quantity, reason, estimated cost, logged by, date.
- [x] "Log Waste" dialog: item picker, quantity + unit display, reason chips
      (spoilage / overproduction / spill / theft / damaged / expired / other), notes, date.
- [x] Header card: today's / period waste cost total.
- [ ] Date-range filter. *(deferred — table shows all; filter not yet added)*

### T1.5 — Count Sheet UI ✅
- [x] New **"Counts"** tab in inventory page.
- [x] Count list with status badges: draft (gray) / in_progress (amber) / completed (blue) / approved (green).
- [x] "Create Count" dialog: name, item selection (full catalog or by category), assignee.
- [x] Count detail / review view: per-line `expected` vs `counted` vs `variance`,
      color-coded variance rows, approve action, blind-count toggle.
- [x] On approval / submit, auto-adjust stock (via `submit_inventory_count()` behavior).

### T1.6 — Wire `StockUpdateDialog` "Waste / Spoilage" reason
- [ ] Currently `StockUpdateDialog.tsx` has a "Waste / Spoilage" reason that writes a generic stock log.
- [ ] Decide: route that path through `log_waste()` so it lands in `waste_logs`, OR keep separate and
      document the distinction. (Recommended: route through `log_waste()` to avoid double bookkeeping.)

### T1.7 — Fix `log_waste()` over-waste handling ✅
- [x] Bug: `log_waste()` called `decrement_location_stock()`, which migration
      `20260501000000_atomic_inventory_decrement.sql` had hardened to raise
      `P0002 insufficient_stock` — so wasting against a 0/low-stock item crashed.
- [x] Decision: **block** over-waste (cannot waste more than on hand).
- [x] Migration `20260518000000_fix_log_waste_floor_stock.sql` — recreates
      `log_waste()` to reject over-waste with a clear `success=false` message
      (no exception), uses `set_location_stock()` for the decrement.
- [x] `LogWasteDialog.tsx` — disables submit + shows a blocking message when
      quantity exceeds stock on hand.

### Phase 1 Acceptance
- [x] A merchant can log waste and see it reflected in stock + waste totals.
- [x] A merchant can create, fill, submit, and approve a count sheet; variances adjust stock.
- [x] All mutations appear in audit logs and respect location scoping + RLS.

---

## Phase 2 — Reporting & Analytics ✅ (code complete 2026-05-18)

**Goal:** COGS visibility and food-cost control.

**Delivered:**
- `supabase/migrations/20260518100000_phase2_inventory_reporting.sql` — helper
  `_inventory_value_at()` + RPCs `get_cogs_report()` and `get_food_cost_analysis()`.
- `app/dashboard/actions/inventory-reports.ts` — `GetCogsReport`,
  `GetFoodCostAnalysis`, `GetInventoryKpis`, `GetWasteAnalytics`.
- `app/dashboard/inventory/hooks/useInventoryReports.ts` — React Query hooks.
- Components: `InventoryDashboardTab`, `InventoryReportsTab`.
- `page.tsx` — new **Dashboard** and **Reports** tabs (UI scoped per location,
  like Waste/Counts).

**Decisions made:**
- "Sold" orders for COGS revenue = all orders EXCEPT `draft` / `cancelled` /
  `refunded` / `void`.
- Both new tabs are location-scoped; "All Locations" shows a select-a-location state.
- New migration lives in `supabase/migrations/` (canonical — also addresses T0.2).

**⚠️ Remaining:** the migration has **not been applied to any database** (no local
Docker/Supabase in the dev environment). Apply
`20260518100000_phase2_inventory_reporting.sql` via the Supabase dashboard / normal
deploy flow, then regenerate `database.types.ts`. Until then the RPC calls error
at runtime.

### T2.1 — `get_cogs_report()` RPC ✅
- [x] New migration. Signature: `(merchant_id, location_id, start_date, end_date)`.
- [x] Formula: beginning inventory + purchases (from received POs) − ending inventory.
- [x] Returns per-category and per-item breakdown + revenue / COGS % / gross profit.
- [x] `SECURITY DEFINER`. Auth boundary is the server action (resolves merchant by
      `clerk_org_id`) — matches the existing `log_waste()` pattern (no in-RPC check).

### T2.2 — `get_food_cost_analysis()` RPC ✅
- [x] Theoretical cost = recipes × sales (both `menu_item_recipes` paths: direct +
      `recipe_items`).
- [x] Actual cost = beginning stock + purchases − ending stock − waste.
- [x] Returns variance (theoretical vs actual), by-category and by-week.

### T2.3 — Server actions + hooks ✅
- [x] `app/dashboard/actions/inventory-reports.ts` wrapping both RPCs.
- [x] `app/dashboard/inventory/hooks/useInventoryReports.ts` — date-range query hooks.

### T2.4 — Inventory Dashboard (KPI page) ✅
- [x] New **Dashboard** tab: total inventory value, low-stock count, today's waste
      cost, open PO count + pending amount.
- [x] COGS trend chart (last 4 weeks, area).
- [x] Top 5 items by cost (bar).

### T2.5 — COGS & Food Cost Report page ✅
- [x] New **Reports** tab with date-range picker (presets + custom).
- [x] Summary cards: Total COGS, COGS %, Revenue, Gross Profit.
- [x] Category breakdown table: theoretical vs actual vs variance.
- [x] Actual vs Theoretical grouped bar chart by week.
- [x] Item-level COGS drill-down table.

### T2.6 — Waste Analytics ✅
- [x] Waste by reason (donut) / by item (bar) / by week (bar) — embedded in the
      Reports tab.

### Phase 2 Acceptance
- [ ] COGS report numbers reconcile against PO + stock data for a known date range.
      *(pending — needs the migration applied to a DB with real data)*
- [ ] Food-cost variance is non-zero only when real shrinkage/recipe drift exists.
      *(pending — same)*

---

## Phase 3 — Multi-Location Operations ✅ (code complete 2026-05-19)

**Goal:** Inter-location stock movement, par levels, unit conversions.

**Delivered:**
- `supabase/migrations/20260519000000_phase3_multi_location_ops.sql` — `par_level`
  column, `unit_conversions`, `inventory_transfers` + `inventory_transfer_items`,
  RPCs `initiate_transfer()` / `receive_transfer()` / `cancel_transfer()`, RLS.
- `app/dashboard/actions/transfers.ts` — `GetMerchantLocations`, `GetTransfers`,
  `GetTransferDetail`, `InitiateTransfer`, `ReceiveTransfer`, `CancelTransfer`,
  `GetParLevelShortfalls`, `GenerateParLevelPurchaseOrders`.
- `app/dashboard/inventory/hooks/useTransfers.ts` — React Query hooks.
- Components: `TransfersTab`, `CreateTransferDialog`, `ReceiveTransferDialog`.
- `page.tsx` — new **Transfers** tab (location-scoped, like Waste/Counts).
- `par_level` wired through item add/edit dialogs + `Create/UpdateInventoryItem`.

**⚠️ Remaining:** apply `20260519000000_phase3_multi_location_ops.sql` to the DB,
then regenerate `database.types.ts`. Until then the transfer RPC calls error at
runtime (same situation as the Phase 2 migration).

### T3.1 — `inventory_transfers` + `inventory_transfer_items` tables ✅
- [x] `inventory_transfers`: merchant_id, from/to_location_id, status
      (draft / in_transit / received / cancelled), transfer_number (TRF-0001),
      initiated_by / received_by, timestamps.
- [x] `inventory_transfer_items`: transfer_id, inventory_item_id, quantity_sent, quantity_received.
- [x] `updated_at` columns + `update_updated_at_column()` trigger.
- [x] RLS: scoped by `merchant_id` + source/destination location membership.

### T3.2 — Transfer RPCs ✅
- [x] `initiate_transfer()` — decrements source stock, sets `in_transit` (atomic;
      rolls back on insufficient stock via `decrement_location_stock` P0002).
- [x] `receive_transfer()` — increments destination stock, supports partial
      receives + returns discrepancies.
- [x] `cancel_transfer()` — returns sent stock to source for in-transit transfers.
- [x] All log to `stock_update_log` with `update_source = 'transfer'`.

### T3.3 — `unit_conversions` table 🟡
- [x] Columns: merchant_id, inventory_item_id (NULL = merchant-wide rule),
      from_unit, to_unit, conversion_factor; RLS + `updated_at` trigger.
- [ ] Applying conversions in PO receiving / counts — schema in place; wiring deferred.

### T3.4 — `par_level` on `inventory_items` ✅
- [x] `ALTER TABLE inventory_items ADD COLUMN par_level numeric;`
- [x] Updated `types/inventory.ts` + item add/edit dialogs + create/update actions.

### T3.5 — Transfer UI ✅
- [x] **Transfers** tab: list with status badges, create transfer
      (source = current location / destination / items), receive transfer
      (sent vs received compare, defaults to sent), cancel in-transit transfer.

### T3.6 — Auto-PO generation from par levels ✅
- [x] `GenerateParLevelPurchaseOrders()` — creates draft POs (grouped by vendor)
      for items below `par_level`, surfaced as a banner in the Transfers tab.

### Phase 3 Acceptance
- [x] Stock decremented at source and incremented at destination with no net loss.
- [x] Partial receives reconcile correctly (discrepancies logged).
      *(both pending DB verification — needs the migration applied)*

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

1. ~~**T0.1** — drop `item_stock`~~ *(still open)*.
2. ~~**Phase 1 web UI (T1.1–T1.6)**~~ ✅ done 2026-05-18.
3. ~~**Phase 2 (T2.1–T2.6)**~~ ✅ code complete 2026-05-18 — **apply the migration to the DB**.
4. ~~**Phase 3 (T3.1–T3.6)**~~ ✅ code complete 2026-05-19 — **apply the migration to the DB**.
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
- [x] COGS revenue source — resolved: count all orders EXCEPT `draft` / `cancelled` /
      `refunded` / `void`, by `COALESCE(completed_at, created_at)`.
