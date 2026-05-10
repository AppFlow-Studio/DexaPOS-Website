-- Migration: luqra_chargebacks table + reconcile_luqra_chargebacks() RPC
-- Creates the TSYS sync target table and the reconciliation function that
-- matches incoming chargebacks to existing order_payments records.

-- ─── luqra_chargebacks ────────────────────────────────────────────────────────

CREATE TABLE public.luqra_chargebacks (
  id                       bigint       PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  merchant_id              uuid         NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id              uuid         REFERENCES public.locations(id) ON DELETE SET NULL,
  mid                      varchar,
  case_number              varchar      UNIQUE,
  acquirer_reference_number varchar,
  date_loaded              date,
  date_transaction         date,
  debit_credit             varchar,
  merch_amount             numeric,
  case_amount              numeric,
  case_type                varchar,
  item_type                varchar,
  resolution_to            date,
  reason_code              varchar,
  reason_description       varchar,
  card_brand               varchar,
  cardholder_account_number varchar,
  auth_code                varchar,
  trans_id                 varchar,
  current_status           varchar,
  dispute_type             varchar,
  status_id                integer,
  history                  jsonb,
  raw                      jsonb,
  reconciled_payment_id    uuid         REFERENCES public.order_payments(id) ON DELETE SET NULL,
  reconciled_at            timestamptz,
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX luqra_chargebacks_merchant_id_idx
  ON public.luqra_chargebacks (merchant_id);

CREATE INDEX luqra_chargebacks_reconciled_payment_id_idx
  ON public.luqra_chargebacks (reconciled_payment_id);

CREATE INDEX luqra_chargebacks_case_number_idx
  ON public.luqra_chargebacks (case_number)
  WHERE case_number IS NOT NULL;

ALTER TABLE public.luqra_chargebacks ENABLE ROW LEVEL SECURITY;

-- HQ-only direct access; merchant sync goes through SECURITY DEFINER RPCs
CREATE POLICY "hq_full_access_luqra_chargebacks"
  ON public.luqra_chargebacks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM   public.members  m
      JOIN   public.roles    r ON r.code = m.role
      WHERE  m.user_id            = current_user_id()
        AND  r.organization_type  = 'hq'
    )
  );

CREATE TRIGGER update_luqra_chargebacks_updated_at
  BEFORE UPDATE ON public.luqra_chargebacks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── reconcile_luqra_chargebacks() ───────────────────────────────────────────
--
-- Scans unreconciled luqra_chargebacks rows for a merchant and tries to match
-- each one to an order_payments record. On a single confident match it:
--   1. Sets luqra_chargebacks.reconciled_payment_id
--   2. Inserts a chargebacks row (idempotent via dispute_psp_reference UNIQUE)
--
-- Returns { matched, ambiguous, unmatched } summary.

CREATE OR REPLACE FUNCTION public.reconcile_luqra_chargebacks(
  p_merchant_id uuid,
  p_since       timestamptz DEFAULT now() - interval '7 days'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lc          record;
  v_candidates  uuid[];
  v_location_id uuid;
  v_matched     int := 0;
  v_ambiguous   int := 0;
  v_unmatched   int := 0;
BEGIN
  FOR v_lc IN
    SELECT *
    FROM   luqra_chargebacks
    WHERE  merchant_id          = p_merchant_id
      AND  reconciled_payment_id IS NULL
      AND  created_at            >= p_since
  LOOP

    -- Match: auth_code OR trans_id, plus last-4 and amount within ±$0.05
    SELECT ARRAY_AGG(op.id) INTO v_candidates
    FROM   order_payments op
    JOIN   orders         o  ON o.id = op.order_id
    WHERE  o.merchant_id = p_merchant_id
      AND  (
             ( v_lc.auth_code IS NOT NULL
               AND op.authorization_code = v_lc.auth_code )
          OR ( v_lc.trans_id IS NOT NULL
               AND op.processor_transaction_id = v_lc.trans_id )
           )
      AND  (
             v_lc.cardholder_account_number IS NULL
          OR op.card_last_four = RIGHT(v_lc.cardholder_account_number, 4)
           )
      AND  ABS(
               op.total_amount
             - COALESCE(v_lc.case_amount, v_lc.merch_amount, 0)
           ) <= 0.05;

    IF v_candidates IS NULL OR ARRAY_LENGTH(v_candidates, 1) = 0 THEN
      -- Orphan — no match found; stays in luqra_chargebacks only
      v_unmatched := v_unmatched + 1;

    ELSIF ARRAY_LENGTH(v_candidates, 1) > 1 THEN
      -- Ambiguous — multiple candidates, needs manual review
      v_ambiguous := v_ambiguous + 1;

    ELSE
      -- Single confident match
      UPDATE luqra_chargebacks
      SET    reconciled_payment_id = v_candidates[1],
             reconciled_at         = now()
      WHERE  id = v_lc.id;

      -- Derive location from the matched payment's order
      SELECT o.location_id INTO v_location_id
      FROM   order_payments op
      JOIN   orders         o ON o.id = op.order_id
      WHERE  op.id = v_candidates[1];

      -- Create chargebacks row (idempotent via case_number uniqueness)
      INSERT INTO chargebacks (
        original_payment_id,
        dispute_psp_reference,
        merchant_id,
        location_id,
        amount,
        reason_code,
        reason_description,
        card_network,
        status,
        defense_deadline,
        received_at
      ) VALUES (
        v_candidates[1],
        v_lc.case_number,
        p_merchant_id,
        v_location_id,
        COALESCE(v_lc.case_amount, v_lc.merch_amount, 0),
        COALESCE(v_lc.reason_code, 'unknown'),
        v_lc.reason_description,
        v_lc.card_brand,
        'notified',
        v_lc.resolution_to::timestamptz,
        COALESCE(v_lc.date_loaded::timestamptz, now())
      )
      ON CONFLICT (dispute_psp_reference) DO NOTHING;

      v_matched := v_matched + 1;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'matched',   v_matched,
    'ambiguous', v_ambiguous,
    'unmatched', v_unmatched
  );
END;
$$;

COMMENT ON FUNCTION public.reconcile_luqra_chargebacks(uuid, timestamptz) IS
  'Matches unreconciled luqra_chargebacks rows to order_payments by auth_code/trans_id + last4 + amount. Creates chargebacks rows for single confident matches. Returns {matched, ambiguous, unmatched}.';
