-- Service charge / auto-gratuity admin config (Mahmoud — Charcoal Gardenia).
-- Adds the config table, snapshots on orders, and exposes service_charge in
-- get_cash_flow_report so it can be reported separately from tips.

CREATE TABLE IF NOT EXISTS public.service_charge_rules (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id            uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id            uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  name                   text NOT NULL DEFAULT 'Service Charge',
  rate_percent           numeric(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  min_party_size         integer NOT NULL DEFAULT 6 CHECK (min_party_size >= 1),
  applies_to_order_types text[] NOT NULL DEFAULT ARRAY['dine_in'],
  -- 'pre_discount' (Toast/Square default) computes the charge on subtotal BEFORE
  -- item-level discounts; 'post_discount' computes after discounts are applied.
  applies_on             text NOT NULL DEFAULT 'pre_discount'
                         CHECK (applies_on IN ('pre_discount', 'post_discount')),
  is_taxable             boolean NOT NULL DEFAULT false,
  auto_apply             boolean NOT NULL DEFAULT true,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_charge_active_scope
  ON public.service_charge_rules
    (merchant_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_service_charge_rules_merchant
  ON public.service_charge_rules (merchant_id);

DROP TRIGGER IF EXISTS trg_service_charge_rules_updated_at ON public.service_charge_rules;
CREATE TRIGGER trg_service_charge_rules_updated_at
  BEFORE UPDATE ON public.service_charge_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.service_charge_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scr_select ON public.service_charge_rules;
CREATE POLICY scr_select ON public.service_charge_rules
  FOR SELECT USING (public.is_merchant_admin(merchant_id));

DROP POLICY IF EXISTS scr_insert ON public.service_charge_rules;
CREATE POLICY scr_insert ON public.service_charge_rules
  FOR INSERT WITH CHECK (public.is_merchant_admin(merchant_id));

DROP POLICY IF EXISTS scr_update ON public.service_charge_rules;
CREATE POLICY scr_update ON public.service_charge_rules
  FOR UPDATE USING (public.is_merchant_admin(merchant_id))
             WITH CHECK (public.is_merchant_admin(merchant_id));

DROP POLICY IF EXISTS scr_delete ON public.service_charge_rules;
CREATE POLICY scr_delete ON public.service_charge_rules
  FOR DELETE USING (public.is_merchant_admin(merchant_id));

-- Order snapshot columns: capture rule name + rate at the time of the order so
-- receipts/reports stay correct after a rule is later renamed or re-rated.
-- Mirrors the existing order_items.discount_name pattern.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_name      text,
  ADD COLUMN IF NOT EXISTS service_charge_rate      numeric(5,2),
  ADD COLUMN IF NOT EXISTS service_charge_rule_id   uuid REFERENCES public.service_charge_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_charge_is_manual boolean NOT NULL DEFAULT false;

-- Expose service_charge in get_cash_flow_report (Mahmoud's reporting gap).
-- Keeps existing payload shape and appends the new field.
CREATE OR REPLACE FUNCTION public.get_cash_flow_report(
  p_merchant_id uuid,
  p_location_id uuid,
  p_start_date  timestamp with time zone,
  p_end_date    timestamp with time zone
) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'order_number',    o.order_number,
                'amount_collected', op.amount,
                'tip_amount',      op.tip_amount,
                'total_amount',    op.total_amount,
                'created_at',      op.initiated_at,
                'staff_name',      sp.first_name || ' ' || sp.last_name,
                'service_charge',  COALESCE(o.service_charge, 0)
            ) ORDER BY op.initiated_at DESC
        ), '[]'::json)
        FROM order_payments op
        JOIN orders o ON o.id = op.order_id
        LEFT JOIN staff_profiles sp ON sp.id = op.processed_by_staff_id
        WHERE o.merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR o.location_id = p_location_id)
          AND op.payment_method = 'cash'
          AND op.status IN ('captured', 'authorized')
          AND op.initiated_at BETWEEN p_start_date AND p_end_date
    );
END;
$$;
