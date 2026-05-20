-- Persist Luqra deposits and link them to luqra_transactions so admins can
-- trace: deposit → batches → transactions → our order_payments.
--
-- Linking strategy (no FK in the Luqra payload):
--   * deposit.id is composite: <depositDate><referenceNumber>, returned by
--     /api/v1/reports/deposits/details. We use it verbatim as the PK.
--   * Each Luqra transaction carries its own batchId (already on
--     luqra_transactions). The transaction's transactionDate IS the
--     settlement date, which equals the deposit's depositDate. So we link
--     luqra_transactions.deposit_id at sync time by (mid, transaction_date).
--   * From a deposit row, batches inside it are derived by grouping that
--     deposit's transactions by batch_id.

CREATE TABLE IF NOT EXISTS public.luqra_deposits (
  /** Luqra composite id: <depositDate><referenceNumber>. Stable. */
  id TEXT PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  mid TEXT NOT NULL,

  deposit_date DATE NOT NULL,
  statement_date DATE,
  reference_number TEXT,
  routing_number TEXT,
  /** Last-4-only on details; full from list endpoint when available. */
  dda_number TEXT,

  /** Numeric dollars — Luqra returns decimal-string. */
  batch_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  daily_fees NUMERIC(14, 2) NOT NULL DEFAULT 0,
  chargeback_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reserved_funds NUMERIC(14, 2) NOT NULL DEFAULT 0,
  adjustment_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_batches NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_deposit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  split_funding_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,

  chargeback_case_number TEXT,
  doing_business_as TEXT,

  /** Both /deposits and /deposits/details payloads kept for forensics. */
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS luqra_dep_merchant_date_idx
  ON public.luqra_deposits (merchant_id, deposit_date DESC);
CREATE INDEX IF NOT EXISTS luqra_dep_mid_date_idx
  ON public.luqra_deposits (mid, deposit_date DESC);
DROP TRIGGER IF EXISTS update_luqra_deposits_updated_at ON public.luqra_deposits;
CREATE TRIGGER update_luqra_deposits_updated_at
  BEFORE UPDATE ON public.luqra_deposits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.luqra_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luqra_deposits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS luqra_dep_admin_select ON public.luqra_deposits;
CREATE POLICY luqra_dep_admin_select ON public.luqra_deposits
  FOR SELECT
  USING (public.is_dexapos_admin());
DROP POLICY IF EXISTS luqra_dep_merchant_admin_select ON public.luqra_deposits;
CREATE POLICY luqra_dep_merchant_admin_select ON public.luqra_deposits
  FOR SELECT
  USING (public.is_merchant_admin(merchant_id));
-- Add the FK from transactions → deposits (nullable; set at sync time).
ALTER TABLE public.luqra_transactions
  ADD COLUMN IF NOT EXISTS deposit_id TEXT REFERENCES public.luqra_deposits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS luqra_txn_deposit_idx
  ON public.luqra_transactions (deposit_id)
  WHERE deposit_id IS NOT NULL;
-- Sync runs already covers transactions/chargebacks; widen the check.
ALTER TABLE public.luqra_sync_runs
  DROP CONSTRAINT IF EXISTS luqra_sync_runs_resource_check;
ALTER TABLE public.luqra_sync_runs
  ADD CONSTRAINT luqra_sync_runs_resource_check
    CHECK (resource IN ('transactions', 'chargebacks', 'deposits'));
