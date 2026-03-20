-- ============================================================================
-- DEXA-SUPPORT-001: Attachment RPCs
-- Adds attachment support to the support ticketing system.
-- Storage bucket "support-attachments" must be created as PRIVATE in the
-- Supabase dashboard. All URL generation is handled server-side via signed URLs.
-- ============================================================================

-- ============================================================================
-- Update create_support_ticket to accept initial attachments
-- ============================================================================
CREATE OR REPLACE FUNCTION create_support_ticket(
  p_merchant_id        UUID,
  p_location_id        UUID,
  p_subject            TEXT,
  p_description        TEXT,
  p_category           TEXT,
  p_submitted_by       TEXT,
  p_submitted_by_name  TEXT,
  p_submitted_by_email TEXT DEFAULT NULL,
  p_carrier_id         UUID DEFAULT NULL,
  p_metadata           JSONB DEFAULT '{}'::jsonb,
  p_attachments        JSONB DEFAULT '[]'::jsonb  -- [{file_name, file_path, file_size, file_type}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- ============================================================================
-- New RPC: add_ticket_message_with_attachments
-- Inserts a message and its attachments atomically, then updates ticket state.
-- ============================================================================
CREATE OR REPLACE FUNCTION add_ticket_message_with_attachments(
  p_ticket_id   UUID,
  p_sender_id   TEXT,
  p_sender_name TEXT,
  p_sender_role TEXT,
  p_message     TEXT,
  p_is_internal BOOLEAN DEFAULT false,
  p_attachments JSONB   DEFAULT '[]'::jsonb  -- [{file_name, file_path, file_size, file_type}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;
