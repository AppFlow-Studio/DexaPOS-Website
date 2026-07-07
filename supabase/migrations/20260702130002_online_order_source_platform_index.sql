-- ============================================================================
-- Index supporting Channel + Platform filtering on the Orders list.
-- ----------------------------------------------------------------------------
-- Split out of 20260702130001 (the order_source backfill) ON PURPOSE: those
-- UPDATEs touch `orders`, whose deferred constraint trigger enforce_order_math()
-- (20260501000006) queues pending trigger events for the transaction. Postgres
-- refuses to CREATE INDEX on a table that has pending trigger events within the
-- same transaction (SQLSTATE 55006: "cannot CREATE INDEX ... pending trigger
-- events"). Because `supabase db push`/`db reset` wrap each migration file in
-- its own transaction, running the index here — after the backfill has already
-- committed — starts a clean transaction with no pending events.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_source_platform
  ON public.orders (merchant_id, location_id, order_source, delivery_platform);
