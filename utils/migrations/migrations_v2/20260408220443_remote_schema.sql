set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.accept_online_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order       RECORD;
  v_now         TIMESTAMPTZ := NOW();
BEGIN
  -- Lock the row to prevent race conditions
  SELECT id, status, location_id, merchant_id
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order is not in pending status (current: ' || v_order.status || ')'
    );
  END IF;

  -- Transition: pending → accepted → sent_to_kitchen
  UPDATE public.orders
     SET status              = 'accepted',
         accepted_at         = v_now,
         sent_to_kitchen_at  = v_now,
         updated_at          = v_now
   WHERE id = p_order_id;

  -- Fire all items to kitchen
  UPDATE public.order_items
     SET kitchen_status     = 'sent',
         sent_to_kitchen_at = v_now
   WHERE order_id = p_order_id
     AND (kitchen_status IS NULL OR kitchen_status = 'pending');

  -- Audit trail
  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, 'pending', 'accepted', v_now, 'Accepted by merchant');

  RETURN jsonb_build_object(
    'success',    true,
    'order_id',   p_order_id,
    'accepted_at', v_now
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_category_to_menu(p_menu_id uuid, p_category_id uuid, p_display_order integer DEFAULT 0, p_custom_title text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO menu_categories (
        menu_id, category_id, display_order, 
        custom_title, is_active,
        created_at, updated_at
    ) VALUES (
        p_menu_id, p_category_id, p_display_order,
        p_custom_title, true,
        NOW(), NOW()
    )
    ON CONFLICT (menu_id, category_id) 
    DO UPDATE SET
        display_order = EXCLUDED.display_order,
        custom_title = COALESCE(EXCLUDED.custom_title, menu_categories.custom_title),
        is_active = true,
        updated_at = NOW();
    
    RETURN json_build_object(
        'success', true,
        'menu_id', p_menu_id,
        'category_id', p_category_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_item_to_category(p_category_id uuid, p_menu_item_id uuid, p_display_order integer DEFAULT 0, p_custom_price numeric DEFAULT NULL::numeric, p_is_featured boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO category_items (
        category_id, menu_item_id, display_order, 
        custom_price, is_featured, is_available,
        created_at, updated_at
    ) VALUES (
        p_category_id, p_menu_item_id, p_display_order,
        p_custom_price, p_is_featured, true,
        NOW(), NOW()
    )
    ON CONFLICT (category_id, menu_item_id) 
    DO UPDATE SET
        display_order = EXCLUDED.display_order,
        custom_price = COALESCE(EXCLUDED.custom_price, category_items.custom_price),
        is_featured = EXCLUDED.is_featured,
        updated_at = NOW();
    
    RETURN json_build_object(
        'success', true,
        'category_id', p_category_id,
        'menu_item_id', p_menu_item_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_ticket_message(p_ticket_id uuid, p_sender_id text, p_sender_name text, p_sender_role text, p_message text, p_is_internal boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_message_id UUID;
  v_ticket     RECORD;
BEGIN
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  INSERT INTO public.support_ticket_messages (
    ticket_id, sender_id, sender_name, sender_role, message, is_internal,
    read_by_merchant, read_by_admin
  ) VALUES (
    p_ticket_id, p_sender_id, p_sender_name, p_sender_role, p_message, p_is_internal,
    CASE WHEN p_sender_role = 'admin' THEN false ELSE true END,
    CASE WHEN p_sender_role = 'admin' THEN true ELSE false END
  )
  RETURNING id INTO v_message_id;

  -- Update ticket timestamps and status
  UPDATE public.support_tickets
  SET
    last_message_at = now(),
    updated_at = now(),
    -- First admin response sets first_response_at
    first_response_at = CASE
      WHEN p_sender_role = 'admin' AND first_response_at IS NULL THEN now()
      ELSE first_response_at
    END,
    -- Admin reply moves ticket to in_progress if it was open
    status = CASE
      WHEN p_sender_role = 'admin' AND status = 'open' THEN 'in_progress'
      WHEN p_sender_role = 'merchant' AND status = 'waiting_on_merchant' THEN 'in_progress'
      ELSE status
    END
  WHERE id = p_ticket_id;

  RETURN jsonb_build_object('message_id', v_message_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_ticket_message_with_attachments(p_ticket_id uuid, p_sender_id text, p_sender_name text, p_sender_role text, p_message text, p_is_internal boolean DEFAULT false, p_attachments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_message_id UUID;
  v_ticket     RECORD;
  v_att        JSONB;
BEGIN
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  -- Insert message
  INSERT INTO public.support_ticket_messages (
    ticket_id, sender_id, sender_name, sender_role, message, is_internal,
    read_by_merchant, read_by_admin
  ) VALUES (
    p_ticket_id, p_sender_id, p_sender_name, p_sender_role, p_message, p_is_internal,
    CASE WHEN p_sender_role = 'admin' THEN false ELSE true END,
    CASE WHEN p_sender_role = 'admin' THEN true  ELSE false END
  )
  RETURNING id INTO v_message_id;

  -- Insert attachments linked to this message
  FOR v_att IN SELECT * FROM jsonb_array_elements(COALESCE(p_attachments, '[]'::jsonb))
  LOOP
    INSERT INTO public.support_ticket_attachments (
      ticket_id, message_id, uploaded_by,
      file_name, file_path, file_size, file_type
    ) VALUES (
      p_ticket_id, v_message_id, p_sender_id,
      v_att->>'file_name',
      v_att->>'file_path',
      (v_att->>'file_size')::integer,
      v_att->>'file_type'
    );
  END LOOP;

  -- Update ticket timestamps and auto-advance status
  UPDATE public.support_tickets
  SET
    last_message_at   = now(),
    updated_at        = now(),
    first_response_at = CASE
      WHEN p_sender_role = 'admin' AND first_response_at IS NULL THEN now()
      ELSE first_response_at
    END,
    status = CASE
      WHEN p_sender_role = 'admin'    AND status = 'open'                  THEN 'in_progress'
      WHEN p_sender_role = 'merchant' AND status = 'waiting_on_merchant'   THEN 'in_progress'
      ELSE status
    END
  WHERE id = p_ticket_id;

  RETURN jsonb_build_object('message_id', v_message_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_bulk_reset_pins(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(staff_profile_id uuid, staff_name text, new_pin text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_admin_user_id text;
  v_staff record;
  v_pin text;
  v_reset_count int := 0;
BEGIN
  IF NOT is_dexapos_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_admin_user_id := current_user_id();

  FOR v_staff IN
    SELECT
      sp.id AS profile_id,
      sp.user_id AS profile_user_id,
      sp.first_name || ' ' || sp.last_name AS full_name,
      lm.location_id AS loc_id
    FROM staff_profiles sp
    JOIN location_members lm ON lm.staff_profile_id = sp.id
    JOIN locations l ON l.id = lm.location_id
    WHERE sp.merchant_id = p_merchant_id
      AND sp.is_active = true
      AND lm.is_active = true
      AND (p_location_id IS NULL OR lm.location_id = p_location_id)
    UNION
    SELECT
      sp.id AS profile_id,
      sp.user_id AS profile_user_id,
      sp.first_name || ' ' || sp.last_name AS full_name,
      lm.location_id AS loc_id
    FROM staff_profiles sp
    JOIN location_members lm ON lm.user_id = sp.user_id
    JOIN locations l ON l.id = lm.location_id
    WHERE sp.merchant_id = p_merchant_id
      AND sp.user_id IS NOT NULL
      AND sp.is_active = true
      AND lm.staff_profile_id IS NULL
      AND lm.is_active = true
      AND (p_location_id IS NULL OR lm.location_id = p_location_id)
  LOOP
    v_pin := lpad(floor(random() * 9000 + 1000)::text, 4, '0');

    UPDATE location_members
    SET
      pin_plain = v_pin,
      pin_hashed = NULL,
      pin_code = v_pin,
      updated_at = NOW()
    WHERE (
        staff_profile_id = v_staff.profile_id
        OR (v_staff.profile_user_id IS NOT NULL AND user_id = v_staff.profile_user_id)
      )
      AND location_id = v_staff.loc_id;

    staff_profile_id := v_staff.profile_id;
    staff_name := v_staff.full_name;
    new_pin := v_pin;
    RETURN NEXT;

    v_reset_count := v_reset_count + 1;
  END LOOP;

  INSERT INTO audit_logs (
    actor_user_id,
    actor_role,
    action,
    action_category,
    severity,
    resource_type,
    resource_id,
    merchant_id,
    location_id,
    metadata
  ) VALUES (
    v_admin_user_id,
    'hq.admin',
    'ADMIN_BULK_RESET_PINS',
    'staff_management',
    'warning',
    'merchant',
    p_merchant_id,
    p_merchant_id,
    p_location_id,
    jsonb_build_object(
      'bulk_reset', true,
      'staff_count', v_reset_count
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_unified_staff_view(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(member_id text, staff_profile_id uuid, user_id text, clerk_user_id text, email text, first_name text, last_name text, display_name text, avatar_url text, phone text, account_type text, is_clerk_user boolean, location_assignments jsonb, total_locations bigint, primary_location_id uuid, primary_location_name text, overall_is_active boolean, member_created_at timestamp with time zone, last_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT is_dexapos_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  WITH staff_data AS (
    SELECT
      sp.id AS profile_id,
      sp.user_id,
      u.id AS clerk_user_id,
      sp.email,
      sp.first_name,
      sp.last_name,
      sp.display_name,
      COALESCE(u.avatar_url, sp.avatar_url) AS avatar_url,
      sp.phone,
      sp.account_type,
      sp.is_active AS profile_active,
      sp.created_at,
      sp.updated_at
    FROM staff_profiles sp
    LEFT JOIN users u ON u.id = sp.user_id
    WHERE sp.merchant_id = p_merchant_id
  ),
  location_data AS (
    SELECT
      COALESCE(lm.staff_profile_id, sp_map.id) AS profile_id,
      jsonb_agg(
        jsonb_build_object(
          'location_id', l.id,
          'location_name', l.name,
          'role_code', lm.role_code,
          'role_name', r.name,
          'is_primary', lm.is_primary_location,
          'is_active', lm.is_active,
          'has_pin', (lm.pin_plain IS NOT NULL OR lm.pin_hashed IS NOT NULL OR lm.pin_code IS NOT NULL),
          'pin_code', COALESCE(lm.pin_plain, lm.pin_hashed, lm.pin_code),
          'hourly_rate', lm.hourly_rate,
          'employment_type', lm.employment_type,
          'assigned_at', lm.assigned_at
        ) ORDER BY lm.is_primary_location DESC, l.name
      ) AS assignments,
      COUNT(*)::bigint AS location_count,
      (array_agg(l.id) FILTER (WHERE lm.is_primary_location = true))[1] AS primary_loc_id,
      (array_agg(l.name) FILTER (WHERE lm.is_primary_location = true))[1] AS primary_loc_name,
      BOOL_OR(lm.is_active) AS any_active
    FROM location_members lm
    INNER JOIN locations l ON l.id = lm.location_id
    LEFT JOIN roles r ON r.code = lm.role_code
    LEFT JOIN staff_profiles sp_map
      ON sp_map.user_id = lm.user_id
     AND sp_map.merchant_id = p_merchant_id
    WHERE l.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR lm.location_id = p_location_id)
      AND COALESCE(lm.staff_profile_id, sp_map.id) IS NOT NULL
    GROUP BY COALESCE(lm.staff_profile_id, sp_map.id)
  )
  SELECT
    m.id::text AS member_id,
    sd.profile_id AS staff_profile_id,
    sd.user_id AS user_id,
    sd.clerk_user_id,
    sd.email,
    sd.first_name,
    sd.last_name,
    sd.display_name,
    sd.avatar_url,
    sd.phone,
    sd.account_type,
    (sd.account_type = 'clerk') AS is_clerk_user,
    COALESCE(ld.assignments, '[]'::jsonb) AS location_assignments,
    COALESCE(ld.location_count, 0) AS total_locations,
    ld.primary_loc_id AS primary_location_id,
    ld.primary_loc_name AS primary_location_name,
    COALESCE(ld.any_active, false) AND sd.profile_active AS overall_is_active,
    m.created_at AS member_created_at,
    m.updated_at AS last_updated_at
  FROM staff_data sd
  LEFT JOIN members m ON m.staff_profile_id = sd.profile_id OR m.user_id = sd.user_id
  LEFT JOIN location_data ld ON ld.profile_id = sd.profile_id
  ORDER BY sd.last_name, sd.first_name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_reset_staff_pin(p_staff_profile_id uuid, p_location_id uuid, p_custom_pin text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, new_pin text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pin text;
  v_staff_name text;
  v_merchant_id uuid;
  v_admin_user_id text;
  v_staff_user_id text;
BEGIN
  IF NOT is_dexapos_admin() THEN
    RETURN QUERY SELECT false, NULL::text, 'Unauthorized: Admin access required'::text;
    RETURN;
  END IF;

  v_admin_user_id := current_user_id();

  SELECT
    sp.first_name || ' ' || sp.last_name,
    sp.merchant_id,
    sp.user_id
  INTO v_staff_name, v_merchant_id, v_staff_user_id
  FROM staff_profiles sp
  JOIN location_members lm
    ON (
      lm.staff_profile_id = sp.id
      OR (sp.user_id IS NOT NULL AND lm.user_id = sp.user_id)
    )
  WHERE sp.id = p_staff_profile_id
    AND lm.location_id = p_location_id;

  IF v_staff_name IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'Staff member not found at this location'::text;
    RETURN;
  END IF;

  IF p_custom_pin IS NOT NULL THEN
    IF NOT p_custom_pin ~ '^\d{4,6}$' THEN
      RETURN QUERY SELECT false, NULL::text, 'PIN must be 4-6 digits'::text;
      RETURN;
    END IF;
    v_pin := p_custom_pin;
  ELSE
    v_pin := lpad(floor(random() * 9000 + 1000)::text, 4, '0');
  END IF;

  UPDATE location_members
  SET
    pin_plain = v_pin,
    pin_hashed = NULL,
    pin_code = v_pin,
    updated_at = NOW()
  WHERE (
      staff_profile_id = p_staff_profile_id
      OR (v_staff_user_id IS NOT NULL AND user_id = v_staff_user_id)
    )
    AND location_id = p_location_id;

  INSERT INTO audit_logs (
    actor_user_id,
    actor_role,
    action,
    action_category,
    severity,
    resource_type,
    resource_id,
    resource_name,
    merchant_id,
    location_id,
    metadata
  ) VALUES (
    v_admin_user_id,
    'hq.admin',
    'ADMIN_RESET_PIN',
    'staff_management',
    'warning',
    'staff_profile',
    p_staff_profile_id,
    v_staff_name,
    v_merchant_id,
    p_location_id,
    jsonb_build_object('admin_reset', true)
  );

  RETURN QUERY SELECT true, v_pin, NULL::text;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.app_set_location_stock(p_inventory_item_id uuid, p_location_id uuid, p_quantity numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.set_location_stock(p_inventory_item_id, p_location_id, p_quantity);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_tip_distribution(p_session_id uuid, p_approved_by uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN

UPDATE tip_distribution_sessions
SET
status='approved',
approved_at=now(),
approved_by=p_approved_by
WHERE id=p_session_id
AND status='calculated';

IF NOT FOUND THEN

RETURN json_build_object(
'success',false,
'error','Session not found or not in calculated status'
);

END IF;

RETURN json_build_object(
'success',true,
'session_id',p_session_id
);

END;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_device(p_device_id uuid, p_new_status public.device_lifecycle_status, p_to_merchant_id uuid DEFAULT NULL::uuid, p_to_location_id uuid DEFAULT NULL::uuid, p_tracking_number text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.auto_activate_merchant_on_first_successful_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$declare
  v_previous_status text;
begin
  if new.merchant_id is null then
    return new;
  end if;

  if coalesce(new.status::text, '') not in ('captured', 'succeeded') then
    return new;
  end if;

  select onboarding_status
  into v_previous_status
  from public.merchants
  where id = new.merchant_id;

  if v_previous_status is null or v_previous_status not in ('created', 'onboarding') then
    return new;
  end if;

  update public.merchants
  set
    onboarding_status = 'active',
    activated_at = coalesce(activated_at, now()),
    onboarding_completed_at = coalesce(onboarding_completed_at, now()),
    updated_at = now()
  where id = new.merchant_id
    and onboarding_status in ('created', 'onboarding');

  if found then
    insert into public.audit_logs (
      action, action_category, severity, status, actor_name, actor_role,
      resource_type, merchant_id, changes, metadata
    )
    values (
      'merchant.status_auto_activated',
      'merchant',
      'info',
      'success',
      'System',
      'system',
      'merchant',
      new.merchant_id,
      jsonb_build_object(
        'before', jsonb_build_object('onboarding_status', v_previous_status),
        'after', jsonb_build_object('onboarding_status', 'active')
      ),
      jsonb_build_object(
        'source', 'order_payments_trigger',
        'auto_activation', true,
        'payment_id', new.id
      )
    );
  end if;

  return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.broadcast_order_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$DECLARE
  payload jsonb;
  order_data jsonb;
  order_items_data jsonb;
  order_payments_data jsonb;
  order_refund_items_data jsonb;
  reversals_data jsonb;
  payment_items_data jsonb;


  v_topic text;
  v_location_id uuid;
  v_station_name text;
BEGIN
  -- Get location_id (handle DELETE case)
  v_location_id := COALESCE(NEW.location_id, OLD.location_id);

  IF v_location_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build topic
  v_topic := 'location:' || v_location_id::text || ':orders';

  -- Build payload based on operation
  IF TG_OP = 'DELETE' THEN
    -- DELETE: Minimal payload (no need to fetch items)
    payload := jsonb_build_object(
      'operation', TG_OP,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', jsonb_build_object(
          'id', OLD.id,
          'order_number', OLD.order_number,
          'location_id', OLD.location_id,
          'station_id', OLD.station_id
        )
      )
    );
  ELSE
    -- INSERT/UPDATE: Full payload with order_items and modifiers
    -- 1. FETCH STATION NAME ----------------------------------------
    -- We need to look up the name based on the station_id
    SELECT station_name INTO v_station_name
    FROM stations
    WHERE id = NEW.station_id;
    -----------------------------------------------------------------
    -- Fetch order items WITH their modifiers for this order
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        --TODO: Might need to fetch menu_item base price 
        -- THIS LOGIC does not work for the current modifiers calculation locally
        'id', oi.id,
        'menu_item_id', oi.menu_item_id,
        'item_name', oi.item_name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'cash_price', oi.cash_price,
        'subtotal', oi.subtotal,
        'cash_subtotal', oi.cash_subtotal,
        'base_card_price', oi.base_card_price,
        'base_cash_price', oi.base_cash_price,
        'tax_amount', oi.tax_amount,
        'cash_tax_amount', oi.cash_tax_amount,
        'discount_amount', COALESCE(oi.discount_amount, 0),
        'item_status', oi.item_status,
        'kitchen_status', oi.kitchen_status,
        'paid_quantity', COALESCE(oi.paid_quantity, 0),
        'refunded_quantity', COALESCE(oi.refunded_quantity, 0),
        'refunded_amount', COALESCE(oi.refunded_amount, 0),
        'course_number', oi.course_number,
        'seat_number', oi.seat_number,
        'is_voided', COALESCE(oi.is_voided, false),
        'is_open_item', COALESCE(oi.is_open_item, false),
        'open_item_name', oi.open_item_name,
        'open_item_price', oi.open_item_price,
        'special_instructions', oi.special_instructions,
        'category_name', oi.category_name,
        'category_id', oi.category_id,
        'prep_station', oi.prep_station,
        'rush', COALESCE(oi.rush, false),
        'is_prioritized', COALESCE(oi.is_prioritized, false),
        'fire_time', oi.fire_time::timestamptz,
        -- Phase 2.5: Include modifiers for this item
        'modifiers', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'modifier_group_id', oim.modifier_group_id,
              'modifier_item_id', oim.modifier_item_id,
              'modifier_group_name', oim.modifier_group_name,
              'modifier_name', oim.modifier_name,
              'price_modifier', oim.price_modifier,
              'quantity', oim.quantity,
              'is_no', COALESCE(oim.is_no, false)
            )
          ), '[]'::jsonb)
          FROM order_item_modifiers oim
          WHERE oim.order_item_id = oi.id
        )
      )
      ORDER BY oi.display_order ASC NULLS LAST, oi.created_at ASC
    ), '[]'::jsonb) INTO order_items_data
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND COALESCE(oi.is_voided, false) = false;

     
    -- Fetch order payments for this order
    -- Split into two jsonb_build_object calls to stay under 100-arg limit
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', op.id,
        'order_id', op.order_id,
        'payment_method', op.payment_method,
        'amount', op.amount,
        'tip_amount', COALESCE(op.tip_amount, 0),
        'total_amount', op.total_amount,
        'status', op.status,
        'subtotal_portion', op.subtotal_portion,
        'tax_portion', op.tax_portion,
        'discount_portion', op.discount_portion,
        'amount_tendered', op.amount_tendered,
        'change_given', COALESCE(op.change_given, 0),
        'is_cash_priced', COALESCE(op.is_cash_priced, false),
        'original_amount', op.original_amount,
        'split_portion_index', op.split_portion_index,
        'split_count', op.split_count,
        'covers_items', COALESCE(op.covers_items, ARRAY[]::uuid[]),
        'card_type', op.card_type,
        'card_last_four', op.card_last_four,
        'transaction_id', op.transaction_id,
        'terminal_type', op.terminal_type,
        'is_voided', COALESCE(op.is_voided, false),
        'void_reason', op.void_reason,
        'refunded_amount', COALESCE(op.refunded_amount, 0),
        'refunded_at', op.refunded_at
      ) || jsonb_build_object(
        'captured_at', op.captured_at,
        'authorization_code', op.authorization_code,
        'auth_code', op.auth_code,
        'rrn', op.rrn,
        'batch_number', op.batch_number,
        'dejavoo_batch_number', op.dejavoo_batch_number,
        'dejavoo_invoice_number', op.dejavoo_invoice_number,
        'result_code', op.result_code,
        'entry_mode', op.processor_response->'dejavoo_transaction'->>'entryMode',
        'reference_number', op.reference_number,
        'reference_id', op.reference_number,
        'created_at', op.initiated_at,
        -- Return/refund tracking fields
        'is_returned', COALESCE(op.is_returned, false),
        'returned_at', op.returned_at,
        'returned_by', op.returned_by,
        'return_amount', COALESCE(op.return_amount, 0),
        'return_rrn', op.return_rrn,
        'return_auth_code', op.return_auth_code,
        'return_reference_id', op.return_reference_id,
        'return_number', op.return_number,
        'return_reason', op.return_reason
      )
    ), '[]'::jsonb) INTO order_payments_data
    FROM order_payments op
    WHERE op.order_id = NEW.id
      AND op.status IN ('captured', 'refunded', 'partially_refunded', 'void');
    -- Include refunded/voided payments for history display

    -- Fetch reversals for this order (via payment linkage)
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'original_payment_id', r.original_payment_id,
        'original_psp_reference', r.original_psp_reference,
        'reversal_reference_id', r.reversal_reference_id,
        'reversal_psp_reference', r.reversal_psp_reference,
        'merchant_id', r.merchant_id,
        'location_id', r.location_id,
        'reversal_type', r.reversal_type,
        'amount', r.amount,
        'reason_code', r.reason_code,
        'reason_description', r.reason_description,
        'status', r.status,
        'result_code', r.result_code,
        'response_message', r.response_message,
        'initiated_by', r.initiated_by,
        'approved_by', r.approved_by,
        'requested_at', r.requested_at,
        'processed_at', r.processed_at,
        'completed_at', r.completed_at,
        'failed_at', r.failed_at,
        'terminal_response', r.terminal_response,
        'emv_data', r.emv_data
      )
    ), '[]'::jsonb) INTO reversals_data
    FROM reversals r
    JOIN order_payments op ON op.id = r.original_payment_id
    WHERE op.order_id = NEW.id;

    -- Fetch refund line items for this order
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ori.id,
        'reversal_id', ori.reversal_id,
        'order_item_id', ori.order_item_id,
        'order_payment_item_id', ori.order_payment_item_id,
        'quantity_refunded', ori.quantity_refunded,
        'unit_price_refunded', ori.unit_price_refunded,
        'subtotal_refunded', ori.subtotal_refunded,
        'tax_refunded', ori.tax_refunded,
        'total_refunded', ori.total_refunded,
        'refund_reason', ori.refund_reason,
        'refund_reason_detail', ori.refund_reason_detail,
        'return_to_inventory', ori.return_to_inventory,
        'inventory_updated', ori.inventory_updated,
        'created_at', ori.created_at
      )
    ), '[]'::jsonb) INTO order_refund_items_data
    FROM order_refund_items ori
    JOIN order_items oi ON oi.id = ori.order_item_id
    WHERE oi.order_id = NEW.id;


    -- Fetch per-payment item coverage from junction table
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', opi.id,
        'order_payment_id', opi.order_payment_id,
        'order_item_id', opi.order_item_id,
        'quantity_paid', opi.quantity_paid,
        'unit_price_paid', opi.unit_price_paid,
        'subtotal_paid', opi.subtotal_paid,
        'tax_paid', opi.tax_paid
      )
    ), '[]'::jsonb) INTO payment_items_data
    FROM order_payment_items opi
    JOIN order_payments op ON op.id = opi.order_payment_id
    WHERE op.order_id = NEW.id;


    -- Build order_data in parts to avoid 100 argument limit
    -- Part 1: Identifiers and relationships
    order_data := jsonb_build_object(
      'id', NEW.id,
      'order_number', NEW.order_number,
      'display_number', NEW.display_number,
      'external_id', NEW.external_id,
      'merchant_id', NEW.merchant_id,
      'location_id', NEW.location_id,
      'customer_id', NEW.customer_id,
      'created_by_staff_id', NEW.created_by_staff_id,
      'created_by_user_id', NEW.created_by_user_id,
      'assigned_server_id', NEW.assigned_server_id,
      'station_id', NEW.station_id,
      'station_name', v_station_name,
      'order_type', NEW.order_type,
      'order_source', NEW.order_source,
      'delivery_platform', COALESCE(NEW.delivery_platform, NEW.metadata->>'delivery_company'),
      'split_payment_path', NEW.split_payment_path,
      'status', NEW.status,
      'table_number', NEW.table_number,
      'seat_number', NEW.seat_number,
      'check_status', NEW.check_status
    );

    -- Part 2: Financial totals
    order_data := order_data || jsonb_build_object(
      'subtotal', NEW.subtotal,
      'tax_amount', NEW.tax_amount,
      'tip_amount', NEW.tip_amount,
      'discount_amount', NEW.discount_amount,
      'service_charge', NEW.service_charge,
      'total_amount', NEW.total_amount,
      'card_subtotal', NEW.card_subtotal,
      'card_tax_amount', NEW.card_tax_amount,
      'card_total', NEW.card_total,
      'cash_subtotal', NEW.cash_subtotal,
      'cash_tax_amount', NEW.cash_tax_amount,
      'cash_total', NEW.cash_total,
      'cash_discount_applied', NEW.cash_discount_applied,
      'cash_discount_amount', NEW.cash_discount_amount
    );

    -- Part 3: Effective pricing and payment status
    order_data := order_data || jsonb_build_object(
      'effective_subtotal', NEW.effective_subtotal,
      'effective_tax_amount', NEW.effective_tax_amount,
      'effective_total', NEW.effective_total,
      'payment_pricing_mode', NEW.payment_pricing_mode,
      'payment_status', NEW.payment_status,
      'amount_paid', NEW.amount_paid,
      'amount_due', NEW.amount_due,
      'cash_amount_due', NEW.cash_amount_due
    );

    -- Part 4: Timestamps
    order_data := order_data || jsonb_build_object(
      'created_at', NEW.created_at,
      'updated_at', NEW.updated_at,
      'sent_to_kitchen_at', NEW.sent_to_kitchen_at,
      'started_preparing_at', NEW.started_preparing_at,
      'ready_at', NEW.ready_at,
      'completed_at', NEW.completed_at,
      'cancelled_at', NEW.cancelled_at,
      'voided_at', NEW.voided_at
    );

    -- Part 5: Void info, sync info, order items, and payments
    order_data := order_data || jsonb_build_object(
      'voided_by', NEW.voided_by,
      'void_reason', NEW.void_reason,
      'cancellation_reason', NEW.cancellation_reason,
      'sync_version', NEW.sync_version,
      'is_offline', NEW.is_offline,
      'order_items', order_items_data,
      'order_payments', order_payments_data,
      'reversals', reversals_data,
      'order_refund_items', order_refund_items_data,
      'payment_items', payment_items_data
    );

    -- Build final payload
    payload := jsonb_build_object(
      'operation', TG_OP,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', order_data
      )
    );
  END IF;

  -- RAISE LOG 'Active Order %', payload; 
  RAISE LOG 'Broadcasting order for location %', v_topic;
  RAISE LOG 'Broadcasting order for location %', payload;

  -- Broadcast using Supabase Realtime
  PERFORM realtime.send(
    payload,
    TG_OP,
    v_topic,
    true
  );

  RETURN NULL;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_order_changes failed: %', SQLERRM;
  RETURN NULL;
END;$function$
;

CREATE OR REPLACE FUNCTION public.calculate_tip_distribution(p_location_id uuid, p_merchant_id uuid, p_session_date date, p_shift_period text DEFAULT 'full_day'::text, p_calculated_by uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session_id       UUID;
  v_total_collected   NUMERIC;
  v_total_distributed NUMERIC;
  v_total_pooled      NUMERIC;
  v_total_tipouts     NUMERIC;
  v_pool              RECORD;
  v_rule              RECORD;
  v_role_share        RECORD;
  v_pool_total        NUMERIC;
  v_role_count        INTEGER;
  v_total_hours       NUMERIC;
  v_total_points      NUMERIC;
  v_tipout_total      NUMERIC;
  v_giver_count       INTEGER;
  v_receiver_count    INTEGER;
BEGIN

  -- Advisory lock to prevent concurrent runs for same location/date
  PERFORM pg_advisory_xact_lock(
    hashtext(p_location_id::text || p_session_date::text)
  );

  -- =========================================================
  -- STEP 1: CREATE OR RESET SESSION
  -- =========================================================
  INSERT INTO tip_distribution_sessions(
    merchant_id, location_id, session_date, shift_period
  )
  VALUES(p_merchant_id, p_location_id, p_session_date, p_shift_period)
  ON CONFLICT(location_id, session_date, shift_period)
  DO UPDATE SET updated_at = now(), status = 'draft'
  RETURNING id INTO v_session_id;

  DELETE FROM tip_distribution_details WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 2: POPULATE EMPLOYEE DATA FROM DAILY TIPS
  -- =========================================================
  INSERT INTO tip_distribution_details(
    session_id, staff_profile_id, role_code,
    hours_worked, gross_sales,
    charged_tips, cash_tips, individual_tips_earned
  )
  SELECT
    v_session_id,
    edt.staff_profile_id,
    lm.role_code,
    COALESCE(edt.hours_worked, 0),
    COALESCE(edt.gross_sales, 0),
    COALESCE(edt.charged_tips, 0),
    COALESCE(edt.cash_tips_declared, 0),
    COALESCE(edt.charged_tips, 0) + COALESCE(edt.cash_tips_declared, 0)
  FROM employee_daily_tips edt
  JOIN location_members lm
    ON lm.staff_profile_id = edt.staff_profile_id
    AND lm.location_id = edt.location_id
  WHERE edt.location_id = p_location_id
    AND edt.shift_date = p_session_date;

  -- =========================================================
  -- STEP 3: CALCULATE TOTAL COLLECTED
  -- =========================================================
  SELECT COALESCE(SUM(individual_tips_earned), 0)
  INTO v_total_collected
  FROM tip_distribution_details
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 4: CREATE TEMP TABLE FOR PER‑POOL CONTRIBUTIONS
  -- =========================================================
  CREATE TEMP TABLE temp_pool_contrib (
    pool_id UUID,
    staff_profile_id UUID,
    amount NUMERIC
  ) ON COMMIT DROP;

  -- =========================================================
  -- STEP 5: PROCESS EACH ACTIVE TIP POOL – CONTRIBUTIONS
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM tip_pool_configs
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- Insert contributions into temp table (per pool)
    IF v_pool.tip_source = 'charged_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.charged_tips * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);

    ELSIF v_pool.tip_source = 'all_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.individual_tips_earned * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);

    ELSIF v_pool.tip_source = 'cash_only' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.cash_tips * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 6: UPDATE tip_pool_contributed FROM TEMP TABLE
  -- =========================================================
  UPDATE tip_distribution_details dd
  SET tip_pool_contributed = COALESCE((
    SELECT SUM(amount) FROM temp_pool_contrib t
    WHERE t.staff_profile_id = dd.staff_profile_id
  ), 0)
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 7: REDISTRIBUTE EACH POOL (accumulate receipts)
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM tip_pool_configs
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- Get total contributed to this pool from the temp table
    SELECT COALESCE(SUM(amount), 0) INTO v_pool_total
    FROM temp_pool_contrib
    WHERE pool_id = v_pool.id;

    -- Skip if nothing to distribute
    IF v_pool_total = 0 THEN
      CONTINUE;
    END IF;

    -- ----- DISTRIBUTION BY METHOD -----
    IF v_pool.distribution_method = 'percentage' THEN
      -- Percentage split by role, equally among employees of that role
      FOR v_role_share IN
        SELECT prs.role_code, prs.share_percentage
        FROM tip_pool_role_shares prs
        WHERE prs.tip_pool_config_id = v_pool.id
          AND prs.is_eligible = true
          AND prs.share_percentage IS NOT NULL
          AND prs.share_percentage > 0
      LOOP
        SELECT COUNT(*) INTO v_role_count
        FROM tip_distribution_details
        WHERE session_id = v_session_id
          AND role_code = v_role_share.role_code;

        IF v_role_count > 0 THEN
          UPDATE tip_distribution_details
          SET tip_pool_received = tip_pool_received +
            ROUND((v_pool_total * (v_role_share.share_percentage / 100.0)) / v_role_count, 2)
          WHERE session_id = v_session_id
            AND role_code = v_role_share.role_code;
        END IF;
      END LOOP;

    ELSIF v_pool.distribution_method = 'equal_split' THEN
      -- Equal split only among employees whose roles are eligible for this pool
      SELECT COUNT(*) INTO v_role_count
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND EXISTS (
          SELECT 1 FROM tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id
            AND prs.role_code = dd.role_code
            AND prs.is_eligible = true
        );

      IF v_role_count > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total / v_role_count, 2)
        WHERE dd.session_id = v_session_id
          AND EXISTS (
            SELECT 1 FROM tip_pool_role_shares prs
            WHERE prs.tip_pool_config_id = v_pool.id
              AND prs.role_code = dd.role_code
              AND prs.is_eligible = true
          );
      END IF;

    ELSIF v_pool.distribution_method = 'hours_weighted' THEN
      -- Hours‑weighted only for eligible roles
      SELECT COALESCE(SUM(dd.hours_worked), 0) INTO v_total_hours
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND EXISTS (
          SELECT 1 FROM tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id
            AND prs.role_code = dd.role_code
            AND prs.is_eligible = true
        );

      IF v_total_hours > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total * (dd.hours_worked / v_total_hours), 2)
        WHERE dd.session_id = v_session_id
          AND EXISTS (
            SELECT 1 FROM tip_pool_role_shares prs
            WHERE prs.tip_pool_config_id = v_pool.id
              AND prs.role_code = dd.role_code
              AND prs.is_eligible = true
          );
      END IF;

    ELSIF v_pool.distribution_method = 'points' THEN
      -- Points‑based: role's points_per_hour * employee's hours
      SELECT COALESCE(SUM(prs.points_per_hour * dd.hours_worked), 0) INTO v_total_points
      FROM tip_distribution_details dd
      JOIN tip_pool_role_shares prs
        ON prs.tip_pool_config_id = v_pool.id
        AND prs.role_code = dd.role_code
        AND prs.is_eligible = true
      WHERE dd.session_id = v_session_id;

      IF v_total_points > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total * ((prs_sub.points_per_hour * dd.hours_worked) / v_total_points), 2)
        FROM tip_pool_role_shares prs_sub
        WHERE dd.session_id = v_session_id
          AND prs_sub.tip_pool_config_id = v_pool.id
          AND prs_sub.role_code = dd.role_code
          AND prs_sub.is_eligible = true;
      END IF;
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 8: TIP‑OUT RULES (all three types)
  -- =========================================================
  FOR v_rule IN
    SELECT * FROM tip_out_rules
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- How many receivers for this rule?
    SELECT COUNT(*) INTO v_receiver_count
    FROM tip_distribution_details
    WHERE session_id = v_session_id
      AND role_code = v_rule.to_role_code;

    IF v_rule.tip_out_type = 'percentage_of_sales' THEN
      -- Deduct from givers
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given +
        ROUND(dd.gross_sales * (v_rule.tip_out_value / 100.0), 2)
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      -- Total given (for crediting receivers)
      SELECT COALESCE(SUM(ROUND(dd.gross_sales * (v_rule.tip_out_value / 100.0), 2)), 0)
      INTO v_tipout_total
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      -- Credit receivers equally
      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;

    ELSIF v_rule.tip_out_type = 'percentage_of_tips' THEN
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given +
        ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      SELECT COALESCE(SUM(ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)), 0)
      INTO v_tipout_total
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;

    ELSIF v_rule.tip_out_type = 'flat_amount' THEN
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given + v_rule.tip_out_value
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      SELECT COUNT(*) INTO v_giver_count
      FROM tip_distribution_details
      WHERE session_id = v_session_id
        AND role_code = v_rule.from_role_code;

      v_tipout_total := v_giver_count * v_rule.tip_out_value;

      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 9: CALCULATE NET TIPS FOR EACH EMPLOYEE
  -- =========================================================
  UPDATE tip_distribution_details
  SET net_tips =
    individual_tips_earned
    - tip_pool_contributed
    + tip_pool_received
    - tip_out_given
    + tip_out_received
    + manual_adjustment
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 10: AGGREGATE SESSION TOTALS
  -- =========================================================
  SELECT
    COALESCE(SUM(net_tips), 0),
    COALESCE(SUM(tip_pool_contributed), 0),
    COALESCE(SUM(tip_out_given), 0)
  INTO v_total_distributed, v_total_pooled, v_total_tipouts
  FROM tip_distribution_details
  WHERE session_id = v_session_id;

  UPDATE tip_distribution_sessions
  SET
    status = 'calculated',
    total_tips_collected = v_total_collected,
    total_tips_pooled = v_total_pooled,
    total_tip_outs = v_total_tipouts,
    total_distributed = v_total_distributed,
    rounding_adjustment = v_total_collected - v_total_distributed,
    calculated_at = now(),
    calculated_by = p_calculated_by
  WHERE id = v_session_id;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'total_collected', v_total_collected,
    'total_distributed', v_total_distributed
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_online_order_by_customer(p_order_id uuid, p_session_token text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_order   RECORD;
  v_now     TIMESTAMPTZ := NOW();
BEGIN
  -- Validate session token and ownership
  SELECT s.id, s.order_id, s.expires_at
    INTO v_session
    FROM public.online_order_sessions s
   WHERE s.session_token = p_session_token
     AND s.expires_at > v_now;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired session');
  END IF;

  IF v_session.order_id <> p_order_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order does not belong to this session');
  END IF;

  -- Lock and check order
  SELECT id, status
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order can only be cancelled while pending (current: ' || v_order.status || ')'
    );
  END IF;

  UPDATE public.orders
     SET status               = 'cancelled',
         cancelled_at         = v_now,
         cancelled_by         = 'customer',
         cancellation_reason  = p_reason,
         updated_at           = v_now
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, 'pending', 'cancelled', v_now,
     COALESCE('Cancelled by customer: ' || p_reason, 'Cancelled by customer'));

  RETURN jsonb_build_object(
    'success',      true,
    'order_id',     p_order_id,
    'cancelled_at', v_now
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_inventory_count(p_merchant_id uuid, p_location_id uuid, p_count_name text, p_assigned_to_user_id text DEFAULT NULL::text, p_assigned_to_name text DEFAULT NULL::text, p_item_ids jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_count_id      UUID;
    v_items_count   INTEGER;
BEGIN
    -- Create count session
    INSERT INTO inventory_counts (
        merchant_id, location_id,
        count_name, status,
        assigned_to_user_id, assigned_to_name
    ) VALUES (
        p_merchant_id, p_location_id,
        p_count_name, 'draft',
        p_assigned_to_user_id, p_assigned_to_name
    )
    RETURNING id INTO v_count_id;

    -- Snapshot current stock for each item in scope
    -- Scope: active items belonging to this merchant (global OR location-specific)
    -- Stock snapshot: use location_inventory_stock if a row exists, else 0
    INSERT INTO inventory_count_items (count_id, inventory_item_id, expected_quantity)
    SELECT
        v_count_id,
        ii.id,
        COALESCE(lis.stock_quantity, 0)
    FROM inventory_items ii
    LEFT JOIN location_inventory_stock lis
        ON  lis.inventory_item_id = ii.id
        AND lis.location_id       = p_location_id
    WHERE ii.merchant_id  = p_merchant_id
      AND ii.is_active    = true
      AND (
            -- global items (shared across all locations)
            ii.location_id IS NULL
            OR
            -- items specific to this location
            ii.location_id = p_location_id
          )
      AND (
            -- no filter → include all in-scope items
            p_item_ids IS NULL
            OR
            -- filter to requested item UUIDs
            ii.id = ANY(
                SELECT elem::UUID
                FROM jsonb_array_elements_text(p_item_ids) AS elem
            )
          );

    GET DIAGNOSTICS v_items_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success',      true,
        'count_id',     v_count_id,
        'items_count',  v_items_count
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_support_ticket(p_merchant_id uuid, p_location_id uuid, p_subject text, p_description text, p_category text, p_submitted_by text, p_submitted_by_name text, p_submitted_by_email text DEFAULT NULL::text, p_carrier_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ticket_id     UUID;
  v_ticket_number TEXT;
  v_carrier_id    UUID;
BEGIN
  -- Auto-resolve carrier from merchant if not provided
  IF p_carrier_id IS NULL THEN
    SELECT carrier_id INTO v_carrier_id FROM public.merchants WHERE id = p_merchant_id;
  ELSE
    v_carrier_id := p_carrier_id;
  END IF;

  -- Generate ticket number
  v_ticket_number := 'DEXA-' || lpad(nextval('support_ticket_seq')::text, 5, '0');

  INSERT INTO public.support_tickets (
    ticket_number, merchant_id, location_id,
    submitted_by, submitted_by_name, submitted_by_email,
    carrier_id, subject, description, category, metadata
  ) VALUES (
    v_ticket_number, p_merchant_id, p_location_id,
    p_submitted_by, p_submitted_by_name, p_submitted_by_email,
    v_carrier_id, p_subject, p_description, p_category, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_ticket_id;

  -- Insert initial description as first message
  INSERT INTO public.support_ticket_messages (
    ticket_id, sender_id, sender_name, sender_role, message, read_by_admin
  ) VALUES (
    v_ticket_id, p_submitted_by, p_submitted_by_name, 'merchant', p_description, false
  );

  RETURN jsonb_build_object('ticket_id', v_ticket_id, 'ticket_number', v_ticket_number);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_support_ticket(p_merchant_id uuid, p_location_id uuid, p_subject text, p_description text, p_category text, p_submitted_by text, p_submitted_by_name text, p_submitted_by_email text DEFAULT NULL::text, p_carrier_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb, p_attachments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ticket_id     UUID;
  v_ticket_number TEXT;
  v_carrier_id    UUID;
  v_message_id    UUID;
  v_att           JSONB;
BEGIN
  -- Auto-resolve carrier from merchant if not provided
  IF p_carrier_id IS NULL THEN
    SELECT carrier_id INTO v_carrier_id FROM public.merchants WHERE id = p_merchant_id;
  ELSE
    v_carrier_id := p_carrier_id;
  END IF;

  -- Generate ticket number
  v_ticket_number := 'DEXA-' || lpad(nextval('support_ticket_seq')::text, 5, '0');

  INSERT INTO public.support_tickets (
    ticket_number, merchant_id, location_id,
    submitted_by, submitted_by_name, submitted_by_email,
    carrier_id, subject, description, category, metadata
  ) VALUES (
    v_ticket_number, p_merchant_id, p_location_id,
    p_submitted_by, p_submitted_by_name, p_submitted_by_email,
    v_carrier_id, p_subject, p_description, p_category, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_ticket_id;

  -- Insert initial description as first message
  INSERT INTO public.support_ticket_messages (
    ticket_id, sender_id, sender_name, sender_role, message, read_by_admin
  ) VALUES (
    v_ticket_id, p_submitted_by, p_submitted_by_name, 'merchant', p_description, false
  ) RETURNING id INTO v_message_id;

  -- Insert attachments linked to the first message
  FOR v_att IN SELECT * FROM jsonb_array_elements(COALESCE(p_attachments, '[]'::jsonb))
  LOOP
    INSERT INTO public.support_ticket_attachments (
      ticket_id, message_id, uploaded_by,
      file_name, file_path, file_size, file_type
    ) VALUES (
      v_ticket_id, v_message_id, p_submitted_by,
      v_att->>'file_name',
      v_att->>'file_path',
      (v_att->>'file_size')::integer,
      v_att->>'file_type'
    );
  END LOOP;

  RETURN jsonb_build_object('ticket_id', v_ticket_id, 'ticket_number', v_ticket_number);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decline_online_order(p_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_now   TIMESTAMPTZ := NOW();
BEGIN
  SELECT id, status
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order is not in pending status (current: ' || v_order.status || ')'
    );
  END IF;

  UPDATE public.orders
     SET status           = 'declined',
         declined_at      = v_now,
         declined_reason  = p_reason,
         cancelled_at     = v_now,
         cancelled_by     = 'merchant',
         updated_at       = v_now
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, 'pending', 'declined', v_now,
     COALESCE('Declined by merchant: ' || p_reason, 'Declined by merchant'));

  RETURN jsonb_build_object(
    'success',     true,
    'order_id',    p_order_id,
    'declined_at', v_now
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decrement_location_stock(p_inventory_item_id uuid, p_location_id uuid, p_quantity numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO location_inventory_stock (location_id, inventory_item_id, stock_quantity, updated_at)
    VALUES (p_location_id, p_inventory_item_id, 0, now())
    ON CONFLICT (location_id, inventory_item_id)
    DO UPDATE SET
        stock_quantity = GREATEST(0, location_inventory_stock.stock_quantity - p_quantity),
        updated_at     = now();

    -- Sync legacy aggregate
    UPDATE inventory_items
    SET
        current_stock = (
            SELECT COALESCE(SUM(stock_quantity), 0)
            FROM location_inventory_stock
            WHERE inventory_item_id = p_inventory_item_id
        ),
        updated_at = now()
    WHERE id = p_inventory_item_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.find_duplicate_customers(p_merchant_id uuid)
 RETURNS TABLE(customers jsonb, reason text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN

  -- =========================
  -- Duplicate Phone Numbers
  -- =========================
  RETURN QUERY
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'phone', c.phone,
        'email', c.email,
        'lifetime_spend', c.lifetime_spend,
        'visits', c.visits,
        'last_visit', c.last_visit,
        'total_orders', c.total_orders,
        'avg_spend', c.avg_spend,
        'tags', c.tags
      )
      ORDER BY c.created_at ASC
    ) AS customers,
    'same_phone'::text AS reason
  FROM customers c
  WHERE c.merchant_id = p_merchant_id
    AND c.phone IS NOT NULL
  GROUP BY c.phone
  HAVING COUNT(*) > 1;


  -- =========================
  -- Similar Names (pg_trgm)
  -- =========================
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN

    RETURN QUERY
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'id', c1.id,
          'name', c1.name,
          'phone', c1.phone,
          'email', c1.email,
          'lifetime_spend', c1.lifetime_spend,
          'visits', c1.visits,
          'last_visit', c1.last_visit,
          'total_orders', c1.total_orders,
          'avg_spend', c1.avg_spend,
          'tags', c1.tags
        )
        ORDER BY c1.created_at ASC
      ) AS customers,
      'similar_name'::text AS reason
    FROM customers c1
    INNER JOIN customers c2
      ON c1.merchant_id = c2.merchant_id
      AND c1.id < c2.id
      AND c1.name IS NOT NULL
      AND c2.name IS NOT NULL
    WHERE c1.merchant_id = p_merchant_id
      AND NOT (c1.phone = c2.phone AND c1.phone IS NOT NULL)
      AND LOWER(c1.name) <> LOWER(c2.name)
      AND LOWER(c1.name) % LOWER(c2.name)
    GROUP BY
      c1.id, c1.name, c1.phone, c1.email,
      c1.lifetime_spend, c1.visits,
      c1.last_visit, c1.total_orders,
      c1.avg_spend, c1.tags, c1.created_at,
      c2.id, c2.name
    HAVING similarity(LOWER(c1.name), LOWER(c2.name)) > 0.7;

  END IF;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_merchant_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO invoice_number_sequences (merchant_id, last_number)
  VALUES (p_merchant_id, 1)
  ON CONFLICT (merchant_id) DO UPDATE
    SET last_number = invoice_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'INV-' || LPAD(v_next::TEXT, 4, '0');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.ticket_number := 'DEXA-' || lpad(nextval('support_ticket_seq')::text, 5, '0');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_merchant_breakdown(p_merchant_ids uuid[] DEFAULT NULL::uuid[], p_location_ids uuid[] DEFAULT NULL::uuid[], p_payment_status text[] DEFAULT NULL::text[], p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(merchant_id uuid, merchant_name text, total_locations bigint, active_locations bigint, order_count bigint, transaction_count bigint, card_revenue numeric, cash_revenue numeric, total_revenue numeric, avg_ticket numeric, tip_total numeric, total_fees numeric, void_count bigint, refund_count bigint, void_refund_amount numeric, void_rate_pct numeric, unsettled_amount numeric, cash_discount_count bigint, last_transaction_at timestamp with time zone, prior_total_revenue numeric, revenue_change_pct numeric, payment_method_breakdown jsonb, daily_revenue_trend jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed_merchants uuid[];
  v_filter_merchants  uuid[];
  v_from              timestamptz;
  v_to                timestamptz;
  v_period_days       int;
  v_prior_from        timestamptz;
  v_prior_to          timestamptz;
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  v_from := COALESCE(p_date_from, date_trunc('day', now()) - interval '29 days');
  v_to := COALESCE(p_date_to, now());

  IF p_date_from IS NULL AND p_date_to IS NOT NULL THEN
    v_from := p_date_to - interval '29 days';
  END IF;

  IF p_date_from IS NOT NULL AND p_date_to IS NULL THEN
    v_to := now();
  END IF;

  IF v_to <= v_from THEN
    v_to := v_from + interval '1 second';
  END IF;

  v_period_days := GREATEST(EXTRACT(DAY FROM v_to - v_from)::int, 1);
  v_prior_from := v_from - (v_period_days || ' days')::interval;
  v_prior_to := v_from;

  SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
    INTO v_allowed_merchants
  FROM public.get_admin_merchant_ids() AS mid;

  IF COALESCE(array_length(v_allowed_merchants, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF p_merchant_ids IS NULL OR array_length(p_merchant_ids, 1) IS NULL THEN
    v_filter_merchants := v_allowed_merchants;
  ELSE
    SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
      INTO v_filter_merchants
    FROM unnest(p_merchant_ids) AS mid
    WHERE mid = ANY (v_allowed_merchants);

    IF COALESCE(array_length(v_filter_merchants, 1), 0) = 0 THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH
  base AS (
    SELECT
      op.merchant_id,
      op.location_id,
      op.order_id,
      op.id AS payment_id,
      COALESCE(op.captured_at, op.initiated_at) AS event_ts,
      op.payment_method::text AS payment_method,
      op.status::text AS payment_status,
      COALESCE(op.total_amount, 0)::numeric AS total_amount,
      COALESCE(op.tip_amount, 0)::numeric AS tip_amount,
      COALESCE(op.gateway_fee, 0)::numeric AS gateway_fee,
      COALESCE(op.refunded_amount, 0)::numeric AS refunded_amount,
      COALESCE(op.return_amount, 0)::numeric AS return_amount,
      COALESCE(op.is_voided, false) AS is_voided,
      COALESCE(op.is_returned, false) AS is_returned,
      COALESCE(op.is_settled, false) AS is_settled,
      COALESCE(op.cash_discount_applied, false) AS cash_discount_applied
    FROM public.order_payments op
    WHERE op.merchant_id = ANY (v_filter_merchants)
      AND (p_location_ids IS NULL OR op.location_id = ANY (p_location_ids))
      AND COALESCE(op.captured_at, op.initiated_at) >= v_from
      AND COALESCE(op.captured_at, op.initiated_at) <= v_to
      AND (
        (p_payment_status IS NULL AND op.status::text NOT IN ('pending', 'failed'))
        OR (p_payment_status IS NOT NULL AND op.status::text = ANY (p_payment_status))
      )
  ),

  prior_period AS (
    SELECT
      op.merchant_id,
      COALESCE(
        SUM(
          CASE
            WHEN op.status::text = 'captured' THEN COALESCE(op.total_amount, 0)
            ELSE 0
          END
        ),
        0
      )::numeric AS prior_revenue
    FROM public.order_payments op
    WHERE op.merchant_id = ANY (v_filter_merchants)
      AND (p_location_ids IS NULL OR op.location_id = ANY (p_location_ids))
      AND COALESCE(op.captured_at, op.initiated_at) >= v_prior_from
      AND COALESCE(op.captured_at, op.initiated_at) < v_prior_to
      AND op.status::text NOT IN ('pending', 'failed')
    GROUP BY op.merchant_id
  ),

  all_locations AS (
    SELECT
      l.merchant_id,
      COUNT(*)::bigint AS total_locations
    FROM public.locations l
    WHERE l.merchant_id = ANY (v_filter_merchants)
      AND l.is_active = true
    GROUP BY l.merchant_id
  ),

  merchant_rollup AS (
    SELECT
      b.merchant_id,
      COUNT(DISTINCT b.location_id)::bigint AS active_locations,
      COUNT(DISTINCT b.order_id)::bigint AS order_count,
      COUNT(*)::bigint AS transaction_count,

      ROUND(
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_status = 'captured' AND b.payment_method = 'card'
              THEN b.total_amount
              ELSE 0
            END
          ),
          0
        ),
        2
      ) AS card_revenue,

      ROUND(
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_status = 'captured' AND b.payment_method = 'cash'
              THEN b.total_amount
              ELSE 0
            END
          ),
          0
        ),
        2
      ) AS cash_revenue,

      ROUND(
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_status = 'captured' THEN b.total_amount
              ELSE 0
            END
          ),
          0
        ),
        2
      ) AS total_revenue,

      ROUND(
        COALESCE(
          AVG(
            CASE
              WHEN b.payment_status = 'captured' THEN b.total_amount
              ELSE NULL
            END
          ),
          0
        ),
        2
      ) AS avg_ticket,

      ROUND(
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_status = 'captured' THEN b.tip_amount
              ELSE 0
            END
          ),
          0
        ),
        2
      ) AS tip_total,

      ROUND(COALESCE(SUM(b.gateway_fee), 0), 2) AS total_fees,

      COUNT(*) FILTER (WHERE b.is_voided)::bigint AS void_count,
      COUNT(*) FILTER (WHERE b.payment_status IN ('refunded', 'partially_refunded'))::bigint AS refund_count,

      ROUND(
        COALESCE(
          SUM(CASE WHEN b.is_voided THEN b.total_amount ELSE 0 END) +
          SUM(b.refunded_amount) +
          SUM(b.return_amount),
          0
        ),
        2
      ) AS void_refund_amount,

      ROUND(
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_status = 'captured' AND NOT b.is_settled
              THEN b.total_amount
              ELSE 0
            END
          ),
          0
        ),
        2
      ) AS unsettled_amount,

      COUNT(*) FILTER (WHERE b.cash_discount_applied)::bigint AS cash_discount_count,
      MAX(b.event_ts) AS last_transaction_at
    FROM base b
    GROUP BY b.merchant_id
  ),

  method_breakdown AS (
    SELECT
      b.merchant_id,
      jsonb_agg(
        jsonb_build_object(
          'method', b.payment_method,
          'count', b.cnt,
          'amount', b.amt
        ) ORDER BY b.amt DESC
      ) AS payment_method_breakdown
    FROM (
      SELECT
        base_tx.merchant_id,
        base_tx.payment_method,
        COUNT(*)::bigint AS cnt,
        ROUND(
          COALESCE(
            SUM(CASE WHEN base_tx.payment_status = 'captured' THEN base_tx.total_amount ELSE 0 END),
            0
          ),
          2
        ) AS amt
      FROM base AS base_tx
      GROUP BY base_tx.merchant_id, base_tx.payment_method
    ) b
    GROUP BY b.merchant_id
  ),

  date_series AS (
    SELECT d::date AS day
    FROM generate_series(
      date_trunc('day', v_from)::date,
      date_trunc('day', v_to)::date,
      '1 day'::interval
    ) AS d
  ),

  merchant_ids_cte AS (
    SELECT DISTINCT base_ids.merchant_id
    FROM base AS base_ids
  ),

  daily_filled AS (
    SELECT
      mi.merchant_id,
      ds.day,
      COALESCE(
        SUM(CASE WHEN b.payment_status = 'captured' THEN b.total_amount ELSE 0 END),
        0
      )::numeric AS daily_revenue
    FROM merchant_ids_cte mi
    CROSS JOIN date_series ds
    LEFT JOIN base b
      ON b.merchant_id = mi.merchant_id
      AND date_trunc('day', b.event_ts)::date = ds.day
    GROUP BY mi.merchant_id, ds.day
  ),

  trend AS (
    SELECT
      df.merchant_id,
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(df.day, 'YYYY-MM-DD'),
          'revenue', ROUND(df.daily_revenue, 2)
        ) ORDER BY df.day
      ) AS daily_revenue_trend
    FROM daily_filled df
    GROUP BY df.merchant_id
  )

  SELECT
    mr.merchant_id,
    m.name::text AS merchant_name,
    COALESCE(al.total_locations, 0)::bigint AS total_locations,
    mr.active_locations,
    mr.order_count,
    mr.transaction_count,
    mr.card_revenue,
    mr.cash_revenue,
    mr.total_revenue,
    mr.avg_ticket,
    mr.tip_total,
    mr.total_fees,
    mr.void_count,
    mr.refund_count,
    mr.void_refund_amount,
    CASE
      WHEN mr.transaction_count > 0
      THEN ROUND((mr.void_count::numeric / mr.transaction_count) * 100, 2)
      ELSE 0
    END::numeric AS void_rate_pct,
    mr.unsettled_amount,
    mr.cash_discount_count,
    mr.last_transaction_at,
    COALESCE(pp.prior_revenue, 0)::numeric AS prior_total_revenue,
    CASE
      WHEN COALESCE(pp.prior_revenue, 0) > 0
      THEN ROUND(((mr.total_revenue - pp.prior_revenue) / pp.prior_revenue) * 100, 1)
      WHEN mr.total_revenue > 0 THEN 100.0
      ELSE 0
    END::numeric AS revenue_change_pct,
    COALESCE(mb.payment_method_breakdown, '[]'::jsonb) AS payment_method_breakdown,
    COALESCE(t.daily_revenue_trend, '[]'::jsonb) AS daily_revenue_trend
  FROM merchant_rollup mr
  JOIN public.merchants m ON m.id = mr.merchant_id
  LEFT JOIN all_locations al ON al.merchant_id = mr.merchant_id
  LEFT JOIN prior_period pp ON pp.merchant_id = mr.merchant_id
  LEFT JOIN method_breakdown mb ON mb.merchant_id = mr.merchant_id
  LEFT JOIN trend t ON t.merchant_id = mr.merchant_id
  ORDER BY mr.total_revenue DESC, mr.transaction_count DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_merchant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH admin_ctx AS (
    SELECT
      public.current_user_id() AS user_id,
      public.is_dexapos_admin() AS is_admin,
      EXISTS (
        SELECT 1
        FROM public.get_my_hq_role() r
        WHERE r.role_code = 'hq.super_admin'
      ) AS is_super_admin
  )
  SELECT m.id
  FROM public.merchants m
  CROSS JOIN admin_ctx c
  WHERE c.is_admin = true
    AND c.is_super_admin = true

  UNION

  SELECT ama.merchant_id
  FROM public.admin_merchant_access ama
  CROSS JOIN admin_ctx c
  WHERE c.is_admin = true
    AND c.is_super_admin = false
    AND ama.admin_user_id = c.user_id
    AND ama.is_active = true;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_settlement_batch_payments(p_batch_id text, p_merchant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(payment_id uuid, order_id uuid, order_number text, merchant_id uuid, merchant_name text, location_id uuid, location_name text, payment_method text, payment_status text, total_amount numeric, tip_amount numeric, refund_amount numeric, is_voided boolean, is_returned boolean, initiated_at timestamp with time zone, captured_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed_merchants uuid[];
  v_filter_merchants uuid[];
  v_batch_id text := NULLIF(trim(p_batch_id), '');
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  IF v_batch_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
  INTO v_allowed_merchants
  FROM public.get_admin_merchant_ids() AS mid;

  IF COALESCE(array_length(v_allowed_merchants, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF p_merchant_id IS NOT NULL THEN
    IF NOT (p_merchant_id = ANY (v_allowed_merchants)) THEN
      RETURN;
    END IF;
    v_filter_merchants := ARRAY[p_merchant_id];
  ELSE
    v_filter_merchants := v_allowed_merchants;
  END IF;

  RETURN QUERY
  SELECT
    op.id AS payment_id,
    op.order_id,
    COALESCE(o.order_number, o.display_number)::text AS order_number,
    o.merchant_id,
    m.name::text AS merchant_name,
    o.location_id,
    l.name::text AS location_name,
    op.payment_method::text AS payment_method,
    op.status::text AS payment_status,
    COALESCE(op.total_amount, 0)::numeric AS total_amount,
    COALESCE(op.tip_amount, 0)::numeric AS tip_amount,
    COALESCE(op.return_amount, 0)::numeric AS refund_amount,
    COALESCE(op.is_voided, false) AS is_voided,
    COALESCE(op.is_returned, false) AS is_returned,
    op.initiated_at,
    op.captured_at
  FROM public.order_payments op
  JOIN public.orders o
    ON o.id = op.order_id
  JOIN public.merchants m
    ON m.id = o.merchant_id
  LEFT JOIN public.locations l
    ON l.id = o.location_id
  WHERE o.merchant_id = ANY (v_filter_merchants)
    AND COALESCE(op.batch_number, op.dejavoo_batch_number) = v_batch_id
  ORDER BY COALESCE(op.captured_at, op.initiated_at, o.created_at) DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_settlement_batches(p_merchant_ids uuid[] DEFAULT NULL::uuid[], p_status text[] DEFAULT NULL::text[], p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, batch_id text, merchant_id uuid, merchant_name text, location_id uuid, location_name text, business_date date, opened_at timestamp with time zone, closed_at timestamp with time zone, settlement_date date, funded_date date, transaction_count integer, sales_count integer, refund_count integer, void_count integer, gross_amount numeric, tip_amount numeric, refund_amount numeric, net_deposit numeric, status text, linked_payment_count bigint, linked_payment_amount numeric, discrepancy_amount numeric, has_discrepancy boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed_merchants uuid[];
  v_filter_merchants uuid[];
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
  INTO v_allowed_merchants
  FROM public.get_admin_merchant_ids() AS mid;

  IF COALESCE(array_length(v_allowed_merchants, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF p_merchant_ids IS NULL OR array_length(p_merchant_ids, 1) IS NULL THEN
    v_filter_merchants := v_allowed_merchants;
  ELSE
    SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
    INTO v_filter_merchants
    FROM unnest(p_merchant_ids) AS mid
    WHERE mid = ANY (v_allowed_merchants);

    IF COALESCE(array_length(v_filter_merchants, 1), 0) = 0 THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH scoped_batches AS (
    SELECT
      sb.id,
      sb.batch_id,
      sb.merchant_id,
      m.name AS merchant_name,
      sb.location_id,
      l.name AS location_name,
      sb.business_date,
      sb.opened_at,
      sb.closed_at,
      sb.settlement_date,
      sb.funded_date,
      COALESCE(sb.transaction_count, 0) AS transaction_count,
      COALESCE(sb.sales_count, 0) AS sales_count,
      COALESCE(sb.refund_count, 0) AS refund_count,
      COALESCE(sb.void_count, 0) AS void_count,
      COALESCE(sb.gross_amount, 0) AS gross_amount_cents,
      COALESCE(sb.tip_amount, 0) AS tip_amount_cents,
      COALESCE(sb.refund_amount, 0) AS refund_amount_cents,
      COALESCE(sb.net_deposit, 0) AS net_deposit_cents,
      sb.status::text AS status
    FROM public.settlement_batches sb
    JOIN public.merchants m
      ON m.id = sb.merchant_id
    LEFT JOIN public.locations l
      ON l.id = sb.location_id
    WHERE sb.merchant_id = ANY (v_filter_merchants)
      AND (p_status IS NULL OR sb.status::text = ANY (p_status))
      AND (p_date_from IS NULL OR sb.business_date >= p_date_from)
      AND (p_date_to IS NULL OR sb.business_date <= p_date_to)
    ORDER BY sb.business_date DESC, sb.closed_at DESC NULLS LAST, sb.opened_at DESC
    LIMIT v_limit
  )
  SELECT
    b.id,
    b.batch_id::text,
    b.merchant_id,
    b.merchant_name::text,
    b.location_id,
    b.location_name::text,
    b.business_date,
    b.opened_at,
    b.closed_at,
    b.settlement_date,
    b.funded_date,
    b.transaction_count,
    b.sales_count,
    b.refund_count,
    b.void_count,
    (b.gross_amount_cents::numeric / 100.0)::numeric AS gross_amount,
    (b.tip_amount_cents::numeric / 100.0)::numeric AS tip_amount,
    (b.refund_amount_cents::numeric / 100.0)::numeric AS refund_amount,
    (b.net_deposit_cents::numeric / 100.0)::numeric AS net_deposit,
    b.status,
    COALESCE(lp.linked_payment_count, 0)::bigint AS linked_payment_count,
    COALESCE(lp.linked_payment_amount, 0)::numeric AS linked_payment_amount,
    ROUND(
      (b.gross_amount_cents::numeric / 100.0) - COALESCE(lp.linked_payment_amount, 0),
      2
    )::numeric AS discrepancy_amount,
    ABS(
      ROUND(
        (b.gross_amount_cents::numeric / 100.0) - COALESCE(lp.linked_payment_amount, 0),
        2
      )
    ) >= 0.01 AS has_discrepancy
  FROM scoped_batches b
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS linked_payment_count,
      COALESCE(
        SUM(
          CASE
            WHEN COALESCE(op.is_voided, false) THEN 0
            WHEN op.status::text = ANY (ARRAY['failed', 'pending']) THEN 0
            ELSE COALESCE(op.total_amount, 0)::numeric
          END
        ),
        0
      )::numeric AS linked_payment_amount
    FROM public.order_payments op
    LEFT JOIN public.orders o
      ON o.id = op.order_id
    WHERE COALESCE(op.merchant_id, o.merchant_id) = b.merchant_id
      AND COALESCE(op.batch_number, op.dejavoo_batch_number) = b.batch_id
  ) lp ON true
  ORDER BY b.business_date DESC, b.closed_at DESC NULLS LAST, b.opened_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_transaction_detail(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_order_enriched jsonb;
  v_payments jsonb;
  v_order_items jsonb;
  v_order_discounts jsonb;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_dexapos_admin() THEN
    RETURN NULL;
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_order.merchant_id NOT IN (SELECT public.get_admin_merchant_ids()) THEN
    RETURN NULL;
  END IF;

  SELECT
    to_jsonb(v_order)
    || jsonb_build_object(
      'merchant_name', m.name,
      'location_name', l.name,
      'staff_name', NULLIF(trim(concat_ws(' ', sp.first_name, sp.last_name)), '')
    )
  INTO v_order_enriched
  FROM public.merchants m
  LEFT JOIN public.locations l
    ON l.id = v_order.location_id
  LEFT JOIN public.staff_profiles sp
    ON sp.id = v_order.created_by_staff_id
  WHERE m.id = v_order.merchant_id;

  SELECT COALESCE(
    jsonb_agg(
      (
        to_jsonb(op)
        || jsonb_build_object(
          'staff_name', NULLIF(trim(concat_ws(' ', psp.first_name, psp.last_name)), ''),
          'terminal_info',
            CASE
              WHEN pt.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'terminal_id', pt.id,
                'terminal_name', pt.terminal_name,
                'terminal_model', pt.terminal_model,
                'serial_number', pt.serial_number,
                'tpn', pt.tpn,
                'connection_type', pt.connection_type,
                'api_environment', pt.api_environment
              )
            END,
          'settlement',
            CASE
              WHEN sb.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'settlement_batch_id', sb.id,
                'batch_id', sb.batch_id,
                'status', sb.status,
                'opened_at', sb.opened_at,
                'closed_at', sb.closed_at,
                'settlement_date', sb.settlement_date,
                'funded_date', sb.funded_date,
                'is_settled', COALESCE(op.is_settled, false),
                'settled_at', op.settled_at
              )
            END,
          'items_paid', COALESCE(
            (
              SELECT jsonb_agg(
                to_jsonb(opi)
                || jsonb_build_object(
                  'item', to_jsonb(oi)
                )
                ORDER BY opi.created_at
              )
              FROM public.order_payment_items opi
              JOIN public.order_items oi
                ON oi.id = opi.order_item_id
              WHERE opi.order_payment_id = op.id
            ),
            '[]'::jsonb
          ),
          'payment_events', COALESCE(
            (
              SELECT jsonb_agg(to_jsonb(pe) ORDER BY pe.event_timestamp)
              FROM public.payment_events pe
              WHERE pe.payment_id = op.id
            ),
            '[]'::jsonb
          )
        )
      )
      ORDER BY COALESCE(op.initiated_at, op.captured_at)
    ),
    '[]'::jsonb
  )
  INTO v_payments
  FROM public.order_payments op
  LEFT JOIN public.staff_profiles psp
    ON psp.id = COALESCE(op.processed_by_staff_id, op.tip_adjusted_by, op.returned_by)
  LEFT JOIN LATERAL (
    SELECT pt_inner.*
    FROM public.payment_terminals pt_inner
    WHERE pt_inner.location_id = COALESCE(op.location_id, v_order.location_id)
      AND (
        op.terminal_id IS NULL
        OR pt_inner.serial_number = op.terminal_id
        OR pt_inner.tpn = op.terminal_id
        OR pt_inner.id::text = op.terminal_id
      )
    ORDER BY
      CASE
        WHEN op.terminal_id IS NOT NULL AND pt_inner.serial_number = op.terminal_id THEN 0
        WHEN op.terminal_id IS NOT NULL AND pt_inner.tpn = op.terminal_id THEN 1
        WHEN op.terminal_id IS NOT NULL AND pt_inner.id::text = op.terminal_id THEN 2
        ELSE 3
      END,
      pt_inner.updated_at DESC
    LIMIT 1
  ) pt ON true
  LEFT JOIN LATERAL (
    SELECT sb_inner.*
    FROM public.settlement_batches sb_inner
    WHERE sb_inner.merchant_id = COALESCE(op.merchant_id, v_order.merchant_id)
      AND sb_inner.location_id = COALESCE(op.location_id, v_order.location_id)
      AND COALESCE(op.batch_number, op.dejavoo_batch_number) IS NOT NULL
      AND sb_inner.batch_id = COALESCE(op.batch_number, op.dejavoo_batch_number)
    ORDER BY sb_inner.closed_at DESC NULLS LAST, sb_inner.created_at DESC
    LIMIT 1
  ) sb ON true
  WHERE op.order_id = p_order_id;

  SELECT COALESCE(
    jsonb_agg(
      (
        to_jsonb(oi)
        || jsonb_build_object(
          'modifiers', COALESCE(
            (
              SELECT jsonb_agg(to_jsonb(oim) ORDER BY oim.created_at)
              FROM public.order_item_modifiers oim
              WHERE oim.order_item_id = oi.id
            ),
            '[]'::jsonb
          )
        )
      )
      ORDER BY oi.created_at, oi.display_order
    ),
    '[]'::jsonb
  )
  INTO v_order_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(od) ORDER BY od.applied_at, od.created_at),
    '[]'::jsonb
  )
  INTO v_order_discounts
  FROM public.order_discounts od
  WHERE od.order_id = p_order_id;

  RETURN jsonb_build_object(
    'order', v_order_enriched,
    'payments', v_payments,
    'order_items', v_order_items,
    'order_discounts', v_order_discounts
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_transaction_summary(p_merchant_ids uuid[] DEFAULT NULL::uuid[], p_location_ids uuid[] DEFAULT NULL::uuid[], p_status text[] DEFAULT NULL::text[], p_payment_status text[] DEFAULT NULL::text[], p_payment_method text[] DEFAULT NULL::text[], p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_min_amount numeric DEFAULT NULL::numeric, p_max_amount numeric DEFAULT NULL::numeric, p_search text DEFAULT NULL::text, p_card_type text DEFAULT NULL::text, p_staff_id uuid DEFAULT NULL::uuid, p_sort_by text DEFAULT 'initiated_at'::text, p_sort_dir text DEFAULT 'desc'::text)
 RETURNS TABLE(current_period_from timestamp with time zone, current_period_to timestamp with time zone, previous_period_from timestamp with time zone, previous_period_to timestamp with time zone, current_total_transactions bigint, previous_total_transactions bigint, current_card_revenue numeric, previous_card_revenue numeric, current_card_count bigint, previous_card_count bigint, current_cash_revenue numeric, previous_cash_revenue numeric, current_cash_count bigint, previous_cash_count bigint, current_total_revenue numeric, previous_total_revenue numeric, current_avg_tip numeric, previous_avg_tip numeric, current_avg_tip_pct numeric, previous_avg_tip_pct numeric, current_void_return_count bigint, previous_void_return_count bigint, current_void_return_amount numeric, previous_void_return_amount numeric, current_void_rate_pct numeric, previous_void_rate_pct numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_allowed_merchants uuid[];
  v_filter_merchants uuid[];
  v_card_tokens text[];
  v_current_from timestamptz;
  v_current_to timestamptz;
  v_previous_from timestamptz;
  v_previous_to timestamptz;
  v_window interval;
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  -- Keep signature parity with list RPC (sorting is ignored for aggregates).
  PERFORM p_sort_by, p_sort_dir;

  v_current_from := COALESCE(p_date_from, date_trunc('day', now()) - interval '29 days');
  v_current_to := COALESCE(p_date_to, now());

  IF p_date_from IS NULL AND p_date_to IS NOT NULL THEN
    v_current_from := p_date_to - interval '29 days';
  END IF;

  IF p_date_from IS NOT NULL AND p_date_to IS NULL THEN
    v_current_to := now();
  END IF;

  IF v_current_to <= v_current_from THEN
    v_current_to := v_current_from + interval '1 second';
  END IF;

  v_window := v_current_to - v_current_from;
  IF v_window < interval '1 second' THEN
    v_window := interval '1 day';
  END IF;

  v_previous_to := v_current_from;
  v_previous_from := v_current_from - v_window;

  SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
  INTO v_allowed_merchants
  FROM public.get_admin_merchant_ids() AS mid;

  IF p_merchant_ids IS NULL OR array_length(p_merchant_ids, 1) IS NULL THEN
    v_filter_merchants := v_allowed_merchants;
  ELSE
    SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
    INTO v_filter_merchants
    FROM unnest(p_merchant_ids) AS mid
    WHERE mid = ANY (v_allowed_merchants);
  END IF;

  IF NULLIF(trim(COALESCE(p_card_type, '')), '') IS NOT NULL THEN
    v_card_tokens := ARRAY(
      SELECT trim(token)
      FROM unnest(string_to_array(lower(p_card_type), ',')) AS token
      WHERE trim(token) <> ''
    );
  ELSE
    v_card_tokens := ARRAY[]::text[];
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      op.id AS payment_id,
      COALESCE(op.captured_at, op.initiated_at, o.created_at) AS event_ts,
      op.payment_method::text AS payment_method,
      op.status::text AS payment_status,
      op.total_amount::numeric AS total_amount,
      op.tip_amount::numeric AS tip_amount,
      op.amount::numeric AS amount,
      COALESCE(op.is_voided, false) AS is_voided,
      COALESCE(op.is_returned, false) AS is_returned,
      op.return_amount::numeric AS return_amount
    FROM public.order_payments op
    JOIN public.orders o
      ON o.id = op.order_id
    WHERE o.merchant_id = ANY (v_filter_merchants)
      AND (p_location_ids IS NULL OR o.location_id = ANY (p_location_ids))
      AND (p_status IS NULL OR o.status::text = ANY (p_status))
      AND (
        (p_payment_status IS NULL AND op.status::text <> ALL (ARRAY['pending', 'failed']))
        OR (p_payment_status IS NOT NULL AND op.status::text = ANY (p_payment_status))
      )
      AND (p_payment_method IS NULL OR op.payment_method::text = ANY (p_payment_method))
      AND (p_min_amount IS NULL OR op.total_amount >= p_min_amount)
      AND (p_max_amount IS NULL OR op.total_amount <= p_max_amount)
      AND (
        p_staff_id IS NULL
        OR op.processed_by_staff_id = p_staff_id
        OR o.created_by_staff_id = p_staff_id
      )
      AND (
        COALESCE(array_length(v_card_tokens, 1), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(v_card_tokens) AS token
          WHERE lower(COALESCE(op.card_type, '')) LIKE '%' || token || '%'
        )
      )
      AND (
        v_search IS NULL
        OR COALESCE(o.order_number, '') ILIKE '%' || v_search || '%'
        OR COALESCE(o.display_number, '') ILIKE '%' || v_search || '%'
        OR COALESCE(o.customer_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.card_last_four, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.authorization_code, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.reference_number, '') ILIKE '%' || v_search || '%'
      )
  ),
  current_scope AS (
    SELECT *
    FROM base
    WHERE event_ts >= v_current_from
      AND event_ts <= v_current_to
  ),
  previous_scope AS (
    SELECT *
    FROM base
    WHERE event_ts >= v_previous_from
      AND event_ts < v_previous_to
  ),
  current_metrics AS (
    SELECT
      COUNT(*)::bigint AS total_transactions,
      COALESCE(
        SUM(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
            THEN total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS card_revenue,
      COUNT(*) FILTER (
        WHERE payment_status = 'captured'
          AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      )::bigint AS card_count,
      COALESCE(
        SUM(
          CASE
            WHEN payment_status = 'captured' AND payment_method = 'cash'
            THEN total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS cash_revenue,
      COUNT(*) FILTER (
        WHERE payment_status = 'captured' AND payment_method = 'cash'
      )::bigint AS cash_count,
      COALESCE(
        AVG(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
            THEN tip_amount
            ELSE NULL
          END
        ),
        0
      )::numeric AS avg_tip,
      COALESCE(
        AVG(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
              AND amount > 0
            THEN (tip_amount / amount) * 100
            ELSE NULL
          END
        ),
        0
      )::numeric AS avg_tip_pct,
      COUNT(*) FILTER (
        WHERE is_voided OR is_returned
      )::bigint AS void_return_count,
      COALESCE(
        SUM(
          CASE
            WHEN is_returned THEN COALESCE(return_amount, 0)
            WHEN is_voided THEN COALESCE(total_amount, 0)
            ELSE 0
          END
        ),
        0
      )::numeric AS void_return_amount,
      CASE
        WHEN COUNT(*) > 0 THEN
          (
            COUNT(*) FILTER (WHERE is_voided OR is_returned)::numeric
            / COUNT(*)::numeric
          ) * 100
        ELSE 0
      END::numeric AS void_rate_pct
    FROM current_scope
  ),
  previous_metrics AS (
    SELECT
      COUNT(*)::bigint AS total_transactions,
      COALESCE(
        SUM(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
            THEN total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS card_revenue,
      COUNT(*) FILTER (
        WHERE payment_status = 'captured'
          AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      )::bigint AS card_count,
      COALESCE(
        SUM(
          CASE
            WHEN payment_status = 'captured' AND payment_method = 'cash'
            THEN total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS cash_revenue,
      COUNT(*) FILTER (
        WHERE payment_status = 'captured' AND payment_method = 'cash'
      )::bigint AS cash_count,
      COALESCE(
        AVG(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
            THEN tip_amount
            ELSE NULL
          END
        ),
        0
      )::numeric AS avg_tip,
      COALESCE(
        AVG(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
              AND amount > 0
            THEN (tip_amount / amount) * 100
            ELSE NULL
          END
        ),
        0
      )::numeric AS avg_tip_pct,
      COUNT(*) FILTER (
        WHERE is_voided OR is_returned
      )::bigint AS void_return_count,
      COALESCE(
        SUM(
          CASE
            WHEN is_returned THEN COALESCE(return_amount, 0)
            WHEN is_voided THEN COALESCE(total_amount, 0)
            ELSE 0
          END
        ),
        0
      )::numeric AS void_return_amount,
      CASE
        WHEN COUNT(*) > 0 THEN
          (
            COUNT(*) FILTER (WHERE is_voided OR is_returned)::numeric
            / COUNT(*)::numeric
          ) * 100
        ELSE 0
      END::numeric AS void_rate_pct
    FROM previous_scope
  )
  SELECT
    v_current_from,
    v_current_to,
    v_previous_from,
    v_previous_to,
    cm.total_transactions,
    pm.total_transactions,
    cm.card_revenue,
    pm.card_revenue,
    cm.card_count,
    pm.card_count,
    cm.cash_revenue,
    pm.cash_revenue,
    cm.cash_count,
    pm.cash_count,
    (cm.card_revenue + cm.cash_revenue)::numeric AS current_total_revenue,
    (pm.card_revenue + pm.cash_revenue)::numeric AS previous_total_revenue,
    cm.avg_tip,
    pm.avg_tip,
    cm.avg_tip_pct,
    pm.avg_tip_pct,
    cm.void_return_count,
    pm.void_return_count,
    cm.void_return_amount,
    pm.void_return_amount,
    cm.void_rate_pct,
    pm.void_rate_pct
  FROM current_metrics cm
  CROSS JOIN previous_metrics pm;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_transactions(p_merchant_ids uuid[] DEFAULT NULL::uuid[], p_location_ids uuid[] DEFAULT NULL::uuid[], p_status text[] DEFAULT NULL::text[], p_payment_status text[] DEFAULT NULL::text[], p_payment_method text[] DEFAULT NULL::text[], p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_min_amount numeric DEFAULT NULL::numeric, p_max_amount numeric DEFAULT NULL::numeric, p_search text DEFAULT NULL::text, p_card_type text DEFAULT NULL::text, p_staff_id uuid DEFAULT NULL::uuid, p_sort_by text DEFAULT 'initiated_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS TABLE(id uuid, order_id uuid, order_number text, display_number text, merchant_id uuid, merchant_name text, location_id uuid, location_name text, customer_name text, payment_method text, card_type text, card_last_four text, authorization_code text, reference_number text, amount numeric, tip_amount numeric, total_amount numeric, subtotal_amount numeric, tax_amount numeric, discount_amount numeric, status text, order_status text, payment_status text, staff_id uuid, staff_name text, entry_mode text, created_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 200);
  v_offset integer := (v_page - 1) * v_page_size;
  v_sort_by text;
  v_sort_dir text;
  v_search text := NULLIF(trim(p_search), '');
  v_allowed_merchants uuid[];
  v_filter_merchants uuid[];
  v_card_tokens text[];
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
  INTO v_allowed_merchants
  FROM public.get_admin_merchant_ids() AS mid;

  IF COALESCE(array_length(v_allowed_merchants, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF p_merchant_ids IS NULL OR array_length(p_merchant_ids, 1) IS NULL THEN
    v_filter_merchants := v_allowed_merchants;
  ELSE
    SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
    INTO v_filter_merchants
    FROM unnest(p_merchant_ids) AS mid
    WHERE mid = ANY (v_allowed_merchants);

    IF COALESCE(array_length(v_filter_merchants, 1), 0) = 0 THEN
      RETURN;
    END IF;
  END IF;

  v_sort_by := lower(COALESCE(p_sort_by, 'initiated_at'));
  IF v_sort_by NOT IN (
    'initiated_at',
    'created_at',
    'order_number',
    'total_amount',
    'amount',
    'tip_amount',
    'merchant_name',
    'location_name',
    'customer_name',
    'status',
    'payment_method'
  ) THEN
    v_sort_by := 'initiated_at';
  END IF;

  v_sort_dir := lower(COALESCE(p_sort_dir, 'desc'));
  IF v_sort_dir NOT IN ('asc', 'desc') THEN
    v_sort_dir := 'desc';
  END IF;

  IF NULLIF(trim(COALESCE(p_card_type, '')), '') IS NOT NULL THEN
    v_card_tokens := ARRAY(
      SELECT trim(token)
      FROM unnest(string_to_array(lower(p_card_type), ',')) AS token
      WHERE trim(token) <> ''
    );
  ELSE
    v_card_tokens := ARRAY[]::text[];
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      op.id,
      op.order_id,
      o.order_number,
      o.display_number,
      o.merchant_id AS merchant_id,
      m.name AS merchant_name,
      o.location_id AS location_id,
      l.name AS location_name,
      o.customer_name,
      op.payment_method::text AS payment_method,
      op.card_type,
      op.card_last_four,
      op.authorization_code,
      op.reference_number,
      op.amount::numeric AS amount,
      op.tip_amount::numeric AS tip_amount,
      op.total_amount::numeric AS total_amount,
      o.subtotal::numeric AS subtotal_amount,
      o.tax_amount::numeric AS tax_amount,
      o.discount_amount::numeric AS discount_amount,
      op.status::text AS status,
      o.status::text AS order_status,
      o.payment_status::text AS payment_status,
      COALESCE(op.processed_by_staff_id, o.created_by_staff_id) AS staff_id,
      trim(concat_ws(' ', sp.first_name, sp.last_name)) AS staff_name,
      COALESCE(
        NULLIF(op.processor_response->>'entry_type', ''),
        NULLIF(op.processor_response->>'entryType', ''),
        NULLIF(op.processor_response->>'entry_mode', ''),
        NULLIF(op.processor_response->>'entryMode', '')
      ) AS entry_mode,
      COALESCE(op.captured_at, op.initiated_at, o.created_at) AS created_at
    FROM public.order_payments op
    JOIN public.orders o
      ON o.id = op.order_id
    JOIN public.merchants m
      ON m.id = o.merchant_id
    LEFT JOIN public.locations l
      ON l.id = o.location_id
    LEFT JOIN public.staff_profiles sp
      ON sp.id = COALESCE(op.processed_by_staff_id, o.created_by_staff_id)
    WHERE o.merchant_id = ANY (v_filter_merchants)
      AND (p_location_ids IS NULL OR o.location_id = ANY (p_location_ids))
      AND (p_status IS NULL OR o.status::text = ANY (p_status))
      AND (
        (p_payment_status IS NULL AND op.status::text <> ALL (ARRAY['pending', 'failed']))
        OR (p_payment_status IS NOT NULL AND op.status::text = ANY (p_payment_status))
      )
      AND (p_payment_method IS NULL OR op.payment_method::text = ANY (p_payment_method))
      AND (p_date_from IS NULL OR COALESCE(op.captured_at, op.initiated_at, o.created_at) >= p_date_from)
      AND (p_date_to IS NULL OR COALESCE(op.captured_at, op.initiated_at, o.created_at) <= p_date_to)
      AND (p_min_amount IS NULL OR op.total_amount >= p_min_amount)
      AND (p_max_amount IS NULL OR op.total_amount <= p_max_amount)
      AND (
        p_staff_id IS NULL
        OR op.processed_by_staff_id = p_staff_id
        OR o.created_by_staff_id = p_staff_id
      )
      AND (
        COALESCE(array_length(v_card_tokens, 1), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(v_card_tokens) AS token
          WHERE lower(COALESCE(op.card_type, '')) LIKE '%' || token || '%'
        )
      )
      AND (
        v_search IS NULL
        OR COALESCE(o.order_number, '') ILIKE '%' || v_search || '%'
        OR COALESCE(o.display_number, '') ILIKE '%' || v_search || '%'
        OR COALESCE(o.customer_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.card_last_four, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.authorization_code, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.reference_number, '') ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT f.*, COUNT(*) OVER() AS total_count
    FROM filtered f
  )
  SELECT
    c.id,
    c.order_id,
    c.order_number,
    c.display_number,
    c.merchant_id,
    c.merchant_name,
    c.location_id,
    c.location_name,
    c.customer_name,
    c.payment_method,
    c.card_type,
    c.card_last_four,
    c.authorization_code,
    c.reference_number,
    c.amount,
    c.tip_amount,
    c.total_amount,
    c.subtotal_amount,
    c.tax_amount,
    c.discount_amount,
    c.status,
    c.order_status,
    c.payment_status,
    c.staff_id,
    NULLIF(c.staff_name, ''),
    c.entry_mode,
    c.created_at,
    c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN v_sort_by = 'order_number'   AND v_sort_dir = 'asc'  THEN c.order_number END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'order_number'   AND v_sort_dir = 'desc' THEN c.order_number END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'total_amount'   AND v_sort_dir = 'asc'  THEN c.total_amount END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'total_amount'   AND v_sort_dir = 'desc' THEN c.total_amount END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'amount'         AND v_sort_dir = 'asc'  THEN c.amount END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'amount'         AND v_sort_dir = 'desc' THEN c.amount END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'tip_amount'     AND v_sort_dir = 'asc'  THEN c.tip_amount END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'tip_amount'     AND v_sort_dir = 'desc' THEN c.tip_amount END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'merchant_name'  AND v_sort_dir = 'asc'  THEN c.merchant_name END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'merchant_name'  AND v_sort_dir = 'desc' THEN c.merchant_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'location_name'  AND v_sort_dir = 'asc'  THEN c.location_name END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'location_name'  AND v_sort_dir = 'desc' THEN c.location_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'customer_name'  AND v_sort_dir = 'asc'  THEN c.customer_name END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'customer_name'  AND v_sort_dir = 'desc' THEN c.customer_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'status'         AND v_sort_dir = 'asc'  THEN c.status END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'status'         AND v_sort_dir = 'desc' THEN c.status END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'payment_method' AND v_sort_dir = 'asc'  THEN c.payment_method END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'payment_method' AND v_sort_dir = 'desc' THEN c.payment_method END DESC NULLS LAST,
    CASE WHEN v_sort_by IN ('initiated_at', 'created_at') AND v_sort_dir = 'asc'  THEN c.created_at END ASC NULLS LAST,
    CASE WHEN v_sort_by IN ('initiated_at', 'created_at') AND v_sort_dir = 'desc' THEN c.created_at END DESC NULLS LAST,
    c.created_at DESC
  LIMIT v_page_size
  OFFSET v_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_transactions_export(p_merchant_ids uuid[] DEFAULT NULL::uuid[], p_location_ids uuid[] DEFAULT NULL::uuid[], p_status text[] DEFAULT NULL::text[], p_payment_status text[] DEFAULT NULL::text[], p_payment_method text[] DEFAULT NULL::text[], p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_min_amount numeric DEFAULT NULL::numeric, p_max_amount numeric DEFAULT NULL::numeric, p_search text DEFAULT NULL::text, p_card_type text DEFAULT NULL::text, p_staff_id uuid DEFAULT NULL::uuid, p_sort_by text DEFAULT 'initiated_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 10000)
 RETURNS TABLE(payment_id uuid, order_id uuid, order_number text, display_number text, created_at timestamp with time zone, merchant_id uuid, merchant_name text, location_id uuid, location_name text, customer_name text, order_type text, order_status text, payment_method text, card_type text, card_last_four text, entry_mode text, authorization_code text, reference_number text, batch_number text, subtotal_amount numeric, tax_amount numeric, tip_amount numeric, discount_amount numeric, service_charge_amount numeric, total_amount numeric, amount_tendered numeric, change_given numeric, payment_status text, is_voided boolean, void_reason text, is_returned boolean, return_amount numeric, return_reason text, staff_name text, terminal_serial text, device_id text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sort_by text;
  v_sort_dir text;
  v_search text := NULLIF(trim(p_search), '');
  v_allowed_merchants uuid[];
  v_filter_merchants uuid[];
  v_card_tokens text[];
  v_export_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10000), 1), 10000);
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
  INTO v_allowed_merchants
  FROM public.get_admin_merchant_ids() AS mid;

  IF COALESCE(array_length(v_allowed_merchants, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF p_merchant_ids IS NULL OR array_length(p_merchant_ids, 1) IS NULL THEN
    v_filter_merchants := v_allowed_merchants;
  ELSE
    SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
    INTO v_filter_merchants
    FROM unnest(p_merchant_ids) AS mid
    WHERE mid = ANY (v_allowed_merchants);

    IF COALESCE(array_length(v_filter_merchants, 1), 0) = 0 THEN
      RETURN;
    END IF;
  END IF;

  v_sort_by := lower(COALESCE(p_sort_by, 'initiated_at'));
  IF v_sort_by NOT IN (
    'initiated_at',
    'created_at',
    'order_number',
    'total_amount',
    'merchant_name',
    'location_name',
    'customer_name',
    'payment_method',
    'payment_status'
  ) THEN
    v_sort_by := 'initiated_at';
  END IF;

  v_sort_dir := lower(COALESCE(p_sort_dir, 'desc'));
  IF v_sort_dir NOT IN ('asc', 'desc') THEN
    v_sort_dir := 'desc';
  END IF;

  IF NULLIF(trim(COALESCE(p_card_type, '')), '') IS NOT NULL THEN
    v_card_tokens := ARRAY(
      SELECT trim(token)
      FROM unnest(string_to_array(lower(p_card_type), ',')) AS token
      WHERE trim(token) <> ''
    );
  ELSE
    v_card_tokens := ARRAY[]::text[];
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      op.id AS payment_id,
      op.order_id,
      o.order_number,
      o.display_number,
      COALESCE(op.captured_at, op.initiated_at, o.created_at) AS created_at,
      o.merchant_id,
      m.name AS merchant_name,
      o.location_id,
      l.name AS location_name,
      COALESCE(NULLIF(o.customer_name, ''), 'Walk-in') AS customer_name,
      o.order_type::text AS order_type,
      o.status::text AS order_status,
      op.payment_method::text AS payment_method,
      op.card_type,
      op.card_last_four,
      COALESCE(
        NULLIF(op.processor_response->>'entry_type', ''),
        NULLIF(op.processor_response->>'entryType', ''),
        NULLIF(op.processor_response->>'entry_mode', ''),
        NULLIF(op.processor_response->>'entryMode', ''),
        NULLIF(op.terminal_response->>'entry_type', ''),
        NULLIF(op.terminal_response->>'entryType', ''),
        NULLIF(op.terminal_response->>'entry_mode', ''),
        NULLIF(op.terminal_response->>'entryMode', '')
      ) AS entry_mode,
      op.authorization_code,
      op.reference_number,
      COALESCE(op.batch_number::text, op.dejavoo_batch_number)::text AS batch_number,
      o.subtotal::numeric AS subtotal_amount,
      o.tax_amount::numeric AS tax_amount,
      op.tip_amount::numeric AS tip_amount,
      o.discount_amount::numeric AS discount_amount,
      o.service_charge::numeric AS service_charge_amount,
      op.total_amount::numeric AS total_amount,
      op.amount_tendered::numeric AS amount_tendered,
      op.change_given::numeric AS change_given,
      op.status::text AS payment_status,
      COALESCE(op.is_voided, false) AS is_voided,
      op.void_reason,
      COALESCE(op.is_returned, false) AS is_returned,
      op.return_amount::numeric AS return_amount,
      op.return_reason::text AS return_reason,
      NULLIF(trim(concat_ws(' ', sp.first_name, sp.last_name)), '') AS staff_name,
      COALESCE(pt.serial_number, NULLIF(op.terminal_id, '')) AS terminal_serial,
      COALESCE(NULLIF(op.device_id, ''), NULLIF(o.device_id, '')) AS device_id
    FROM public.order_payments op
    JOIN public.orders o
      ON o.id = op.order_id
    JOIN public.merchants m
      ON m.id = o.merchant_id
    LEFT JOIN public.locations l
      ON l.id = o.location_id
    LEFT JOIN public.staff_profiles sp
      ON sp.id = COALESCE(op.processed_by_staff_id, o.created_by_staff_id)
    LEFT JOIN LATERAL (
      SELECT pt_inner.*
      FROM public.payment_terminals pt_inner
      WHERE pt_inner.location_id = COALESCE(op.location_id, o.location_id)
        AND (
          op.terminal_id IS NULL
          OR pt_inner.serial_number = op.terminal_id
          OR pt_inner.tpn = op.terminal_id
          OR pt_inner.id::text = op.terminal_id
        )
      ORDER BY
        CASE
          WHEN op.terminal_id IS NOT NULL AND pt_inner.serial_number = op.terminal_id THEN 0
          WHEN op.terminal_id IS NOT NULL AND pt_inner.tpn = op.terminal_id THEN 1
          WHEN op.terminal_id IS NOT NULL AND pt_inner.id::text = op.terminal_id THEN 2
          ELSE 3
        END,
        pt_inner.updated_at DESC
      LIMIT 1
    ) pt ON true
    WHERE o.merchant_id = ANY (v_filter_merchants)
      AND (p_location_ids IS NULL OR o.location_id = ANY (p_location_ids))
      AND (p_status IS NULL OR o.status::text = ANY (p_status))
      AND (
        (p_payment_status IS NULL AND op.status::text <> ALL (ARRAY['pending', 'failed']))
        OR (p_payment_status IS NOT NULL AND op.status::text = ANY (p_payment_status))
      )
      AND (p_payment_method IS NULL OR op.payment_method::text = ANY (p_payment_method))
      AND (p_date_from IS NULL OR COALESCE(op.captured_at, op.initiated_at, o.created_at) >= p_date_from)
      AND (p_date_to IS NULL OR COALESCE(op.captured_at, op.initiated_at, o.created_at) <= p_date_to)
      AND (p_min_amount IS NULL OR op.total_amount >= p_min_amount)
      AND (p_max_amount IS NULL OR op.total_amount <= p_max_amount)
      AND (
        p_staff_id IS NULL
        OR op.processed_by_staff_id = p_staff_id
        OR o.created_by_staff_id = p_staff_id
      )
      AND (
        COALESCE(array_length(v_card_tokens, 1), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(v_card_tokens) AS token
          WHERE lower(COALESCE(op.card_type, '')) LIKE '%' || token || '%'
        )
      )
      AND (
        v_search IS NULL
        OR COALESCE(o.order_number, '') ILIKE '%' || v_search || '%'
        OR COALESCE(o.display_number, '') ILIKE '%' || v_search || '%'
        OR COALESCE(o.customer_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.card_last_four, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.authorization_code, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.reference_number, '') ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT f.*, COUNT(*) OVER() AS total_count
    FROM filtered f
  )
  SELECT
    c.payment_id,
    c.order_id,
    c.order_number,
    c.display_number,
    c.created_at,
    c.merchant_id,
    c.merchant_name,
    c.location_id,
    c.location_name,
    c.customer_name,
    c.order_type,
    c.order_status,
    c.payment_method,
    c.card_type,
    c.card_last_four,
    c.entry_mode,
    c.authorization_code,
    c.reference_number,
    c.batch_number,
    c.subtotal_amount,
    c.tax_amount,
    c.tip_amount,
    c.discount_amount,
    c.service_charge_amount,
    c.total_amount,
    c.amount_tendered,
    c.change_given,
    c.payment_status,
    c.is_voided,
    c.void_reason,
    c.is_returned,
    c.return_amount,
    c.return_reason,
    c.staff_name,
    c.terminal_serial,
    c.device_id,
    c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN v_sort_by = 'order_number'   AND v_sort_dir = 'asc'  THEN c.order_number END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'order_number'   AND v_sort_dir = 'desc' THEN c.order_number END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'total_amount'   AND v_sort_dir = 'asc'  THEN c.total_amount END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'total_amount'   AND v_sort_dir = 'desc' THEN c.total_amount END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'merchant_name'  AND v_sort_dir = 'asc'  THEN c.merchant_name END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'merchant_name'  AND v_sort_dir = 'desc' THEN c.merchant_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'location_name'  AND v_sort_dir = 'asc'  THEN c.location_name END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'location_name'  AND v_sort_dir = 'desc' THEN c.location_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'customer_name'  AND v_sort_dir = 'asc'  THEN c.customer_name END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'customer_name'  AND v_sort_dir = 'desc' THEN c.customer_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'payment_method' AND v_sort_dir = 'asc'  THEN c.payment_method END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'payment_method' AND v_sort_dir = 'desc' THEN c.payment_method END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'payment_status' AND v_sort_dir = 'asc'  THEN c.payment_status END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'payment_status' AND v_sort_dir = 'desc' THEN c.payment_status END DESC NULLS LAST,
    CASE WHEN v_sort_by IN ('initiated_at', 'created_at') AND v_sort_dir = 'asc'  THEN c.created_at END ASC NULLS LAST,
    CASE WHEN v_sort_by IN ('initiated_at', 'created_at') AND v_sort_dir = 'desc' THEN c.created_at END DESC NULLS LAST,
    c.created_at DESC
  LIMIT v_export_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_avg_kitchen_time(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(date date, avg_minutes numeric, overall_avg numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH daily_avg AS (
    SELECT
      DATE(kis.created_at) AS kitchen_date,
      AVG(EXTRACT(EPOCH FROM (kis.bumped_at - kis.created_at)) / 60)::NUMERIC(10,2) AS avg_min
    FROM kds_item_status kis
    WHERE kis.created_at >= p_from
      AND kis.created_at < p_to
      AND kis.bumped_at IS NOT NULL
    GROUP BY DATE(kis.created_at)
  )
  SELECT
    d.kitchen_date AS date,
    d.avg_min AS avg_minutes,
    (
      SELECT AVG(EXTRACT(EPOCH FROM (kis.bumped_at - kis.created_at)) / 60)::NUMERIC(10,2)
      FROM kds_item_status kis
      WHERE kis.created_at >= p_from
        AND kis.created_at < p_to
        AND kis.bumped_at IS NOT NULL
    ) AS overall_avg
  FROM daily_avg d
  ORDER BY d.kitchen_date;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_avg_table_turn_time(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(date date, avg_minutes numeric, overall_avg numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH daily_avg AS (
    SELECT
      DATE(ts.seated_at) AS session_date,
      ROUND(
        AVG(
          COALESCE(
            ts.actual_duration,
            EXTRACT(EPOCH FROM (ts.closed_at - ts.seated_at)) / 60
          )
        ),
        2
      ) AS avg_min
    FROM table_sessions ts
    WHERE ts.seated_at >= p_from
      AND ts.seated_at < p_to
      AND ts.closed_at IS NOT NULL
    GROUP BY DATE(ts.seated_at)
  )
  SELECT
    d.session_date,
    d.avg_min,
    (
      SELECT ROUND(
        AVG(
          COALESCE(
            ts.actual_duration,
            EXTRACT(EPOCH FROM (ts.closed_at - ts.seated_at)) / 60
          )
        ),
        2
      )
      FROM table_sessions ts
      WHERE ts.seated_at >= p_from
        AND ts.seated_at < p_to
        AND ts.closed_at IS NOT NULL
    ) AS overall_avg
  FROM daily_avg d
  ORDER BY d.session_date;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_avg_ticket_by_day(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(date date, avg_ticket numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    DATE(o.created_at) as date,
    AVG(o.total_amount)::NUMERIC(8,2) as avg_ticket
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY DATE(o.created_at)
  ORDER BY date;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_avg_time_to_first_order(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(avg_days numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    AVG(EXTRACT(EPOCH FROM (o.created_at - m.created_at)) / 86400)::NUMERIC(5,2) as avg_days
  FROM merchants m
  JOIN LATERAL (
    SELECT created_at FROM orders WHERE merchant_id = m.id ORDER BY created_at LIMIT 1
  ) o ON TRUE
  WHERE m.created_at >= p_from AND m.created_at < p_to
    AND o.created_at >= p_from AND o.created_at < p_to;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_busiest_locations(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(location_id uuid, location_name text, merchant_name text, order_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.name,
    m.name,
    COUNT(*)::BIGINT as order_count
  FROM orders o
  JOIN locations l ON o.location_id = l.id
  JOIN merchants m ON o.merchant_id = m.id
  WHERE o.created_at >= p_from AND o.created_at < p_to
  GROUP BY l.id, l.name, m.name
  ORDER BY order_count DESC
  LIMIT 10;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cash_vs_card_split(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(pricing_mode text, order_count bigint, revenue numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(o.payment_pricing_mode::TEXT, 'unknown') as pricing_mode,
    COUNT(*)::BIGINT as order_count,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as revenue
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY o.payment_pricing_mode
  ORDER BY order_count DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_categories_for_location(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', c.id,
                'name', c.name,
                'description', c.description,
                'image', c.image,
                'display_order', c.display_order,
                
                -- Ownership info
                'location_id', c.location_id,
                'is_global', COALESCE(c.is_global, c.location_id IS NULL),
                'is_location_specific', (c.location_id IS NOT NULL),
                'location_name', (
                    SELECT l.name FROM locations l WHERE l.id = c.location_id
                ),
                'created_by', c.created_by,
                
                -- Global availability
                'is_active', c.is_active,
                
                -- Location override (only applies to global categories)
                'location_override', CASE 
                    WHEN c.location_id IS NULL AND lco.id IS NOT NULL THEN json_build_object(
                        'id', lco.id,
                        'is_active', lco.is_active,
                        'display_order', lco.display_order,
                        'custom_title', lco.custom_title
                    )
                    ELSE NULL
                END,
                
                -- Effective values
                'effective_is_active', CASE
                    -- Location-specific category: use its own is_active
                    WHEN c.location_id IS NOT NULL THEN c.is_active
                    -- Global category: check for location override
                    ELSE COALESCE(lco.is_active, c.is_active)
                END,
                'effective_display_order', CASE
                    WHEN c.location_id IS NOT NULL THEN c.display_order
                    ELSE COALESCE(lco.display_order, c.display_order)
                END,
                'effective_name', CASE
                    WHEN c.location_id IS NOT NULL THEN c.name
                    ELSE COALESCE(lco.custom_title, c.name)
                END,
                
                -- Items in this category
                'items', (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'id', ci.id,
                            'menu_item_id', mi.id,
                            'display_order', ci.display_order,
                            'is_featured', ci.is_featured,
                            
                            -- Category-level price
                            'category_price', ci.custom_price,
                            'category_cash_price', ci.custom_cash_price,
                            'category_delivery_price', ci.custom_delivery_price,
                            'category_is_available', ci.is_available,
                            
                            'menu_item', json_build_object(
                                'id', mi.id,
                                'name', mi.name,
                                'description', mi.description,
                                'image', mi.image,
                                'allergens', mi.allergens,
                                'meal_types', mi.meal_types,
                                'card_bg_color', mi.card_bg_color,
                                'location_id', mi.location_id,
                                -- Level 1: Base price
                                'base_price', mi.price,
                                'base_cash_price', mi.cash_price,
                                'base_delivery_price', mi.delivery_price,
                                'base_availability', mi.availability,
                                
                                -- Level 2: Location item override
                                'location_item_override', CASE 
                                    WHEN lio.id IS NOT NULL THEN json_build_object(
                                        'id', lio.id,
                                        'custom_price', lio.custom_price,
                                        'custom_cash_price', lio.custom_cash_price,
                                        'custom_delivery_price', lio.custom_delivery_price,
                                        'price_modifier', lio.price_modifier,
                                        'price_modifier_type', lio.price_modifier_type,
                                        'is_available', lio.is_available,
                                        'stock_tracking_mode', lio.stock_tracking_mode,
                                        'current_stock', lio.current_stock
                                    )
                                    ELSE NULL
                                END,
                                
                                -- Level 4: Location + Category override
                                'location_category_override', CASE 
                                    WHEN lcio.id IS NOT NULL THEN json_build_object(
                                        'id', lcio.id,
                                        'custom_price', lcio.custom_price,
                                        'custom_cash_price', lcio.custom_cash_price,
                                        'custom_delivery_price', lcio.custom_delivery_price,
                                        'is_available', lcio.is_available
                                    )
                                    ELSE NULL
                                END,
                                
                                -- Effective price (full cascade)
                                'effective_price', COALESCE(
                                    lcio.custom_price,           -- L4: Location + Category
                                    ci.custom_price,             -- L3: Category
                                    lio.custom_price,            -- L2: Location item
                                    mi.price                     -- L1: Base
                                ),
                                
                                'effective_cash_price', COALESCE(
                                    lcio.custom_cash_price,
                                    ci.custom_cash_price,
                                    lio.custom_cash_price,
                                    mi.cash_price
                                ),

                                'effective_delivery_price', COALESCE(
                                    lcio.custom_delivery_price,
                                    ci.custom_delivery_price,
                                    lio.custom_delivery_price,
                                    mi.delivery_price
                                ),

                                -- Availability (AND logic)
                                'effective_availability', (
                                    mi.availability = true
                                    AND COALESCE(lio.is_available, true) = true
                                    AND COALESCE(ci.is_available, true) = true
                                    AND COALESCE(lcio.is_available, true) = true
                                ),

                                -- Item badges (location-specific)
                                -- is_new: stored per-branch in location_item_overrides
                                'is_new', COALESCE(lio.is_new, false),
                                'is_popular', (
                                    COALESCE(lio.is_popular, false)
                                    OR (
                                        p_location_id IS NOT NULL
                                        AND (
                                            SELECT COUNT(*) >= 10
                                            FROM order_items oi
                                            JOIN orders o ON o.id = oi.order_id
                                            WHERE oi.menu_item_id = mi.id
                                              AND o.location_id = p_location_id
                                              AND o.status = 'completed'
                                              AND o.completed_at > NOW() - INTERVAL '30 days'
                                              AND oi.is_voided = false
                                        )
                                    )
                                ),

                                -- Price source
                                'price_source', CASE
                                    WHEN lcio.custom_price IS NOT NULL THEN 'location_category'
                                    WHEN ci.custom_price IS NOT NULL THEN 'category'
                                    WHEN lio.custom_price IS NOT NULL THEN 'location_item'
                                    ELSE 'base'
                                END,

                                -- Override flags
                                'has_location_item_override', (lio.id IS NOT NULL),
                                'has_category_price', (ci.custom_price IS NOT NULL),
                                'has_location_category_override', (lcio.id IS NOT NULL)
                            )
                        ) ORDER BY COALESCE(lcio.display_order, ci.display_order)
                    ), '[]'::json)
                    FROM category_items ci
                    JOIN menu_items mi ON mi.id = ci.menu_item_id
                    LEFT JOIN location_item_overrides lio 
                        ON lio.menu_item_id = mi.id 
                        AND lio.location_id = p_location_id
                    LEFT JOIN location_category_item_overrides lcio 
                        ON lcio.menu_item_id = mi.id 
                        AND lcio.category_id = c.id
                        AND lcio.location_id = p_location_id
                    WHERE ci.category_id = c.id
                ),
                
                -- Item count
                'item_count', (
                    SELECT COUNT(*) FROM category_items ci WHERE ci.category_id = c.id
                ),

                -- Menu count (how many menus use this category)
                'menu_count', (
                    SELECT COUNT(*) FROM menu_categories mc WHERE mc.category_id = c.id
                ),
                
                -- Has location override
                'has_location_override', (lco.id IS NOT NULL),
                
                'created_at', c.created_at,
                'updated_at', c.updated_at
            ) ORDER BY 
                -- Sort: Global categories first, then location-specific
                CASE WHEN c.location_id IS NULL THEN 0 ELSE 1 END,
                COALESCE(lco.display_order, c.display_order) NULLS LAST,
                c.name
        ), '[]'::json)
        FROM categories c
        -- Only join location overrides if we have a location context
        LEFT JOIN location_category_overrides lco 
            ON lco.category_id = c.id 
            AND lco.location_id = p_location_id
            AND c.location_id IS NULL  -- Only global categories can have overrides
        WHERE c.merchant_id = p_merchant_id
          AND (
              -- If no location specified: return ALL categories (admin view)
              p_location_id IS NULL
              OR
              -- If location specified: return global + this location's categories
              (
                  c.location_id IS NULL  -- Global categories
                  OR 
                  c.location_id = p_location_id  -- This location's specific categories
              )
          )
    );
END;$function$
;

CREATE OR REPLACE FUNCTION public.get_chargeback_volume_by_month(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(month text, chargeback_count bigint, total_amount numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(DATE_TRUNC('month', cb.received_at)::DATE, 'YYYY-MM') as month,
    COUNT(*)::BIGINT as chargeback_count,
    SUM(cb.amount)::NUMERIC as total_amount
  FROM chargebacks cb
  WHERE cb.received_at >= p_from AND cb.received_at < p_to
  GROUP BY DATE_TRUNC('month', cb.received_at)
  ORDER BY month;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_churn_risk_merchants(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(merchant_id uuid, merchant_name text, last_period_revenue numeric, current_revenue numeric, change_pct numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_window_days INT;
  v_prev_start  TIMESTAMPTZ;
  v_prev_end    TIMESTAMPTZ;
BEGIN
  -- Calculate window size correctly
  v_window_days := EXTRACT(DAY FROM (p_to - p_from));
  v_prev_start  := p_from - (v_window_days || ' days')::INTERVAL;
  v_prev_end    := p_from;

  RETURN QUERY
  WITH current_rev AS (
    SELECT 
      o.merchant_id,
      COALESCE(SUM(o.total_amount), 0) AS revenue
    FROM orders o
    WHERE o.created_at >= p_from
      AND o.created_at < p_to
      AND o.status NOT IN ('draft', 'cancelled', 'void')
    GROUP BY o.merchant_id
  ),
  previous_rev AS (
    SELECT 
      o.merchant_id,
      COALESCE(SUM(o.total_amount), 0) AS revenue
    FROM orders o
    WHERE o.created_at >= v_prev_start
      AND o.created_at < v_prev_end
      AND o.status NOT IN ('draft', 'cancelled', 'void')
    GROUP BY o.merchant_id
  )

  SELECT
    cr.merchant_id,
    m.name::TEXT,
    pr.revenue::NUMERIC AS last_period_revenue,
    cr.revenue::NUMERIC AS current_revenue,
    CASE
      WHEN pr.revenue > 0
      THEN ((cr.revenue - pr.revenue) / pr.revenue * 100)::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END AS change_pct

  FROM current_rev cr
  JOIN previous_rev pr
    ON cr.merchant_id = pr.merchant_id
  JOIN merchants m
    ON cr.merchant_id = m.id

  WHERE pr.revenue > 0
    AND ((cr.revenue - pr.revenue) / pr.revenue) < -0.5

  ORDER BY change_pct;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_customer_activity_timeline(p_customer_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(activity_id text, activity_type text, activity_label text, description text, amount_value numeric, currency text, created_at timestamp with time zone, is_clickable boolean, related_entity_id uuid, related_entity_type text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  -- Orders
  SELECT
    'order_' || o.id::text AS activity_id,
    'order'::text AS activity_type,
    'Order Completed'::text AS activity_label,
    'Order #' || o.order_number || ' — ' || item_counts.cnt || ' item' ||
      CASE WHEN item_counts.cnt > 1 THEN 's' ELSE '' END AS description,
    o.total_amount AS amount_value,
    'USD'::text AS currency,
    o.created_at,
    true::boolean AS is_clickable,
    o.id AS related_entity_id,
    'order'::text AS related_entity_type
  FROM orders o
  JOIN LATERAL (
    SELECT COUNT(*)::integer AS cnt
    FROM order_items oi
    WHERE oi.order_id = o.id AND oi.is_voided = false
  ) item_counts ON true
  WHERE o.customer_id = p_customer_id
    AND o.status NOT IN ('cancelled', 'void')

  UNION ALL

  -- Customer Activities (tags, notes, etc.)
  SELECT
    'activity_' || ca.id::text AS activity_id,
    ca.activity_type::text AS activity_type,
    CASE
      WHEN ca.activity_type = 'tag_added' THEN 'Tag Added'
      WHEN ca.activity_type = 'tag_removed' THEN 'Tag Removed'
      WHEN ca.activity_type = 'note_added' THEN 'Note Added'
      ELSE ca.activity_type::text
    END AS activity_label,
    CASE
      WHEN ca.activity_type = 'tag_added' THEN 'Tagged as ' || COALESCE((ca.metadata->>'tag'), 'unknown')
      WHEN ca.activity_type = 'tag_removed' THEN 'Removed tag: ' || COALESCE((ca.metadata->>'tag'), 'unknown')
      WHEN ca.activity_type = 'note_added' THEN 'Note: ' || COALESCE((ca.metadata->>'note'), '')
      ELSE COALESCE(ca.metadata::text, '')
    END AS description,
    NULL::numeric AS amount_value,
    NULL::text AS currency,
    ca.created_at,
    false::boolean AS is_clickable,
    NULL::uuid AS related_entity_id,
    NULL::text AS related_entity_type
  FROM customer_activities ca
  WHERE ca.customer_id = p_customer_id

  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_customer_channel_trend(p_customer_id uuid, p_days integer DEFAULT 90)
 RETURNS TABLE(channel text, count_recent bigint, count_previous bigint, percentage_recent numeric, percentage_previous numeric, trend_label text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH recent_period AS (
      SELECT
          o.order_type::text AS channel,
          COUNT(*)::bigint AS count_recent
      FROM orders o
      WHERE o.customer_id = p_customer_id
        AND o.created_at >= NOW() - (p_days || ' days')::interval
        AND o.status NOT IN ('cancelled', 'void')
      GROUP BY o.order_type
  ),
  previous_period AS (
      SELECT
          o.order_type::text AS channel,
          COUNT(*)::bigint AS count_previous
      FROM orders o
      WHERE o.customer_id = p_customer_id
        AND o.created_at >= NOW() - ((p_days * 2) || ' days')::interval
        AND o.created_at < NOW() - (p_days || ' days')::interval
        AND o.status NOT IN ('cancelled', 'void')
      GROUP BY o.order_type
  ),
  totals AS (
      SELECT
          NULLIF((SELECT SUM(r.count_recent) FROM recent_period r), 0) AS total_recent,
          NULLIF((SELECT SUM(p.count_previous) FROM previous_period p), 0) AS total_previous
  )
  SELECT
      COALESCE(rp.channel, pp.channel) AS channel,
      COALESCE(rp.count_recent, 0) AS count_recent,
      COALESCE(pp.count_previous, 0) AS count_previous,
      ROUND(
          COALESCE(rp.count_recent, 0)::numeric
          / NULLIF(t.total_recent, 0) * 100,
          1
      ) AS percentage_recent,
      ROUND(
          COALESCE(pp.count_previous, 0)::numeric
          / NULLIF(t.total_previous, 0) * 100,
          1
      ) AS percentage_previous,
      CASE
          WHEN COALESCE(rp.count_recent, 0) > COALESCE(pp.count_previous, 0)
              THEN '↑ Increasing'
          WHEN COALESCE(rp.count_recent, 0) < COALESCE(pp.count_previous, 0)
              THEN '↓ Decreasing'
          ELSE '→ Stable'
      END AS trend_label
  FROM recent_period rp
  FULL OUTER JOIN previous_period pp
      ON rp.channel = pp.channel
  CROSS JOIN totals t
  ORDER BY COALESCE(rp.count_recent, 0) DESC;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_customer_percentile(p_customer_id uuid, p_merchant_id uuid)
 RETURNS TABLE(percentile numeric, rank_position bigint, total_customers bigint, is_top_tier boolean)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH customer_rank AS (
    SELECT
      c.id,
      c.lifetime_spend,
      ROW_NUMBER() OVER (ORDER BY c.lifetime_spend DESC) AS rank,
      COUNT(*) OVER () AS total
    FROM customers c
    WHERE c.merchant_id = p_merchant_id
  )
  SELECT
    ROUND(((total - rank + 1)::numeric / NULLIF(total, 0) * 100), 1) AS percentile,
    rank::bigint AS rank_position,
    total::bigint AS total_customers,
    (rank <= CEIL(total::numeric * 0.2)::bigint)::boolean AS is_top_tier
  FROM customer_rank
  WHERE id = p_customer_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_customer_spend_trend(p_customer_id uuid, p_months integer DEFAULT 6)
 RETURNS TABLE(month text, month_date date, total_spend numeric, order_count bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    to_char(DATE_TRUNC('month', o.created_at), 'Mon') AS month,
    DATE_TRUNC('month', o.created_at)::date AS month_date,
    COALESCE(SUM(o.total_amount), 0::numeric) AS total_spend,
    COUNT(*)::bigint AS order_count
  FROM orders o
  WHERE o.customer_id = p_customer_id
    AND o.created_at >= NOW() - (p_months || ' months')::interval
    AND o.status NOT IN ('cancelled', 'void')
  GROUP BY DATE_TRUNC('month', o.created_at)
  ORDER BY month_date ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_customer_top_items(p_customer_id uuid, p_days integer DEFAULT 90, p_limit integer DEFAULT 10)
 RETURNS TABLE(item_id uuid, item_name text, order_count bigint, total_spent numeric, last_ordered_at timestamp with time zone, is_new_favorite boolean, frequency_label text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH item_orders AS (
    SELECT
      COALESCE(oi.menu_item_id, '00000000-0000-0000-0000-000000000000'::uuid) AS item_id,
      oi.item_name,
      COUNT(*)::bigint AS order_count,
      COALESCE(SUM(oi.unit_price * oi.quantity), 0::numeric) AS total_spent,
      MAX(o.created_at) AS last_ordered_at,
      -- Check if first ordered in last 30 days (new favorite)
      (MIN(o.created_at) >= NOW() - '30 days'::interval)::boolean AS is_new_favorite
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - (p_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
      AND oi.is_voided = false
    GROUP BY oi.menu_item_id, oi.item_name
  ),
  total_orders AS (
    SELECT COUNT(DISTINCT o.id)::bigint AS order_count
    FROM orders o
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - (p_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
  )
  SELECT
    io.item_id,
    io.item_name,
    io.order_count,
    io.total_spent,
    io.last_ordered_at,
    io.is_new_favorite,
    CASE
      WHEN io.order_count >= tot.order_count THEN 'Every visit'
      WHEN io.order_count >= (tot.order_count * 0.5) THEN 'Regularly'
      WHEN io.order_count >= (tot.order_count * 0.25) THEN 'Often'
      ELSE 'Occasionally'
    END AS frequency_label
  FROM item_orders io
  CROSS JOIN total_orders tot
  ORDER BY io.order_count DESC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_customer_visit_pattern(p_customer_id uuid, p_days integer DEFAULT 90)
 RETURNS TABLE(day_of_week text, hour_of_day integer, visit_count bigint, is_peak boolean)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH visit_stats AS (
    SELECT
      TO_CHAR(o.created_at, 'Day') AS day_of_week,
      EXTRACT(HOUR FROM o.created_at)::integer AS hour_of_day,
      COUNT(*)::bigint AS visit_count,
      ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rank
    FROM orders o
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - (p_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
    GROUP BY TO_CHAR(o.created_at, 'Day'), EXTRACT(HOUR FROM o.created_at)
  )
  SELECT
    TRIM(visit_stats.day_of_week) AS day_of_week,
    visit_stats.hour_of_day,
    visit_stats.visit_count,
    (visit_stats.rank <= 3)::boolean AS is_peak
  FROM visit_stats
  ORDER BY visit_stats.visit_count DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_customer_visit_trend(p_customer_id uuid, p_recent_days integer DEFAULT 90, p_compare_days integer DEFAULT 90)
 RETURNS TABLE(recent_visits bigint, previous_visits bigint, trend_direction text, trend_percentage numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH recent AS (
    SELECT COUNT(DISTINCT DATE(o.created_at))::bigint AS visit_days
    FROM orders o
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - (p_recent_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
  ),
  previous AS (
    SELECT COUNT(DISTINCT DATE(o.created_at))::bigint AS visit_days
    FROM orders o
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - ((p_recent_days + p_compare_days) || ' days')::interval
      AND o.created_at < NOW() - (p_recent_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
  )
  SELECT
    r.visit_days AS recent_visits,
    p.visit_days AS previous_visits,
    CASE
      WHEN r.visit_days > p.visit_days THEN '↑'
      WHEN r.visit_days < p.visit_days THEN '↓'
      ELSE '→'
    END AS trend_direction,
    CASE
      WHEN p.visit_days = 0 THEN NULL
      ELSE ROUND(((r.visit_days - p.visit_days)::numeric / p.visit_days * 100), 1)
    END AS trend_percentage
  FROM recent r, previous p;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dual_pricing_adoption(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(adopted_merchants bigint, total_merchants bigint, adoption_pct numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_total_merchants BIGINT;
  v_adopted BIGINT;
BEGIN
  SELECT COUNT(DISTINCT id)::BIGINT INTO v_total_merchants FROM merchants;

  SELECT COUNT(DISTINCT merchant_id)::BIGINT INTO v_adopted
  FROM orders
  WHERE created_at >= p_from AND created_at < p_to
    AND cash_discount_applied = true;

  RETURN QUERY
  SELECT
    COALESCE(v_adopted, 0)::BIGINT,
    v_total_merchants,
    CASE
      WHEN v_total_merchants > 0
      THEN (COALESCE(v_adopted, 0)::NUMERIC / v_total_merchants * 100)::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_eligible_promotions(p_customer_id uuid, p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_order_total numeric DEFAULT NULL::numeric, p_order_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_promo RECORD;
    v_result JSONB := '[]'::JSONB;
    v_customer RECORD;
    v_visit_count INTEGER;
    v_last_visit DATE;
    v_today DATE := CURRENT_DATE;
    v_now_time TIME := LOCALTIME;
    v_qualifying BOOLEAN;
    v_discount_amount NUMERIC;
    v_bogo_qty INTEGER;
    v_bundle_match BOOLEAN;
BEGIN
    -- Fetch customer info if available
    IF p_customer_id IS NOT NULL THEN
        SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
        SELECT COUNT(*) INTO v_visit_count FROM orders WHERE customer_id = p_customer_id AND status = 'completed';
        SELECT MAX(created_at)::DATE INTO v_last_visit FROM orders WHERE customer_id = p_customer_id AND status = 'completed';
    END IF;

    FOR v_promo IN
        SELECT *
        FROM promotions
        WHERE merchant_id = p_merchant_id
          AND is_active = true
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at >= now())
          AND (location_ids IS NULL OR p_location_id IS NULL OR p_location_id = ANY(location_ids))
    LOOP
        -- Time-of-day filter
        IF v_promo.active_days IS NOT NULL AND NOT (EXTRACT(DOW FROM now())::INTEGER = ANY(v_promo.active_days)) THEN
            CONTINUE;
        END IF;
        IF v_promo.active_time_start IS NOT NULL AND v_promo.active_time_end IS NOT NULL THEN
            IF NOT (v_now_time BETWEEN v_promo.active_time_start AND v_promo.active_time_end) THEN
                CONTINUE;
            END IF;
        END IF;

        v_qualifying := true;

        -- Type-specific qualification
        CASE v_promo.promo_type
            WHEN 'happy_hour' THEN
                -- Already handled by time filters above
                NULL;

            WHEN 'birthday' THEN
                IF v_customer IS NULL OR v_customer.birthday IS NULL THEN
                    v_qualifying := false;
                ELSE
                    -- Respect birthday_window: day, week, or month
                    CASE COALESCE(v_promo.birthday_window, 'week')
                        WHEN 'day' THEN
                            IF EXTRACT(MONTH FROM v_customer.birthday) != EXTRACT(MONTH FROM v_today)
                               OR EXTRACT(DAY FROM v_customer.birthday) != EXTRACT(DAY FROM v_today) THEN
                                v_qualifying := false;
                            END IF;
                        WHEN 'week' THEN
                            -- Check if birthday falls within 7 days (before or after today)
                            IF ABS(
                                EXTRACT(DOY FROM MAKE_DATE(EXTRACT(YEAR FROM v_today)::INT, EXTRACT(MONTH FROM v_customer.birthday)::INT, EXTRACT(DAY FROM v_customer.birthday)::INT))
                                - EXTRACT(DOY FROM v_today)
                            ) > 3 THEN
                                v_qualifying := false;
                            END IF;
                        WHEN 'month' THEN
                            IF EXTRACT(MONTH FROM v_customer.birthday) != EXTRACT(MONTH FROM v_today) THEN
                                v_qualifying := false;
                            END IF;
                        ELSE
                            v_qualifying := false;
                    END CASE;
                END IF;

            WHEN 'first_visit' THEN
                -- Qualifies if customer is anonymous OR has 0 completed orders
                IF p_customer_id IS NOT NULL AND v_visit_count > 0 THEN
                    v_qualifying := false;
                END IF;

            WHEN 'comeback' THEN
                IF v_last_visit IS NULL OR v_last_visit > v_today - COALESCE(v_promo.comeback_days, 30) THEN
                    v_qualifying := false;
                END IF;

            WHEN 'threshold' THEN
                IF p_order_total IS NULL OR p_order_total < COALESCE(v_promo.threshold_amount, 0) THEN
                    v_qualifying := false;
                END IF;

            WHEN 'bogo' THEN
                -- Check if order contains at least bogo_buy_quantity of qualifying items
                IF p_order_items IS NULL THEN
                    v_qualifying := false;
                ELSE
                    SELECT COALESCE(SUM((item->>'quantity')::INTEGER), 0) INTO v_bogo_qty
                    FROM jsonb_array_elements(p_order_items) AS item
                    WHERE (v_promo.target_item_ids IS NULL OR (item->>'menu_item_id')::UUID = ANY(v_promo.target_item_ids))
                      AND (v_promo.target_categories IS NULL OR (item->>'category_id')::UUID = ANY(v_promo.target_categories));

                    IF v_bogo_qty < COALESCE(v_promo.bogo_buy_quantity, 1) THEN
                        v_qualifying := false;
                    END IF;
                END IF;

            WHEN 'bundle' THEN
                -- Check all target items/categories present in order
                IF p_order_items IS NULL THEN
                    v_qualifying := false;
                ELSE
                    -- All target_item_ids must appear in the order
                    IF v_promo.target_item_ids IS NOT NULL THEN
                        SELECT bool_and(EXISTS(
                            SELECT 1 FROM jsonb_array_elements(p_order_items) AS item
                            WHERE (item->>'menu_item_id')::UUID = tid
                        )) INTO v_bundle_match
                        FROM unnest(v_promo.target_item_ids) AS tid;

                        IF NOT COALESCE(v_bundle_match, false) THEN
                            v_qualifying := false;
                        END IF;
                    END IF;
                END IF;

            WHEN 'seasonal' THEN
                -- Already handled by date range filters above
                NULL;

            WHEN 'referral' THEN
                IF v_customer IS NULL OR v_customer.referred_by_customer_id IS NULL THEN
                    v_qualifying := false;
                ELSE
                    -- Check if referral promo already used by this customer
                    PERFORM 1 FROM promotion_usage WHERE promotion_id = v_promo.id AND customer_id = p_customer_id;
                    IF FOUND THEN
                        v_qualifying := false;
                    END IF;
                END IF;

            ELSE
                -- Unknown promo type, skip
                v_qualifying := false;
        END CASE;

        -- Check per-customer usage limits
        IF v_qualifying AND p_customer_id IS NOT NULL AND v_promo.max_uses_per_customer IS NOT NULL THEN
            PERFORM 1 FROM promotion_usage
            WHERE promotion_id = v_promo.id AND customer_id = p_customer_id
            HAVING COUNT(*) >= v_promo.max_uses_per_customer;
            IF FOUND THEN
                v_qualifying := false;
            END IF;
        END IF;

        -- Check total usage limits
        IF v_qualifying AND v_promo.max_uses_total IS NOT NULL THEN
            IF v_promo.current_uses >= v_promo.max_uses_total THEN
                v_qualifying := false;
            END IF;
        END IF;

        IF v_qualifying THEN
            -- Calculate discount amount if order total is known
            IF p_order_total IS NOT NULL THEN
                IF v_promo.discount_type = 'percentage' THEN
                    v_discount_amount := LEAST(
                        p_order_total * v_promo.discount_value / 100,
                        COALESCE(v_promo.discount_max, p_order_total)
                    );
                ELSIF v_promo.discount_type = 'fixed_amount' THEN
                    v_discount_amount := v_promo.discount_value;
                ELSE
                    v_discount_amount := v_promo.discount_value;
                END IF;
            ELSE
                v_discount_amount := NULL;
            END IF;

            v_result := v_result || jsonb_build_object(
                'promo_id', v_promo.id,
                'name', v_promo.name,
                'promo_type', v_promo.promo_type,
                'discount_type', v_promo.discount_type,
                'discount_value', v_promo.discount_value,
                'discount_max', v_promo.discount_max,
                'discount_amount', v_discount_amount,
                'auto_apply', COALESCE(v_promo.auto_apply, false)
            );
        END IF;
    END LOOP;

    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_feature_adoption_rates(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(feature text, adopted_count bigint, total_merchants bigint, adoption_pct numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_total_merchants BIGINT;
BEGIN
  SELECT COUNT(DISTINCT id)::BIGINT INTO v_total_merchants FROM merchants;

  RETURN QUERY
  SELECT
    'kds'::TEXT as feature,
    COUNT(DISTINCT kd.merchant_id)::BIGINT,
    v_total_merchants,
    (COUNT(DISTINCT kd.merchant_id)::NUMERIC / NULLIF(v_total_merchants, 0) * 100)::NUMERIC(5,2)
  FROM kds_displays kd
  WHERE kd.is_active = true
    AND kd.created_at >= p_from AND kd.created_at < p_to

  UNION ALL

  SELECT
    'table_management'::TEXT,
    COUNT(DISTINCT ts.merchant_id)::BIGINT,
    v_total_merchants,
    (COUNT(DISTINCT ts.merchant_id)::NUMERIC / NULLIF(v_total_merchants, 0) * 100)::NUMERIC(5,2)
  FROM table_sessions ts
  WHERE ts.seated_at >= p_from AND ts.seated_at < p_to

  UNION ALL

  SELECT
    'online_ordering'::TEXT,
    COUNT(DISTINCT o.merchant_id)::BIGINT,
    v_total_merchants,
    (COUNT(DISTINCT o.merchant_id)::NUMERIC / NULLIF(v_total_merchants, 0) * 100)::NUMERIC(5,2)
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.order_type = 'online';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_floor_plan_objects_with_sessions(p_floor_plan_id uuid)
 RETURNS TABLE(id uuid, floor_plan_id uuid, location_id uuid, merchant_id uuid, name text, shape_id text, category text, x numeric, y numeric, rotation numeric, z_index integer, width numeric, height numeric, capacity integer, min_capacity integer, is_reservable boolean, is_combinable boolean, is_visible boolean, is_active boolean, section_id uuid, zone_name text, default_turn_time integer, label_override text, color_override text, created_at timestamp with time zone, updated_at timestamp with time zone, session_id uuid, session_status text, session_number text, party_size integer, guest_name text, order_id uuid, server_staff_id uuid, is_vip boolean, needs_attention boolean, current_course integer, seated_at timestamp with time zone, reservation_id uuid, waitlist_id uuid, merged_tables uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    fpo.id,
    fpo.floor_plan_id,
    fpo.location_id,
    fpo.merchant_id,
    fpo.name,
    fpo.shape_id,
    fpo.category::TEXT,
    fpo.x,
    fpo.y,
    fpo.rotation,
    fpo.z_index,
    fpo.width,
    fpo.height,
    fpo.capacity,
    fpo.min_capacity,
    fpo.is_reservable,
    fpo.is_combinable,
    fpo.is_visible,
    fpo.is_active,
    fpo.section_id,
    fpo.zone_name,
    fpo.default_turn_time,
    fpo.label_override,
    fpo.color_override,
    fpo.created_at,
    fpo.updated_at,
    ts.id AS session_id,
    COALESCE(ts.status::TEXT, 'available') AS session_status,
    ts.session_number,
    ts.party_size,
    ts.guest_name,
    ts.order_id,
    ts.server_staff_id,
    COALESCE(ts.is_vip, false) AS is_vip,
    COALESCE(ts.needs_attention, false) AS needs_attention,
    COALESCE(ts.current_course, 1) AS current_course,
    ts.seated_at,
    ts.reservation_id,
    ts.waitlist_id,
    (
      SELECT ARRAY_AGG(tst2.table_id ORDER BY tst2.seated_position)
      FROM table_session_tables tst2
      WHERE tst2.session_id = ts.id
      AND tst2.is_active = true
    ) AS merged_tables
  FROM floor_plan_objects fpo
  LEFT JOIN table_session_tables tst
    ON tst.table_id = fpo.id
    AND tst.is_active = true
  LEFT JOIN table_sessions ts
    ON ts.id = tst.session_id
    AND ts.is_active = true
    AND ts.status NOT IN ('cleaning')
  WHERE fpo.floor_plan_id = p_floor_plan_id
    AND fpo.is_active = true
  ORDER BY fpo.z_index, fpo.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_kds_tickets_v2(p_location_id uuid, p_statuses text[] DEFAULT ARRAY['sent'::text, 'preparing'::text, 'ready'::text], p_kds_display_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(ticket ORDER BY ticket->>'start_time' ASC NULLS LAST), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'ticket_id', o.id::text || '_c' || COALESCE(oi_grouped.course_number, 1)::text
        || '_f' || COALESCE(EXTRACT(EPOCH FROM oi_grouped.fire_time::timestamptz)::bigint::text, '0'),
      'order_id', o.id,
      'db_order_id', o.id,
      'order_number', o.order_number,
      'display_number', o.display_number,
      'course_number', COALESCE(oi_grouped.course_number, 1),
      'status', CASE
        WHEN oi_grouped.all_ready THEN 'ready'
        WHEN oi_grouped.any_sent THEN 'pending'
        ELSE 'cooking'
      END,
      'order_type', o.order_type,
      'order_source', o.order_source,
      'delivery_platform', COALESCE(o.delivery_platform, o.metadata->>'delivery_company'),
      'table_name', o.table_number,
      'customer_name', o.customer_name,
      'start_time', COALESCE(oi_grouped.fire_time::timestamptz, o.sent_to_kitchen_at, o.created_at),
      'item_count', oi_grouped.item_count,
      'prioritized', oi_grouped.any_prioritized,
      'session_id', o.session_id,
      'items', oi_grouped.items_json
    ) AS ticket
    FROM orders o
    -- Join aggregated items grouped by course
    INNER JOIN (
      SELECT
        oi.order_id,
        COALESCE(oi.course_number, 1) AS course_number,
        -- Status aggregation
        bool_and(oi.kitchen_status = 'ready') AS all_ready,
        bool_or(oi.kitchen_status = 'sent') AS any_sent,
        -- Item count (sum of quantities)
        SUM(oi.quantity)::int AS item_count,
        oi.fire_time,
        -- Ticket-level priority flag (true if any item is prioritized)
        bool_or(COALESCE(oi.is_prioritized, false)) AS any_prioritized,
        -- Items array with nested modifiers (stable ordering)
        jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'name', COALESCE(oi.open_item_name, oi.item_name),
            'quantity', oi.quantity,
            'seat_number', oi.seat_number,
            'kitchen_status', COALESCE(oi.kitchen_status, 'sent'),
            'special_instructions', oi.special_instructions,
            'category_name', oi.category_name,
            'category_id', oi.category_id,
            'menu_name', oi.menu_name,
            'menu_id', oi.menu_id,
            'prep_station', oi.prep_station,
            'rush', COALESCE(oi.rush, false),
            'is_prioritized', COALESCE(oi.is_prioritized, false),
            'fire_time', oi.fire_time::timestamptz,
            'modifiers', (
              SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                  'modifier_name', oim.modifier_name,
                  'modifier_group_name', oim.modifier_group_name,
                  'price_modifier', oim.price_modifier,
                  'is_no', COALESCE(oim.is_no, false)
                )
              ), '[]'::jsonb)
              FROM order_item_modifiers oim
              WHERE oim.order_item_id = oi.id
            )
          )
          ORDER BY oi.id ASC
        ) AS items_json
      FROM order_items oi
      -- When p_kds_display_id is provided, only include items routed to that display
      LEFT JOIN kds_item_status kis
        ON kis.order_item_id = oi.id
        AND kis.kds_display_id = p_kds_display_id
        AND kis.status NOT IN ('cancelled', 'completed')
      WHERE COALESCE(oi.is_voided, false) = false
        AND oi.kitchen_status = ANY(p_statuses)
        -- Filter: if display ID provided, only show routed items; otherwise show all
        AND (p_kds_display_id IS NULL OR kis.id IS NOT NULL)
      GROUP BY oi.order_id, COALESCE(oi.course_number, 1), oi.fire_time
    ) oi_grouped ON oi_grouped.order_id = o.id
    WHERE o.location_id = p_location_id
      AND o.status NOT IN ('completed', 'cancelled', 'void', 'refunded')
  ) sub;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_kitchen_performance_stats(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_start_date timestamp with time zone DEFAULT (now() - '7 days'::interval), p_end_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- Main stats aggregation using order_items and orders
  WITH item_data AS (
    SELECT
      oi.id,
      oi.order_id,
      oi.prep_station,
      oi.rush,
      oi.created_at,
      oi.item_status,
      o.created_at as order_created_at,
      o.updated_at as order_updated_at,
      -- Time from item creation to order update (proxy for prep time)
      EXTRACT(EPOCH FROM (o.updated_at - oi.created_at)) as item_to_order_update_seconds,
      -- Time from order creation to order update (full ticket time)
      EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) as ticket_time_seconds
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND oi.created_at >= p_start_date
      AND oi.created_at <= p_end_date
      AND oi.item_status NOT IN ('cancelled', 'voided')
  ),
  ticket_summary AS (
    -- Overall ticket times per order
    SELECT
      order_id,
      MAX(ticket_time_seconds) as ticket_time_seconds
    FROM item_data
    GROUP BY order_id
  ),
  station_stats AS (
    -- Per-station statistics
    SELECT
      COALESCE(id.prep_station, 'Unassigned') as station_name,
      COUNT(*) as total_items,
      AVG(id.item_to_order_update_seconds) as avg_prep_seconds,
      COUNT(CASE WHEN id.item_status IN ('served', 'ready') THEN 1 END) as completed_items,
      COUNT(CASE WHEN id.item_status IN ('pending', 'preparing') THEN 1 END) as pending_items
    FROM item_data id
    GROUP BY id.prep_station
  ),
  hourly_day_stats AS (
    -- Heatmap data: hour and day of week
    SELECT
      EXTRACT(HOUR FROM id.created_at AT TIME ZONE 'UTC')::int as hour_of_day,
      EXTRACT(DOW FROM id.created_at AT TIME ZONE 'UTC')::int as day_of_week,
      AVG(id.item_to_order_update_seconds) as avg_prep_seconds,
      COUNT(*) as item_count
    FROM item_data id
    GROUP BY
      EXTRACT(HOUR FROM id.created_at AT TIME ZONE 'UTC'),
      EXTRACT(DOW FROM id.created_at AT TIME ZONE 'UTC')
  ),
  rush_analysis AS (
    -- Rush vs normal orders
    SELECT
      COUNT(CASE WHEN id.rush = true THEN 1 END) as rush_items,
      COUNT(*) as total_items,
      AVG(id.item_to_order_update_seconds) FILTER (WHERE id.rush = true) as avg_rush_seconds,
      AVG(id.item_to_order_update_seconds) FILTER (WHERE id.rush = false OR id.rush IS NULL) as avg_normal_seconds
    FROM item_data id
  ),
  completion_analysis AS (
    -- Item status breakdown
    SELECT
      COUNT(CASE WHEN id.item_status IN ('served', 'ready') THEN 1 END) as completed_items,
      COUNT(CASE WHEN id.item_status IN ('pending', 'preparing') THEN 1 END) as pending_items,
      COUNT(*) as total_items
    FROM item_data id
  ),
  daily_trend_data AS (
    -- Daily average prep times
    SELECT
      DATE(id.created_at AT TIME ZONE 'UTC') as trend_date,
      AVG(id.item_to_order_update_seconds) as avg_prep_seconds
    FROM item_data id
    GROUP BY DATE(id.created_at AT TIME ZONE 'UTC')
  )
  SELECT jsonb_build_object(
    'avg_ticket_time_minutes',
    ROUND(COALESCE((SELECT AVG(ticket_time_seconds) FROM ticket_summary) / 60.0, 0)::numeric, 2),
    'total_items_processed',
    (SELECT COUNT(*) FROM item_data),
    'by_station',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'station_id', ss.station_name,
        'display_name', ss.station_name,
        'total_items', ss.total_items,
        'avg_prep_minutes', ROUND(COALESCE(ss.avg_prep_seconds / 60.0, 0)::numeric, 2),
        'auto_bumped', ss.pending_items,
        'manual_completed', ss.completed_items,
        'alert_threshold_minutes', 10,
        'auto_bump_threshold_minutes', 20
      ) ORDER BY ss.station_name)
      FROM station_stats ss
    ), '[]'::jsonb),
    'by_hour_and_day',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hour_of_day', hds.hour_of_day,
        'day_of_week', hds.day_of_week,
        'avg_ticket_minutes', ROUND(COALESCE(hds.avg_prep_seconds / 60.0, 0)::numeric, 2)
      ) ORDER BY hds.hour_of_day, hds.day_of_week)
      FROM hourly_day_stats hds
      WHERE hds.item_count > 0
    ), '[]'::jsonb),
    'rush_stats',
    (
      SELECT jsonb_build_object(
        'rush_items', COALESCE(ra.rush_items, 0),
        'total_items', COALESCE(ra.total_items, 0),
        'rush_percentage', COALESCE(ROUND(((ra.rush_items::float / NULLIF(ra.total_items, 0)) * 100)::numeric, 2), 0),
        'avg_rush_time_minutes', COALESCE(ROUND((ra.avg_rush_seconds / 60.0)::numeric, 2), 0),
        'avg_normal_time_minutes', COALESCE(ROUND((ra.avg_normal_seconds / 60.0)::numeric, 2), 0)
      )
      FROM rush_analysis ra
    ),
    'auto_bump_stats',
    (
      SELECT jsonb_build_object(
        'auto_bumped', COALESCE(ca.pending_items, 0),
        'manual_completed', COALESCE(ca.completed_items, 0),
        'total_items', COALESCE(ca.total_items, 0),
        'auto_bump_rate', COALESCE(ROUND(((ca.pending_items::float / NULLIF(ca.total_items, 0)) * 100)::numeric, 2), 0)
      )
      FROM completion_analysis ca
    ),
    'daily_trend',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', dtd.trend_date,
        'avg_ticket_minutes', ROUND(COALESCE(dtd.avg_prep_seconds / 60.0, 0)::numeric, 2)
      ) ORDER BY dtd.trend_date)
      FROM daily_trend_data dtd
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_menu_item_details(p_item_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN (
        SELECT json_build_object(
            'id', mi.id,
            'name', mi.name,
            'description', mi.description,
            'image', mi.image,
            'meal_types', mi.meal_types,
            'allergens', mi.allergens,
            'card_bg_color', mi.card_bg_color,
            'stock_tracking_mode', mi.stock_tracking_mode,

            -- Level 1: Global Base
            'base_price', mi.price,
            'base_cash_price', mi.cash_price,
            'base_delivery_price', mi.delivery_price,
            'base_availability', mi.availability,

            -- Level 2: Location Override
            'location_override', CASE
                WHEN lio.id IS NOT NULL THEN json_build_object(
                    'id', lio.id,
                    'custom_price', lio.custom_price,
                    'custom_cash_price', lio.custom_cash_price,
                    'custom_delivery_price', lio.custom_delivery_price,
                    'price_modifier', lio.price_modifier,
                    'price_modifier_type', lio.price_modifier_type,
                    'is_available', lio.is_available,
                    'stock_tracking_mode', lio.stock_tracking_mode,
                    'current_stock', lio.current_stock,
                    'is_popular', lio.is_popular
                )
                ELSE NULL
            END,

            -- Effective Values (Computed)
            'effective_price', COALESCE(lio.custom_price, mi.price),
            'effective_cash_price', COALESCE(lio.custom_cash_price, mi.cash_price),
            'effective_delivery_price', COALESCE(lio.custom_delivery_price, mi.delivery_price),
            'effective_availability', COALESCE(lio.is_available, mi.availability),

            -- UI Flags
            'has_location_override', (lio.id IS NOT NULL),
            'price_source', CASE
                WHEN lio.custom_price IS NOT NULL THEN 'location_override'
                ELSE 'base'
            END,

            -- Modifiers
            'modifier_groups', (
                SELECT COALESCE(json_agg(
                    json_build_object(
                        'id', mg.id,
                        'name', mg.name,
                        'description', mg.description,
                        'min_selections', mg.min_selections,
                        'max_selections', mg.max_selections,
                        'is_required', mg.is_required,
                        'is_active', COALESCE(lmgo.is_active, true),
                        'items', (
                            SELECT COALESCE(json_agg(
                                json_build_object(
                                    'id', mgi.id,
                                    'name', mgi.name,
                                    'description', mgi.description,
                                    'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier),
                                    'is_active', (mgi.is_active = true AND COALESCE(lmio_mod.is_active, true) = true),
                                    'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'),
                                    'current_stock', lmio_mod.current_stock
                                ) ORDER BY mgi.name ASC
                            ), '[]'::json)
                            FROM modifier_group_items mgi
                            LEFT JOIN location_modifier_item_overrides lmio_mod
                                ON lmio_mod.modifier_group_item_id = mgi.id
                                AND lmio_mod.location_id = p_location_id
                            WHERE mgi.modifier_group_id = mg.id
                        )
                    ) ORDER BY mg.name ASC
                ), '[]'::json)
                FROM menu_item_modifier_groups mimg
                JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                LEFT JOIN location_modifier_group_overrides lmgo
                    ON lmgo.modifier_group_id = mg.id
                    AND lmgo.location_id = p_location_id
                WHERE mimg.menu_item_id = mi.id
            ),

            -- Categories (fixed: was menu_item_categories, now category_items)
            'categories', (
                SELECT COALESCE(json_agg(
                    json_build_object('id', c.id, 'name', c.name)
                ), '[]'::json)
                FROM category_items ci
                JOIN categories c ON c.id = ci.category_id
                WHERE ci.menu_item_id = mi.id
            ),

            -- Menus
            'menus', (
                SELECT COALESCE(json_agg(
                    json_build_object(
                        'id', m.id,
                        'name', m.name,
                        'is_active', m.is_active,
                        'is_global', (m.location_id IS NULL),
                        'location_id', m.location_id
                    ) ORDER BY m.name ASC
                ), '[]'::json)
                FROM menu_item_menus mim
                JOIN menus m ON m.id = mim.menu_id
                WHERE mim.menu_item_id = mi.id
            ),

            'menu_count', (
                SELECT COUNT(*)
                FROM menu_item_menus mim
                WHERE mim.menu_item_id = mi.id
            )
        )
        FROM menu_items mi
        LEFT JOIN location_item_overrides lio
            ON lio.menu_item_id = mi.id AND lio.location_id = p_location_id
        WHERE mi.id = p_item_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_menu_with_categories(p_menu_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', m.id,
        'merchant_id', m.merchant_id,
        'location_id', m.location_id,
        'name', m.name,
        'description', m.description,
        'is_active', m.is_active,
        'is_global', (m.location_id IS NULL),
        'is_location_owned', (m.location_id IS NOT NULL),
        'created_at', m.created_at,
        'updated_at', m.updated_at,

        -- Categories with items (Uber Eats / DoorDash style)
        'categories', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', mc.id,
                    'category_id', c.id,
                    'display_order', COALESCE(
                        lmco.display_order,
                        lco.display_order,
                        mc.display_order
                    ),
                    'is_active', COALESCE(
                        lmco.is_active,
                        lco.is_active,
                        mc.is_active,
                        true
                    ),

                    'category', json_build_object(
                        'id', c.id,
                        'name', COALESCE(lmco.custom_title, mc.custom_title, c.name),
                        'description', c.description,
                        'image', COALESCE(mc.custom_image, c.image),
                        'has_location_override', (lco.id IS NOT NULL),
                        'has_menu_category_override', (lmco.id IS NOT NULL),
                        'location_id', c.location_id
                    ),

                    -- Items in this category on this menu
                    'items', (
                        SELECT COALESCE(json_agg(
                            json_build_object(
                                'id', ci.id,
                                'menu_item_id', mi.id,
                                'category_id', c.id,
                                'display_order', COALESCE(lcio.display_order, ci.display_order),
                                'is_featured', COALESCE(lcio.is_featured, ci.is_featured),

                                'menu_item', json_build_object(
                                    'id', mi.id,
                                    'name', mi.name,
                                    'description', mi.description,
                                    'image', mi.image,
                                    'allergens', mi.allergens,
                                    'meal_types', mi.meal_types,
                                    'card_bg_color', mi.card_bg_color,

                                    -- ============================================
                                    -- PRICE BREAKDOWN (All Levels)
                                    -- ============================================
                                    'price_levels', json_build_object(
                                        'level_1_base', mi.price,
                                        'level_2_location_item', lio.custom_price,
                                        'level_2_modifier', lio.price_modifier,
                                        'level_2_modifier_type', lio.price_modifier_type,
                                        'level_3_category', ci.custom_price,
                                        'level_4_location_category', lcio.custom_price,
                                        'level_5_location_menu', lmio.custom_price,
                                        'level_1_delivery', mi.delivery_price,
                                        'level_2_location_item_delivery', lio.custom_delivery_price,
                                        'level_3_category_delivery', ci.custom_delivery_price,
                                        'level_4_location_category_delivery', lcio.custom_delivery_price,
                                        'level_5_location_menu_delivery', lmio.custom_delivery_price
                                    ),

                                    -- ============================================
                                    -- EFFECTIVE PRICE (Full Cascade)
                                    -- L5 > L4 > L3 > L2 > L1
                                    -- ============================================
                                    'effective_price', CASE
                                        -- Location-owned menu: simplified cascade
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(
                                                ci.custom_price,
                                                mi.price
                                            )
                                        -- Global menu with location context
                                        ELSE COALESCE(
                                            lmio.custom_price,                    -- L5: Location + Menu
                                            lcio.custom_price,                    -- L4: Location + Category
                                            ci.custom_price,                      -- L3: Category
                                            -- L2 with modifier logic
                                            CASE
                                                WHEN lio.price_modifier_type = 'add'
                                                     AND lio.price_modifier IS NOT NULL
                                                THEN mi.price + lio.price_modifier
                                                WHEN lio.price_modifier_type = 'percent'
                                                     AND lio.price_modifier IS NOT NULL
                                                THEN mi.price * (1 + lio.price_modifier / 100)
                                                WHEN lio.custom_price IS NOT NULL
                                                THEN lio.custom_price
                                                ELSE NULL
                                            END,
                                            mi.price                              -- L1: Base
                                        )
                                    END,

                                    'effective_cash_price', CASE
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(ci.custom_cash_price, mi.cash_price)
                                        ELSE COALESCE(
                                            lmio.custom_cash_price,
                                            lcio.custom_cash_price,
                                            ci.custom_cash_price,
                                            lio.custom_cash_price,
                                            mi.cash_price
                                        )
                                    END,

                                    'effective_delivery_price', CASE
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(ci.custom_delivery_price, mi.delivery_price)
                                        ELSE COALESCE(
                                            lmio.custom_delivery_price,
                                            lcio.custom_delivery_price,
                                            ci.custom_delivery_price,
                                            lio.custom_delivery_price,
                                            mi.delivery_price
                                        )
                                    END,

                                    -- ============================================
                                    -- AVAILABILITY (AND Logic through all levels)
                                    -- ============================================
                                    'effective_availability', (
                                        mi.availability = true                           -- L1
                                        AND COALESCE(lio.is_available, true) = true      -- L2
                                        AND COALESCE(ci.is_available, true) = true       -- L3
                                        AND COALESCE(lcio.is_available, true) = true     -- L4
                                        AND COALESCE(lmio.is_available, true) = true     -- L5
                                    ),

                                    -- Item badges (location-specific)
                                    -- is_new: stored per-branch in location_item_overrides
                                    'is_new', COALESCE(lio.is_new, false),
                                    'is_popular', (
                                    COALESCE(lio.is_popular, false)
                                    OR (
                                        p_location_id IS NOT NULL
                                        AND (
                                            SELECT COUNT(*) >= 10
                                            FROM order_items oi
                                            JOIN orders o ON o.id = oi.order_id
                                            WHERE oi.menu_item_id = mi.id
                                              AND o.location_id = p_location_id
                                              AND o.status = 'completed'
                                              AND o.completed_at > NOW() - INTERVAL '30 days'
                                              AND oi.is_voided = false
                                        )
                                    )
                                ),

                                    -- Price source indicator for UI
                                    'price_source', CASE
                                        WHEN lmio.custom_price IS NOT NULL THEN 'location_menu'
                                        WHEN lcio.custom_price IS NOT NULL THEN 'location_category'
                                        WHEN ci.custom_price IS NOT NULL THEN 'category'
                                        WHEN lio.custom_price IS NOT NULL OR lio.price_modifier IS NOT NULL
                                            THEN 'location_item'
                                        ELSE 'base'
                                    END,

                                    -- Override flags for UI
                                    'has_location_item_override', (lio.id IS NOT NULL),
                                    'has_category_override', (ci.custom_price IS NOT NULL),
                                    'has_location_category_override', (lcio.id IS NOT NULL),
                                    'has_location_menu_override', (lmio.id IS NOT NULL),

                                    -- Stock info
                                    'stock_tracking_mode', COALESCE(
                                        NULLIF(lio.stock_tracking_mode, 'use_default'),
                                        mi.stock_tracking_mode
                                    ),
                                    'current_stock', lio.current_stock,

                                    -- Modifiers (with location overrides)
                                    'modifier_groups', (
                                        SELECT COALESCE(json_agg(
                                            json_build_object(
                                                'id', mg.id,
                                                'name', mg.name,
                                                'min_selections', mg.min_selections,
                                                'max_selections', mg.max_selections,
                                                'is_required', mg.is_required,
                                                'is_active', COALESCE(lmgo.is_active, true),

                                                'items', (
                                                    SELECT COALESCE(json_agg(
                                                        json_build_object(
                                                            'id', mgi.id,
                                                            'name', mgi.name,
                                                            'price_modifier', COALESCE(
                                                                lmio_mod.price_modifier,
                                                                mgi.price_modifier
                                                            ),
                                                            'is_active', (
                                                                mgi.is_active = true
                                                                AND COALESCE(lmio_mod.is_active, true) = true
                                                            ),
                                                            'stock_tracking_mode', COALESCE(
                                                                lmio_mod.stock_tracking_mode,
                                                                'in_stock'
                                                            ),
                                                            'current_stock', lmio_mod.current_stock
                                                        ) ORDER BY mgi.display_order, mgi.name
                                                    ), '[]'::json)
                                                    FROM modifier_group_items mgi
                                                    LEFT JOIN location_modifier_item_overrides lmio_mod
                                                        ON lmio_mod.modifier_group_item_id = mgi.id
                                                        AND lmio_mod.location_id = p_location_id
                                                    WHERE mgi.modifier_group_id = mg.id
                                                )
                                            ) ORDER BY mg.display_order, mg.name
                                        ), '[]'::json)
                                        FROM menu_item_modifier_groups mimg
                                        JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                                        LEFT JOIN location_modifier_group_overrides lmgo
                                            ON lmgo.modifier_group_id = mg.id
                                            AND lmgo.location_id = p_location_id
                                        WHERE mimg.menu_item_id = mi.id
                                    )
                                )
                            ) ORDER BY COALESCE(lcio.display_order, ci.display_order)
                        ), '[]'::json)
                        FROM category_items ci
                        JOIN menu_items mi ON mi.id = ci.menu_item_id
                        -- L2: Location item override
                        LEFT JOIN location_item_overrides lio
                            ON lio.menu_item_id = mi.id
                            AND lio.location_id = p_location_id
                        -- L4: Location + Category override
                        LEFT JOIN location_category_item_overrides lcio
                            ON lcio.menu_item_id = mi.id
                            AND lcio.category_id = c.id
                            AND lcio.location_id = p_location_id
                        -- L5: Location + Menu override
                        LEFT JOIN location_menu_item_overrides lmio
                            ON lmio.menu_item_id = mi.id
                            AND lmio.menu_id = m.id
                            AND lmio.category_id = c.id
                            AND lmio.location_id = p_location_id
                        WHERE ci.category_id = c.id
                        -- Removed: AND COALESCE(ci.is_available, true) = true
                        -- Sold-out items now pass through with effective_availability = false
                        -- so the storefront can render them grayed out with a "Sold Out" label.
                    )
                ) ORDER BY COALESCE(lmco.display_order, lco.display_order, mc.display_order)
            ), '[]'::json)
            FROM menu_categories mc
            JOIN categories c ON c.id = mc.category_id
            LEFT JOIN location_category_overrides lco
                ON lco.category_id = c.id
                AND lco.location_id = p_location_id
            LEFT JOIN location_menu_category_overrides lmco
                ON lmco.category_id = c.id
                AND lmco.menu_id = m.id
                AND lmco.location_id = p_location_id
            WHERE mc.menu_id = m.id
              AND COALESCE(lmco.is_active, lco.is_active, mc.is_active, true) = true
        ),

        -- Schedules
        'schedules', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', ms.id,
                    'schedule', json_build_object(
                        'id', s.id,
                        'name', s.name,
                        'description', s.description,
                        'is_active', s.is_active,
                        'time_slots', (
                            SELECT COALESCE(json_agg(
                                json_build_object(
                                    'id', sts.id,
                                    'day_of_week', sts.day_of_week,
                                    'start_time', sts.start_time,
                                    'end_time', sts.end_time
                                )
                            ), '[]'::json)
                            FROM schedule_time_slots sts
                            WHERE sts.schedule_id = s.id
                        )
                    )
                )
            ), '[]'::json)
            FROM menu_schedules ms
            JOIN schedules s ON s.id = ms.schedule_id
            WHERE ms.menu_id = m.id
        )
    ) INTO result
    FROM menus m
    WHERE m.id = p_menu_id;

    RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_merchant_acquisition(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(period text, new_merchants bigint, new_locations bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(DATE_TRUNC('week', m.created_at)::DATE, 'YYYY-MM-DD') as period,
    COUNT(DISTINCT m.id)::BIGINT as new_merchants,
    COUNT(DISTINCT l.id)::BIGINT as new_locations
  FROM merchants m
  LEFT JOIN locations l ON l.merchant_id = m.id AND l.created_at >= p_from AND l.created_at < p_to
  WHERE m.created_at >= p_from AND m.created_at < p_to
  GROUP BY DATE_TRUNC('week', m.created_at)
  ORDER BY period;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_merchant_retention(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(retained bigint, churned bigint, new_merchants bigint, retention_rate numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_window_days INT;
  v_prev_start  TIMESTAMPTZ;
  v_prev_end    TIMESTAMPTZ;
BEGIN
  -- Calculate window size
  v_window_days := EXTRACT(DAY FROM (p_to - p_from));
  v_prev_start  := p_from - (v_window_days || ' days')::INTERVAL;
  v_prev_end    := p_from;

  RETURN QUERY
  WITH current_active AS (
    SELECT DISTINCT merchant_id
    FROM orders
    WHERE created_at >= p_from
      AND created_at < p_to
  ),
  previous_active AS (
    SELECT DISTINCT merchant_id
    FROM orders
    WHERE created_at >= v_prev_start
      AND created_at < v_prev_end
  ),
  new_merchants_cte AS (
    SELECT COUNT(*)::BIGINT AS cnt
    FROM merchants
    WHERE created_at >= p_from
      AND created_at < p_to
  )

  SELECT
    -- Retained = active in both periods
    COUNT(DISTINCT pa.merchant_id)
      FILTER (WHERE ca.merchant_id IS NOT NULL)::BIGINT AS retained,

    -- Churned = active before but not now
    COUNT(DISTINCT pa.merchant_id)
      FILTER (WHERE ca.merchant_id IS NULL)::BIGINT AS churned,

    -- Newly created merchants in current window
    (SELECT cnt FROM new_merchants_cte) AS new_merchants,

    -- Retention %
    CASE
      WHEN COUNT(DISTINCT pa.merchant_id) > 0 THEN
        (
          COUNT(DISTINCT pa.merchant_id)
          FILTER (WHERE ca.merchant_id IS NOT NULL)::NUMERIC
          / COUNT(DISTINCT pa.merchant_id)
        * 100
        )::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END AS retention_rate

  FROM previous_active pa
  LEFT JOIN current_active ca
    ON pa.merchant_id = ca.merchant_id;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_hq_permissions()
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_user_id text;
  v_permissions text[];
BEGIN
  v_user_id := current_user_id();
  IF v_user_id IS NULL OR NOT is_dexapos_admin() THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT ARRAY_AGG(DISTINCT rp.permission_code)
  INTO v_permissions
  FROM members m
  JOIN roles r ON r.code = m.role
  JOIN role_permissions rp ON rp.role_code = m.role
  WHERE m.user_id = v_user_id
    AND r.organization_type = 'hq';

  RETURN COALESCE(v_permissions, ARRAY[]::text[]);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_onboarding_funnel(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(stage text, merchant_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH created_merchants AS (
    SELECT COUNT(DISTINCT id)::BIGINT as cnt FROM merchants WHERE created_at >= p_from AND created_at < p_to
  ),
  with_menu AS (
    SELECT COUNT(DISTINCT m.id)::BIGINT as cnt
    FROM merchants m
    WHERE m.created_at >= p_from AND m.created_at < p_to
      AND EXISTS (SELECT 1 FROM menu_items mi WHERE mi.merchant_id = m.id LIMIT 1)
  ),
  with_staff AS (
    SELECT COUNT(DISTINCT m.id)::BIGINT as cnt
    FROM merchants m
    WHERE m.created_at >= p_from AND m.created_at < p_to
      AND EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.merchant_id = m.id LIMIT 1)
  ),
  with_first_order AS (
    SELECT COUNT(DISTINCT m.id)::BIGINT as cnt
    FROM merchants m
    WHERE m.created_at >= p_from AND m.created_at < p_to
      AND EXISTS (SELECT 1 FROM orders o WHERE o.merchant_id = m.id LIMIT 1)
  ),
  steady_state AS (
    SELECT COUNT(DISTINCT merchant_id)::BIGINT as cnt
    FROM (
      SELECT o.merchant_id
      FROM orders o
      WHERE o.created_at >= p_from AND o.created_at < p_to
      GROUP BY o.merchant_id
      HAVING COUNT(*) >= 5
    ) subq
  )
  SELECT 'Merchant Created' as stage, (SELECT cnt FROM created_merchants) as merchant_count
  UNION ALL
  SELECT 'Menu Setup', (SELECT cnt FROM with_menu)
  UNION ALL
  SELECT 'Staff Added', (SELECT cnt FROM with_staff)
  UNION ALL
  SELECT 'First Order', (SELECT cnt FROM with_first_order)
  UNION ALL
  SELECT 'Steady State (5+ orders)', (SELECT cnt FROM steady_state);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_order_flow_stats(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_start_date timestamp with time zone DEFAULT (now() - '7 days'::interval), p_end_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- Base: all orders in the date range
  WITH all_orders AS (
    SELECT
      o.id,
      o.status::text as status,
      o.total_amount,
      o.created_at,
      o.completed_at,
      o.order_type,
      o.voided_by,
      o.void_reason,
      sp_voided.first_name || ' ' || sp_voided.last_name as voided_by_staff
    FROM orders o
    LEFT JOIN staff_profiles sp_voided ON o.voided_by = sp_voided.id
    WHERE o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
  ),

  -- Funnel stages: count orders at each status
  funnel_counts AS (
    SELECT
      status,
      CASE
        WHEN status = 'pending' THEN 'Pending'
        WHEN status = 'sent_to_kitchen' THEN 'Sent to Kitchen'
        WHEN status = 'preparing' THEN 'Preparing'
        WHEN status = 'ready' THEN 'Ready'
        WHEN status = 'completed' THEN 'Completed'
        WHEN status = 'cancelled' THEN 'Cancelled'
        WHEN status = 'refunded' THEN 'Refunded'
        WHEN status = 'void' THEN 'Void'
        WHEN status = 'draft' THEN 'Draft'
        ELSE status
      END as label,
      CASE
        WHEN status = 'draft' THEN 0
        WHEN status = 'pending' THEN 1
        WHEN status = 'sent_to_kitchen' THEN 2
        WHEN status = 'preparing' THEN 3
        WHEN status = 'ready' THEN 4
        WHEN status = 'completed' THEN 5
        WHEN status = 'cancelled' THEN 6
        WHEN status = 'refunded' THEN 7
        WHEN status = 'void' THEN 8
        ELSE 99
      END as sort_order,
      COUNT(*) as count_val
    FROM all_orders
    GROUP BY status
  ),

  -- Top voided items
  top_voided_items_calc AS (
    SELECT
      mi.name as item_name,
      COUNT(*) as void_count,
      COALESCE(SUM(oi.unit_price * oi.quantity), 0) as void_amount
    FROM all_orders ao
    LEFT JOIN order_items oi ON ao.id = oi.order_id
    LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE ao.status = 'void'
      AND oi.id IS NOT NULL
    GROUP BY mi.name
    ORDER BY void_count DESC
    LIMIT 10
  ),

  -- Staff void stats
  staff_void_stats_calc AS (
    SELECT
      COALESCE(ao.voided_by_staff, 'Unknown') as staff_name,
      COUNT(*) as void_count,
      COALESCE(SUM(ao.total_amount), 0) as void_amount
    FROM all_orders ao
    WHERE ao.status = 'void'
      AND ao.voided_by IS NOT NULL
    GROUP BY ao.voided_by_staff
    ORDER BY void_count DESC
  ),

  -- Refund reason breakdown
  refund_reason_calc AS (
    SELECT
      COALESCE(op.refund_reason, 'No reason provided') as reason,
      COUNT(*) as count_val,
      COALESCE(SUM(op.refunded_amount), 0) as total_amount
    FROM all_orders ao
    LEFT JOIN order_payments op ON ao.id = op.order_id
    WHERE ao.status = 'refunded'
      AND op.is_returned = true
    GROUP BY op.refund_reason
    ORDER BY count_val DESC
  ),

  -- Order type breakdown
  order_type_stats_calc AS (
    SELECT
      ao.order_type as order_type_val,
      COUNT(*) as count_val,
      COALESCE(SUM(ao.total_amount), 0) as total_rev,
      COALESCE(AVG(ao.total_amount), 0) as avg_val
    FROM all_orders ao
    WHERE ao.order_type IS NOT NULL
    GROUP BY ao.order_type
  ),

  -- Completion time per order type
  completion_time_calc AS (
    SELECT
      ao.order_type as order_type_val,
      AVG(EXTRACT(EPOCH FROM (ao.completed_at - ao.created_at)) / 60) as avg_min,
      MIN(EXTRACT(EPOCH FROM (ao.completed_at - ao.created_at)) / 60) as min_min,
      MAX(EXTRACT(EPOCH FROM (ao.completed_at - ao.created_at)) / 60) as max_min,
      COUNT(*) as count_val
    FROM all_orders ao
    WHERE ao.completed_at IS NOT NULL
      AND ao.order_type IS NOT NULL
    GROUP BY ao.order_type
  ),

  -- Aggregates
  order_totals AS (
    SELECT
      COUNT(*) as total_orders,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
      COUNT(CASE WHEN status = 'void' THEN 1 END) as void_count
    FROM all_orders
  )

  SELECT jsonb_build_object(
    'total_orders', (SELECT total_orders FROM order_totals),

    'completion_rate',
    CASE
      WHEN (SELECT total_orders FROM order_totals) > 0
      THEN ROUND(((SELECT completed_count FROM order_totals)::numeric / (SELECT total_orders FROM order_totals) * 100)::numeric, 2)
      ELSE 0
    END,

    'cancellation_rate',
    CASE
      WHEN (SELECT total_orders FROM order_totals) > 0
      THEN ROUND(((SELECT cancelled_count FROM order_totals)::numeric / (SELECT total_orders FROM order_totals) * 100)::numeric, 2)
      ELSE 0
    END,

    'void_rate',
    CASE
      WHEN (SELECT total_orders FROM order_totals) > 0
      THEN ROUND(((SELECT void_count FROM order_totals)::numeric / (SELECT total_orders FROM order_totals) * 100)::numeric, 2)
      ELSE 0
    END,

    'funnel',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'status', fc.status,
        'label', fc.label,
        'count', fc.count_val,
        'pct_of_total', ROUND((fc.count_val::numeric / (SELECT total_orders FROM order_totals) * 100)::numeric, 2)
      ) ORDER BY fc.sort_order)
      FROM funnel_counts fc
    ), '[]'::jsonb),

    'void_refund',
    jsonb_build_object(
      'total_voids', (SELECT COUNT(*) FROM all_orders WHERE status = 'void'),
      'void_amount', (SELECT COALESCE(SUM(total_amount), 0) FROM all_orders WHERE status = 'void'),
      'total_refunds', (SELECT COUNT(*) FROM all_orders WHERE status = 'refunded'),
      'refund_amount', (SELECT COALESCE(SUM(total_amount), 0) FROM all_orders WHERE status = 'refunded'),
      'by_reason', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'reason', frc.reason,
          'count', frc.count_val,
          'total_amount', ROUND(COALESCE(frc.total_amount, 0)::numeric, 2)
        ))
        FROM refund_reason_calc frc
      ), '[]'::jsonb),
      'top_voided_items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'item_name', tvi.item_name,
          'void_count', tvi.void_count,
          'void_amount', ROUND(COALESCE(tvi.void_amount, 0)::numeric, 2)
        ))
        FROM top_voided_items_calc tvi
      ), '[]'::jsonb),
      'staff_voids', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'staff_id', ''::text,
          'staff_name', svs.staff_name,
          'void_count', svs.void_count,
          'void_amount', ROUND(COALESCE(svs.void_amount, 0)::numeric, 2)
        ))
        FROM staff_void_stats_calc svs
      ), '[]'::jsonb)
    ),

    'order_types',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'order_type', ots.order_type_val,
        'count', ots.count_val,
        'total_revenue', ROUND(COALESCE(ots.total_rev, 0)::numeric, 2),
        'avg_order_value', ROUND(COALESCE(ots.avg_val, 0)::numeric, 2),
        'pct_of_total', ROUND((ots.count_val::numeric / (SELECT total_orders FROM order_totals) * 100)::numeric, 2)
      ))
      FROM order_type_stats_calc ots
    ), '[]'::jsonb),

    'completion_times',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'order_type', ctc.order_type_val,
        'avg_minutes', ROUND(COALESCE(ctc.avg_min, 0)::numeric, 2),
        'order_count', ctc.count_val,
        'min_minutes', ROUND(COALESCE(ctc.min_min, 0)::numeric, 2),
        'max_minutes', ROUND(COALESCE(ctc.max_min, 0)::numeric, 2)
      ))
      FROM completion_time_calc ctc
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_payment_failure_rate_by_day(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(date date, total_txns bigint, failed_txns bigint, failure_rate_pct numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    DATE(op.initiated_at) AS date,
    COUNT(*)::BIGINT AS total_txns,
    COUNT(*) FILTER (WHERE op.status IN ('failed', 'declined'))::BIGINT AS failed_txns,
    CASE
      WHEN COUNT(*) > 0
      THEN (
        COUNT(*) FILTER (WHERE op.status IN ('failed', 'declined'))::NUMERIC
        / COUNT(*) * 100
      )::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END AS failure_rate_pct
  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to
  GROUP BY DATE(op.initiated_at)
  ORDER BY date;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_payment_method_mix(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(payment_method text, txn_count bigint, total_amount numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    op.payment_method::TEXT,
    COUNT(*)::BIGINT AS txn_count,
    COALESCE(SUM(op.total_amount), 0)::NUMERIC AS total_amount
  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to
  GROUP BY op.payment_method
  ORDER BY txn_count DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_payment_summary_stats(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(total_transactions bigint, total_failed bigint, overall_failure_rate numeric, total_chargebacks bigint, total_chargeback_amount numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_transactions,

    COUNT(
      CASE WHEN op.status IN ('failed', 'declined') THEN 1 END
    )::BIGINT AS total_failed,

    CASE
      WHEN COUNT(*) > 0
      THEN ROUND(
        COUNT(CASE WHEN op.status IN ('failed', 'declined') THEN 1 END)::NUMERIC
        / COUNT(*) * 100,
        2
      )
      ELSE 0
    END AS overall_failure_rate,

    (
      SELECT COUNT(*)::BIGINT
      FROM chargebacks cb
      WHERE cb.received_at >= p_from
        AND cb.received_at < p_to
    ) AS total_chargebacks,

    (
      SELECT COALESCE(SUM(cb.amount), 0)
      FROM chargebacks cb
      WHERE cb.received_at >= p_from
        AND cb.received_at < p_to
    ) AS total_chargeback_amount

  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_peak_hours_heatmap(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(day_of_week integer, hour integer, order_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(DOW FROM o.created_at)::INT as day_of_week,
    EXTRACT(HOUR FROM o.created_at)::INT as hour,
    COUNT(*)::BIGINT as order_count
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
  GROUP BY EXTRACT(DOW FROM o.created_at), EXTRACT(HOUR FROM o.created_at)
  ORDER BY day_of_week, hour;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_platform_gmv_by_day(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(date date, revenue numeric, order_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    DATE(o.created_at) as date,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as revenue,
    COUNT(*)::BIGINT as order_count
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY DATE(o.created_at)
  ORDER BY date;
END;
$function$
;

-- CREATE OR REPLACE FUNCTION public.get_pos_inventory_sync(p_location_id uuid)
--  RETURNS json
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--     v_merchant_id UUID;
--     v_result      JSON;
-- BEGIN
--     SELECT merchant_id INTO v_merchant_id
--     FROM locations
--     WHERE id = p_location_id;

--     IF v_merchant_id IS NULL THEN
--         RETURN json_build_object('error', 'Location not found');
--     END IF;

--     SELECT json_agg(row_to_json(t)) INTO v_result
--     FROM (
--         SELECT
--             ii.id,
--             ii.name,
--             ii.sku,
--             ii.unit_type,
--             ii.stock_mode,
--             ii.reorder_point,
--             ii.reorder_quantity,
--             ii.is_active,
--             ii.updated_at,
--             COALESCE(lis.stock_quantity, 0)              AS stock_quantity,
--             -- Effective cost: location override → global (no per-row scalar function)
--             COALESCE(lio.cost_per_unit, ii.cost_per_unit, 0) AS effective_cost,
--             -- Effective reorder point: location override → global
--             COALESCE(lio.reorder_point, ii.reorder_point)    AS effective_reorder_point
--         FROM inventory_items ii
--         LEFT JOIN location_inventory_stock lis
--                ON lis.inventory_item_id = ii.id
--               AND lis.location_id       = p_location_id
--         LEFT JOIN location_inventory_overrides lio
--                ON lio.inventory_item_id = ii.id
--               AND lio.location_id       = p_location_id
--         WHERE ii.merchant_id = v_merchant_id
--           AND ii.is_active   = true
--         ORDER BY ii.name
--     ) t;

--     RETURN COALESCE(v_result, '[]'::json);
-- END;
-- $function$
-- ;

CREATE OR REPLACE FUNCTION public.get_refund_rate_by_day(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(date date, refund_rate_pct numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    DATE(op.initiated_at) AS date,
    CASE
      WHEN SUM(op.total_amount) > 0
      THEN (
        SUM(CASE WHEN op.status IN ('refunded', 'partially_refunded')
                 THEN op.amount ELSE 0 END)::NUMERIC
        / SUM(op.total_amount) * 100
      )::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END AS refund_rate_pct
  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to
  GROUP BY DATE(op.initiated_at)
  ORDER BY date;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_revenue_by_merchant(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(merchant_id uuid, merchant_name text, revenue numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.name,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as revenue
  FROM merchants m
  LEFT JOIN orders o ON o.merchant_id = m.id
    AND o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY m.id, m.name
  ORDER BY revenue DESC
  LIMIT 20;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_revenue_by_order_type(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(order_type text, revenue numeric, order_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    o.order_type::TEXT,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as revenue,
    COUNT(*)::BIGINT as order_count
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY o.order_type
  ORDER BY revenue DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_service_timeline_breakdown(p_location_id text, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    result json;
BEGIN
    WITH session_events AS (
        -- Join sessions with their events, filtered by location and date range
        SELECT
            ts.session_id,
            e.event_type,
            e.occurred_at
        FROM public.table_sessions ts
        JOIN public.table_session_events e ON ts.id = e.session_id
        WHERE ts.location_id = p_location_id
          AND e.occurred_at BETWEEN p_start_date AND p_end_date
    ),
    -- Phase 1: Seated → First Order (time to first order)
    seated_to_first AS (
        SELECT
            AVG(EXTRACT(EPOCH FROM (first_order_at - seated_at)) / 60) AS avg_minutes
        FROM (
            SELECT
                session_id,
                MIN(CASE WHEN event_type = 'seated' THEN occurred_at END) AS seated_at,
                MIN(CASE WHEN event_type IN ('order_placed', 'order_added') THEN occurred_at END) AS first_order_at
            FROM session_events
            GROUP BY session_id
        ) t
        WHERE seated_at IS NOT NULL
          AND first_order_at IS NOT NULL
          AND first_order_at > seated_at
    ),
    -- Phase 2: First Order → Food Served (kitchen + delivery time)
    first_to_food AS (
        SELECT
            AVG(EXTRACT(EPOCH FROM (food_served_at - first_order_at)) / 60) AS avg_minutes
        FROM (
            SELECT
                session_id,
                MIN(CASE WHEN event_type IN ('order_placed', 'order_added') THEN occurred_at END) AS first_order_at,
                MIN(CASE WHEN event_type IN ('appetizers_served', 'mains_served', 'desserts_served') THEN occurred_at END) AS food_served_at
            FROM session_events
            GROUP BY session_id
        ) t
        WHERE first_order_at IS NOT NULL
          AND food_served_at IS NOT NULL
          AND food_served_at > first_order_at
    ),
    -- Phase 3: Food Served → Check Presented
    food_to_check AS (
        SELECT
            AVG(EXTRACT(EPOCH FROM (check_presented_at - food_served_at)) / 60) AS avg_minutes
        FROM (
            SELECT
                session_id,
                MIN(CASE WHEN event_type IN ('appetizers_served', 'mains_served', 'desserts_served') THEN occurred_at END) AS food_served_at,
                MIN(CASE WHEN event_type = 'check_presented' THEN occurred_at END) AS check_presented_at
            FROM session_events
            GROUP BY session_id
        ) t
        WHERE food_served_at IS NOT NULL
          AND check_presented_at IS NOT NULL
          AND check_presented_at > food_served_at
    ),
    -- Phase 4: Check Presented → Payment Complete
    check_to_payment AS (
        SELECT
            AVG(EXTRACT(EPOCH FROM (payment_complete_at - check_presented_at)) / 60) AS avg_minutes
        FROM (
            SELECT
                session_id,
                MIN(CASE WHEN event_type = 'check_presented' THEN occurred_at END) AS check_presented_at,
                MIN(CASE WHEN event_type = 'payment_complete' THEN occurred_at END) AS payment_complete_at
            FROM session_events
            GROUP BY session_id
        ) t
        WHERE check_presented_at IS NOT NULL
          AND payment_complete_at IS NOT NULL
          AND payment_complete_at > check_presented_at
    ),
    -- Phase 5: Payment → Table Cleared
    payment_to_cleared AS (
        SELECT
            AVG(EXTRACT(EPOCH FROM (table_cleared_at - payment_complete_at)) / 60) AS avg_minutes
        FROM (
            SELECT
                session_id,
                MIN(CASE WHEN event_type = 'payment_complete' THEN occurred_at END) AS payment_complete_at,
                MIN(CASE WHEN event_type = 'table_cleared' THEN occurred_at END) AS table_cleared_at
            FROM session_events
            GROUP BY session_id
        ) t
        WHERE payment_complete_at IS NOT NULL
          AND table_cleared_at IS NOT NULL
          AND table_cleared_at > payment_complete_at
    )
    SELECT json_build_object(
        'seated_to_first_order', (SELECT avg_minutes FROM seated_to_first),
        'first_order_to_food_served', (SELECT avg_minutes FROM first_to_food),
        'food_served_to_check_presented', (SELECT avg_minutes FROM food_to_check),
        'check_presented_to_payment_complete', (SELECT avg_minutes FROM check_to_payment),
        'payment_to_table_cleared', (SELECT avg_minutes FROM payment_to_cleared)
    ) INTO result;

    RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_staff_performance_stats(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_start_date timestamp with time zone DEFAULT (now() - '7 days'::interval), p_end_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- Orders per staff (assigned server or creator)
  WITH staff_order_data AS (
    SELECT
      sp.id as staff_id,
      sp.first_name || ' ' || sp.last_name as staff_name,
      sp.account_type as role,
      o.id as order_id,
      o.total_amount,
      o.subtotal,
      o.created_at,
      o.voided_at,
      o.status
    FROM orders o
    LEFT JOIN staff_profiles sp ON (o.assigned_server_id = sp.id OR o.created_by_staff_id = sp.id)
    WHERE o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND o.status NOT IN ('draft', 'cancelled', 'void')
  ),

  -- Tips per staff
  staff_tips_data AS (
    SELECT
      sp.id as staff_id,
      sp.first_name || ' ' || sp.last_name as staff_name,
      op.tip_amount,
      op.subtotal_portion,
      CASE WHEN op.payment_method = 'cash' THEN op.tip_amount ELSE 0 END as cash_tip,
      CASE WHEN op.payment_method = 'card' THEN op.tip_amount ELSE 0 END as card_tip
    FROM order_payments op
    LEFT JOIN staff_profiles sp ON op.processed_by_staff_id = sp.id
    WHERE op.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR op.location_id = p_location_id)
      AND op.initiated_at >= p_start_date
      AND op.initiated_at <= p_end_date
      AND op.status NOT IN ('failed', 'declined', 'void')
      AND sp.id IS NOT NULL
  ),

  -- Table turns per staff
  staff_table_turns AS (
    SELECT
      sp.id as staff_id,
      sp.first_name || ' ' || sp.last_name as staff_name,
      COUNT(*) as tables_turned,
      AVG(COALESCE(ts.actual_duration, 0)) / 60 as avg_turn_minutes
    FROM table_sessions ts
    LEFT JOIN staff_profiles sp ON ts.server_staff_id = sp.id
    WHERE ts.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR ts.location_id = p_location_id)
      AND ts.cleared_at >= p_start_date
      AND ts.cleared_at <= p_end_date
      AND ts.cleared_at IS NOT NULL
      AND sp.id IS NOT NULL
    GROUP BY sp.id, staff_name
  ),

  -- Order activity per staff
  staff_activity_data AS (
    SELECT
      sp.id as staff_id,
      sp.first_name || ' ' || sp.last_name as staff_name,
      COUNT(CASE WHEN o.created_by_staff_id = sp.id THEN 1 END) as orders_created,
      COUNT(CASE WHEN op.processed_by_staff_id = sp.id THEN 1 END) as payments_processed,
      COUNT(CASE WHEN op.is_voided = true AND op.voided_by = sp.id THEN 1 END) as voids_count,
      COALESCE(SUM(CASE WHEN op.is_voided = true AND op.voided_by = sp.id THEN op.amount ELSE 0 END), 0) as void_amount,
      COUNT(CASE WHEN op.is_returned = true AND op.returned_by = sp.id THEN 1 END) as refunds_count,
      COALESCE(SUM(CASE WHEN op.is_returned = true AND op.returned_by = sp.id THEN op.return_amount ELSE 0 END), 0) as refund_amount
    FROM staff_profiles sp
    LEFT JOIN orders o ON (o.created_by_staff_id = sp.id OR o.assigned_server_id = sp.id)
      AND o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
    LEFT JOIN order_payments op ON o.id = op.order_id
      AND op.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR op.location_id = p_location_id)
      AND op.initiated_at >= p_start_date
      AND op.initiated_at <= p_end_date
    WHERE sp.merchant_id = p_merchant_id
    GROUP BY sp.id, staff_name
  ),

  -- Leaderboard aggregation
  leaderboard_data AS (
    SELECT
      sod.staff_id,
      sod.staff_name,
      sod.role,
      COALESCE(SUM(sod.total_amount), 0) as total_sales,
      COALESCE(AVG(sod.subtotal), 0) as avg_check_size,
      COUNT(sod.order_id) as order_count,
      COALESCE(SUM(std.tip_amount), 0) as total_tips,
      CASE
        WHEN COALESCE(SUM(std.subtotal_portion), 0) > 0
        THEN ROUND((COALESCE(SUM(std.tip_amount), 0) / NULLIF(SUM(std.subtotal_portion), 0) * 100)::numeric, 2)
        ELSE 0
      END as avg_tip_pct,
      COALESCE(stt.tables_turned, 0) as tables_turned,
      ROUND(COALESCE(stt.avg_turn_minutes, 0)::numeric, 2) as avg_table_turn_minutes
    FROM staff_order_data sod
    LEFT JOIN staff_tips_data std ON sod.staff_id = std.staff_id
    LEFT JOIN staff_table_turns stt ON sod.staff_id = stt.staff_id
    WHERE sod.staff_id IS NOT NULL
    GROUP BY sod.staff_id, sod.staff_name, sod.role, stt.tables_turned, stt.avg_turn_minutes
  ),

  -- Tips distribution buckets
  tip_distribution_calc AS (
    SELECT
      CASE
        WHEN COALESCE(std.tip_amount / NULLIF(std.subtotal_portion, 0) * 100, 0) < 10 THEN '0-10%'
        WHEN COALESCE(std.tip_amount / NULLIF(std.subtotal_portion, 0) * 100, 0) < 15 THEN '11-15%'
        WHEN COALESCE(std.tip_amount / NULLIF(std.subtotal_portion, 0) * 100, 0) < 20 THEN '16-20%'
        WHEN COALESCE(std.tip_amount / NULLIF(std.subtotal_portion, 0) * 100, 0) < 25 THEN '21-25%'
        ELSE '26%+'
      END as bucket,
      COUNT(*) as count
    FROM staff_tips_data std
    GROUP BY bucket
  ),

  -- Per-staff tips summary
  staff_tips_summary AS (
    SELECT
      std.staff_id,
      std.staff_name,
      COALESCE(SUM(std.tip_amount), 0) as total_tips,
      CASE
        WHEN COALESCE(SUM(std.subtotal_portion), 0) > 0
        THEN ROUND((COALESCE(SUM(std.tip_amount), 0) / NULLIF(SUM(std.subtotal_portion), 0) * 100)::numeric, 2)
        ELSE 0
      END as avg_tip_pct
    FROM staff_tips_data std
    GROUP BY std.staff_id, std.staff_name
  )

  SELECT jsonb_build_object(
    'total_active_staff',
    (SELECT COUNT(DISTINCT staff_id) FROM leaderboard_data WHERE staff_id IS NOT NULL),

    'total_orders',
    (SELECT COALESCE(SUM(order_count), 0) FROM leaderboard_data),

    'total_tips',
    (SELECT COALESCE(SUM(total_tips), 0)::numeric FROM staff_tips_summary),

    'avg_tip_pct',
    (SELECT CASE
      WHEN COUNT(*) > 0 THEN ROUND(AVG(avg_tip_pct)::numeric, 2)
      ELSE 0
    END FROM staff_tips_summary),

    'leaderboard',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'staff_id', ld.staff_id::text,
        'staff_name', ld.staff_name,
        'role', ld.role,
        'total_sales', ROUND(COALESCE(ld.total_sales, 0)::numeric, 2),
        'avg_check_size', ROUND(COALESCE(ld.avg_check_size, 0)::numeric, 2),
        'total_tips', ROUND(COALESCE(ld.total_tips, 0)::numeric, 2),
        'avg_tip_pct', COALESCE(ld.avg_tip_pct, 0),
        'tables_turned', COALESCE(ld.tables_turned, 0),
        'avg_table_turn_minutes', COALESCE(ld.avg_table_turn_minutes, 0),
        'order_count', COALESCE(ld.order_count, 0)
      ) ORDER BY ld.total_sales DESC)
      FROM leaderboard_data ld
      WHERE ld.staff_id IS NOT NULL
    ), '[]'::jsonb),

    'tips_analysis',
    jsonb_build_object(
      'total_tips', (SELECT COALESCE(SUM(total_tips), 0)::numeric FROM staff_tips_summary),
      'avg_tip_pct', (SELECT CASE
        WHEN COUNT(*) > 0 THEN ROUND(AVG(avg_tip_pct)::numeric, 2)
        ELSE 0
      END FROM staff_tips_summary),
      'cash_tips', (SELECT COALESCE(SUM(cash_tip), 0)::numeric FROM staff_tips_data),
      'card_tips', (SELECT COALESCE(SUM(card_tip), 0)::numeric FROM staff_tips_data),
      'tip_distribution', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'bucket', tdc.bucket,
          'count', tdc.count
        ) ORDER BY tdc.bucket)
        FROM tip_distribution_calc tdc
      ), '[]'::jsonb),
      'by_staff', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'staff_id', sts.staff_id::text,
          'staff_name', sts.staff_name,
          'total_tips', ROUND(COALESCE(sts.total_tips, 0)::numeric, 2),
          'avg_tip_pct', COALESCE(sts.avg_tip_pct, 0)
        ) ORDER BY sts.total_tips DESC)
        FROM staff_tips_summary sts
      ), '[]'::jsonb)
    ),

    'order_activity',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'staff_id', sad.staff_id::text,
        'staff_name', sad.staff_name,
        'orders_created', COALESCE(sad.orders_created, 0),
        'payments_processed', COALESCE(sad.payments_processed, 0),
        'voids_count', COALESCE(sad.voids_count, 0),
        'void_amount', ROUND(COALESCE(sad.void_amount, 0)::numeric, 2),
        'refunds_count', COALESCE(sad.refunds_count, 0),
        'refund_amount', ROUND(COALESCE(sad.refund_amount, 0)::numeric, 2)
      ) ORDER BY sad.orders_created DESC)
      FROM staff_activity_data sad
      WHERE sad.staff_id IS NOT NULL
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_support_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_open_count            INTEGER;
  v_unassigned_count      INTEGER;
  v_avg_first_response    NUMERIC;
  v_avg_resolution        NUMERIC;
  v_tickets_today         INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_open_count
  FROM public.support_tickets
  WHERE status IN ('open', 'in_progress', 'waiting_on_merchant');

  SELECT COUNT(*) INTO v_unassigned_count
  FROM public.support_tickets
  WHERE status IN ('open', 'in_progress') AND assigned_to IS NULL;

  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600)::NUMERIC, 1)
  INTO v_avg_first_response
  FROM public.support_tickets
  WHERE first_response_at IS NOT NULL
    AND created_at >= now() - INTERVAL '30 days';

  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::NUMERIC, 1)
  INTO v_avg_resolution
  FROM public.support_tickets
  WHERE resolved_at IS NOT NULL
    AND created_at >= now() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_tickets_today
  FROM public.support_tickets
  WHERE created_at >= date_trunc('day', now());

  RETURN jsonb_build_object(
    'open_count',               COALESCE(v_open_count, 0),
    'unassigned_count',         COALESCE(v_unassigned_count, 0),
    'avg_first_response_hours', COALESCE(v_avg_first_response, 0),
    'avg_resolution_hours',     COALESCE(v_avg_resolution, 0),
    'tickets_today',            COALESCE(v_tickets_today, 0)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_table_performance_stats(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_start_date timestamp with time zone DEFAULT (now() - '7 days'::interval), p_end_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- Closed sessions in date range with table/section info
  WITH session_data AS (
    SELECT
      ts.id,
      ts.party_size,
      ts.seated_at,
      ts.first_order_at,
      ts.food_served_at,
      ts.check_presented_at,
      ts.paid_at,
      ts.cleared_at,
      fpo.id as table_id,
      fpo.name as table_name,
      fpo.capacity,
      COALESCE(ss.name, 'Unassigned') as section_name,
      -- Order associated with session
      o.total_amount,
      -- Calculate turn time: seated to cleared
      EXTRACT(EPOCH FROM (ts.cleared_at - ts.seated_at)) / 60 as turn_time_seconds
    FROM table_sessions ts
    LEFT JOIN table_session_tables tst ON ts.id = tst.session_id
    LEFT JOIN floor_plan_objects fpo ON tst.table_id = fpo.id
      AND fpo.category IN ('table', 'booth')
    LEFT JOIN server_sections ss ON fpo.section_id = ss.id
    LEFT JOIN orders o ON ts.order_id = o.id
    WHERE ts.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR ts.location_id = p_location_id)
      AND ts.cleared_at IS NOT NULL
      AND ts.seated_at >= p_start_date
      AND ts.seated_at <= p_end_date
  ),

  -- Party size buckets
  party_size_stats AS (
    SELECT
      CASE
        WHEN sd.party_size BETWEEN 1 AND 2 THEN '1-2'
        WHEN sd.party_size BETWEEN 3 AND 4 THEN '3-4'
        WHEN sd.party_size BETWEEN 5 AND 6 THEN '5-6'
        ELSE '7+'
      END as bucket,
      AVG(sd.turn_time_seconds) as avg_turn_seconds,
      COUNT(*) as session_count
    FROM session_data sd
    GROUP BY bucket
  ),

  -- Daily trend
  daily_trend_data AS (
    SELECT
      DATE(sd.seated_at) as trend_date,
      AVG(sd.turn_time_seconds) as avg_turn_seconds,
      COUNT(*) as session_count
    FROM session_data sd
    GROUP BY DATE(sd.seated_at)
  ),

  -- Service phases: avg time between key events
  -- seated -> order -> food -> check -> payment -> cleared
  service_phases_calc AS (
    SELECT
      'seated_to_order' as phase,
      AVG(EXTRACT(EPOCH FROM (sd.first_order_at - sd.seated_at)) / 60) as avg_minutes,
      COUNT(CASE WHEN sd.first_order_at IS NOT NULL THEN 1 END) as phase_count
    FROM session_data sd
    WHERE sd.first_order_at IS NOT NULL

    UNION ALL

    SELECT
      'order_to_food' as phase,
      AVG(EXTRACT(EPOCH FROM (sd.food_served_at - sd.first_order_at)) / 60) as avg_minutes,
      COUNT(CASE WHEN sd.food_served_at IS NOT NULL THEN 1 END) as phase_count
    FROM session_data sd
    WHERE sd.food_served_at IS NOT NULL AND sd.first_order_at IS NOT NULL

    UNION ALL

    SELECT
      'food_to_check' as phase,
      AVG(EXTRACT(EPOCH FROM (sd.check_presented_at - sd.food_served_at)) / 60) as avg_minutes,
      COUNT(CASE WHEN sd.check_presented_at IS NOT NULL THEN 1 END) as phase_count
    FROM session_data sd
    WHERE sd.check_presented_at IS NOT NULL AND sd.food_served_at IS NOT NULL

    UNION ALL

    SELECT
      'check_to_payment' as phase,
      AVG(EXTRACT(EPOCH FROM (sd.paid_at - sd.check_presented_at)) / 60) as avg_minutes,
      COUNT(CASE WHEN sd.paid_at IS NOT NULL THEN 1 END) as phase_count
    FROM session_data sd
    WHERE sd.paid_at IS NOT NULL AND sd.check_presented_at IS NOT NULL

    UNION ALL

    SELECT
      'payment_to_cleared' as phase,
      AVG(EXTRACT(EPOCH FROM (sd.cleared_at - sd.paid_at)) / 60) as avg_minutes,
      COUNT(CASE WHEN sd.cleared_at IS NOT NULL THEN 1 END) as phase_count
    FROM session_data sd
    WHERE sd.cleared_at IS NOT NULL AND sd.paid_at IS NOT NULL
  ),

  -- Hourly RevPASH (Revenue Per Available Seat Hour)
  -- RevPASH = Total Revenue / (Capacity * Hours Available)
  hourly_revpash_calc AS (
    SELECT
      EXTRACT(HOUR FROM sd.seated_at AT TIME ZONE 'UTC')::int as hour_of_day,
      SUM(COALESCE(sd.total_amount, 0)) as total_revenue,
      SUM(sd.party_size) as total_covers,
      COUNT(*) as session_count,
      ROUND((SUM(COALESCE(sd.total_amount, 0)) / NULLIF(SUM(sd.party_size), 0))::numeric, 2) as revpash
    FROM session_data sd
    GROUP BY EXTRACT(HOUR FROM sd.seated_at AT TIME ZONE 'UTC')
  ),

  -- Per-table utilization
  table_utilization_calc AS (
    SELECT
      sd.table_id,
      sd.table_name,
      sd.capacity,
      sd.section_name,
      COUNT(*) as total_sessions,
      AVG(sd.turn_time_seconds) / 60 as avg_turn_minutes,
      SUM(COALESCE(sd.total_amount, 0)) as total_revenue,
      SUM(sd.party_size) as total_covers,
      ROUND((SUM(COALESCE(sd.total_amount, 0)) / NULLIF(SUM(sd.party_size), 0))::numeric, 2) as revpash
    FROM session_data sd
    WHERE sd.table_id IS NOT NULL
    GROUP BY sd.table_id, sd.table_name, sd.capacity, sd.section_name
  ),

  -- Per-section stats
  section_stats_calc AS (
    SELECT
      sd.section_name,
      COUNT(*) as total_sessions,
      SUM(COALESCE(sd.total_amount, 0)) as total_revenue,
      AVG(sd.turn_time_seconds) / 60 as avg_turn_minutes
    FROM session_data sd
    GROUP BY sd.section_name
  )

  SELECT jsonb_build_object(
    'avg_turn_time_minutes',
    ROUND(COALESCE((SELECT AVG(sd.turn_time_seconds) / 60 FROM session_data sd), 0)::numeric, 2),

    'total_sessions',
    (SELECT COUNT(*) FROM session_data),

    'total_covers',
    (SELECT COALESCE(SUM(party_size), 0) FROM session_data),

    'by_party_size',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'bucket', pss.bucket,
        'avg_turn_time_minutes', ROUND(COALESCE(pss.avg_turn_seconds / 60, 0)::numeric, 2),
        'sessions', pss.session_count
      ) ORDER BY pss.bucket)
      FROM party_size_stats pss
    ), '[]'::jsonb),

    'daily_trend',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', dtd.trend_date,
        'avg_turn_time_minutes', ROUND(COALESCE(dtd.avg_turn_seconds / 60, 0)::numeric, 2),
        'sessions', dtd.session_count
      ) ORDER BY dtd.trend_date)
      FROM daily_trend_data dtd
    ), '[]'::jsonb),

    'service_phases',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'phase', spc.phase,
        'avg_minutes', ROUND(COALESCE(spc.avg_minutes, 0)::numeric, 2),
        'sessions', COALESCE(spc.phase_count, 0)
      ))
      FROM service_phases_calc spc
    ), '[]'::jsonb),

    'hourly_revpash',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hour', hrc.hour_of_day,
        'revpash', COALESCE(hrc.revpash, 0),
        'covers', COALESCE(hrc.total_covers, 0)
      ) ORDER BY hrc.hour_of_day)
      FROM hourly_revpash_calc hrc
    ), '[]'::jsonb),

    'table_utilization',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'table_id', COALESCE(tuc.table_id::text, ''),
        'table_name', COALESCE(tuc.table_name, 'Unknown'),
        'capacity', COALESCE(tuc.capacity, 0),
        'section_name', COALESCE(tuc.section_name, 'Unassigned'),
        'total_sessions', tuc.total_sessions,
        'avg_turn_time_minutes', ROUND(COALESCE(tuc.avg_turn_minutes, 0)::numeric, 2),
        'total_revenue', ROUND(COALESCE(tuc.total_revenue, 0)::numeric, 2),
        'total_covers', COALESCE(tuc.total_covers, 0),
        'revpash', COALESCE(tuc.revpash, 0)
      ) ORDER BY tuc.total_revenue DESC)
      FROM table_utilization_calc tuc
    ), '[]'::jsonb),

    'section_stats',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'section_name', ssc.section_name,
        'total_sessions', ssc.total_sessions,
        'total_revenue', ROUND(COALESCE(ssc.total_revenue, 0)::numeric, 2),
        'avg_turn_time_minutes', ROUND(COALESCE(ssc.avg_turn_minutes, 0)::numeric, 2)
      ) ORDER BY ssc.total_revenue DESC)
      FROM section_stats_calc ssc
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_terminal_type_distribution(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(terminal_type text, terminal_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    pt.terminal_type::TEXT,
    COUNT(*)::BIGINT as terminal_count
  FROM payment_terminals pt
  WHERE pt.is_active = true
  GROUP BY pt.terminal_type
  ORDER BY terminal_count DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_tip_rate_by_day(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(date date, tip_rate_pct numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    DATE(op.initiated_at) AS date,
    CASE
      WHEN SUM(op.total_amount) > 0
      THEN (SUM(op.tip_amount)::NUMERIC / SUM(op.total_amount) * 100)::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END AS tip_rate_pct
  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to
  GROUP BY DATE(op.initiated_at)
  ORDER BY date;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_transaction_volume_by_day(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(date date, txn_count bigint, total_amount numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    DATE(op.initiated_at) AS date,
    COUNT(*)::BIGINT AS txn_count,
    SUM(op.total_amount)::NUMERIC AS total_amount
  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to
  GROUP BY DATE(op.initiated_at)
  ORDER BY date;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_unified_staff_view(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(member_id text, staff_profile_id uuid, user_id text, clerk_user_id text, email text, first_name text, last_name text, display_name text, avatar_url text, phone text, account_type text, is_clerk_user boolean, location_assignments jsonb, total_locations integer, primary_location_id uuid, primary_location_name text, overall_is_active boolean, member_created_at timestamp with time zone, last_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH staff_data AS (
    SELECT
      sp.id AS profile_id,
      sp.user_id,
      u.id AS clerk_user_id,
      sp.email,
      sp.first_name,
      sp.last_name,
      sp.display_name,
      COALESCE(u.avatar_url, sp.avatar_url) AS avatar_url,
      sp.phone,
      sp.account_type,
      sp.is_active AS profile_active,
      sp.created_at,
      sp.updated_at
    FROM staff_profiles sp
    LEFT JOIN users u ON u.id = sp.user_id
    WHERE sp.merchant_id = p_merchant_id
  ),
  location_data AS (
    SELECT
      COALESCE(lm.staff_profile_id, sp_map.id) AS profile_id,
      jsonb_agg(
        jsonb_build_object(
          'location_id', l.id,
          'location_name', l.name,
          'role_code', lm.role_code,
          'role_name', r.name,
          'is_primary', lm.is_primary_location,
          'is_active', lm.is_active,
          'has_pin', (lm.pin_plain IS NOT NULL OR lm.pin_hashed IS NOT NULL OR lm.pin_code IS NOT NULL),
          'pin_code', COALESCE(lm.pin_plain, lm.pin_hashed, lm.pin_code),
          'hourly_rate', lm.hourly_rate,
          'employment_type', lm.employment_type,
          'assigned_at', lm.assigned_at
        ) ORDER BY lm.is_primary_location DESC, l.name
      ) AS assignments,
      COUNT(*)::INT AS location_count,
      (array_agg(l.id) FILTER (WHERE lm.is_primary_location = true))[1] AS primary_loc_id,
      (array_agg(l.name) FILTER (WHERE lm.is_primary_location = true))[1] AS primary_loc_name,
      BOOL_OR(lm.is_active) AS any_active
    FROM location_members lm
    INNER JOIN locations l ON l.id = lm.location_id
    LEFT JOIN roles r ON r.code = lm.role_code
    LEFT JOIN staff_profiles sp_map
      ON sp_map.user_id = lm.user_id
     AND sp_map.merchant_id = p_merchant_id
    WHERE l.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR lm.location_id = p_location_id)
      AND COALESCE(lm.staff_profile_id, sp_map.id) IS NOT NULL
    GROUP BY COALESCE(lm.staff_profile_id, sp_map.id)
  )
  SELECT
    m.id::text AS member_id,
    sd.profile_id AS staff_profile_id,
    sd.user_id AS user_id,
    sd.clerk_user_id,
    sd.email,
    sd.first_name,
    sd.last_name,
    sd.display_name,
    sd.avatar_url,
    sd.phone,
    sd.account_type,
    (sd.account_type = 'clerk') AS is_clerk_user,
    COALESCE(ld.assignments, '[]'::JSONB) AS location_assignments,
    COALESCE(ld.location_count, 0) AS total_locations,
    ld.primary_loc_id AS primary_location_id,
    ld.primary_loc_name AS primary_location_name,
    COALESCE(ld.any_active, false) AND sd.profile_active AS overall_is_active,
    m.created_at AS member_created_at,
    m.updated_at AS last_updated_at
  FROM staff_data sd
  LEFT JOIN members m ON m.staff_profile_id = sd.profile_id OR m.user_id = sd.user_id
  LEFT JOIN location_data ld ON ld.profile_id = sd.profile_id
  WHERE m.id IS NOT NULL OR ld.profile_id IS NOT NULL
  ORDER BY sd.last_name, sd.first_name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.hq_has_permission(p_permission_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_user_id text;
  v_has_permission boolean;
BEGIN
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT is_dexapos_admin() THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM members m
    JOIN roles r ON r.code = m.role
    JOIN role_permissions rp ON rp.role_code = m.role
    WHERE m.user_id = v_user_id
      AND r.organization_type = 'hq'
      AND rp.permission_code = p_permission_code
  )
  INTO v_has_permission;

  RETURN COALESCE(v_has_permission, false);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_location_stock(p_inventory_item_id uuid, p_location_id uuid, p_quantity numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO location_inventory_stock (location_id, inventory_item_id, stock_quantity, updated_at)
    VALUES (p_location_id, p_inventory_item_id, GREATEST(0, p_quantity), now())
    ON CONFLICT (location_id, inventory_item_id)
    DO UPDATE SET
        stock_quantity = location_inventory_stock.stock_quantity + p_quantity,
        updated_at     = now();

    -- Sync legacy aggregate
    UPDATE inventory_items
    SET
        current_stock = (
            SELECT COALESCE(SUM(stock_quantity), 0)
            FROM location_inventory_stock
            WHERE inventory_item_id = p_inventory_item_id
        ),
        updated_at = now()
    WHERE id = p_inventory_item_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_admin_payment_audit_event(p_action text, p_resource_type text DEFAULT 'payment_data'::text, p_resource_id text DEFAULT NULL::text, p_merchant_id text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_fields_accessed text[] DEFAULT NULL::text[], p_success boolean DEFAULT true, p_error_message text DEFAULT NULL::text, p_request_path text DEFAULT '/manage/transactions'::text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id text := auth.jwt()->>'sub';
  v_user_email text := NULLIF(auth.jwt()->>'email', '');
  v_user_role text := NULL;
  v_resource_id uuid := NULL;
  v_merchant_id uuid := NULL;
  v_location_id uuid := NULL;
  v_ip_address inet := NULL;
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  IF NULLIF(trim(COALESCE(p_resource_id, '')), '') IS NOT NULL THEN
    BEGIN
      v_resource_id := trim(p_resource_id)::uuid;
    EXCEPTION
      WHEN others THEN
        v_resource_id := NULL;
    END;
  END IF;

  IF NULLIF(trim(COALESCE(p_merchant_id, '')), '') IS NOT NULL THEN
    BEGIN
      v_merchant_id := trim(p_merchant_id)::uuid;
    EXCEPTION
      WHEN others THEN
        v_merchant_id := NULL;
    END;
  END IF;

  IF NULLIF(trim(COALESCE(p_location_id, '')), '') IS NOT NULL THEN
    BEGIN
      v_location_id := trim(p_location_id)::uuid;
    EXCEPTION
      WHEN others THEN
        v_location_id := NULL;
    END;
  END IF;

  IF NULLIF(trim(COALESCE(p_ip_address, '')), '') IS NOT NULL THEN
    BEGIN
      v_ip_address := trim(p_ip_address)::inet;
    EXCEPTION
      WHEN others THEN
        v_ip_address := NULL;
    END;
  END IF;

  BEGIN
    SELECT role_code::text
    INTO v_user_role
    FROM public.get_my_hq_role()
    LIMIT 1;
  EXCEPTION
    WHEN others THEN
      v_user_role := NULL;
  END;

  INSERT INTO public.payment_audit_log (
    resource_type,
    resource_id,
    action,
    user_id,
    user_email,
    user_role,
    merchant_id,
    location_id,
    ip_address,
    user_agent,
    request_path,
    success,
    error_message,
    fields_accessed,
    event_timestamp
  )
  VALUES (
    COALESCE(NULLIF(trim(COALESCE(p_resource_type, '')), ''), 'payment_data'),
    v_resource_id,
    COALESCE(NULLIF(trim(COALESCE(p_action, '')), ''), 'unknown_action'),
    v_user_id,
    v_user_email,
    v_user_role,
    v_merchant_id,
    v_location_id,
    v_ip_address,
    NULLIF(trim(COALESCE(p_user_agent, '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_request_path, '')), ''), '/manage/transactions'),
    COALESCE(p_success, true),
    NULLIF(trim(COALESCE(p_error_message, '')), ''),
    COALESCE(p_fields_accessed, ARRAY[]::text[]),
    now()
  );
EXCEPTION
  WHEN others THEN
    RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_waste(p_merchant_id uuid, p_location_id uuid, p_inventory_item_id uuid, p_quantity numeric, p_reason text, p_notes text, p_logged_by_user_id text, p_logged_by_name text, p_waste_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_waste_log_id      UUID;
    v_cost_per_unit     NUMERIC;
    v_estimated_cost    NUMERIC;
    v_prev_stock        NUMERIC;
    v_new_stock         NUMERIC;
BEGIN
    -- Validate quantity
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'quantity must be greater than zero');
    END IF;

    -- Fetch cost_per_unit for estimated_cost calculation
    SELECT COALESCE(cost_per_unit, 0)
    INTO   v_cost_per_unit
    FROM   inventory_items
    WHERE  id = p_inventory_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'inventory item not found');
    END IF;

    v_estimated_cost := ROUND(v_cost_per_unit * p_quantity, 4);

    -- Capture pre-waste stock
    SELECT COALESCE(stock_quantity, 0)
    INTO   v_prev_stock
    FROM   location_inventory_stock
    WHERE  location_id       = p_location_id
      AND  inventory_item_id = p_inventory_item_id;

    -- Insert waste record
    INSERT INTO waste_logs (
        merchant_id, location_id, inventory_item_id,
        quantity, reason, notes,
        waste_date, estimated_cost,
        logged_by_user_id, logged_by_name
    ) VALUES (
        p_merchant_id, p_location_id, p_inventory_item_id,
        p_quantity, p_reason, p_notes,
        p_waste_date, v_estimated_cost,
        p_logged_by_user_id, p_logged_by_name
    )
    RETURNING id INTO v_waste_log_id;

    -- Decrement stock (floored at 0)
    PERFORM public.decrement_location_stock(p_inventory_item_id, p_location_id, p_quantity);

    -- Capture post-waste stock
    SELECT COALESCE(stock_quantity, 0)
    INTO   v_new_stock
    FROM   location_inventory_stock
    WHERE  location_id       = p_location_id
      AND  inventory_item_id = p_inventory_item_id;

    -- Audit log
    INSERT INTO stock_update_log (
        merchant_id, location_id, inventory_item_id,
        previous_stock, new_stock, change_amount,
        update_reason, update_source,
        updated_by_user_id, updated_by_name
    ) VALUES (
        p_merchant_id, p_location_id, p_inventory_item_id,
        v_prev_stock, v_new_stock, -p_quantity,
        'waste_spoilage', 'waste',
        p_logged_by_user_id, p_logged_by_name
    );

    RETURN jsonb_build_object(
        'success',        true,
        'waste_log_id',   v_waste_log_id,
        'estimated_cost', v_estimated_cost,
        'new_stock',      v_new_stock
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.loyalty_earn_on_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_customer_id UUID;
    v_merchant_id UUID;
    v_location_id UUID;
    v_total NUMERIC;
    v_discount NUMERIC;
    v_status TEXT;
    v_program RECORD;
    v_enrollment RECORD;
    v_points_earned INTEGER;
    v_qualifying_amount NUMERIC;
    v_item RECORD;
    v_punch_earned INTEGER;
    v_reward_id UUID;
    v_result JSONB := '[]'::JSONB;
BEGIN
    SELECT customer_id, merchant_id, location_id, total_amount, discount_amount, status
    INTO v_customer_id, v_merchant_id, v_location_id, v_total, v_discount, v_status
    FROM orders
    WHERE id = p_order_id;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('error', 'Order not found', 'order_id', p_order_id);
    END IF;

    IF v_customer_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Order has no customer', 'order_id', p_order_id);
    END IF;

    FOR v_program IN
        SELECT *
        FROM loyalty_programs
        WHERE merchant_id = v_merchant_id
          AND is_active = true
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at >= now())
          AND (location_ids IS NULL OR v_location_id = ANY(location_ids))
    LOOP
        v_reward_id := NULL;
        v_points_earned := 0;
        v_punch_earned := 0;

        SELECT * INTO v_enrollment
        FROM loyalty_enrollments
        WHERE program_id = v_program.id AND customer_id = v_customer_id;

        IF v_enrollment IS NULL THEN
            IF v_program.auto_enroll THEN
                INSERT INTO loyalty_enrollments (
                    program_id, customer_id, merchant_id,
                    current_points, lifetime_points,
                    current_visits, lifetime_visits,
                    current_punches, lifetime_punches,
                    total_rewards_earned, total_rewards_redeemed, total_reward_value
                ) VALUES (
                    v_program.id, v_customer_id, v_merchant_id,
                    0, 0, 0, 0, 0, 0, 0, 0, 0
                )
                RETURNING * INTO v_enrollment;
            ELSE
                CONTINUE;
            END IF;
        END IF;

        IF v_program.cooldown_minutes IS NOT NULL AND v_program.cooldown_minutes > 0
           AND v_enrollment.last_earn_at IS NOT NULL THEN
            IF v_enrollment.last_earn_at + (v_program.cooldown_minutes * interval '1 minute') > now() THEN
                CONTINUE;
            END IF;
        END IF;

        IF v_program.min_order_amount IS NOT NULL AND v_total < v_program.min_order_amount THEN
            CONTINUE;
        END IF;

        IF v_program.program_type = 'points' THEN
            SELECT COALESCE(SUM(
                (oi.unit_price * oi.quantity) -
                CASE WHEN NOT v_program.earn_on_discounted THEN COALESCE(oi.discount_amount, 0) ELSE 0 END
            ), 0)
            INTO v_qualifying_amount
            FROM order_items oi
            WHERE oi.order_id = p_order_id
              AND (v_program.excluded_categories IS NULL OR oi.category_id != ALL(v_program.excluded_categories))
              AND (v_program.excluded_item_ids IS NULL OR oi.menu_item_id != ALL(v_program.excluded_item_ids));

            v_points_earned := FLOOR(v_qualifying_amount * v_program.points_per_dollar);

            IF v_points_earned > 0 THEN
                UPDATE loyalty_enrollments
                SET
                    current_points = current_points + v_points_earned,
                    lifetime_points = lifetime_points + v_points_earned,
                    last_earn_at = now(),
                    updated_at = now()
                WHERE id = v_enrollment.id
                RETURNING * INTO v_enrollment;

                INSERT INTO loyalty_transactions (
                    enrollment_id, customer_id, program_id, merchant_id,
                    order_id, transaction_type,
                    points_delta, balance_points,
                    description
                ) VALUES (
                    v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                    p_order_id, 'earn_points',
                    v_points_earned, v_enrollment.current_points,
                    'Earned ' || v_points_earned || ' points'
                );

                IF v_program.points_redemption_threshold IS NOT NULL
                   AND v_enrollment.current_points >= v_program.points_redemption_threshold
                THEN
                    INSERT INTO loyalty_rewards (
                        customer_id, enrollment_id, program_id, merchant_id,
                        reward_description, reward_type, reward_value,
                        reward_max_value, reward_category_id, reward_menu_item_id,
                        expires_at, status
                    ) VALUES (
                        v_customer_id, v_enrollment.id, v_program.id, v_merchant_id,
                        v_program.reward_description, v_program.reward_type, v_program.reward_value,
                        v_program.reward_max_value, v_program.reward_category_id, v_program.reward_menu_item_id,
                        CASE WHEN v_program.reward_expiry_days IS NOT NULL
                             THEN now() + (v_program.reward_expiry_days * interval '1 day')
                             ELSE NULL END,
                        'available'
                    ) RETURNING id INTO v_reward_id;

                    UPDATE loyalty_enrollments
                    SET
                        current_points = current_points - v_program.points_redemption_threshold,
                        total_rewards_earned = total_rewards_earned + 1
                    WHERE id = v_enrollment.id
                    RETURNING current_points INTO v_enrollment.current_points;

                    INSERT INTO loyalty_transactions (
                        enrollment_id, customer_id, program_id, merchant_id,
                        order_id, transaction_type,
                        points_delta, balance_points,
                        description, reward_id
                    ) VALUES (
                        v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                        p_order_id, 'threshold_crossed',
                        -v_program.points_redemption_threshold, v_enrollment.current_points,
                        'Reward unlocked: ' || v_program.reward_description,
                        v_reward_id
                    );
                END IF;
            END IF;

        ELSIF v_program.program_type = 'visits' THEN
            UPDATE loyalty_enrollments
            SET
                current_visits = current_visits + 1,
                lifetime_visits = lifetime_visits + 1,
                last_earn_at = now(),
                updated_at = now()
            WHERE id = v_enrollment.id
            RETURNING * INTO v_enrollment;

            INSERT INTO loyalty_transactions (
                enrollment_id, customer_id, program_id, merchant_id,
                order_id, transaction_type,
                visits_delta, balance_visits,
                description
            ) VALUES (
                v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                p_order_id, 'earn_visit',
                1, v_enrollment.current_visits,
                'Earned a visit'
            );

            IF v_program.visits_required IS NOT NULL
               AND v_enrollment.current_visits >= v_program.visits_required
            THEN
                INSERT INTO loyalty_rewards (
                    customer_id, enrollment_id, program_id, merchant_id,
                    reward_description, reward_type, reward_value,
                    reward_max_value, reward_category_id, reward_menu_item_id,
                    expires_at, status
                ) VALUES (
                    v_customer_id, v_enrollment.id, v_program.id, v_merchant_id,
                    v_program.reward_description, v_program.reward_type, v_program.reward_value,
                    v_program.reward_max_value, v_program.reward_category_id, v_program.reward_menu_item_id,
                    CASE WHEN v_program.reward_expiry_days IS NOT NULL
                         THEN now() + (v_program.reward_expiry_days * interval '1 day')
                         ELSE NULL END,
                    'available'
                ) RETURNING id INTO v_reward_id;

                UPDATE loyalty_enrollments
                SET
                    current_visits = 0,
                    total_rewards_earned = total_rewards_earned + 1
                WHERE id = v_enrollment.id
                RETURNING current_visits INTO v_enrollment.current_visits;

                INSERT INTO loyalty_transactions (
                    enrollment_id, customer_id, program_id, merchant_id,
                    order_id, transaction_type,
                    visits_delta, balance_visits,
                    description, reward_id
                ) VALUES (
                    v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                    p_order_id, 'threshold_crossed',
                    -v_program.visits_required, v_enrollment.current_visits,
                    'Reward unlocked: ' || v_program.reward_description,
                    v_reward_id
                );
            END IF;

        ELSIF v_program.program_type = 'punch_card' THEN
            v_punch_earned := 0;
            FOR v_item IN
                SELECT oi.menu_item_id, oi.quantity, mi.category_id
                FROM order_items oi
                LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
                WHERE oi.order_id = p_order_id
            LOOP
                IF v_program.punch_target_type = 'item' AND v_item.menu_item_id = v_program.punch_menu_item_id THEN
                    v_punch_earned := v_punch_earned + v_item.quantity;
                ELSIF v_program.punch_target_type = 'category' AND v_item.category_id = v_program.punch_category_id THEN
                    v_punch_earned := v_punch_earned + v_item.quantity;
                END IF;
            END LOOP;

            IF v_punch_earned > 0 THEN
                UPDATE loyalty_enrollments
                SET
                    current_punches = current_punches + v_punch_earned,
                    lifetime_punches = lifetime_punches + v_punch_earned,
                    last_earn_at = now(),
                    updated_at = now()
                WHERE id = v_enrollment.id
                RETURNING * INTO v_enrollment;

                INSERT INTO loyalty_transactions (
                    enrollment_id, customer_id, program_id, merchant_id,
                    order_id, transaction_type,
                    punches_delta, balance_punches,
                    description
                ) VALUES (
                    v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                    p_order_id, 'earn_punch',
                    v_punch_earned, v_enrollment.current_punches,
                    'Earned ' || v_punch_earned || ' punches'
                );

                IF v_program.punches_required IS NOT NULL
                   AND v_enrollment.current_punches >= v_program.punches_required
                THEN
                    INSERT INTO loyalty_rewards (
                        customer_id, enrollment_id, program_id, merchant_id,
                        reward_description, reward_type, reward_value,
                        reward_max_value, reward_category_id, reward_menu_item_id,
                        expires_at, status
                    ) VALUES (
                        v_customer_id, v_enrollment.id, v_program.id, v_merchant_id,
                        v_program.reward_description, v_program.reward_type, v_program.reward_value,
                        v_program.reward_max_value, v_program.reward_category_id, v_program.reward_menu_item_id,
                        CASE WHEN v_program.reward_expiry_days IS NOT NULL
                             THEN now() + (v_program.reward_expiry_days * interval '1 day')
                             ELSE NULL END,
                        'available'
                    ) RETURNING id INTO v_reward_id;

                    UPDATE loyalty_enrollments
                    SET
                        current_punches = current_punches - v_program.punches_required,
                        total_rewards_earned = total_rewards_earned + 1
                    WHERE id = v_enrollment.id
                    RETURNING current_punches INTO v_enrollment.current_punches;

                    INSERT INTO loyalty_transactions (
                        enrollment_id, customer_id, program_id, merchant_id,
                        order_id, transaction_type,
                        punches_delta, balance_punches,
                        description, reward_id
                    ) VALUES (
                        v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                        p_order_id, 'threshold_crossed',
                        -v_program.punches_required, v_enrollment.current_punches,
                        'Reward unlocked: ' || v_program.reward_description,
                        v_reward_id
                    );
                END IF;
            END IF;
        END IF;

        v_result := v_result || jsonb_build_object(
            'program_name', v_program.name,
            'program_type', v_program.program_type,
            'earned', CASE v_program.program_type
                WHEN 'points' THEN v_points_earned
                WHEN 'visits' THEN 1
                WHEN 'punch_card' THEN v_punch_earned
            END,
            'new_balance', CASE v_program.program_type
                WHEN 'points' THEN v_enrollment.current_points
                WHEN 'visits' THEN v_enrollment.current_visits
                WHEN 'punch_card' THEN v_enrollment.current_punches
            END,
            'reward_unlocked', v_reward_id IS NOT NULL
        );
    END LOOP;

    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.loyalty_expire_rewards()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_reward RECORD;
BEGIN
    FOR v_reward IN
        SELECT *
        FROM loyalty_rewards
        WHERE status = 'available' AND expires_at < now()
    LOOP
        UPDATE loyalty_rewards
        SET status = 'expired'
        WHERE id = v_reward.id;

        INSERT INTO loyalty_transactions (
            enrollment_id, customer_id, program_id, merchant_id,
            transaction_type,
            description, reward_id
        ) VALUES (
            v_reward.enrollment_id, v_reward.customer_id, v_reward.program_id, v_reward.merchant_id,
            'expire',
            'Reward expired: ' || v_reward.reward_description,
            v_reward.id
        );
    END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.loyalty_get_customer_status(p_customer_id uuid, p_merchant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_customer JSONB;
    v_enrollments JSONB := '[]'::JSONB;
    v_available_rewards JSONB := '[]'::JSONB;
    v_eligible_promos JSONB;
    v_record RECORD;
    v_progress NUMERIC;
BEGIN
    -- Basic customer info
    SELECT jsonb_build_object(
        'id', id,
        'name', name,
        'phone', phone,
        'tags', tags
    ) INTO v_customer
    FROM customers
    WHERE id = p_customer_id;

    -- Enrollments with progress
    FOR v_record IN
        SELECT
            e.*,
            p.name as program_name,
            p.program_type,
            p.points_redemption_threshold,
            p.visits_required,
            p.punches_required,
            p.reward_description
        FROM loyalty_enrollments e
        JOIN loyalty_programs p ON e.program_id = p.id
        WHERE e.customer_id = p_customer_id AND e.merchant_id = p_merchant_id
          AND e.is_active = true
    LOOP
        IF v_record.program_type = 'points' AND COALESCE(v_record.points_redemption_threshold, 0) > 0 THEN
            v_progress := (v_record.current_points::NUMERIC / v_record.points_redemption_threshold) * 100;
        ELSIF v_record.program_type = 'visits' AND COALESCE(v_record.visits_required, 0) > 0 THEN
            v_progress := (v_record.current_visits::NUMERIC / v_record.visits_required) * 100;
        ELSIF v_record.program_type = 'punch_card' AND COALESCE(v_record.punches_required, 0) > 0 THEN
            v_progress := (v_record.current_punches::NUMERIC / v_record.punches_required) * 100;
        ELSE
            v_progress := 0;
        END IF;

        v_enrollments := v_enrollments || jsonb_build_object(
            'program_id', v_record.program_id,
            'program_name', v_record.program_name,
            'program_type', v_record.program_type,
            'current_points', v_record.current_points,
            'points_threshold', v_record.points_redemption_threshold,
            'current_visits', v_record.current_visits,
            'visits_required', v_record.visits_required,
            'current_punches', v_record.current_punches,
            'punches_required', v_record.punches_required,
            'progress_percent', ROUND(v_progress::NUMERIC, 1),
            'next_reward', v_record.reward_description
        );
    END LOOP;

    -- Available (non-expired) rewards
    FOR v_record IN
        SELECT r.*, p.name as program_name
        FROM loyalty_rewards r
        JOIN loyalty_programs p ON r.program_id = p.id
        WHERE r.customer_id = p_customer_id
          AND r.merchant_id = p_merchant_id
          AND r.status = 'available'
          AND (r.expires_at IS NULL OR r.expires_at > now())
    LOOP
        v_available_rewards := v_available_rewards || jsonb_build_object(
            'reward_id', v_record.id,
            'description', v_record.reward_description,
            'reward_type', v_record.reward_type,
            'expires_at', v_record.expires_at,
            'program_name', v_record.program_name
        );
    END LOOP;

    -- Eligible promotions (delegate to separate function)
    SELECT get_eligible_promotions(p_customer_id, p_merchant_id, NULL, NULL, NULL)
    INTO v_eligible_promos;

    -- Assemble result matching spec shape
    RETURN jsonb_build_object(
        'customer', v_customer,
        'enrollments', v_enrollments,
        'available_rewards', v_available_rewards,
        'eligible_promotions', COALESCE(v_eligible_promos, '[]'::JSONB)
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.loyalty_manual_adjust(p_enrollment_id uuid, p_adjustment_type text, p_amount integer, p_reason text, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_enrollment RECORD;
    v_new_balance INTEGER;
BEGIN
    SELECT * INTO v_enrollment FROM loyalty_enrollments WHERE id = p_enrollment_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Enrollment not found');
    END IF;

    CASE p_adjustment_type
        WHEN 'points' THEN
            UPDATE loyalty_enrollments
            SET
                current_points = current_points + p_amount,
                lifetime_points = lifetime_points + GREATEST(p_amount, 0),
                updated_at = now()
            WHERE id = p_enrollment_id
            RETURNING current_points INTO v_new_balance;

            INSERT INTO loyalty_transactions (
                enrollment_id, customer_id, program_id, merchant_id,
                transaction_type,
                points_delta, balance_points,
                description, staff_id
            ) VALUES (
                p_enrollment_id, v_enrollment.customer_id, v_enrollment.program_id, v_enrollment.merchant_id,
                'adjust',
                p_amount, v_new_balance,
                'Manual adjustment: ' || p_reason,
                p_staff_id
            );

        WHEN 'visits' THEN
            UPDATE loyalty_enrollments
            SET
                current_visits = current_visits + p_amount,
                lifetime_visits = lifetime_visits + GREATEST(p_amount, 0),
                updated_at = now()
            WHERE id = p_enrollment_id
            RETURNING current_visits INTO v_new_balance;

            INSERT INTO loyalty_transactions (
                enrollment_id, customer_id, program_id, merchant_id,
                transaction_type,
                visits_delta, balance_visits,
                description, staff_id
            ) VALUES (
                p_enrollment_id, v_enrollment.customer_id, v_enrollment.program_id, v_enrollment.merchant_id,
                'adjust',
                p_amount, v_new_balance,
                'Manual adjustment: ' || p_reason,
                p_staff_id
            );

        WHEN 'punches' THEN
            UPDATE loyalty_enrollments
            SET
                current_punches = current_punches + p_amount,
                lifetime_punches = lifetime_punches + GREATEST(p_amount, 0),
                updated_at = now()
            WHERE id = p_enrollment_id
            RETURNING current_punches INTO v_new_balance;

            INSERT INTO loyalty_transactions (
                enrollment_id, customer_id, program_id, merchant_id,
                transaction_type,
                punches_delta, balance_punches,
                description, staff_id
            ) VALUES (
                p_enrollment_id, v_enrollment.customer_id, v_enrollment.program_id, v_enrollment.merchant_id,
                'adjust',
                p_amount, v_new_balance,
                'Manual adjustment: ' || p_reason,
                p_staff_id
            );

        ELSE
            RETURN jsonb_build_object('error', 'Invalid adjustment type. Must be: points, visits, or punches');
    END CASE;

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.loyalty_redeem_reward(p_reward_id uuid, p_order_id uuid, p_location_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_reward RECORD;
    v_customer_id UUID;
    v_order_total NUMERIC;
    v_enrollment RECORD;
    v_discount_amount NUMERIC;
    v_free_item_id UUID;
    v_item_price NUMERIC;
    v_discount JSONB;
BEGIN
    -- Fetch reward and validate
    SELECT r.*, p.merchant_id AS program_merchant_id
    INTO v_reward
    FROM loyalty_rewards r
    JOIN loyalty_programs p ON r.program_id = p.id
    WHERE r.id = p_reward_id AND r.status = 'available';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Reward not available');
    END IF;

    -- Check expiry
    IF v_reward.expires_at IS NOT NULL AND v_reward.expires_at < now() THEN
        UPDATE loyalty_rewards SET status = 'expired' WHERE id = p_reward_id;
        RETURN jsonb_build_object('error', 'Reward expired');
    END IF;

    -- Validate customer matches order
    SELECT customer_id, total_amount INTO v_customer_id, v_order_total FROM orders WHERE id = p_order_id;
    IF v_customer_id IS NULL OR v_customer_id != v_reward.customer_id THEN
        RETURN jsonb_build_object('error', 'Reward does not belong to this customer');
    END IF;

    -- Get enrollment for balance updates
    SELECT * INTO v_enrollment FROM loyalty_enrollments WHERE id = v_reward.enrollment_id;

    -- Compute discount based on reward_type
    CASE v_reward.reward_type
        WHEN 'discount_fixed' THEN
            v_discount_amount := v_reward.reward_value;

        WHEN 'discount_percent' THEN
            v_discount_amount := LEAST(
                (v_order_total * v_reward.reward_value / 100),
                COALESCE(v_reward.reward_max_value, v_order_total)
            );

        WHEN 'free_item' THEN
            v_free_item_id := v_reward.reward_menu_item_id;
            IF v_free_item_id IS NULL THEN
                RETURN jsonb_build_object('error', 'Free item reward missing menu item reference');
            END IF;
            -- Look up the item price from the order
            SELECT oi.unit_price INTO v_item_price
            FROM order_items oi
            WHERE oi.order_id = p_order_id AND oi.menu_item_id = v_free_item_id
            LIMIT 1;
            v_discount_amount := COALESCE(v_item_price, 0);

        WHEN 'free_category_item' THEN
            -- Find the cheapest qualifying category item on the order
            SELECT oi.unit_price, oi.menu_item_id INTO v_item_price, v_free_item_id
            FROM order_items oi
            LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
            WHERE oi.order_id = p_order_id
              AND mi.category_id = v_reward.reward_category_id
            ORDER BY oi.unit_price ASC
            LIMIT 1;
            v_discount_amount := COALESCE(v_item_price, 0);

        ELSE
            RETURN jsonb_build_object('error', 'Unsupported reward type');
    END CASE;

    -- Mark reward as redeemed
    UPDATE loyalty_rewards
    SET
        status = 'redeemed',
        redeemed_at = now(),
        redeemed_order_id = p_order_id,
        redeemed_location_id = p_location_id
    WHERE id = p_reward_id;

    -- Update enrollment totals
    UPDATE loyalty_enrollments
    SET
        total_rewards_redeemed = total_rewards_redeemed + 1,
        total_reward_value = total_reward_value + v_discount_amount,
        last_redeem_at = now(),
        updated_at = now()
    WHERE id = v_reward.enrollment_id;

    -- Log transaction
    INSERT INTO loyalty_transactions (
        enrollment_id, customer_id, program_id, merchant_id,
        order_id, location_id, transaction_type,
        points_delta, balance_points, punches_delta, balance_punches,
        visits_delta, balance_visits, description, reward_id
    ) VALUES (
        v_reward.enrollment_id, v_reward.customer_id, v_reward.program_id, v_reward.merchant_id,
        p_order_id, p_location_id, 'redeem',
        0, v_enrollment.current_points,
        0, v_enrollment.current_punches,
        0, v_enrollment.current_visits,
        'Redeemed: ' || v_reward.reward_description,
        p_reward_id
    );

    -- Return discount details → feeds into order_discounts with source = 'loyalty'
    v_discount := jsonb_build_object(
        'discount_type', CASE v_reward.reward_type
            WHEN 'discount_fixed' THEN 'fixed_amount'
            WHEN 'discount_percent' THEN 'percentage'
            WHEN 'free_item' THEN 'free_item'
            WHEN 'free_category_item' THEN 'free_item'
        END,
        'discount_amount', v_discount_amount,
        'discount_name', v_reward.reward_description,
        'source', 'loyalty',
        'free_item_id', v_free_item_id
    );

    RETURN v_discount;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.loyalty_void_order_earnings(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_tx RECORD;
    v_enrollment RECORD;
    v_reward RECORD;
    v_threshold_tx RECORD;
BEGIN
    FOR v_tx IN
        SELECT *
        FROM loyalty_transactions
        WHERE order_id = p_order_id
          AND transaction_type IN ('earn_points', 'earn_visit', 'earn_punch')
    LOOP
        -- Fetch current enrollment state
        SELECT * INTO v_enrollment FROM loyalty_enrollments WHERE id = v_tx.enrollment_id;

        -- Reverse balances
        UPDATE loyalty_enrollments
        SET
            current_points = current_points - COALESCE(v_tx.points_delta, 0),
            lifetime_points = lifetime_points - COALESCE(v_tx.points_delta, 0),
            current_visits = current_visits - COALESCE(v_tx.visits_delta, 0),
            lifetime_visits = lifetime_visits - COALESCE(v_tx.visits_delta, 0),
            current_punches = current_punches - COALESCE(v_tx.punches_delta, 0),
            lifetime_punches = lifetime_punches - COALESCE(v_tx.punches_delta, 0),
            updated_at = now()
        WHERE id = v_tx.enrollment_id;

        -- Log void transaction
        INSERT INTO loyalty_transactions (
            enrollment_id, customer_id, program_id, merchant_id,
            order_id, transaction_type,
            points_delta, punches_delta, visits_delta,
            balance_points, balance_punches, balance_visits,
            description
        ) VALUES (
            v_tx.enrollment_id, v_tx.customer_id, v_tx.program_id, v_tx.merchant_id,
            p_order_id, 'void',
            -COALESCE(v_tx.points_delta, 0),
            -COALESCE(v_tx.punches_delta, 0),
            -COALESCE(v_tx.visits_delta, 0),
            v_enrollment.current_points - COALESCE(v_tx.points_delta, 0),
            v_enrollment.current_punches - COALESCE(v_tx.punches_delta, 0),
            v_enrollment.current_visits - COALESCE(v_tx.visits_delta, 0),
            'Voided earnings from order ' || p_order_id
        );

        -- Void any unredeemed rewards linked via threshold_crossed transactions for this order
        FOR v_threshold_tx IN
            SELECT *
            FROM loyalty_transactions
            WHERE order_id = p_order_id
              AND enrollment_id = v_tx.enrollment_id
              AND transaction_type = 'threshold_crossed'
              AND reward_id IS NOT NULL
        LOOP
            -- Check reward status before voiding
            SELECT * INTO v_reward FROM loyalty_rewards WHERE id = v_threshold_tx.reward_id;

            IF v_reward.status = 'available' THEN
                -- Safe to void — not yet redeemed
                UPDATE loyalty_rewards
                SET status = 'voided', voided_at = now(), voided_reason = 'Order voided'
                WHERE id = v_reward.id;

                -- Decrement total_rewards_earned
                UPDATE loyalty_enrollments
                SET total_rewards_earned = GREATEST(total_rewards_earned - 1, 0)
                WHERE id = v_tx.enrollment_id;
            ELSIF v_reward.status = 'redeemed' THEN
                -- Already redeemed → flag for manager review, do NOT auto-claw-back
                UPDATE loyalty_rewards
                SET voided_reason = 'REVIEW: Order voided but reward was already redeemed'
                WHERE id = v_reward.id;
            END IF;
        END LOOP;
    END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.merge_customers(p_primary_id uuid, p_duplicate_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_merchant_id uuid;
  v_primary_name text;
  v_new_spend numeric := 0;
  v_new_visits bigint := 0;
  v_new_last_visit timestamptz;
  v_new_total_orders bigint := 0;
  v_merged_tags text[];
  v_duplicate_count int;
BEGIN

  -- =====================================
  -- 1️⃣ Basic Input Validation
  -- =====================================

  IF p_duplicate_ids IS NULL 
     OR array_length(p_duplicate_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No duplicate IDs provided'
    );
  END IF;

  IF p_primary_id = ANY(p_duplicate_ids) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Primary ID cannot be included in duplicate IDs'
    );
  END IF;

  -- =====================================
  -- 2️⃣ Lock Primary Customer Row
  -- =====================================

  SELECT merchant_id, name
  INTO v_merchant_id, v_primary_name
  FROM customers
  WHERE id = p_primary_id
  FOR UPDATE;

  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Primary customer not found'
    );
  END IF;

  -- =====================================
  -- 3️⃣ Validate + Lock Duplicate Rows
  -- =====================================

  SELECT COUNT(*)
  INTO v_duplicate_count
  FROM customers
  WHERE id = ANY(p_duplicate_ids)
    AND merchant_id = v_merchant_id
  FOR UPDATE;

  IF v_duplicate_count <> array_length(p_duplicate_ids, 1) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'One or more duplicate IDs invalid or cross-merchant'
    );
  END IF;

  -- =====================================
  -- 4️⃣ Aggregate Duplicate Totals
  -- =====================================

  SELECT
    COALESCE(SUM(lifetime_spend), 0),
    COALESCE(SUM(visits), 0),
    MAX(last_visit),
    COALESCE(SUM(total_orders), 0)
  INTO
    v_new_spend,
    v_new_visits,
    v_new_last_visit,
    v_new_total_orders
  FROM customers
  WHERE id = ANY(p_duplicate_ids)
    AND merchant_id = v_merchant_id;

  -- =====================================
  -- 5️⃣ Merge Tags (Set Union)
  -- =====================================

  SELECT array_agg(DISTINCT tag)
  INTO v_merged_tags
  FROM (
    SELECT unnest(tags) AS tag
    FROM customers
    WHERE (id = p_primary_id OR id = ANY(p_duplicate_ids))
      AND merchant_id = v_merchant_id
      AND tags IS NOT NULL
  ) t
  WHERE tag IS NOT NULL;

  -- =====================================
  -- 6️⃣ Reassign Orders
  -- =====================================

  UPDATE orders
  SET customer_id = p_primary_id,
      updated_at = NOW()
  WHERE customer_id = ANY(p_duplicate_ids)
    AND merchant_id = v_merchant_id;

  -- =====================================
  -- 7️⃣ Reassign Customer Activities
  -- =====================================

  UPDATE customer_activities
  SET customer_id = p_primary_id,
      updated_at = NOW()
  WHERE customer_id = ANY(p_duplicate_ids)
    AND merchant_id = v_merchant_id;

  -- =====================================
  -- 8️⃣ Update Primary Customer
  -- =====================================

  UPDATE customers
  SET
    lifetime_spend = lifetime_spend + v_new_spend,
    visits = visits + v_new_visits,
    last_visit = CASE
      WHEN v_new_last_visit IS NOT NULL
           AND (last_visit IS NULL OR v_new_last_visit > last_visit)
      THEN v_new_last_visit
      ELSE last_visit
    END,
    tags = COALESCE(v_merged_tags, tags),
    total_orders = total_orders + v_new_total_orders,
    updated_at = NOW()
  WHERE id = p_primary_id
    AND merchant_id = v_merchant_id;

  -- =====================================
  -- 9️⃣ Delete Duplicate Customers
  -- =====================================

  DELETE FROM customers
  WHERE id = ANY(p_duplicate_ids)
    AND merchant_id = v_merchant_id;

  -- =====================================
  -- 10️⃣ Success Response
  -- =====================================

  RETURN jsonb_build_object(
    'success', true,
    'primary_id', p_primary_id,
    'primary_name', v_primary_name,
    'merged_count', v_duplicate_count,
    'merged_ids', p_duplicate_ids,
    'combined_spend', v_new_spend,
    'combined_visits', v_new_visits
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_waitlist_party(p_waitlist_id uuid, p_notification_type text DEFAULT 'sms'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_entry    waitlist%ROWTYPE;
  v_location locations%ROWTYPE;
BEGIN
  SELECT * INTO v_entry FROM waitlist
  WHERE id = p_waitlist_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids())
    AND status = 'waiting';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Entry not found or not in waiting status');
  END IF;

  IF v_entry.notification_count >= 3 THEN
    RETURN json_build_object('success', false, 'error', 'max_notifications_reached');
  END IF;

  SELECT * INTO v_location FROM locations WHERE id = v_entry.location_id;

  RETURN json_build_object(
    'success', true,
    'phone', v_entry.phone,
    'party_name', v_entry.party_name,
    'store_name', COALESCE(v_location.name, 'Our Restaurant'),
    'notified_at', v_entry.notified_at,
    'notification_count', v_entry.notification_count,
    'last_notification_type', v_entry.last_notification_type,
    'notification_failures', v_entry.notification_failures,
    'action_required', 'send_sms',
    'message_template', 'Hi ' || v_entry.party_name || '! Your table at ' || COALESCE(v_location.name, 'Our Restaurant') || ' is ready. Please check in with the host within 10 minutes.'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_staff_login(p_location_id uuid, p_pin_code text)
 RETURNS TABLE(success boolean, staff_profile_id uuid, role_code text, first_name text, last_name text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_row RECORD;
BEGIN
  IF p_location_id IS NULL OR p_pin_code IS NULL OR p_pin_code = '' THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      'Missing location_id or pin_code'::TEXT;
    RETURN;
  END IF;

  FOR v_row IN
    SELECT
      lm.staff_profile_id,
      lm.role_code,
      COALESCE(lm.pin_plain, lm.pin_code) AS stored_plain_pin,
      COALESCE(lm.pin_hashed, CASE WHEN lm.pin_code IS NOT NULL AND lm.pin_code !~ '^\d{4,6}$' THEN lm.pin_code END) AS stored_hashed_pin,
      sp.first_name,
      sp.last_name
    FROM location_members lm
    JOIN staff_profiles sp ON sp.id = lm.staff_profile_id
    WHERE lm.location_id = p_location_id
      AND lm.is_active = true
      AND sp.is_active = true
      AND (
        lm.pin_plain IS NOT NULL
        OR lm.pin_hashed IS NOT NULL
        OR lm.pin_code IS NOT NULL
      )
  LOOP
    IF v_row.stored_plain_pin = p_pin_code
       OR (
         v_row.stored_hashed_pin LIKE '$2%'
         AND crypt(p_pin_code, v_row.stored_hashed_pin) = v_row.stored_hashed_pin
       ) THEN
      RETURN QUERY SELECT
        true,
        v_row.staff_profile_id,
        v_row.role_code,
        v_row.first_name,
        v_row.last_name,
        NULL::TEXT;
      RETURN;
    END IF;
  END LOOP;

  RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
    'Invalid PIN'::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_append_only_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_online_order(p_location_id uuid, p_provider text, p_provider_order_id text, p_provider_restaurant_id text DEFAULT NULL::text, p_external_reference text DEFAULT NULL::text, p_delivery_company text DEFAULT NULL::text, p_provider_metadata jsonb DEFAULT '{}'::jsonb, p_order_type_raw text DEFAULT 'DELIVERY'::text, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text, p_subtotal numeric DEFAULT 0, p_tax numeric DEFAULT 0, p_total numeric DEFAULT 0, p_gratuity numeric DEFAULT 0, p_surcharge numeric DEFAULT 0, p_delivery_charge numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_placed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ready_by timestamp with time zone DEFAULT NULL::timestamp with time zone, p_estimated_delivery timestamp with time zone DEFAULT NULL::timestamp with time zone, p_items jsonb DEFAULT '[]'::jsonb, p_delivery_address jsonb DEFAULT NULL::jsonb, p_order_notes text DEFAULT NULL::text, p_raw_payload jsonb DEFAULT NULL::jsonb, p_auto_accept boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$DECLARE
  v_merchant_id      UUID;
  v_order_id         UUID;
  v_order_number     TEXT;
  v_display_number   TEXT;
  v_payment_id       UUID;
  v_order_type       public.order_type;
  v_status           public.order_status;
  v_kitchen_status   TEXT;
  v_provider_enum    public.online_order_provider;

  v_item             JSONB;
  v_item_index       INTEGER := 0;
  v_item_count       INTEGER := 0;
  v_order_item_id    UUID;

  v_menu_item        RECORD;
  v_menu_item_found  BOOLEAN;

  v_item_tax_raw     NUMERIC;
  v_item_tax_floor   NUMERIC;
  v_tax_distributed  NUMERIC := 0;
  v_tax_remainders   NUMERIC[];
  v_tax_item_ids     UUID[];
  v_tax_floors       NUMERIC[];

  v_modifier         JSONB;
  v_default_tax_rate NUMERIC;
  v_warnings         JSONB := '[]'::JSONB;
BEGIN
  -- ========================================================================
  -- STEP 0: IDEMPOTENCY
  -- ========================================================================
  DECLARE
    v_existing_order_id UUID;
    v_existing_online_id UUID;
  BEGIN
    SELECT oo.order_id, oo.id
    INTO v_existing_order_id, v_existing_online_id
    FROM public.online_orders oo
    WHERE oo.provider = p_provider::public.online_order_provider
      AND oo.provider_order_id = p_provider_order_id;

    IF v_existing_order_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_existing_order_id,
        'online_order_id', v_existing_online_id,
        'duplicate', true,
        'message', 'Order already processed'
      );
    END IF;

    SELECT id INTO v_existing_order_id
    FROM public.orders
    WHERE external_id = p_provider || ':' || p_provider_order_id;

    IF v_existing_order_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_existing_order_id,
        'duplicate', true,
        'message', 'Order already processed (external_id match)'
      );
    END IF;
  END;

  -- ========================================================================
  -- STEP 1: RESOLVE MERCHANT
  -- ========================================================================
  SELECT merchant_id INTO v_merchant_id
  FROM public.locations
  WHERE id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  -- ========================================================================
  -- STEP 2: CAST PROVIDER ENUM
  -- ========================================================================
  BEGIN
    v_provider_enum := p_provider::public.online_order_provider;
  EXCEPTION WHEN invalid_text_representation THEN
    v_provider_enum := 'other'::public.online_order_provider;
    p_provider_metadata := p_provider_metadata || jsonb_build_object('original_provider', p_provider);
  END;

  -- ========================================================================
  -- STEP 3: MAP ORDER TYPE & STATUS
  -- ========================================================================
  v_order_type := CASE UPPER(p_order_type_raw)
    WHEN 'DELIVERY' THEN 'delivery'::public.order_type
    WHEN 'PICKUP'   THEN 'takeout'::public.order_type
    WHEN 'TAKEOUT'  THEN 'takeout'::public.order_type
    ELSE 'online'::public.order_type
  END;

  IF p_auto_accept THEN
    v_status := 'sent_to_kitchen'::public.order_status;
    v_kitchen_status := 'sent';
  ELSE
    v_status := 'pending'::public.order_status;
    v_kitchen_status := NULL;
  END IF;

  -- ========================================================================
  -- STEP 4: GET DEFAULT TAX RATE
  -- FIX: removed tax_category = 'default' filter — picks the first active rate
  --      for the location regardless of category name (handles 'standard',
  --      'default', 'food', or any custom name set in the dashboard).
  -- ========================================================================
  SELECT percentage INTO v_default_tax_rate
  FROM public.tax_rates
  WHERE location_id = p_location_id
    AND is_active = true
  ORDER BY
    CASE tax_category WHEN 'standard' THEN 0 WHEN 'default' THEN 1 ELSE 2 END,
    created_at ASC
  LIMIT 1;

  -- Self-healing tax: if the caller passed p_tax = 0 but we found a rate,
  -- recalculate tax and total so the stored record is always correct.
  IF v_default_tax_rate IS NOT NULL AND p_tax = 0 AND p_subtotal > 0 THEN
    p_tax   := ROUND(p_subtotal * (v_default_tax_rate / 100), 2);
    p_total := p_subtotal + p_tax + COALESCE(p_gratuity, 0)
                           + COALESCE(p_surcharge, 0)
                           + COALESCE(p_delivery_charge, 0)
                           - COALESCE(p_discount, 0);
  END IF;

  -- Infer rate from p_tax if still unknown (e.g. third-party providers)
  IF v_default_tax_rate IS NULL AND p_subtotal > 0 AND p_tax > 0 THEN
    v_default_tax_rate := ROUND((p_tax / p_subtotal) * 100, 4);
  END IF;

  -- ========================================================================
  -- STEP 5: GENERATE ORDER NUMBER
  -- ========================================================================
  -- Generate order number (per-station when station_id provided)
  v_order_number := public.generate_order_number(p_location_id);

  -- Generate display number (handles both 3-segment and 4-segment formats)
  v_display_number := CASE
    WHEN SPLIT_PART(v_order_number, '-', 4) <> ''
    THEN '#' || SPLIT_PART(v_order_number, '-', 3) || '-' || SPLIT_PART(v_order_number, '-', 4)
    ELSE '#' || SPLIT_PART(v_order_number, '-', 3)
  END;
  
  -- ========================================================================
  -- STEP 6: INSERT ORDER
  -- ========================================================================
  INSERT INTO public.orders (
    merchant_id, location_id, order_number, display_number,
    order_type, status, payment_status,
    customer_name, customer_phone, customer_email, delivery_address,
    subtotal, tax_amount, total_amount, tip_amount, service_charge, discount_amount,
    amount_due, amount_paid,
    card_subtotal, card_tax_amount, card_total,
    cash_subtotal, cash_tax_amount, cash_total,
    effective_subtotal, effective_tax_amount, effective_total,
    external_id, estimated_delivery_time, special_instructions,
    sent_to_kitchen_at, metadata, created_at, updated_at,
    order_source
  ) VALUES (
    v_merchant_id, p_location_id, v_order_number, v_display_number,
    v_order_type, v_status, 'paid'::public.payment_status,
    p_customer_name, p_customer_phone, p_customer_email, p_delivery_address,
    p_subtotal, p_tax, p_total, COALESCE(p_gratuity, 0), COALESCE(p_surcharge, 0), COALESCE(p_discount, 0),
    0, p_total,
    p_subtotal, p_tax, p_total,
    p_subtotal, p_tax, p_total,
    p_subtotal, p_tax, p_total,
    p_provider || ':' || p_provider_order_id,
    COALESCE(p_estimated_delivery, p_ready_by),
    p_order_notes,
    CASE WHEN p_auto_accept THEN NOW() ELSE NULL END,
    jsonb_build_object(
      'source', 'online_order', 'provider', p_provider,
      'delivery_company', p_delivery_company, 'provider_order_id', p_provider_order_id,
      'external_reference', p_external_reference, 'placed_at', p_placed_at,
      'ready_by', p_ready_by, 'auto_accepted', p_auto_accept
    ),
    NOW(), NOW(),
    'online'
  )
  RETURNING id INTO v_order_id;

  -- ========================================================================
  -- STEP 7: INSERT ORDER ITEMS
  -- ========================================================================
  v_tax_remainders := ARRAY[]::NUMERIC[];
  v_tax_item_ids   := ARRAY[]::UUID[];
  v_tax_floors     := ARRAY[]::NUMERIC[];

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_index := v_item_index + 1;
    v_menu_item_found := FALSE;

    IF v_item->>'external_id' IS NOT NULL AND v_item->>'external_id' != '' THEN
      BEGIN
        SELECT mi.id, mi.name, mi.price, mi.is_tax_exempt,
               ci.category_id AS cat_id, c.name AS cat_name
        INTO v_menu_item
        FROM public.menu_items mi
        LEFT JOIN public.category_items ci ON ci.menu_item_id = mi.id
        LEFT JOIN public.categories c ON c.id = ci.category_id
        WHERE mi.id = (v_item->>'external_id')::UUID
          AND mi.merchant_id = v_merchant_id
        LIMIT 1;

        IF FOUND THEN v_menu_item_found := TRUE; END IF;
      EXCEPTION WHEN invalid_text_representation THEN NULL;
      END;
    END IF;

    DECLARE
      v_item_unit_price    NUMERIC;
      v_item_qty           INTEGER;
      v_item_subtotal      NUMERIC;
      v_item_name          TEXT;
      v_item_menu_id       UUID;
      v_item_cat_id        UUID;
      v_item_cat_name      TEXT;
      v_item_is_open       BOOLEAN;
      v_item_is_tax_exempt BOOLEAN;
    BEGIN
      v_item_qty        := COALESCE((v_item->>'quantity')::INTEGER, 1);
      v_item_unit_price := COALESCE((v_item->>'price')::NUMERIC, 0);
      v_item_subtotal   := COALESCE((v_item->>'total')::NUMERIC, 0);
      v_item_name       := v_item->>'name';

      IF v_menu_item_found THEN
        v_item_menu_id       := v_menu_item.id;
        v_item_cat_id        := v_menu_item.cat_id;
        v_item_cat_name      := v_menu_item.cat_name;
        v_item_is_open       := FALSE;
        v_item_is_tax_exempt := COALESCE(v_menu_item.is_tax_exempt, FALSE);
      ELSE
        v_item_menu_id       := NULL;
        v_item_cat_id        := NULL;
        v_item_cat_name      := NULL;
        v_item_is_open       := TRUE;
        v_item_is_tax_exempt := FALSE;
        v_warnings := v_warnings || jsonb_build_object(
          'type', 'menu_item_not_found',
          'external_id', v_item->>'external_id',
          'item_name', v_item_name,
          'message', 'Menu item not found in POS — inserted as open item'
        );
      END IF;

      IF p_subtotal > 0 AND NOT v_item_is_tax_exempt THEN
        v_item_tax_raw   := p_tax * (v_item_subtotal / p_subtotal);
        v_item_tax_floor := TRUNC(v_item_tax_raw, 2);
      ELSE
        v_item_tax_raw   := 0;
        v_item_tax_floor := 0;
      END IF;

      INSERT INTO public.order_items (
        order_id, menu_item_id, item_name, quantity, unit_price, subtotal,
        tax_amount, tax_rate, category_id, category_name,
        item_status, kitchen_status, sent_to_kitchen_at, display_order,
        special_instructions, is_open_item, is_tax_exempt,
        open_item_name, open_item_price,
        base_card_price, base_cash_price, cash_price, cash_unit_price,
        cash_subtotal, cash_tax_amount, metadata, created_at, updated_at
      ) VALUES (
        v_order_id, v_item_menu_id, v_item_name, v_item_qty, v_item_unit_price, v_item_subtotal,
        v_item_tax_floor, v_default_tax_rate, v_item_cat_id, v_item_cat_name,
        CASE WHEN p_auto_accept THEN 'sent' ELSE 'pending' END,
        v_kitchen_status,
        CASE WHEN p_auto_accept THEN NOW() ELSE NULL END,
        v_item_index,
        v_item->>'note', v_item_is_open, v_item_is_tax_exempt,
        CASE WHEN v_item_is_open THEN v_item_name ELSE NULL END,
        CASE WHEN v_item_is_open THEN v_item_unit_price ELSE NULL END,
        v_item_unit_price, v_item_unit_price, v_item_unit_price, v_item_unit_price,
        v_item_subtotal, v_item_tax_floor,
        jsonb_build_object(
          'source', 'online_order', 'provider', p_provider,
          'provider_item_id', v_item->>'id',
          'provider_external_id', v_item->>'external_id',
          'menu_item_matched', v_menu_item_found
        ),
        NOW(), NOW()
      )
      RETURNING id INTO v_order_item_id;

      v_tax_distributed := v_tax_distributed + v_item_tax_floor;
      v_tax_remainders  := array_append(v_tax_remainders, v_item_tax_raw - v_item_tax_floor);
      v_tax_item_ids    := array_append(v_tax_item_ids, v_order_item_id);
      v_tax_floors      := array_append(v_tax_floors, v_item_tax_floor);
      v_item_count      := v_item_count + 1;

      IF v_item->'modifiers' IS NOT NULL AND jsonb_array_length(v_item->'modifiers') > 0 THEN
        FOR v_modifier IN SELECT * FROM jsonb_array_elements(v_item->'modifiers')
        LOOP
          DECLARE
            v_mod_price NUMERIC;
            v_mod_qty   INTEGER;
          BEGIN
            v_mod_price := COALESCE((v_modifier->>'price')::NUMERIC, 0);
            v_mod_qty   := COALESCE((v_modifier->>'quantity')::INTEGER, 1);
            INSERT INTO public.order_item_modifiers (
              order_item_id, modifier_group_name, modifier_name,
              price_modifier, quantity, total_price, metadata
            ) VALUES (
              v_order_item_id,
              COALESCE(v_modifier->>'group_name', 'Modifier'),
              COALESCE(v_modifier->>'name', 'Unknown Modifier'),
              v_mod_price, v_mod_qty, v_mod_price * v_mod_qty,
              jsonb_build_object(
                'source', 'online_order', 'provider', p_provider,
                'provider_modifier_id', v_modifier->>'id'
              )
            );
          END;
        END LOOP;
      END IF;
    END;
  END LOOP;

  -- ========================================================================
  -- STEP 8: TAX REMAINDER DISTRIBUTION (Largest Remainder Method)
  -- ========================================================================
  DECLARE
    v_tax_deficit NUMERIC;
    v_penny_count INTEGER;
    v_num_items   INTEGER;
    i             INTEGER;
    j             INTEGER;
    v_max_rem     NUMERIC;
    v_max_idx     INTEGER;
    v_tmp_rem     NUMERIC;
    v_tmp_id      UUID;
    v_tmp_floor   NUMERIC;
  BEGIN
    v_tax_deficit := ROUND(p_tax - v_tax_distributed, 2);
    v_penny_count := ROUND(v_tax_deficit * 100)::INTEGER;
    v_num_items   := COALESCE(array_length(v_tax_remainders, 1), 0);

    IF v_penny_count > 0 AND v_num_items > 0 THEN
      FOR i IN 1..v_num_items LOOP
        v_max_rem := v_tax_remainders[i];
        v_max_idx := i;
        FOR j IN (i+1)..v_num_items LOOP
          IF v_tax_remainders[j] > v_max_rem THEN
            v_max_rem := v_tax_remainders[j];
            v_max_idx := j;
          END IF;
        END LOOP;
        IF v_max_idx != i THEN
          v_tmp_rem := v_tax_remainders[i];
          v_tax_remainders[i] := v_tax_remainders[v_max_idx];
          v_tax_remainders[v_max_idx] := v_tmp_rem;
          v_tmp_id := v_tax_item_ids[i];
          v_tax_item_ids[i] := v_tax_item_ids[v_max_idx];
          v_tax_item_ids[v_max_idx] := v_tmp_id;
          v_tmp_floor := v_tax_floors[i];
          v_tax_floors[i] := v_tax_floors[v_max_idx];
          v_tax_floors[v_max_idx] := v_tmp_floor;
        END IF;
      END LOOP;

      FOR i IN 1..LEAST(v_penny_count, v_num_items) LOOP
        UPDATE public.order_items
        SET tax_amount      = v_tax_floors[i] + 0.01,
            cash_tax_amount = v_tax_floors[i] + 0.01
        WHERE id = v_tax_item_ids[i];
      END LOOP;
    END IF;
  END;

  -- ========================================================================
  -- STEP 9: INSERT ORDER PAYMENT
  -- ========================================================================
  INSERT INTO public.order_payments (
    order_id, payment_method, status, amount, total_amount,
    subtotal_portion, tax_portion, tip_amount, terminal_type,
    is_cash_priced, cash_discount_applied, captured_at,
    location_id, merchant_id, metadata
  ) VALUES (
    v_order_id, 'external'::public.payment_method, 'paid'::public.payment_status,
    p_total, p_total + COALESCE(p_gratuity, 0),
    p_subtotal, p_tax, COALESCE(p_gratuity, 0),
    'none'::public.terminal_type, FALSE, FALSE, NOW(),
    p_location_id, v_merchant_id,
    jsonb_build_object(
      'source', 'online_order', 'provider', p_provider,
      'delivery_company', p_delivery_company,
      'provider_order_id', p_provider_order_id,
      'external_reference', p_external_reference,
      'payment_status_from_source', 'PAID'
    )
  )
  RETURNING id INTO v_payment_id;

  -- ========================================================================
  -- STEP 10: INSERT ORDER PAYMENT ITEMS
  -- ========================================================================
  INSERT INTO public.order_payment_items (
    order_payment_id, order_item_id, quantity_paid,
    unit_price_paid, subtotal_paid, tax_paid
  )
  SELECT v_payment_id, oi.id, oi.quantity, oi.unit_price, oi.subtotal, oi.tax_amount
  FROM public.order_items oi
  WHERE oi.order_id = v_order_id;

  -- ========================================================================
  -- STEP 11: ORDER STATUS HISTORY
  -- ========================================================================
  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, notes, metadata
  ) VALUES (
    v_order_id, NULL, v_status,
    'Online order — ' || COALESCE(p_delivery_company, p_provider),
    jsonb_build_object(
      'source', 'online_order', 'provider', p_provider,
      'delivery_company', p_delivery_company,
      'auto_accepted', p_auto_accept,
      'provider_order_id', p_provider_order_id
    )
  );

  -- ========================================================================
  -- STEP 12: INSERT ONLINE_ORDERS LINK RECORD
  -- ========================================================================
  INSERT INTO public.online_orders (
    order_id, location_id, merchant_id, provider, provider_order_id,
    provider_restaurant_id, external_reference, delivery_company,
    placed_at, ready_by, estimated_delivery,
    provider_metadata, raw_payload, provider_status
  ) VALUES (
    v_order_id, p_location_id, v_merchant_id, v_provider_enum, p_provider_order_id,
    p_provider_restaurant_id, p_external_reference, p_delivery_company,
    p_placed_at, p_ready_by, p_estimated_delivery,
    p_provider_metadata, p_raw_payload,
    CASE WHEN p_auto_accept THEN 'confirmed' ELSE 'received' END
  );

  -- ========================================================================
  -- STEP 13: AUDIT LOG
  -- ========================================================================
  INSERT INTO public.audit_logs (
    actor_user_id, actor_name, organization_id,
    action, action_category, resource_type, resource_name,
    metadata, status
  ) VALUES (
    NULL, 'system',
    (SELECT clerk_org_id FROM public.merchants WHERE id = v_merchant_id),
    'online_order_created', 'order_management', 'order', v_order_number,
    jsonb_build_object(
      'order_id', v_order_id, 'order_type', v_order_type,
      'provider', p_provider, 'delivery_company', p_delivery_company,
      'provider_order_id', p_provider_order_id, 'auto_accepted', p_auto_accept,
      'item_count', v_item_count, 'total', p_total, 'tax', p_tax,
      'warnings', v_warnings
    ),
    'success'
  );

  -- ========================================================================
  -- RETURN
  -- ========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'display_number', v_display_number,
    'status', v_status,
    'payment_status', 'paid',
    'item_count', v_item_count,
    'total', p_total,
    'tax', p_tax,
    'auto_accepted', p_auto_accept,
    'provider', p_provider,
    'warnings', v_warnings
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_detail', SQLSTATE,
    'provider', p_provider,
    'provider_order_id', p_provider_order_id
  );
END;$function$
;

CREATE OR REPLACE FUNCTION public.record_waitlist_sms_result(p_waitlist_id uuid, p_success boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT p_success THEN
    UPDATE waitlist
    SET notification_failures = notification_failures + 1
    WHERE id = p_waitlist_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_waitlist_sms_result(p_waitlist_id uuid, p_success boolean, p_notification_type text DEFAULT 'sms'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF p_success THEN
    UPDATE waitlist
    SET
      status = 'notified',
      notified_at = NOW(),
      notification_count = notification_count + 1,
      last_notification_type = p_notification_type
    WHERE id = p_waitlist_id;
  ELSE
    UPDATE waitlist
    SET
      notification_count = notification_count + 1,
      notification_failures = notification_failures + 1,
      last_notification_type = p_notification_type
    WHERE id = p_waitlist_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_category_from_menu(p_menu_id uuid, p_category_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    DELETE FROM menu_categories
    WHERE menu_id = p_menu_id AND category_id = p_category_id;
    
    -- Also clean up location overrides
    DELETE FROM location_menu_category_overrides
    WHERE menu_id = p_menu_id AND category_id = p_category_id;
    
    RETURN json_build_object(
        'success', true,
        'menu_id', p_menu_id,
        'category_id', p_category_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_item_from_category(p_category_id uuid, p_menu_item_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Remove the item from category
    DELETE FROM category_items
    WHERE category_id = p_category_id AND menu_item_id = p_menu_item_id;
    
    -- Also clean up any location overrides for this category+item
    DELETE FROM location_category_item_overrides
    WHERE category_id = p_category_id AND menu_item_id = p_menu_item_id;
    
    RETURN json_build_object(
        'success', true,
        'category_id', p_category_id,
        'menu_item_id', p_menu_item_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resend_waitlist_notification(p_waitlist_id uuid, p_notification_type text DEFAULT 'sms'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_entry    waitlist%ROWTYPE;
  v_location locations%ROWTYPE;
BEGIN
  SELECT * INTO v_entry FROM waitlist
  WHERE id = p_waitlist_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids())
    AND status IN ('waiting', 'notified', 'arrived');

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Entry not found');
  END IF;

  IF v_entry.notification_count >= 3 THEN
    RETURN json_build_object('success', false, 'error', 'max_notifications_reached');
  END IF;

  SELECT * INTO v_location FROM locations WHERE id = v_entry.location_id;

  RETURN json_build_object(
    'success', true,
    'phone', v_entry.phone,
    'party_name', v_entry.party_name,
    'store_name', COALESCE(v_location.name, 'Our Restaurant'),
    'notified_at', v_entry.notified_at,
    'notification_count', v_entry.notification_count,
    'last_notification_type', v_entry.last_notification_type,
    'notification_failures', v_entry.notification_failures,
    'action_required', 'send_sms',
    'message_template', 'Hi ' || v_entry.party_name || '! Your table at ' || COALESCE(v_location.name, 'Our Restaurant') || ' is ready. Please check in with the host within 10 minutes.'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_category_item_to_level(p_menu_item_id uuid, p_category_id uuid DEFAULT NULL::uuid, p_menu_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_target_level integer DEFAULT 1)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_deleted_levels TEXT[] := '{}';
BEGIN
    -- Reset Level 5 (location + menu + category)
    IF p_target_level < 5 AND p_location_id IS NOT NULL AND p_menu_id IS NOT NULL THEN
        DELETE FROM location_menu_item_overrides
        WHERE location_id = p_location_id 
          AND menu_id = p_menu_id 
          AND menu_item_id = p_menu_item_id
          AND (p_category_id IS NULL OR category_id = p_category_id);
        
        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_5_location_menu');
        END IF;
    END IF;
    
    -- Reset Level 4 (location + category)
    IF p_target_level < 4 AND p_location_id IS NOT NULL AND p_category_id IS NOT NULL THEN
        DELETE FROM location_category_item_overrides
        WHERE location_id = p_location_id 
          AND category_id = p_category_id 
          AND menu_item_id = p_menu_item_id;
        
        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_4_location_category');
        END IF;
    END IF;
    
    -- Reset Level 3 (category price) - only if merchant admin
    IF p_target_level < 3 AND p_location_id IS NULL AND p_category_id IS NOT NULL THEN
        UPDATE category_items
        SET custom_price = NULL, custom_cash_price = NULL, updated_at = NOW()
        WHERE category_id = p_category_id AND menu_item_id = p_menu_item_id;
        
        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_3_category');
        END IF;
    END IF;
    
    -- Reset Level 2 (location item)
    IF p_target_level < 2 AND p_location_id IS NOT NULL THEN
        DELETE FROM location_item_overrides
        WHERE location_id = p_location_id AND menu_item_id = p_menu_item_id;
        
        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_2_location_item');
        END IF;
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'target_level', p_target_level,
        'deleted_overrides', v_deleted_levels
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.safe_jsonb_int(p_value jsonb, p_default integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_text TEXT;
  v_int  INTEGER;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::JSONB THEN
    RETURN p_default;
  END IF;

  v_text := p_value #>> '{}';   -- extract scalar as text (handles both string and number JSON types)

  IF v_text IS NULL OR v_text = '' THEN
    RETURN p_default;
  END IF;

  -- Only allow digits (optionally negative)
  IF v_text !~ '^-?[0-9]+$' THEN
    RETURN p_default;
  END IF;

  BEGIN
    v_int := v_text::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    RETURN p_default;
  END;

  RETURN COALESCE(v_int, p_default);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_cfd_ordering_panel_images_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_location_ein_last_four()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_digits text;
BEGIN
  -- If app provides a plain EIN pattern, derive last-4 automatically.
  -- If app stores encrypted/tokenized value in ein, this will not overwrite
  -- an explicit ein_last_four set by the app.
  IF NEW.ein IS NOT NULL THEN
    v_digits := regexp_replace(NEW.ein, '[^0-9]', '', 'g');
    IF length(v_digits) = 9 THEN
      NEW.ein_last_four := right(v_digits, 4);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_inventory_count(p_count_id uuid, p_counted_items jsonb, p_user_id text, p_user_name text, p_apply_adjustments boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_location_id           UUID;
    v_merchant_id           UUID;
    v_count_status          TEXT;
    v_item                  JSONB;
    v_inventory_item_id     UUID;
    v_counted_qty           NUMERIC;
    v_expected_qty          NUMERIC;
    v_variance              NUMERIC;
    v_cost_per_unit         NUMERIC;
    v_variance_cost         NUMERIC;
    v_total_variance_cost   NUMERIC  := 0;
    v_items_counted         INTEGER  := 0;
    v_adjustments_applied   INTEGER  := 0;
BEGIN
    -- Fetch count session metadata and validate status
    SELECT ic.location_id, ic.merchant_id, ic.status
    INTO   v_location_id, v_merchant_id, v_count_status
    FROM   inventory_counts ic
    WHERE  ic.id = p_count_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'count session not found');
    END IF;

    IF v_count_status IN ('completed', 'approved') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'count is already ' || v_count_status || ' and cannot be modified'
        );
    END IF;

    -- Mark as in_progress when first items are submitted
    IF v_count_status = 'draft' THEN
        UPDATE inventory_counts
        SET status     = 'in_progress',
            started_at = COALESCE(started_at, now()),
            updated_at = now()
        WHERE id = p_count_id;
    END IF;

    -- Process each submitted count item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_counted_items)
    LOOP
        v_inventory_item_id := (v_item->>'inventory_item_id')::UUID;
        v_counted_qty       := (v_item->>'counted_quantity')::NUMERIC;

        IF v_counted_qty IS NULL OR v_counted_qty < 0 THEN
            CONTINUE;
        END IF;

        -- Fetch expected_quantity from the count snapshot and item cost
        SELECT ici.expected_quantity, ii.cost_per_unit
        INTO   v_expected_qty, v_cost_per_unit
        FROM   inventory_count_items ici
        JOIN   inventory_items ii ON ii.id = ici.inventory_item_id
        WHERE  ici.count_id          = p_count_id
          AND  ici.inventory_item_id = v_inventory_item_id;

        IF NOT FOUND THEN
            -- Item wasn't part of this count's scope; skip silently
            CONTINUE;
        END IF;

        v_variance      := v_counted_qty - v_expected_qty;
        v_variance_cost := ROUND(v_variance * COALESCE(v_cost_per_unit, 0), 4);

        -- Write counted_quantity and variance_cost back to count item
        UPDATE inventory_count_items
        SET counted_quantity = v_counted_qty,
            variance_cost    = v_variance_cost
        WHERE count_id          = p_count_id
          AND inventory_item_id = v_inventory_item_id;

        v_total_variance_cost := v_total_variance_cost + v_variance_cost;
        v_items_counted := v_items_counted + 1;

        -- Optionally reconcile stock for items with a variance
        IF p_apply_adjustments AND v_variance <> 0 THEN
            PERFORM public.set_location_stock(v_inventory_item_id, v_location_id, v_counted_qty);

            INSERT INTO stock_update_log (
                merchant_id, location_id, inventory_item_id,
                previous_stock, new_stock, change_amount,
                update_reason, update_source,
                updated_by_user_id, updated_by_name
            ) VALUES (
                v_merchant_id, v_location_id, v_inventory_item_id,
                v_expected_qty, v_counted_qty, v_variance,
                'physical_count', 'adjustment',
                p_user_id, p_user_name
            );

            v_adjustments_applied := v_adjustments_applied + 1;
        END IF;
    END LOOP;

    -- Mark count as completed
    UPDATE inventory_counts
    SET status       = 'completed',
        completed_at = now(),
        updated_at   = now()
    WHERE id = p_count_id;

    RETURN jsonb_build_object(
        'success',              true,
        'items_counted',        v_items_counted,
        'total_variance_cost',  v_total_variance_cost,
        'adjustments_applied',  v_adjustments_applied
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_location_banking_profile_merchant_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_merchant_id uuid;
BEGIN
  SELECT l.merchant_id
    INTO v_merchant_id
  FROM public.locations l
  WHERE l.id = NEW.location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Invalid location_id % for location_banking_profiles', NEW.location_id;
  END IF;

  NEW.merchant_id := v_merchant_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_earn_on_order_completion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only trigger when status changes TO 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- Call the loyalty RPC function (ignore result, just execute)
    PERFORM loyalty_earn_on_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_void_loyalty_earnings()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$BEGIN
  -- Trigger when status changes TO 'voided' or 'refunded' (from any other status)
  IF NEW.status IN ('void', 'refunded') AND (OLD.status NOT IN ('void', 'refunded')) THEN
    -- Call the loyalty RPC function to reverse earnings (ignore result, just execute)
    PERFORM loyalty_void_order_earnings(NEW.id);
  END IF;
  RETURN NEW;
END;$function$
;

CREATE OR REPLACE FUNCTION public.update_merchant_notes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_ticket_status(p_ticket_id uuid, p_status text, p_resolution_notes text DEFAULT NULL::text, p_resolved_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.support_tickets
  SET
    status = p_status,
    updated_at = now(),
    resolved_at = CASE WHEN p_status = 'resolved' THEN now() ELSE resolved_at END,
    resolved_by = CASE WHEN p_status = 'resolved' AND p_resolved_by IS NOT NULL THEN p_resolved_by ELSE resolved_by END,
    resolution_notes = CASE WHEN p_resolution_notes IS NOT NULL THEN p_resolution_notes ELSE resolution_notes END
  WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_category_item_override(p_menu_item_id uuid, p_category_id uuid DEFAULT NULL::uuid, p_menu_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_custom_price numeric DEFAULT NULL::numeric, p_custom_cash_price numeric DEFAULT NULL::numeric, p_is_available boolean DEFAULT NULL::boolean, p_price_modifier numeric DEFAULT NULL::numeric, p_price_modifier_type text DEFAULT NULL::text, p_display_order integer DEFAULT NULL::integer, p_is_featured boolean DEFAULT NULL::boolean, p_stock_tracking_mode text DEFAULT NULL::text, p_current_stock integer DEFAULT NULL::integer, p_custom_delivery_price numeric DEFAULT NULL::numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_update_level INTEGER;
    v_update_table TEXT;
    v_is_empty BOOLEAN;
    v_menu_location_id UUID;
BEGIN
    -- ========================================================================
    -- SCENARIO A: No category context (Items Library - base item only)
    -- ========================================================================
    IF p_category_id IS NULL THEN
        
        IF p_location_id IS NULL THEN
            -- Level 1: Update base item
            v_update_level := 1;
            v_update_table := 'menu_items';
            
            UPDATE menu_items
            SET
                price = COALESCE(p_custom_price, price),
                cash_price = COALESCE(p_custom_cash_price, cash_price),
                availability = COALESCE(p_is_available, availability),
                stock_tracking_mode = COALESCE(p_stock_tracking_mode, stock_tracking_mode),
                delivery_price = COALESCE(p_custom_delivery_price, delivery_price),
                updated_at = NOW()
            WHERE id = p_menu_item_id;
            
        ELSE
            -- Level 2: Location item override
            v_update_level := 2;
            v_update_table := 'location_item_overrides';
            
            v_is_empty := (
                p_custom_price IS NULL AND
                p_custom_cash_price IS NULL AND
                p_custom_delivery_price IS NULL AND
                p_price_modifier IS NULL AND
                (p_is_available IS NULL OR p_is_available = true) AND
                p_stock_tracking_mode IS NULL AND
                p_current_stock IS NULL
            );

            IF v_is_empty THEN
                DELETE FROM location_item_overrides
                WHERE location_id = p_location_id AND menu_item_id = p_menu_item_id;

                RETURN json_build_object(
                    'success', true,
                    'action', 'deleted',
                    'level', v_update_level,
                    'table', v_update_table
                );
            ELSE
                INSERT INTO location_item_overrides (
                    location_id, menu_item_id,
                    custom_price, custom_cash_price, custom_delivery_price,
                    price_modifier, price_modifier_type,
                    is_available, stock_tracking_mode, current_stock,
                    created_at, updated_at
                ) VALUES (
                    p_location_id, p_menu_item_id,
                    p_custom_price, p_custom_cash_price, p_custom_delivery_price,
                    p_price_modifier, p_price_modifier_type,
                    p_is_available, p_stock_tracking_mode, p_current_stock,
                    NOW(), NOW()
                )
                ON CONFLICT (location_id, menu_item_id)
                DO UPDATE SET
                    custom_price = COALESCE(EXCLUDED.custom_price, location_item_overrides.custom_price),
                    custom_cash_price = COALESCE(EXCLUDED.custom_cash_price, location_item_overrides.custom_cash_price),
                    custom_delivery_price = COALESCE(EXCLUDED.custom_delivery_price, location_item_overrides.custom_delivery_price),
                    price_modifier = COALESCE(EXCLUDED.price_modifier, location_item_overrides.price_modifier),
                    price_modifier_type = COALESCE(EXCLUDED.price_modifier_type, location_item_overrides.price_modifier_type),
                    is_available = COALESCE(EXCLUDED.is_available, location_item_overrides.is_available),
                    stock_tracking_mode = COALESCE(EXCLUDED.stock_tracking_mode, location_item_overrides.stock_tracking_mode),
                    current_stock = COALESCE(EXCLUDED.current_stock, location_item_overrides.current_stock),
                    updated_at = NOW();
            END IF;
        END IF;
        
    -- ========================================================================
    -- SCENARIO B: Category context
    -- ========================================================================
    ELSE
        
        IF p_location_id IS NULL AND p_menu_id IS NULL THEN
            -- Level 3: Category item price (global)
            v_update_level := 3;
            v_update_table := 'category_items';
            
            UPDATE category_items
            SET
                custom_price = p_custom_price,
                custom_cash_price = p_custom_cash_price,
                custom_delivery_price = p_custom_delivery_price,
                is_available = COALESCE(p_is_available, is_available),
                display_order = COALESCE(p_display_order, display_order),
                is_featured = COALESCE(p_is_featured, is_featured),
                updated_at = NOW()
            WHERE category_id = p_category_id AND menu_item_id = p_menu_item_id;
            
        ELSIF p_location_id IS NOT NULL AND p_menu_id IS NULL THEN
            -- Level 4: Location + Category override
            v_update_level := 4;
            v_update_table := 'location_category_item_overrides';
            
            v_is_empty := (
                p_custom_price IS NULL AND
                p_custom_cash_price IS NULL AND
                p_custom_delivery_price IS NULL AND
                (p_is_available IS NULL OR p_is_available = true) AND
                p_display_order IS NULL AND
                p_is_featured IS NULL
            );

            IF v_is_empty THEN
                DELETE FROM location_category_item_overrides
                WHERE location_id = p_location_id
                  AND category_id = p_category_id
                  AND menu_item_id = p_menu_item_id;

                RETURN json_build_object(
                    'success', true,
                    'action', 'deleted',
                    'level', v_update_level,
                    'table', v_update_table
                );
            ELSE
                INSERT INTO location_category_item_overrides (
                    location_id, category_id, menu_item_id,
                    custom_price, custom_cash_price, custom_delivery_price, is_available,
                    display_order, is_featured,
                    created_at, updated_at
                ) VALUES (
                    p_location_id, p_category_id, p_menu_item_id,
                    p_custom_price, p_custom_cash_price, p_custom_delivery_price, p_is_available,
                    p_display_order, p_is_featured,
                    NOW(), NOW()
                )
                ON CONFLICT (location_id, category_id, menu_item_id)
                DO UPDATE SET
                    custom_price = EXCLUDED.custom_price,
                    custom_cash_price = EXCLUDED.custom_cash_price,
                    custom_delivery_price = EXCLUDED.custom_delivery_price,
                    is_available = EXCLUDED.is_available,
                    display_order = EXCLUDED.display_order,
                    is_featured = EXCLUDED.is_featured,
                    updated_at = NOW();
            END IF;
            
        ELSIF p_location_id IS NOT NULL AND p_menu_id IS NOT NULL THEN
            -- Level 5: Location + Menu + Category override
            v_update_level := 5;
            v_update_table := 'location_menu_item_overrides';
            
            -- Check if this is a location-owned menu
            SELECT location_id INTO v_menu_location_id FROM menus WHERE id = p_menu_id;
            
            IF v_menu_location_id IS NOT NULL THEN
                -- Location's own menu - they have full control
                RETURN json_build_object(
                    'success', false,
                    'error', 'Use category_items for location-owned menus'
                );
            END IF;
            
            v_is_empty := (
                p_custom_price IS NULL AND
                p_custom_cash_price IS NULL AND
                p_custom_delivery_price IS NULL AND
                (p_is_available IS NULL OR p_is_available = true)
            );

            IF v_is_empty THEN
                DELETE FROM location_menu_item_overrides
                WHERE location_id = p_location_id
                  AND menu_id = p_menu_id
                  AND category_id = p_category_id
                  AND menu_item_id = p_menu_item_id;

                RETURN json_build_object(
                    'success', true,
                    'action', 'deleted',
                    'level', v_update_level,
                    'table', v_update_table
                );
            ELSE
                INSERT INTO location_menu_item_overrides (
                    location_id, menu_id, category_id, menu_item_id,
                    custom_price, custom_cash_price, custom_delivery_price, is_available,
                    created_at, updated_at
                ) VALUES (
                    p_location_id, p_menu_id, p_category_id, p_menu_item_id,
                    p_custom_price, p_custom_cash_price, p_custom_delivery_price, COALESCE(p_is_available, true),
                    NOW(), NOW()
                )
                ON CONFLICT (location_id, menu_id, category_id, menu_item_id)
                DO UPDATE SET
                    custom_price = EXCLUDED.custom_price,
                    custom_cash_price = EXCLUDED.custom_cash_price,
                    custom_delivery_price = EXCLUDED.custom_delivery_price,
                    is_available = EXCLUDED.is_available,
                    updated_at = NOW();
            END IF;
        END IF;
    END IF;

    RETURN json_build_object(
        'success', true,
        'action', 'upserted',
        'level', v_update_level,
        'table', v_update_table,
        'menu_item_id', p_menu_item_id,
        'category_id', p_category_id,
        'menu_id', p_menu_id,
        'location_id', p_location_id
    );
END;
$function$
;


