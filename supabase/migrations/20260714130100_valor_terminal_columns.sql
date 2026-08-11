-- =====================================================================
-- Valor semi-integration (2/5): payment_terminals config columns
-- =====================================================================
-- Dedicated valor_* columns mirroring the castles_* columns. Single-EPI
-- (no parent/child — MultiMID is out of v1). The client ALSO writes the IP to
-- local_ip_address/local_port so the station RPC (which maps local_ip_address ->
-- ip_address) surfaces it without further changes; valor_* is the canonical
-- config + is surfaced as cancel_port/epi by migration 5/5.
-- =====================================================================

ALTER TABLE public.payment_terminals
  ADD COLUMN IF NOT EXISTS valor_ip_address        text,
  ADD COLUMN IF NOT EXISTS valor_port              integer DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS valor_cancel_port       integer DEFAULT 5001,
  ADD COLUMN IF NOT EXISTS valor_epi               text,
  ADD COLUMN IF NOT EXISTS valor_txn_counter       integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_counter_updated_at timestamptz;

COMMENT ON COLUMN public.payment_terminals.valor_ip_address IS
  'Valor terminal IP (semi-integrated TCP server). Transactions on valor_port (5000).';
COMMENT ON COLUMN public.payment_terminals.valor_cancel_port IS
  'Second port (5001) for cancel-before-card (TRAN_MODE 99).';
COMMENT ON COLUMN public.payment_terminals.valor_epi IS
  'Valor EPI (Electronic Payment Interface) — merchant/device identifier.';
COMMENT ON COLUMN public.payment_terminals.valor_txn_counter IS
  'Monotonic REQ_TXN_ID counter (mirrors castles_txn_counter).';
