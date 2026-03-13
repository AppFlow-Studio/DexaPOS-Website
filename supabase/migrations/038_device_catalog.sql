-- ============================================================================
-- Migration 038: Device Catalog
-- Master catalog of supported hardware models (one row per model, not per unit)
-- ============================================================================

CREATE TABLE public.device_catalog (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  device_category       text NOT NULL CHECK (device_category IN (
                          'pos_tablet', 'cfd', 'kds', 'payment_terminal',
                          'receipt_printer', 'kitchen_printer', 'cash_drawer'
                        )),
  manufacturer          text NOT NULL,
  model_name            text NOT NULL,
  model_sku             text UNIQUE,
  hardware_revision     text,

  specs                 jsonb NOT NULL DEFAULT '{}'::jsonb,

  unit_cost_cents       integer,
  monthly_fee_cents     integer,

  is_active             boolean NOT NULL DEFAULT true,
  discontinued_at       timestamptz,

  image_url             text,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.device_catalog IS 'Master catalog of supported hardware models. One row per model, not per physical unit.';
COMMENT ON COLUMN public.device_catalog.specs IS 'Device-type-specific attributes stored as JSONB to avoid sparse nullable columns.';
COMMENT ON COLUMN public.device_catalog.hardware_revision IS 'Distinguishes hardware revisions of the same model (e.g. Landi C20 PRO Rev A vs Rev B).';

CREATE INDEX idx_device_catalog_category ON public.device_catalog(device_category);
CREATE INDEX idx_device_catalog_manufacturer ON public.device_catalog(manufacturer);

CREATE TRIGGER set_updated_at_device_catalog
  BEFORE UPDATE ON public.device_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS — only HQ admins can read/write the catalog
-- ---------------------------------------------------------------------------
ALTER TABLE public.device_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_catalog_select ON public.device_catalog
  FOR SELECT TO authenticated
  USING (public.is_dexapos_admin());

CREATE POLICY device_catalog_insert ON public.device_catalog
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dexapos_admin());

CREATE POLICY device_catalog_update ON public.device_catalog
  FOR UPDATE TO authenticated
  USING (public.is_dexapos_admin())
  WITH CHECK (public.is_dexapos_admin());

CREATE POLICY device_catalog_delete ON public.device_catalog
  FOR DELETE TO authenticated
  USING (public.is_dexapos_admin());

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------
INSERT INTO public.device_catalog (device_category, manufacturer, model_name, model_sku, specs, is_active) VALUES
-- POS Tablets
('pos_tablet', 'Landi', 'C20 PRO', 'LANDI-C20PRO',
  '{"screen_size":"15.6","resolution":"1920x1080","ram_gb":8,"os":"Android","has_builtin_printer":true,"has_nfc":true}'::jsonb,
  true),
('pos_tablet', 'Landi', 'C20 SE', 'LANDI-C20SE',
  '{"screen_size":"11","resolution":"1280x800","ram_gb":4,"os":"Android","has_builtin_printer":false}'::jsonb,
  true),
('pos_tablet', 'Landi', 'C20 Rangee', 'LANDI-C20RANGEE',
  '{"screen_size":"15.6","resolution":"1920x1080","ram_gb":8,"os":"Android","has_builtin_printer":true}'::jsonb,
  true),
-- CFD
('cfd', 'Landi', 'C20 SE (CFD)', 'LANDI-C20SE-CFD',
  '{"screen_size":"11","resolution":"1280x800","orientation":"portrait","os":"Android"}'::jsonb,
  true),
-- KDS
('kds', 'Landi', 'KDS Display', 'LANDI-KDS',
  '{"screen_size":"15.6","resolution":"1920x1080","os":"Android","purpose":"kitchen_display"}'::jsonb,
  true),
-- Payment Terminals
('payment_terminal', 'Dejavoo', 'P18', 'DJ-P18',
  '{"supports_contactless":true,"supports_emv":true,"supports_debit":true,"supports_ebt":true,"connection":"spinapi","form_factor":"countertop"}'::jsonb,
  true),
('payment_terminal', 'Dejavoo', 'P8', 'DJ-P8',
  '{"supports_contactless":true,"supports_emv":true,"supports_debit":true,"supports_ebt":true,"connection":"spinapi","form_factor":"mobile"}'::jsonb,
  true),
('payment_terminal', 'Castles', 'Saturn1000', 'CS-SAT1000',
  '{"supports_contactless":true,"supports_emv":true,"connection":"tcp_socket","form_factor":"countertop","cradle":"S1F2"}'::jsonb,
  true),
-- Receipt Printers
('receipt_printer', 'Star Micronics', 'TSP100III', 'STAR-TSP100III',
  '{"paper_width_mm":80,"dpi":203,"supports_auto_cut":true,"interface":["usb","network","bluetooth"],"supports_cash_drawer_kick":true}'::jsonb,
  true),
-- Kitchen Printers
('kitchen_printer', 'Star Micronics', 'SP700', 'STAR-SP700',
  '{"paper_width_mm":76,"interface":["usb","network"],"supports_auto_cut":true,"impact_printer":true}'::jsonb,
  true),
-- Cash Drawers
('cash_drawer', 'Star Micronics', 'CD3-1616', 'STAR-CD3-1616',
  '{"slots_bills":5,"slots_coins":8,"connection":"rj11_printer_kick","dimensions":"16x16"}'::jsonb,
  true);
