-- ============================================================================
-- DEXA-SUPPORT-001: Support Ticketing System
-- ============================================================================

-- Ticket number sequence
CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START 1;

-- ============================================================================
-- support_tickets
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number   TEXT NOT NULL UNIQUE,

  -- Who submitted it
  merchant_id     UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id     UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  submitted_by    TEXT NOT NULL REFERENCES public.users(id),
  submitted_by_name  TEXT NOT NULL,
  submitted_by_email TEXT,

  -- Carrier visibility (auto-set from merchant's carrier_id)
  carrier_id      UUID REFERENCES public.carriers(id) ON DELETE SET NULL,

  -- Ticket content
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'general'
                  CHECK (category IN ('general','billing','hardware','pos_app','menu','payments','kitchen','feature_request','onboarding')),
  priority        TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),

  -- Status tracking
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','waiting_on_merchant','resolved','closed')),

  -- Assignment
  assigned_to      TEXT REFERENCES public.users(id),
  assigned_to_name TEXT,
  assigned_at      TIMESTAMP WITH TIME ZONE,

  -- Resolution
  resolved_at         TIMESTAMP WITH TIME ZONE,
  resolved_by         TEXT REFERENCES public.users(id),
  resolution_notes    TEXT,

  -- Timestamps
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  first_response_at TIMESTAMP WITH TIME ZONE,

  -- Metadata (device info, browser, POS version, etc.)
  metadata        JSONB DEFAULT '{}'::jsonb,
  tags            TEXT[] DEFAULT '{}'::text[]
);

-- Auto-generate ticket number via trigger
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ticket_number := 'DEXA-' || lpad(nextval('support_ticket_seq')::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ticket_number
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
  EXECUTE FUNCTION generate_ticket_number();

-- updated_at trigger
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_merchant    ON public.support_tickets(merchant_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_carrier     ON public.support_tickets(carrier_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status      ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned    ON public.support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created     ON public.support_tickets(created_at DESC);

-- ============================================================================
-- support_ticket_messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,

  sender_id   TEXT NOT NULL REFERENCES public.users(id),
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('merchant','carrier','admin')),

  message     TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,

  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  edited_at   TIMESTAMP WITH TIME ZONE,

  read_by_merchant BOOLEAN DEFAULT false,
  read_by_admin    BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.support_ticket_messages(ticket_id, created_at);

-- ============================================================================
-- support_ticket_attachments
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.support_ticket_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id  UUID REFERENCES public.support_ticket_messages(id) ON DELETE SET NULL,

  uploaded_by TEXT NOT NULL REFERENCES public.users(id),
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  file_type   TEXT NOT NULL,

  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON public.support_ticket_attachments(ticket_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;

-- Merchants: own tickets only
CREATE POLICY "merchants_own_tickets" ON public.support_tickets
  FOR ALL USING (
    merchant_id IN (
      SELECT m.id FROM public.merchants m
      WHERE m.clerk_org_id = (SELECT id FROM public.organizations WHERE id = (auth.jwt() -> 'org' ->> 'id') LIMIT 1)
    )
  );

-- Carriers: read tickets from their managed merchants
CREATE POLICY "carriers_see_merchant_tickets" ON public.support_tickets
  FOR SELECT USING (
    carrier_id IN (
      SELECT c.id FROM public.carriers c
      WHERE c.clerk_org_id = (auth.jwt() -> 'org' ->> 'id')
    )
  );

-- HQ: see everything
CREATE POLICY "admin_see_all_tickets" ON public.support_tickets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.members mem
      JOIN public.organizations o ON o.id = mem.organization_id
      WHERE mem.user_id = auth.uid()::text
        AND o.id = (SELECT id FROM public.organizations WHERE id = current_setting('app.dexa_hq_org_id', true) LIMIT 1)
    )
  );

-- Messages: scoped through ticket_id (inherit ticket access)
CREATE POLICY "ticket_messages_via_ticket" ON public.support_ticket_messages
  FOR ALL USING (
    ticket_id IN (SELECT id FROM public.support_tickets)
  );

-- Attachments: scoped through ticket_id
CREATE POLICY "ticket_attachments_via_ticket" ON public.support_ticket_attachments
  FOR ALL USING (
    ticket_id IN (SELECT id FROM public.support_tickets)
  );

-- ============================================================================
-- RPC: create_support_ticket
-- ============================================================================
CREATE OR REPLACE FUNCTION create_support_ticket(
  p_merchant_id       UUID,
  p_location_id       UUID,
  p_subject           TEXT,
  p_description       TEXT,
  p_category          TEXT,
  p_submitted_by      TEXT,
  p_submitted_by_name TEXT,
  p_submitted_by_email TEXT DEFAULT NULL,
  p_carrier_id        UUID DEFAULT NULL,
  p_metadata          JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- ============================================================================
-- RPC: add_ticket_message
-- ============================================================================
CREATE OR REPLACE FUNCTION add_ticket_message(
  p_ticket_id   UUID,
  p_sender_id   TEXT,
  p_sender_name TEXT,
  p_sender_role TEXT,
  p_message     TEXT,
  p_is_internal BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- ============================================================================
-- RPC: update_ticket_status
-- ============================================================================
CREATE OR REPLACE FUNCTION update_ticket_status(
  p_ticket_id       UUID,
  p_status          TEXT,
  p_resolution_notes TEXT DEFAULT NULL,
  p_resolved_by     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- ============================================================================
-- RPC: get_support_dashboard_stats
-- ============================================================================
CREATE OR REPLACE FUNCTION get_support_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;
