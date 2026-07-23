-- Marketing-site CMS schema (ported from hussein112/Dexa migrations 001-004).
--
-- Adapted for this monorepo:
--   * No `cms_users` table / no Supabase-Auth signup trigger. The CMS admin
--     (`/admin`) is gated by Clerk HQ (DEXA_POS_INTERNAL_TEAM_ID) and ALL writes
--     go through the service-role key, which bypasses RLS. So the only RLS
--     policies here are PUBLIC READ policies for the public marketing site.
--   * `updated_by` is a nullable TEXT holding the Clerk user id (not a FK).
--
-- Re-runnable (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- 1. Page content (one row per route) ------------------------------------------
CREATE TABLE IF NOT EXISTS page_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route TEXT UNIQUE NOT NULL,
  cms_title TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  hero_title TEXT NOT NULL DEFAULT '',
  hero_subtitle TEXT NOT NULL DEFAULT '',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  category TEXT NOT NULL DEFAULT 'other',
  published BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
ALTER TABLE page_content ADD COLUMN IF NOT EXISTS cms_title TEXT NOT NULL DEFAULT '';
ALTER TABLE page_content ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other';

ALTER TABLE page_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read published content" ON page_content;
CREATE POLICY "Anyone can read published content"
  ON page_content FOR SELECT
  USING (published = true);

DROP TRIGGER IF EXISTS set_page_content_updated_at ON page_content;
CREATE TRIGGER set_page_content_updated_at
  BEFORE UPDATE ON page_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Reusable content blocks (nav/footer/site-settings live here) ---------------
CREATE TABLE IF NOT EXISTS content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  published BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read published blocks" ON content_blocks;
CREATE POLICY "Anyone can read published blocks"
  ON content_blocks FOR SELECT
  USING (published = true);

DROP TRIGGER IF EXISTS set_content_blocks_updated_at ON content_blocks;
CREATE TRIGGER set_content_blocks_updated_at
  BEFORE UPDATE ON content_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Page categories (self-referential tree) -----------------------------------
CREATE TABLE IF NOT EXISTS page_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  parent_id UUID REFERENCES page_categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE page_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read categories" ON page_categories;
CREATE POLICY "Anyone can read categories"
  ON page_categories FOR SELECT USING (true);

DROP TRIGGER IF EXISTS set_page_categories_updated_at ON page_categories;
CREATE TRIGGER set_page_categories_updated_at
  BEFORE UPDATE ON page_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Contact submissions --------------------------------------------------------
-- Writes come exclusively from the validated /api/contact route (service-role,
-- bypasses RLS). No public policies → RLS-enabled with no policy = no anon access.
-- Admin reads also go through the HQ-gated service-role API.
CREATE TABLE IF NOT EXISTS contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  concept TEXT NOT NULL,
  locations TEXT NOT NULL,
  current_pos TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- 5. Rate-limit ledger + atomic sliding-window check ----------------------------
CREATE TABLE IF NOT EXISTS form_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_rate_limits_lookup
  ON form_rate_limits (ip, action, created_at);
ALTER TABLE form_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_ip TEXT,
  p_action TEXT,
  p_max INT,
  p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  hit_count INT;
BEGIN
  DELETE FROM public.form_rate_limits
  WHERE ip = p_ip
    AND action = p_action
    AND created_at < now() - make_interval(secs => p_window_seconds);

  SELECT count(*) INTO hit_count
  FROM public.form_rate_limits
  WHERE ip = p_ip AND action = p_action;

  IF hit_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.form_rate_limits (ip, action) VALUES (p_ip, p_action);
  RETURN true;
END;
$$;

-- 6. Public storage bucket for CMS image uploads --------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('cms', 'cms', true)
ON CONFLICT (id) DO NOTHING;
