-- Rollback for 20260703120000_user_ui_preferences.sql
-- Drops the per-user UI preferences table (and its RLS policies + trigger cascade).
DROP TABLE IF EXISTS public.user_ui_preferences;
