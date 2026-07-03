-- =============================================================================
-- Migration: user_ui_preferences — per-user dashboard UI preferences
--
-- Why:
--   The Orders list gains a "Columns" show/hide control whose choice must follow
--   the user across devices (not just localStorage). No user-settings table exists
--   yet, so this adds a small, generic per-user key/value store (jsonb value) that
--   other tables' UI prefs can reuse later. Scope is PER-USER (a user's column
--   layout is the same across every merchant/location they access).
--
--   Keyed by the Clerk user id (= users.id = public.current_user_id()). RLS lets a
--   user read/write only their own rows.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_ui_preferences (
  user_id    TEXT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  -- Namespaced preference key, e.g. 'orders.columns'. Lets one row per widget.
  pref_key   TEXT NOT NULL,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pref_key)
);

COMMENT ON TABLE public.user_ui_preferences IS
  'Per-user dashboard UI preferences (e.g. Orders list column visibility). One row per (user, pref_key).';

-- Keep updated_at fresh on writes (function already exists per project conventions).
DROP TRIGGER IF EXISTS set_user_ui_preferences_updated_at ON public.user_ui_preferences;
CREATE TRIGGER set_user_ui_preferences_updated_at
  BEFORE UPDATE ON public.user_ui_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: a user sees and mutates only their own preference rows.
ALTER TABLE public.user_ui_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_ui_preferences_select_own" ON public.user_ui_preferences;
CREATE POLICY "user_ui_preferences_select_own"
  ON public.user_ui_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = public.current_user_id());

DROP POLICY IF EXISTS "user_ui_preferences_insert_own" ON public.user_ui_preferences;
CREATE POLICY "user_ui_preferences_insert_own"
  ON public.user_ui_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = public.current_user_id());

DROP POLICY IF EXISTS "user_ui_preferences_update_own" ON public.user_ui_preferences;
CREATE POLICY "user_ui_preferences_update_own"
  ON public.user_ui_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = public.current_user_id())
  WITH CHECK (user_id = public.current_user_id());

DROP POLICY IF EXISTS "user_ui_preferences_delete_own" ON public.user_ui_preferences;
CREATE POLICY "user_ui_preferences_delete_own"
  ON public.user_ui_preferences
  FOR DELETE
  TO authenticated
  USING (user_id = public.current_user_id());
