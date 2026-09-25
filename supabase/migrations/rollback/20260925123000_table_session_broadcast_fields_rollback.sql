-- Rollback for 20260925123000_table_session_broadcast_fields.sql
-- Restores the baseline body from 20260413215901_remote_schema.sql. POS builds
-- with EXPO_PUBLIC_FLOOR_BROADCAST_APPLY=1 then fall back to reconciling.

CREATE OR REPLACE FUNCTION "public"."broadcast_table_session_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'public', 'pg_temp'
    AS $$DECLARE
  payload jsonb;
session_data jsonb;
v_topic text;
BEGIN
 -- Build the topic string
  v_topic := 'location:' || COALESCE(NEW.location_id, OLD.location_id)::text || ':tables';
-- Build enriched session payload with related data
  SELECT jsonb_build_object(
    'session', jsonb_build_object(
      'id', ts.id,
      'status', ts.status,
      'party_size', ts.party_size,
      'server_user_id', ts.server_user_id,
      'guest_name', ts.guest_name,
      'guest_phone', ts.guest_phone,
      'guest_notes', ts.guest_notes,
      'seated_at', ts.seated_at,
      'current_course', ts.current_course,
      'working_course', ts.working_course,
      'course_pacing', ts.course_pacing,
      'needs_attention', ts.needs_attention,
      'is_vip', ts.is_vip,
      'is_complaint', ts.is_complaint,
      'order_id', ts.order_id,
      'session_number', ts.session_number
    ),
    'tables', (
      SELECT jsonb_agg(jsonb_build_object(
        'table_id', tst.table_id,
        'is_primary', tst.is_primary,
        'table_label', fpo.label_override
      ))
      FROM public.table_session_tables tst
      LEFT JOIN public.floor_plan_objects fpo ON fpo.id = tst.table_id
      WHERE tst.session_id = COALESCE(NEW.id, OLD.id)
      AND tst.is_active = true
    )
    -- 'server', (
    --   SELECT jsonb_build_object(
    --     'user_id', m.user_id,
    --     'first_name', m.first_name,
    --     'last_name', m.last_name,
    --     'display_name', m.display_name
    --   )
    --   FROM public.members m
    --   WHERE m.user_id = COALESCE(NEW.server_user_id, OLD.server_user_id)
    --   LIMIT 1
    -- )
  ) INTO session_data
  FROM public.table_sessions ts
  WHERE ts.id = COALESCE(NEW.id, OLD.id);
-- Build final payload
  payload := jsonb_build_object(
    'operation', TG_OP,
    'timestamp', now(),
    'data', session_data
  );
-- Broadcast to location channel
  -- PERFORM realtime.send(
  --   jsonb_build_object(
  --     'topic', 'location:' || COALESCE(NEW.location_id, OLD.location_id)::text || ':tables',
  --     'event', TG_OP,
  --     'payload', payload,
  --     'private', true
  --   )
  -- );
  PERFORM realtime.send(
    payload,           -- payload (jsonb)
    TG_OP,             -- event (text) 
    v_topic,           -- topic (text)
    true               -- private (boolean)
  );
RETURN NULL;
END;
$$;
