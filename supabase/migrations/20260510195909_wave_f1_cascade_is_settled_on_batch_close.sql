CREATE OR REPLACE FUNCTION public._cascade_is_settled_on_batch_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.status IN ('settled','closed','funded')
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        UPDATE public.order_payments
           SET is_settled = true,
               settled_at = COALESCE(settled_at, NEW.closed_at, now())
         WHERE settlement_batch_id = NEW.id
           AND is_settled = false;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_is_settled_on_batch_close ON public.settlement_batches;
CREATE TRIGGER trg_cascade_is_settled_on_batch_close
    AFTER INSERT OR UPDATE OF status ON public.settlement_batches
    FOR EACH ROW
    EXECUTE FUNCTION public._cascade_is_settled_on_batch_close();

COMMENT ON FUNCTION public._cascade_is_settled_on_batch_close IS
    'AFTER INSERT/UPDATE-OF-status trigger on settlement_batches. When a batch enters a terminal status (settled/closed/funded), flips is_settled=true and stamps settled_at on every linked order_payments row. Idempotent. Bridges all three batch-close writers (POS settle, terminal-direct close + lazy link, website Luqra reconciliation) so external batch-outs propagate to payment rows automatically.';;
