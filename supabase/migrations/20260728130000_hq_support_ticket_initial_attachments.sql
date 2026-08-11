-- Add initial-message attachments to HQ-created support tickets.
-- The original nine-argument RPC remains as a compatibility wrapper.

CREATE OR REPLACE FUNCTION public.create_hq_support_ticket(
  p_location_id uuid,
  p_subject text,
  p_description text,
  p_category text,
  p_submitted_by text,
  p_submitted_by_name text,
  p_submitted_by_email text DEFAULT NULL,
  p_priority text DEFAULT 'normal',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ticket_id uuid;
  v_ticket_number text;
  v_merchant_id uuid;
  v_carrier_id uuid;
  v_message_id uuid;
  v_attachment jsonb;
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
BEGIN
  IF nullif(btrim(p_subject), '') IS NULL THEN
    RAISE EXCEPTION 'Subject is required';
  END IF;

  IF nullif(btrim(p_description), '') IS NULL THEN
    RAISE EXCEPTION 'Description is required';
  END IF;

  IF p_category IS NULL OR p_category <> ALL (
    ARRAY[
      'general', 'billing', 'hardware', 'pos_app', 'menu', 'payments',
      'kitchen', 'feature_request', 'onboarding'
    ]
  ) THEN
    RAISE EXCEPTION 'Invalid support ticket category';
  END IF;

  IF p_priority IS NULL OR
     p_priority <> ALL (ARRAY['low', 'normal', 'high', 'urgent']) THEN
    RAISE EXCEPTION 'Invalid support ticket priority';
  END IF;

  IF jsonb_typeof(v_attachments) <> 'array' THEN
    RAISE EXCEPTION 'Attachments must be a JSON array';
  END IF;

  IF jsonb_array_length(v_attachments) > 3 THEN
    RAISE EXCEPTION 'A maximum of 3 attachments is allowed';
  END IF;

  SELECT l.merchant_id, m.carrier_id
    INTO v_merchant_id, v_carrier_id
  FROM public.locations l
  JOIN public.merchants m ON m.id = l.merchant_id
  WHERE l.id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Configured DEXA HQ support location was not found';
  END IF;

  v_ticket_number :=
    'DEXA-' || lpad(nextval('public.support_ticket_seq')::text, 5, '0');

  INSERT INTO public.support_tickets (
    ticket_number,
    merchant_id,
    location_id,
    submitted_by,
    submitted_by_name,
    submitted_by_email,
    carrier_id,
    subject,
    description,
    category,
    priority,
    metadata
  )
  VALUES (
    v_ticket_number,
    v_merchant_id,
    p_location_id,
    p_submitted_by,
    p_submitted_by_name,
    p_submitted_by_email,
    v_carrier_id,
    btrim(p_subject),
    btrim(p_description),
    p_category,
    p_priority,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'hq_admin',
      'audience', 'developers',
      'hq_created', true
    )
  )
  RETURNING id INTO v_ticket_id;

  INSERT INTO public.support_ticket_messages (
    ticket_id,
    sender_id,
    sender_name,
    sender_role,
    message,
    is_internal,
    read_by_admin,
    read_by_merchant
  )
  VALUES (
    v_ticket_id,
    p_submitted_by,
    p_submitted_by_name,
    'admin',
    btrim(p_description),
    false,
    true,
    false
  )
  RETURNING id INTO v_message_id;

  FOR v_attachment IN
    SELECT value
    FROM jsonb_array_elements(v_attachments)
  LOOP
    IF jsonb_typeof(v_attachment) <> 'object' OR
       nullif(btrim(v_attachment->>'file_name'), '') IS NULL OR
       nullif(btrim(v_attachment->>'file_path'), '') IS NULL OR
       coalesce((v_attachment->>'file_size')::integer, 0)
         NOT BETWEEN 1 AND 5242880 OR
       coalesce(v_attachment->>'file_type', '') <> ALL (
         ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
       ) OR
       position(
         'admin/drafts/' || p_submitted_by || '/'
         IN v_attachment->>'file_path'
       ) <> 1
    THEN
      RAISE EXCEPTION 'Invalid support ticket attachment';
    END IF;

    INSERT INTO public.support_ticket_attachments (
      ticket_id,
      message_id,
      uploaded_by,
      file_name,
      file_path,
      file_size,
      file_type
    )
    VALUES (
      v_ticket_id,
      v_message_id,
      p_submitted_by,
      btrim(v_attachment->>'file_name'),
      btrim(v_attachment->>'file_path'),
      (v_attachment->>'file_size')::integer,
      v_attachment->>'file_type'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ticket_id', v_ticket_id,
    'ticket_number', v_ticket_number,
    'merchant_id', v_merchant_id,
    'location_id', p_location_id,
    'attachment_count', jsonb_array_length(v_attachments)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_hq_support_ticket(
  uuid, text, text, text, text, text, text, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_hq_support_ticket(
  uuid, text, text, text, text, text, text, text, jsonb, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.create_hq_support_ticket(
  p_location_id uuid,
  p_subject text,
  p_description text,
  p_category text,
  p_submitted_by text,
  p_submitted_by_name text,
  p_submitted_by_email text DEFAULT NULL,
  p_priority text DEFAULT 'normal',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.create_hq_support_ticket(
    p_location_id,
    p_subject,
    p_description,
    p_category,
    p_submitted_by,
    p_submitted_by_name,
    p_submitted_by_email,
    p_priority,
    p_metadata,
    '[]'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.create_hq_support_ticket(
  uuid, text, text, text, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_hq_support_ticket(
  uuid, text, text, text, text, text, text, text, jsonb
) TO service_role;
