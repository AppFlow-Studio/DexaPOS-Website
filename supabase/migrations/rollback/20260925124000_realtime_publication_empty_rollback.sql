-- Rollback for 20260925124000_realtime_publication_empty.sql
-- Re-adds the tables the tracked migrations put in supabase_realtime. The
-- forward migration printed the tables it actually dropped on each
-- environment ("supabase_realtime: dropping ..."); add any of those missing
-- from this list. Only needed if a postgres_changes subscriber comes back.

DO $publication$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_notifications', 'floor_plan_objects', 'order_courses', 'order_items',
    'order_payments', 'orders', 'reservations', 'session_kick_notifications',
    'station_sessions', 'support_ticket_messages', 'support_tickets',
    'table_session_events', 'table_session_tables', 'table_sessions', 'waitlist'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$publication$;
