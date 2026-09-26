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
-- publication (supabase_realtime_messages_publication, which carries the
-- partitioned realtime.messages), not this one, so every broadcast keeps working.
--
-- Drops ONLY the public.* postgres_changes tables, iterating the actual
-- publication members (pg_publication_rel) so a partitioned parent is dropped
-- as itself and never by a leaf partition (ALTER PUBLICATION ... DROP TABLE on a
-- partition fails 42704 "is not part of the publication"). realtime.messages is
-- also a member of supabase_realtime here, but it is the broadcast transport and
-- the rollback never re-adds it, so it is intentionally left in place.
--
-- The tables dropped are printed as NOTICEs; keep that list for the rollback.
-- Rollback: rollback/20260927124000_realtime_publication_empty_rollback.sql
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
    SELECT n.nspname AS schemaname, c.relname AS tablename
      FROM pg_publication p
      JOIN pg_publication_rel pr ON pr.prpubid = p.oid
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'public'
     ORDER BY n.nspname, c.relname
  LOOP
    RAISE NOTICE 'supabase_realtime: dropping %.%', r.schemaname, r.tablename;
    EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I', r.schemaname, r.tablename);
  END LOOP;
END;
$publication$;

-- Verify
--   select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';  -- 0
--   select count(*) from pg_publication_tables where pubname = 'supabase_realtime';  -- realtime.messages partitions only
--   select count(*) from realtime.subscription;                                      -- 0 once old tabs reload
--   select count(*) from pg_stat_activity where application_name = 'realtime_connect'; -- drops by ~6
