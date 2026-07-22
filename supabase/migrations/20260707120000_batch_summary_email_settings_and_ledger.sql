-- Auto-email batch-out summary to the location owner on settlement.
--
-- Adds:
--   1. Per-location opt-in toggle + recipient override on `locations`.
--   2. `batch_summary_email_sends` ledger (idempotency + observability) written
--      service-role only by the `email-batch-summary` Edge Function; reads are
--      scoped to the merchant's own staff (mirrors `receipt_sends`).

BEGIN;

-- 1. Per-location settings ---------------------------------------------------
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS batch_summary_email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS batch_summary_email_recipient text;

COMMENT ON COLUMN public.locations.batch_summary_email_enabled IS
  'When true, a batch-out summary email is sent to the owner on each settlement. Opt-in (default off).';
COMMENT ON COLUMN public.locations.batch_summary_email_recipient IS
  'Recipient override for the batch-out summary email. NULL falls back to locations.email.';

-- 2. Send ledger -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.batch_summary_email_sends (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE => one email per settlement batch; survives client re-fires.
  settlement_batch_id uuid NOT NULL UNIQUE REFERENCES public.settlement_batches(id) ON DELETE CASCADE,
  merchant_id         uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id         uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  recipient           text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message       text,
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz
);

CREATE INDEX IF NOT EXISTS idx_batch_summary_email_sends_merchant_created_at
  ON public.batch_summary_email_sends (merchant_id, created_at DESC);

ALTER TABLE public.batch_summary_email_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batch_summary_email_sends_select_merchant_staff
  ON public.batch_summary_email_sends;
CREATE POLICY batch_summary_email_sends_select_merchant_staff
  ON public.batch_summary_email_sends FOR SELECT
  USING (
    is_dexapos_admin()
    OR merchant_id IN (
      SELECT merchant_id FROM public.staff_profiles WHERE user_id = get_my_claim('sub')
    )
  );

COMMIT;
