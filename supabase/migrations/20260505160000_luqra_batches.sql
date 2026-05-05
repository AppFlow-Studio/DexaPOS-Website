-- Persist Luqra batches separately from deposits so we can drill:
--   deposit (banking) ─ batch (processor close) ─ transactions
--
-- Key facts pulled from /api/v1/reports/batches:
--   * batches.id is identical to luqra_transactions.batch_id (e.g. "3768726")
--   * money fields are integer cents on this endpoint (netDeposit, creditsAmount,
--     rejectsAmount, batchedAmount, approvedBatches, flattenDetails.*SalesAmount)
--     — pre-divide on insert.
--   * merchantReferenceNumber on a batch matches the trailing digits of
--     deposits.reference_number (deposit pads with leading zeros).
--   * statementDate on the batch == depositDate on the deposit it lands in.

CREATE TABLE IF NOT EXISTS public.luqra_batches (
  /** Same value as luqra_transactions.batch_id. */
  id TEXT PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  mid TEXT NOT NULL,

  batch_date DATE,
  statement_date DATE,

  merchant_reference_number TEXT,
  reject_reason TEXT,

  transactions_count INT NOT NULL DEFAULT 0,
  has_duplicate_rejects_within_30_days BOOLEAN NOT NULL DEFAULT FALSE,

  /** All numeric dollars (Luqra returns cents on this endpoint; pre-divide). */
  net_deposit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  batched_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  approved_batches NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credits_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  rejects_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,

  /** Per-network breakdown — also dollars after normalization. */
  visa_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  visa_count INT NOT NULL DEFAULT 0,
  mastercard_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  mastercard_count INT NOT NULL DEFAULT 0,
  amex_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amex_count INT NOT NULL DEFAULT 0,
  discover_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discover_count INT NOT NULL DEFAULT 0,
  ebt_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ebt_count INT NOT NULL DEFAULT 0,
  pin_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  pin_count INT NOT NULL DEFAULT 0,

  /** Linked deposit (set at sync time when the matching deposit row exists). */
  deposit_id TEXT REFERENCES public.luqra_deposits(id) ON DELETE SET NULL,

  doing_business_as TEXT,

  raw JSONB NOT NULL DEFAULT '{}'::jsonb,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS luqra_batch_merchant_date_idx
  ON public.luqra_batches (merchant_id, statement_date DESC);
CREATE INDEX IF NOT EXISTS luqra_batch_mid_date_idx
  ON public.luqra_batches (mid, statement_date DESC);
CREATE INDEX IF NOT EXISTS luqra_batch_deposit_idx
  ON public.luqra_batches (deposit_id)
  WHERE deposit_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_luqra_batches_updated_at ON public.luqra_batches;
CREATE TRIGGER update_luqra_batches_updated_at
  BEFORE UPDATE ON public.luqra_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.luqra_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luqra_batches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS luqra_batch_admin_select ON public.luqra_batches;
CREATE POLICY luqra_batch_admin_select ON public.luqra_batches
  FOR SELECT
  USING (public.is_dexapos_admin());

DROP POLICY IF EXISTS luqra_batch_merchant_admin_select ON public.luqra_batches;
CREATE POLICY luqra_batch_merchant_admin_select ON public.luqra_batches
  FOR SELECT
  USING (public.is_merchant_admin(merchant_id));

ALTER TABLE public.luqra_sync_runs
  DROP CONSTRAINT IF EXISTS luqra_sync_runs_resource_check;
ALTER TABLE public.luqra_sync_runs
  ADD CONSTRAINT luqra_sync_runs_resource_check
    CHECK (resource IN ('transactions', 'chargebacks', 'deposits', 'batches'));
