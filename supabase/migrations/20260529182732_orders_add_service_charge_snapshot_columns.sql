ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_name text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_rate numeric(5,2);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_rule_id uuid
    REFERENCES public.service_charge_rules(id);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_is_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.service_charge_name IS
  'Snapshotted display name of the service charge rule active when this order first qualified. Pinned by apply_service_charge_v1 on first apply.';

COMMENT ON COLUMN public.orders.service_charge_rate IS
  'Snapshotted rate_percent (e.g. 18.00 for 18%) of the rule active when this order first qualified. Pinned by apply_service_charge_v1 on first apply; re-pinned only when service_charge_rule_id changes.';

COMMENT ON COLUMN public.orders.service_charge_rule_id IS
  'FK to the service_charge_rules row that was active when this order first qualified. NULL means no SC has been applied to this order.';

COMMENT ON COLUMN public.orders.service_charge_is_manual IS
  'TRUE when a manager has overridden the auto-applied service charge. apply_service_charge_v1 short-circuits when this is true so the override is preserved across recalculates. Wave D introduces the manager-PIN flow that flips this; until then it stays false.';;
