-- Persist Luqra reports data so reconciliations and historical date ranges
-- survive across sessions and don't depend on the live API. The live API stays
-- the source of truth on first ingest; afterward the UI reads from cache and
-- a "Sync from Luqra" action upserts deltas.
--
-- Reconciliation match (order_payment) is stored on the cache row itself —
-- once we've matched a Luqra transaction to one of our payments, it stays
-- matched even if the order_payment is later voided / refunded / re-batched.

-- ---------------------------------------------------------------------------
-- Transactions cache
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.luqra_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  mid TEXT NOT NULL,

  -- Identity (Luqra rows are uniquely keyed by (mid, batchId, authNumber, originalTransactionDate))
  batch_id TEXT NOT NULL,
  authorization_number TEXT NOT NULL,
  transaction_date DATE,
  original_transaction_date DATE NOT NULL,

  terminal_id TEXT,
  pos_entry_mode TEXT,
  card_type TEXT,
  account_first6 TEXT,
  account_last4 TEXT,
  reject_reason TEXT,
  debit_credit_indicator TEXT,
  /** Numeric dollars — pre-divided from the cents Luqra returns. */
  amount_dollars NUMERIC(12, 2) NOT NULL DEFAULT 0,
  doing_business_as TEXT,
  legal_business_name TEXT,
  transaction_code TEXT,
  transaction_code_description TEXT,

  /** Original Luqra payload, kept verbatim for debugging / future fields. */
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Reconciliation
  reconciled_payment_id UUID REFERENCES public.order_payments(id) ON DELETE SET NULL,
  reconciled_order_id UUID,
  reconciled_at TIMESTAMPTZ,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT luqra_txn_unique UNIQUE (mid, batch_id, authorization_number, original_transaction_date)
);
CREATE INDEX IF NOT EXISTS luqra_txn_merchant_date_idx
  ON public.luqra_transactions (merchant_id, original_transaction_date DESC);
CREATE INDEX IF NOT EXISTS luqra_txn_location_date_idx
  ON public.luqra_transactions (location_id, original_transaction_date DESC)
  WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS luqra_txn_unreconciled_idx
  ON public.luqra_transactions (merchant_id, original_transaction_date DESC)
  WHERE reconciled_payment_id IS NULL;
DROP TRIGGER IF EXISTS update_luqra_transactions_updated_at ON public.luqra_transactions;
CREATE TRIGGER update_luqra_transactions_updated_at
  BEFORE UPDATE ON public.luqra_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.luqra_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luqra_transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS luqra_txn_admin_select ON public.luqra_transactions;
CREATE POLICY luqra_txn_admin_select ON public.luqra_transactions
  FOR SELECT
  USING (public.is_dexapos_admin());
DROP POLICY IF EXISTS luqra_txn_merchant_admin_select ON public.luqra_transactions;
CREATE POLICY luqra_txn_merchant_admin_select ON public.luqra_transactions
  FOR SELECT
  USING (public.is_merchant_admin(merchant_id));
-- Writes are server-only via service-role.

-- ---------------------------------------------------------------------------
-- Chargebacks cache
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.luqra_chargebacks (
  /** Luqra `id` (case version id). Stays stable across syncs. */
  id BIGINT PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  mid TEXT NOT NULL,

  case_number TEXT NOT NULL,
  acquirer_reference_number TEXT,
  application_id TEXT,
  doing_business_as TEXT,

  date_loaded TIMESTAMPTZ,
  last_date_loaded TIMESTAMPTZ,
  date_transaction TIMESTAMPTZ,

  debit_credit TEXT,
  /** Numeric dollars (Luqra returns decimal-string, normalize on insert). */
  merch_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  case_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  case_type INT,
  item_type INT,
  resolution_to TEXT,
  reason_code TEXT,
  reason_description TEXT,
  card_brand INT,
  cardholder_account_number TEXT,
  auth_code TEXT,
  trans_id TEXT,
  current_status TEXT,
  dispute_type TEXT,
  is_reversal TEXT,
  status_id INT,

  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Reconciliation back to our local order_payment / chargeback row
  reconciled_payment_id UUID REFERENCES public.order_payments(id) ON DELETE SET NULL,
  reconciled_at TIMESTAMPTZ,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS luqra_cb_merchant_date_idx
  ON public.luqra_chargebacks (merchant_id, date_loaded DESC);
CREATE INDEX IF NOT EXISTS luqra_cb_status_idx
  ON public.luqra_chargebacks (merchant_id, current_status);
DROP TRIGGER IF EXISTS update_luqra_chargebacks_updated_at ON public.luqra_chargebacks;
CREATE TRIGGER update_luqra_chargebacks_updated_at
  BEFORE UPDATE ON public.luqra_chargebacks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.luqra_chargebacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luqra_chargebacks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS luqra_cb_admin_select ON public.luqra_chargebacks;
CREATE POLICY luqra_cb_admin_select ON public.luqra_chargebacks
  FOR SELECT
  USING (public.is_dexapos_admin());
DROP POLICY IF EXISTS luqra_cb_merchant_admin_select ON public.luqra_chargebacks;
CREATE POLICY luqra_cb_merchant_admin_select ON public.luqra_chargebacks
  FOR SELECT
  USING (public.is_merchant_admin(merchant_id));
-- ---------------------------------------------------------------------------
-- Sync run log — observability for which date ranges have been ingested
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.luqra_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  mid TEXT NOT NULL,
  resource TEXT NOT NULL CHECK (resource IN ('transactions', 'chargebacks')),
  date_from DATE,
  date_to DATE,
  pages_fetched INT NOT NULL DEFAULT 0,
  rows_ingested INT NOT NULL DEFAULT 0,
  rows_updated INT NOT NULL DEFAULT 0,
  rows_reconciled INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'partial', 'error')),
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS luqra_sync_merchant_idx
  ON public.luqra_sync_runs (merchant_id, started_at DESC);
