-- Persist multiple email assignees for HQ-created developer tickets without
-- overloading create_hq_support_ticket. The website passes the selection in
-- p_metadata and this trigger promotes it to a first-class column atomically.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS assigned_to_emails text[] NOT NULL
  DEFAULT '{}'::text[];

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_assigned_to_emails_limit;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_assigned_to_emails_limit
  CHECK (cardinality(assigned_to_emails) <= 50);

CREATE OR REPLACE FUNCTION public.apply_support_ticket_email_assignees()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  assignee_payload jsonb;
  normalized_assignees text[];
BEGIN
  assignee_payload := NEW.metadata->'assigned_to_emails';

  IF assignee_payload IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(assignee_payload) <> 'array' THEN
    RAISE EXCEPTION 'Support ticket assignees must be a JSON array';
  END IF;

  SELECT coalesce(
    array_agg(email ORDER BY first_position),
    '{}'::text[]
  )
  INTO normalized_assignees
  FROM (
    SELECT
      lower(btrim(value)) AS email,
      min(ordinality) AS first_position
    FROM jsonb_array_elements_text(assignee_payload)
      WITH ORDINALITY AS selected(value, ordinality)
    GROUP BY lower(btrim(value))
  ) normalized
  WHERE email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$';

  IF cardinality(normalized_assignees) <>
     jsonb_array_length(assignee_payload) THEN
    RAISE EXCEPTION
      'Support ticket assignees contain invalid or duplicate emails';
  END IF;

  IF cardinality(normalized_assignees) > 50 THEN
    RAISE EXCEPTION 'A maximum of 50 support ticket assignees is allowed';
  END IF;

  NEW.assigned_to_emails := normalized_assignees;
  NEW.metadata := NEW.metadata - 'assigned_to_emails';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_support_ticket_email_assignees()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_apply_support_ticket_email_assignees
  ON public.support_tickets;
CREATE TRIGGER trg_apply_support_ticket_email_assignees
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_support_ticket_email_assignees();
