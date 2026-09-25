-- =============================================================================
-- Empty the supabase_realtime publication (turns off Postgres Changes)
-- =============================================================================
-- Plan: Dexa-POS/docs/engineering/database/SUPABASE-CONNECTIONS-AND-STORAGE-2026-09-24.md,
-- Phase 5.6.
--
-- APPLY ONLY AFTER the Website release with Phase 5.1-5.3 is live (no
-- postgres_changes subscription left in either app). Applied earlier it breaks
-- nothing (every remaining subscriber polls), but the old dashboards' bells
-- would lose their push until they reload.
--
-- WHY: while any postgres_changes subscription exists, Supabase Realtime keeps
-- six extra database connections open (subscription management, cleanup and
-- WAL pull, two each). Nothing in the POS app, the CFD build, the Website or
-- the edge functions uses postgres_changes after Phase 5. Broadcast from the
-- database (realtime.send / realtime.broadcast_changes) uses Realtime's own
-- messages publication, not this one, so every broadcast keeps working.
--
-- The tables dropped are printed as NOTICEs; keep that list for the rollback.
-- Rollback: rollback/20260925124000_realtime_publication_empty_rollback.sql
-- =============================================================================

DO $publication$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'publication supabase_realtime does not exist; nothing to do';
    RETURN;
  END IF;

  FOR r IN
    SELECT schemaname, tablename
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
     ORDER BY schemaname, tablename
  LOOP
    RAISE NOTICE 'supabase_realtime: dropping %.%', r.schemaname, r.tablename;
    EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I', r.schemaname, r.tablename);
  END LOOP;
END;
$publication$;

-- Verify
--   select count(*) from pg_publication_tables where pubname = 'supabase_realtime';  -- 0
--   select count(*) from realtime.subscription;                                      -- 0 once old tabs reload
--   select count(*) from pg_stat_activity where application_name = 'realtime_connect'; -- drops by ~6
