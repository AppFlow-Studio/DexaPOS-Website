ALTER TABLE public.luqra_sync_runs
  DROP CONSTRAINT IF EXISTS luqra_sync_runs_resource_check;
ALTER TABLE public.luqra_sync_runs
  ADD CONSTRAINT luqra_sync_runs_resource_check
    CHECK (resource IN ('transactions', 'chargebacks', 'deposits'));

DROP TABLE IF EXISTS public.luqra_batches;
