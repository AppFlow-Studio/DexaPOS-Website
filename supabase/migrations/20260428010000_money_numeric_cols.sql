-- ============================================================================
-- Migration: 20260428010000_money_numeric_cols.sql
-- Workstream B — Money NUMERIC
--
-- Rule: monetary values must be NUMERIC (dollars), never INTEGER cents.
-- Pattern per playbook: ADD column IF NOT EXISTS → UPDATE from /100 → null old
--   later (B6) once all read sites are confirmed migrated.
--
-- B7 (DROP _cents columns) is a follow-up migration after a full deploy cycle.
-- ============================================================================

-- ─── PRIORITY: location_invites.hourly_rate (payroll) ─────────────────────────
-- double precision → numeric(12,4), in-place type change (same column name).
ALTER TABLE public.location_invites
  ALTER COLUMN hourly_rate TYPE numeric(12,4)
  USING COALESCE(hourly_rate, NULL)::numeric(12,4);
-- ─── online_order_payment_intents ─────────────────────────────────────────────
ALTER TABLE public.online_order_payment_intents
  ADD COLUMN IF NOT EXISTS amount        numeric(12,2),
  ADD COLUMN IF NOT EXISTS subtotal      numeric(12,2),
  ADD COLUMN IF NOT EXISTS tax           numeric(12,2),
  ADD COLUMN IF NOT EXISTS tip           numeric(12,2),
  ADD COLUMN IF NOT EXISTS delivery_fee  numeric(12,2);
UPDATE public.online_order_payment_intents SET
  amount       = amount_cents       / 100.0,
  subtotal     = subtotal_cents     / 100.0,
  tax          = tax_cents          / 100.0,
  tip          = tip_cents          / 100.0,
  delivery_fee = delivery_fee_cents / 100.0;
-- ─── online_store_config ──────────────────────────────────────────────────────
ALTER TABLE public.online_store_config
  ADD COLUMN IF NOT EXISTS delivery_fee            numeric(12,2),
  ADD COLUMN IF NOT EXISTS free_delivery_threshold numeric(12,2),
  ADD COLUMN IF NOT EXISTS min_order               numeric(12,2);
UPDATE public.online_store_config SET
  delivery_fee            = delivery_fee_cents            / 100.0,
  free_delivery_threshold = free_delivery_threshold_cents / 100.0,
  min_order               = min_order_cents               / 100.0;
-- ─── delivery_zones ───────────────────────────────────────────────────────────
ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS delivery_fee            numeric(12,2),
  ADD COLUMN IF NOT EXISTS free_delivery_threshold numeric(12,2),
  ADD COLUMN IF NOT EXISTS min_order               numeric(12,2);
UPDATE public.delivery_zones SET
  delivery_fee            = delivery_fee_cents            / 100.0,
  free_delivery_threshold = free_delivery_threshold_cents / 100.0,
  min_order               = min_order_cents               / 100.0;
-- ─── device_catalog ───────────────────────────────────────────────────────────
ALTER TABLE public.device_catalog
  ADD COLUMN IF NOT EXISTS unit_cost   numeric(12,2),
  ADD COLUMN IF NOT EXISTS monthly_fee numeric(12,2);
UPDATE public.device_catalog SET
  unit_cost   = unit_cost_cents   / 100.0,
  monthly_fee = monthly_fee_cents / 100.0;
-- ─── admin_device_inventory VIEW — add monthly_fee ────────────────────────────
-- The view joins device_inventory ⟶ device_catalog. We add the new dollar
-- column alongside the existing monthly_fee_cents for the transition period.
-- Note: CREATE OR REPLACE VIEW only allows ADDING columns at the END (cannot
-- reorder or insert mid-list). monthly_fee is appended after the original
-- column list to keep this idempotent against the production view shape.
CREATE OR REPLACE VIEW public.admin_device_inventory AS
  SELECT
    di.id,
    di.catalog_id,
    di.serial_number,
    di.mac_address,
    di.status,
    di.condition,
    di.firmware_version,
    di.app_version,
    di.purchased_at,
    di.warranty_expires_at,
    di.purchase_order_number,
    di.last_config_at,
    di.created_at,
    di.updated_at,
    dc.device_category,
    dc.manufacturer,
    dc.model_name,
    dc.model_sku,
    dc.monthly_fee_cents,
    di.merchant_id,
    m.name  AS merchant_name,
    di.location_id,
    l.name  AS location_name,
    di.linked_station_id,
    di.linked_payment_terminal_id,
    di.linked_printer_id,
    dc.monthly_fee
  FROM public.device_inventory di
  JOIN public.device_catalog    dc ON dc.id = di.catalog_id
  LEFT JOIN public.merchants    m  ON m.id  = di.merchant_id
  LEFT JOIN public.locations    l  ON l.id  = di.location_id;
-- ─── B5 verification helpers (run manually after deploy) ─────────────────────
-- SELECT SUM(amount_cents), SUM(amount * 100)::bigint FROM public.online_order_payment_intents;
-- SELECT SUM(min_order_cents), SUM(min_order * 100)::bigint FROM public.online_store_config;
-- SELECT SUM(delivery_fee_cents), SUM(delivery_fee * 100)::bigint FROM public.delivery_zones;
-- SELECT SUM(unit_cost_cents), SUM(unit_cost * 100)::bigint FROM public.device_catalog;;
