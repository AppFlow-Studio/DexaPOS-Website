-- ============================================================================
-- Migration 046: Device Registry Foundation
-- Stream C Phase 1: schema-only foundation for device inventory tracking
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'device_lifecycle_status'
  ) THEN
    CREATE TYPE public.device_lifecycle_status AS ENUM (
      'in_warehouse',
      'allocated',
      'shipped',
      'provisioning',
      'deployed',
      'in_repair',
      'decommissioned',
      'lost',
      'rma'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.device_inventory (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id                 uuid NOT NULL REFERENCES public.device_catalog(id),
  serial_number              text NOT NULL,
  mac_address                text,
  status                     public.device_lifecycle_status NOT NULL DEFAULT 'in_warehouse',
  merchant_id                uuid REFERENCES public.merchants(id),
  location_id                uuid REFERENCES public.locations(id),
  linked_station_id          uuid REFERENCES public.stations(id),
  linked_payment_terminal_id uuid REFERENCES public.payment_terminals(id),
  linked_printer_id          uuid REFERENCES public.printers(id),
  purchased_at               date,
  warranty_expires_at        date,
  purchase_order_number      text,
  firmware_version           text,
  app_version                text,
  last_config_at             timestamptz,
  condition                  text NOT NULL DEFAULT 'new' CHECK (
    condition IN ('new', 'good', 'fair', 'damaged', 'refurbished')
  ),
  notes                      text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 text,
  CONSTRAINT device_inventory_one_operational_link CHECK (
    (
      CASE WHEN linked_station_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN linked_payment_terminal_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN linked_printer_id IS NOT NULL THEN 1 ELSE 0 END
    ) <= 1
  ),
  CONSTRAINT device_inventory_location_requires_merchant CHECK (
    location_id IS NULL OR merchant_id IS NOT NULL
  ),
  CONSTRAINT device_inventory_unique_serial_per_catalog UNIQUE (catalog_id, serial_number)
);

COMMENT ON TABLE public.device_inventory IS
  'One row per physical device DEXA has procured. Tracks current lifecycle state, owner, and optional operational link.';

CREATE TABLE IF NOT EXISTS public.device_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         uuid NOT NULL REFERENCES public.device_inventory(id) ON DELETE CASCADE,
  previous_status   public.device_lifecycle_status,
  new_status        public.device_lifecycle_status NOT NULL,
  from_merchant_id  uuid REFERENCES public.merchants(id),
  to_merchant_id    uuid REFERENCES public.merchants(id),
  from_location_id  uuid REFERENCES public.locations(id),
  to_location_id    uuid REFERENCES public.locations(id),
  performed_by      text NOT NULL,
  performed_by_name text,
  tracking_number   text,
  reason            text,
  notes             text,
  assigned_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.device_assignments IS
  'Append-only chain-of-custody log for every device status and ownership transition.';

CREATE TABLE IF NOT EXISTS public.device_config_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         uuid NOT NULL REFERENCES public.device_inventory(id) ON DELETE CASCADE,
  change_type       text NOT NULL CHECK (
    change_type IN ('firmware_update', 'app_update', 'config_change', 'factory_reset', 'reprovisioning')
  ),
  previous_value    text,
  new_value         text,
  config_snapshot   jsonb,
  performed_by      text,
  performed_by_name text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.device_config_history IS
  'Append-only history of firmware, app, and configuration changes per device.';

CREATE TABLE IF NOT EXISTS public.device_notes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id          uuid NOT NULL REFERENCES public.device_inventory(id) ON DELETE CASCADE,
  note_type          text NOT NULL DEFAULT 'general' CHECK (
    note_type IN ('support', 'maintenance', 'incident', 'general', 'warranty_claim')
  ),
  content            text NOT NULL,
  created_by         text NOT NULL,
  created_by_name    text,
  external_ticket_id text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.device_notes IS
  'Append-only support and maintenance notes linked to a device.';

CREATE INDEX IF NOT EXISTS idx_device_inventory_merchant
  ON public.device_inventory(merchant_id);
CREATE INDEX IF NOT EXISTS idx_device_inventory_location
  ON public.device_inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_device_inventory_status
  ON public.device_inventory(status);
CREATE INDEX IF NOT EXISTS idx_device_inventory_serial
  ON public.device_inventory(serial_number);
CREATE INDEX IF NOT EXISTS idx_device_inventory_catalog
  ON public.device_inventory(catalog_id);
CREATE INDEX IF NOT EXISTS idx_device_inventory_linked_station
  ON public.device_inventory(linked_station_id)
  WHERE linked_station_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_inventory_linked_payment_terminal
  ON public.device_inventory(linked_payment_terminal_id)
  WHERE linked_payment_terminal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_inventory_linked_printer
  ON public.device_inventory(linked_printer_id)
  WHERE linked_printer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_assignments_device
  ON public.device_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_device_assignments_date
  ON public.device_assignments(assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_assignments_to_merchant
  ON public.device_assignments(to_merchant_id);

CREATE INDEX IF NOT EXISTS idx_device_config_history_device
  ON public.device_config_history(device_id);
CREATE INDEX IF NOT EXISTS idx_device_config_history_date
  ON public.device_config_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_notes_device
  ON public.device_notes(device_id);
CREATE INDEX IF NOT EXISTS idx_device_notes_date
  ON public.device_notes(created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_device_inventory ON public.device_inventory;
CREATE TRIGGER set_updated_at_device_inventory
  BEFORE UPDATE ON public.device_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.prevent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS device_assignments_append_only_guard ON public.device_assignments;
CREATE TRIGGER device_assignments_append_only_guard
  BEFORE UPDATE OR DELETE ON public.device_assignments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

DROP TRIGGER IF EXISTS device_config_history_append_only_guard ON public.device_config_history;
CREATE TRIGGER device_config_history_append_only_guard
  BEFORE UPDATE OR DELETE ON public.device_config_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

DROP TRIGGER IF EXISTS device_notes_append_only_guard ON public.device_notes;
CREATE TRIGGER device_notes_append_only_guard
  BEFORE UPDATE OR DELETE ON public.device_notes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

ALTER TABLE public.device_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_config_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_inventory_select_hq ON public.device_inventory;
CREATE POLICY device_inventory_select_hq ON public.device_inventory
  FOR SELECT TO authenticated
  USING (public.is_dexapos_admin());

DROP POLICY IF EXISTS device_inventory_insert_hq ON public.device_inventory;
CREATE POLICY device_inventory_insert_hq ON public.device_inventory
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dexapos_admin());

DROP POLICY IF EXISTS device_inventory_update_hq ON public.device_inventory;
CREATE POLICY device_inventory_update_hq ON public.device_inventory
  FOR UPDATE TO authenticated
  USING (public.is_dexapos_admin())
  WITH CHECK (public.is_dexapos_admin());

DROP POLICY IF EXISTS device_inventory_delete_hq ON public.device_inventory;
CREATE POLICY device_inventory_delete_hq ON public.device_inventory
  FOR DELETE TO authenticated
  USING (public.is_dexapos_admin());

DROP POLICY IF EXISTS device_inventory_select_carrier ON public.device_inventory;
CREATE POLICY device_inventory_select_carrier ON public.device_inventory
  FOR SELECT TO authenticated
  USING (
    merchant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.merchants m
      WHERE m.id = device_inventory.merchant_id
        AND m.carrier_id = public.get_my_carrier_id()
    )
  );

DROP POLICY IF EXISTS device_inventory_select_merchant ON public.device_inventory;
CREATE POLICY device_inventory_select_merchant ON public.device_inventory
  FOR SELECT TO authenticated
  USING (
    merchant_id IS NOT NULL
    AND public.is_merchant_admin(merchant_id)
  );

DROP POLICY IF EXISTS device_assignments_select_hq ON public.device_assignments;
CREATE POLICY device_assignments_select_hq ON public.device_assignments
  FOR SELECT TO authenticated
  USING (public.is_dexapos_admin());

DROP POLICY IF EXISTS device_assignments_insert_hq ON public.device_assignments;
CREATE POLICY device_assignments_insert_hq ON public.device_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dexapos_admin());

DROP POLICY IF EXISTS device_assignments_select_carrier ON public.device_assignments;
CREATE POLICY device_assignments_select_carrier ON public.device_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.device_inventory di
      JOIN public.merchants m ON m.id = di.merchant_id
      WHERE di.id = device_assignments.device_id
        AND m.carrier_id = public.get_my_carrier_id()
    )
  );

DROP POLICY IF EXISTS device_assignments_select_merchant ON public.device_assignments;
CREATE POLICY device_assignments_select_merchant ON public.device_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.device_inventory di
      WHERE di.id = device_assignments.device_id
        AND di.merchant_id IS NOT NULL
        AND public.is_merchant_admin(di.merchant_id)
    )
  );

DROP POLICY IF EXISTS device_config_history_select_hq ON public.device_config_history;
CREATE POLICY device_config_history_select_hq ON public.device_config_history
  FOR SELECT TO authenticated
  USING (public.is_dexapos_admin());

DROP POLICY IF EXISTS device_config_history_insert_hq ON public.device_config_history;
CREATE POLICY device_config_history_insert_hq ON public.device_config_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dexapos_admin());

DROP POLICY IF EXISTS device_config_history_select_carrier ON public.device_config_history;
CREATE POLICY device_config_history_select_carrier ON public.device_config_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.device_inventory di
      JOIN public.merchants m ON m.id = di.merchant_id
      WHERE di.id = device_config_history.device_id
        AND m.carrier_id = public.get_my_carrier_id()
    )
  );

DROP POLICY IF EXISTS device_config_history_select_merchant ON public.device_config_history;
CREATE POLICY device_config_history_select_merchant ON public.device_config_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.device_inventory di
      WHERE di.id = device_config_history.device_id
        AND di.merchant_id IS NOT NULL
        AND public.is_merchant_admin(di.merchant_id)
    )
  );

DROP POLICY IF EXISTS device_notes_select_hq ON public.device_notes;
CREATE POLICY device_notes_select_hq ON public.device_notes
  FOR SELECT TO authenticated
  USING (public.is_dexapos_admin());

DROP POLICY IF EXISTS device_notes_insert_hq ON public.device_notes;
CREATE POLICY device_notes_insert_hq ON public.device_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dexapos_admin());

DROP POLICY IF EXISTS device_notes_select_carrier ON public.device_notes;
CREATE POLICY device_notes_select_carrier ON public.device_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.device_inventory di
      JOIN public.merchants m ON m.id = di.merchant_id
      WHERE di.id = device_notes.device_id
        AND m.carrier_id = public.get_my_carrier_id()
    )
  );

DROP POLICY IF EXISTS device_notes_select_merchant ON public.device_notes;
CREATE POLICY device_notes_select_merchant ON public.device_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.device_inventory di
      WHERE di.id = device_notes.device_id
        AND di.merchant_id IS NOT NULL
        AND public.is_merchant_admin(di.merchant_id)
    )
  );

CREATE OR REPLACE FUNCTION public.assign_device(
  p_device_id       uuid,
  p_new_status      public.device_lifecycle_status,
  p_to_merchant_id  uuid DEFAULT NULL,
  p_to_location_id  uuid DEFAULT NULL,
  p_tracking_number text DEFAULT NULL,
  p_reason          text DEFAULT NULL,
  p_notes           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device                    public.device_inventory%ROWTYPE;
  v_performer_id              text;
  v_assignment_id             uuid;
  v_allowed_transitions       public.device_lifecycle_status[];
  v_target_location_merchant  uuid;
  v_target_merchant_id        uuid;
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DEXA HQ can assign devices');
  END IF;

  v_performer_id := public.current_user_id();
  IF v_performer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authenticated user not found');
  END IF;

  SELECT *
  INTO v_device
  FROM public.device_inventory
  WHERE id = p_device_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not found');
  END IF;

  IF v_device.status = p_new_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Device is already in status %s', p_new_status)
    );
  END IF;

  v_allowed_transitions := CASE v_device.status
    WHEN 'in_warehouse'::public.device_lifecycle_status THEN ARRAY['allocated', 'decommissioned', 'lost']::public.device_lifecycle_status[]
    WHEN 'allocated'::public.device_lifecycle_status THEN ARRAY['shipped', 'in_warehouse']::public.device_lifecycle_status[]
    WHEN 'shipped'::public.device_lifecycle_status THEN ARRAY['provisioning', 'in_warehouse', 'lost']::public.device_lifecycle_status[]
    WHEN 'provisioning'::public.device_lifecycle_status THEN ARRAY['deployed', 'in_warehouse', 'in_repair']::public.device_lifecycle_status[]
    WHEN 'deployed'::public.device_lifecycle_status THEN ARRAY['in_repair', 'decommissioned', 'in_warehouse', 'lost']::public.device_lifecycle_status[]
    WHEN 'in_repair'::public.device_lifecycle_status THEN ARRAY['provisioning', 'deployed', 'decommissioned', 'rma', 'in_warehouse']::public.device_lifecycle_status[]
    WHEN 'decommissioned'::public.device_lifecycle_status THEN ARRAY[]::public.device_lifecycle_status[]
    WHEN 'lost'::public.device_lifecycle_status THEN ARRAY['in_warehouse']::public.device_lifecycle_status[]
    WHEN 'rma'::public.device_lifecycle_status THEN ARRAY[]::public.device_lifecycle_status[]
  END;

  IF NOT (p_new_status = ANY (COALESCE(v_allowed_transitions, ARRAY[]::public.device_lifecycle_status[]))) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Invalid transition: %s -> %s', v_device.status, p_new_status)
    );
  END IF;

  IF p_to_location_id IS NOT NULL THEN
    SELECT merchant_id
    INTO v_target_location_merchant
    FROM public.locations
    WHERE id = p_to_location_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Target location not found');
    END IF;
  END IF;

  IF p_to_merchant_id IS NOT NULL
     AND v_target_location_merchant IS NOT NULL
     AND p_to_merchant_id <> v_target_location_merchant THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Target location does not belong to target merchant'
    );
  END IF;

  v_target_merchant_id := COALESCE(p_to_merchant_id, v_target_location_merchant);

  IF p_new_status = 'in_warehouse'::public.device_lifecycle_status
     AND (p_to_merchant_id IS NOT NULL OR p_to_location_id IS NOT NULL) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Warehouse status cannot carry a target merchant or location'
    );
  END IF;

  IF p_new_status IN ('allocated'::public.device_lifecycle_status, 'shipped'::public.device_lifecycle_status)
     AND v_target_merchant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Status %s requires a target merchant', p_new_status)
    );
  END IF;

  IF p_new_status IN ('provisioning'::public.device_lifecycle_status, 'deployed'::public.device_lifecycle_status)
     AND (v_target_merchant_id IS NULL OR p_to_location_id IS NULL) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Status %s requires both a target merchant and location', p_new_status)
    );
  END IF;

  INSERT INTO public.device_assignments (
    device_id,
    previous_status,
    new_status,
    from_merchant_id,
    to_merchant_id,
    from_location_id,
    to_location_id,
    performed_by,
    tracking_number,
    reason,
    notes
  )
  VALUES (
    p_device_id,
    v_device.status,
    p_new_status,
    v_device.merchant_id,
    CASE
      WHEN p_new_status = 'in_warehouse'::public.device_lifecycle_status THEN NULL
      ELSE COALESCE(v_target_merchant_id, v_device.merchant_id)
    END,
    v_device.location_id,
    CASE
      WHEN p_new_status = 'in_warehouse'::public.device_lifecycle_status THEN NULL
      ELSE COALESCE(p_to_location_id, v_device.location_id)
    END,
    v_performer_id,
    p_tracking_number,
    p_reason,
    p_notes
  )
  RETURNING id INTO v_assignment_id;

  UPDATE public.device_inventory
  SET
    status = p_new_status,
    merchant_id = CASE
      WHEN p_new_status = 'in_warehouse'::public.device_lifecycle_status THEN NULL
      ELSE COALESCE(v_target_merchant_id, merchant_id)
    END,
    location_id = CASE
      WHEN p_new_status = 'in_warehouse'::public.device_lifecycle_status THEN NULL
      ELSE COALESCE(p_to_location_id, location_id)
    END,
    linked_station_id = CASE
      WHEN p_new_status IN (
        'in_warehouse'::public.device_lifecycle_status,
        'in_repair'::public.device_lifecycle_status,
        'decommissioned'::public.device_lifecycle_status,
        'lost'::public.device_lifecycle_status,
        'rma'::public.device_lifecycle_status
      ) THEN NULL
      ELSE linked_station_id
    END,
    linked_payment_terminal_id = CASE
      WHEN p_new_status IN (
        'in_warehouse'::public.device_lifecycle_status,
        'in_repair'::public.device_lifecycle_status,
        'decommissioned'::public.device_lifecycle_status,
        'lost'::public.device_lifecycle_status,
        'rma'::public.device_lifecycle_status
      ) THEN NULL
      ELSE linked_payment_terminal_id
    END,
    linked_printer_id = CASE
      WHEN p_new_status IN (
        'in_warehouse'::public.device_lifecycle_status,
        'in_repair'::public.device_lifecycle_status,
        'decommissioned'::public.device_lifecycle_status,
        'lost'::public.device_lifecycle_status,
        'rma'::public.device_lifecycle_status
      ) THEN NULL
      ELSE linked_printer_id
    END
  WHERE id = p_device_id;

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment_id,
    'device_id', p_device_id,
    'previous_status', v_device.status,
    'new_status', p_new_status,
    'merchant_id', (
      SELECT merchant_id
      FROM public.device_inventory
      WHERE id = p_device_id
    ),
    'location_id', (
      SELECT location_id
      FROM public.device_inventory
      WHERE id = p_device_id
    )
  );
END;
$$;

COMMENT ON FUNCTION public.assign_device(uuid, public.device_lifecycle_status, uuid, uuid, text, text, text) IS
  'Primary state-transition RPC for the device registry. Validates lifecycle moves, logs the assignment, and updates current ownership atomically.';

CREATE OR REPLACE VIEW public.admin_device_inventory
WITH (security_invoker = true)
AS
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
  m.name AS merchant_name,
  di.location_id,
  l.name AS location_name,
  di.linked_station_id,
  di.linked_payment_terminal_id,
  di.linked_printer_id
FROM public.device_inventory di
JOIN public.device_catalog dc ON dc.id = di.catalog_id
LEFT JOIN public.merchants m ON m.id = di.merchant_id
LEFT JOIN public.locations l ON l.id = di.location_id;

CREATE OR REPLACE VIEW public.admin_device_summary
WITH (security_invoker = true)
AS
SELECT
  dc.device_category,
  dc.manufacturer,
  dc.model_name,
  di.status,
  count(*) AS device_count
FROM public.device_inventory di
JOIN public.device_catalog dc ON dc.id = di.catalog_id
GROUP BY dc.device_category, dc.manufacturer, dc.model_name, di.status;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_inventory TO authenticated;
GRANT SELECT, INSERT ON public.device_assignments TO authenticated;
GRANT SELECT, INSERT ON public.device_config_history TO authenticated;
GRANT SELECT, INSERT ON public.device_notes TO authenticated;
GRANT SELECT ON public.admin_device_inventory TO authenticated;
GRANT SELECT ON public.admin_device_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_device(uuid, public.device_lifecycle_status, uuid, uuid, text, text, text) TO authenticated;
