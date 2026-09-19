-- Superseded by 20260518000001_order_prefetch_indexes.sql, which creates
-- the same three indexes without CONCURRENTLY. Supabase's migration pipeline
-- cannot execute CREATE INDEX CONCURRENTLY, so fresh replay skips this copy.
-- Existing databases already have this migration recorded as applied.
SELECT 1;
