-- Rollback for 20260920121000_orderout_direct_delivery_outbox.sql
-- Stops capture first (triggers), then the cron, then the functions. Tables are
-- left in place — see the schema rollback for those.

DROP TRIGGER IF EXISTS trg_oo_dispatch_on_accept ON public.orders;
DROP TRIGGER IF EXISTS trg_oo_dispatch_on_cancel ON public.orders;

DO $$
BEGIN
  PERFORM cron.unschedule('orderout-delivery-dispatch-drain');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('orderout-delivery-dispatch-sweep');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP FUNCTION IF EXISTS public.oo_dispatch_on_order_accepted();
DROP FUNCTION IF EXISTS public.oo_dispatch_on_order_cancelled();
DROP FUNCTION IF EXISTS public.sweep_orderout_delivery_dispatches();
DROP FUNCTION IF EXISTS public.apply_orderout_delivery_status(uuid, text, jsonb, timestamptz, text, jsonb);
DROP FUNCTION IF EXISTS public.link_orderout_delivery_echo(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.orderout_delivery_status_rank(text);
DROP FUNCTION IF EXISTS public.complete_orderout_delivery_dispatch(uuid, text, integer, text, jsonb);
DROP FUNCTION IF EXISTS public.claim_orderout_delivery_dispatch(integer);
DROP FUNCTION IF EXISTS public.poke_orderout_delivery_dispatch();
