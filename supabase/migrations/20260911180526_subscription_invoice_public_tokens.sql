-- Subscription invoices: public_token + get_public_subscription_invoice RPC.
--
-- Mirrors the customer-invoice token idiom (20260612100000_invoices_lifecycle_tokens.sql):
-- pgcrypto in `extensions`, gen_random_bytes fully qualified, NOT NULL + volatile
-- DEFAULT in one DDL so ADD COLUMN backfills per-row, then a BEFORE INSERT
-- trigger as belt-and-suspenders. The token backs the Stripe-style hosted
-- invoice page at /subscription-invoice/<token> linked from billing emails.
--
-- DB-apply is staging-first (SQL editor + migration repair). Regenerate
-- database.types.ts after apply.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── public_token (opaque per-invoice key) ────────────────────────────────────
ALTER TABLE public.subscription_invoices
  ADD COLUMN IF NOT EXISTS public_token text NOT NULL DEFAULT
    replace(replace(replace(
      encode(extensions.gen_random_bytes(16), 'base64'),
      '+', '-'), '/', '_'), '=', '');

-- If a prior partial run added it nullable, backfill then tighten.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='subscription_invoices'
      AND column_name='public_token' AND is_nullable='YES'
  ) THEN
    UPDATE public.subscription_invoices
      SET public_token = replace(replace(replace(
            encode(extensions.gen_random_bytes(16), 'base64'),
            '+', '-'), '/', '_'), '=', '')
    WHERE public_token IS NULL;
  END IF;
END $$;

ALTER TABLE public.subscription_invoices
  ALTER COLUMN public_token SET NOT NULL,
  ALTER COLUMN public_token SET DEFAULT
    replace(replace(replace(
      encode(extensions.gen_random_bytes(16), 'base64'),
      '+', '-'), '/', '_'), '=', '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_invoices_public_token
  ON public.subscription_invoices (public_token);

-- Belt-and-suspenders: guarantee a token even if a future INSERT sets it NULL.
CREATE OR REPLACE FUNCTION public.set_subscription_invoice_public_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.public_token IS NULL THEN
    NEW.public_token := replace(replace(replace(
      encode(extensions.gen_random_bytes(16), 'base64'),
      '+', '-'), '/', '_'), '=', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_invoices_set_public_token ON public.subscription_invoices;
CREATE TRIGGER trg_subscription_invoices_set_public_token
  BEFORE INSERT ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_subscription_invoice_public_token();

-- ─── get_public_subscription_invoice(p_token) — display-only payload ───────────
-- Returns NULL when the token doesn't match. Exposes only presentation fields
-- (never billing_profile_id, processor_response, nmi_response, or card data).
CREATE OR REPLACE FUNCTION public.get_public_subscription_invoice(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'invoice', jsonb_build_object(
      'invoice_number',       si.invoice_number,
      'status',               si.status,
      'billing_method',       si.billing_method,
      'billing_period_start', si.billing_period_start,
      'billing_period_end',   si.billing_period_end,
      'line_items',           si.line_items,
      'subtotal',             si.subtotal,
      'card_surcharge',       si.card_surcharge,
      'total_amount',         si.total_amount,
      'due_date',             si.due_date,
      'paid_at',              si.paid_at,
      'created_at',           si.created_at
    ),
    'merchant', jsonb_build_object(
      'name', COALESCE(m.dba_name, m.name)
    ),
    'location', CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name', l.name
    ) END
  )
  INTO v_result
  FROM public.subscription_invoices si
  JOIN public.merchants m      ON m.id = si.merchant_id
  LEFT JOIN public.locations l ON l.id = si.location_id
  WHERE si.public_token = p_token;

  RETURN v_result;  -- NULL when no row matched
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_subscription_invoice(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_subscription_invoice(text) TO anon, authenticated;
