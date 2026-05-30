-- One row per (merchant, scope) for service_charge_rules.
-- The original partial unique index `WHERE is_active = true` let a fresh row
-- be inserted whenever the existing one was toggled inactive, producing
-- duplicates per scope. We now enforce a single row per scope unconditionally
-- and treat is_active purely as an on/off flag on that one row.

-- Collapse any existing duplicates: keep the most recently updated row per
-- (merchant_id, scope) and drop the rest. Safe because v1 hasn't shipped POS
-- auto-apply yet, so no order_rows reference these rule_ids meaningfully.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY merchant_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn
  FROM public.service_charge_rules
)
DELETE FROM public.service_charge_rules
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

DROP INDEX IF EXISTS public.uq_service_charge_active_scope;

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_charge_scope
  ON public.service_charge_rules
    (merchant_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid));
