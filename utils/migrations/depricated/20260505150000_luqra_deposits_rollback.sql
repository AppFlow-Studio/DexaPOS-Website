DROP INDEX IF EXISTS public.luqra_txn_deposit_idx;
ALTER TABLE public.luqra_transactions DROP COLUMN IF EXISTS deposit_id;

ALTER TABLE public.luqra_sync_runs
  DROP CONSTRAINT IF EXISTS luqra_sync_runs_resource_check;
ALTER TABLE public.luqra_sync_runs
  ADD CONSTRAINT luqra_sync_runs_resource_check
    CHECK (resource IN ('transactions', 'chargebacks'));

DROP TABLE IF EXISTS public.luqra_deposits;
