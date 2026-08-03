-- Model DEXA HQ developer tickets as platform-scoped records instead of
-- attaching them to a fake merchant/location.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ticket_scope text NOT NULL DEFAULT 'merchant';

ALTER TABLE public.support_tickets
  ALTER COLUMN merchant_id DROP NOT NULL;

-- Convert tickets created by the previous HQ-only RPC before enforcing the
-- new tenant/scope invariant.
UPDATE public.support_tickets
SET
  ticket_scope = 'hq_internal',
  merchant_id = NULL,
  location_id = NULL,
  carrier_id = NULL,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'scope_migrated_at',
    now()
  )
WHERE coalesce(metadata->>'hq_created', 'false') = 'true'
   OR metadata->>'source' = 'hq_admin';

UPDATE public.support_ticket_messages m
SET read_by_merchant = true
FROM public.support_tickets t
WHERE t.id = m.ticket_id
  AND t.ticket_scope = 'hq_internal'
  AND m.read_by_merchant = false;

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_scope_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_scope_check CHECK (
    (
      ticket_scope = 'merchant'
      AND merchant_id IS NOT NULL
    )
    OR
    (
      ticket_scope = 'hq_internal'
      AND merchant_id IS NULL
      AND location_id IS NULL
      AND carrier_id IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_scope
  ON public.support_tickets(ticket_scope);

COMMENT ON COLUMN public.support_tickets.ticket_scope IS
  'merchant = tenant-owned support request; hq_internal = DEXA HQ engineering work item with no merchant/location ownership.';

-- Ensure merchant users can only access tenant-owned tickets while HQ users
-- retain access to both merchant and platform-scoped records.
DROP POLICY IF EXISTS support_tickets_admin_or_merchant_all
  ON public.support_tickets;

CREATE POLICY support_tickets_admin_or_merchant_all
  ON public.support_tickets
  TO authenticated
  USING (
    public.is_dexapos_admin()
    OR (
      ticket_scope = 'merchant'
      AND merchant_id IN (
        SELECT m.id
        FROM public.merchants m
        WHERE m.clerk_org_id = coalesce(
          public.get_my_claim('org_id'::text),
          auth.jwt() -> 'org' ->> 'id'
        )
      )
    )
  )
  WITH CHECK (
    public.is_dexapos_admin()
    OR (
      ticket_scope = 'merchant'
      AND merchant_id IN (
        SELECT m.id
        FROM public.merchants m
        WHERE m.clerk_org_id = coalesce(
          public.get_my_claim('org_id'::text),
          auth.jwt() -> 'org' ->> 'id'
        )
      )
    )
  );

-- The old overloads required a database location. HQ ticket creation now has
-- one unambiguous, location-free signature.
DROP FUNCTION IF EXISTS public.create_hq_support_ticket(
  uuid, text, text, text, text, text, text, text, jsonb
);
DROP FUNCTION IF EXISTS public.create_hq_support_ticket(
  uuid, text, text, text, text, text, text, text, jsonb, jsonb
);

CREATE OR REPLACE FUNCTION public.create_hq_support_ticket(
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

  v_ticket_number :=
    'DEXA-' || lpad(nextval('public.support_ticket_seq')::text, 5, '0');

  INSERT INTO public.support_tickets (
    ticket_number,
    ticket_scope,
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
    'hq_internal',
    NULL,
    NULL,
    p_submitted_by,
    p_submitted_by_name,
    p_submitted_by_email,
    NULL,
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
    true
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
    'ticket_scope', 'hq_internal',
    'merchant_id', NULL,
    'location_id', NULL,
    'attachment_count', jsonb_array_length(v_attachments)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_hq_support_ticket(
  text, text, text, text, text, text, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_hq_support_ticket(
  text, text, text, text, text, text, text, jsonb, jsonb
) TO service_role;

-- Internal tickets have no merchant recipient, so merchant unread state must
-- never be created by shared message-writing RPCs.
CREATE OR REPLACE FUNCTION public.normalize_hq_internal_message_read_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = NEW.ticket_id
      AND t.ticket_scope = 'hq_internal'
  ) THEN
    NEW.read_by_merchant := true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_hq_internal_message_read_state()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_normalize_hq_internal_message_read_state
  ON public.support_ticket_messages;
CREATE TRIGGER trg_normalize_hq_internal_message_read_state
  BEFORE INSERT OR UPDATE OF ticket_id, read_by_merchant
  ON public.support_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_hq_internal_message_read_state();

NOTIFY pgrst, 'reload schema';
