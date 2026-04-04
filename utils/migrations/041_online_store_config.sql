-- ============================================================================
-- Migration 041: Online Store Config, Pages, Delivery Zones, Order Sessions
-- Replaces `sites` as the source of truth for online store configuration
-- ============================================================================

BEGIN;

-- ============================================================================
-- TABLE 1: online_store_config
-- Master configuration table for each merchant's online store.
-- One row per location.
-- ============================================================================

CREATE TABLE public.online_store_config (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id           uuid NOT NULL REFERENCES public.merchants(id),
  location_id           uuid NOT NULL REFERENCES public.locations(id),

  -- Identity
  slug                  text NOT NULL UNIQUE,
  custom_domain         text UNIQUE,
  store_name            text NOT NULL,

  -- Template & Branding
  template_id           text NOT NULL DEFAULT 'classic' CHECK (template_id IN (
                          'classic', 'bold', 'minimal'
                        )),
  primary_color         text NOT NULL DEFAULT '#2DD4BF',
  secondary_color       text,
  accent_color          text,
  background_color      text NOT NULL DEFAULT '#FFFFFF',
  text_color            text NOT NULL DEFAULT '#111827',
  font_family           text DEFAULT 'DM Sans',

  -- Assets
  logo_url              text,
  hero_image_url        text,
  favicon_url           text,
  og_image_url          text,

  -- Business Info
  description           text,
  phone                 text,
  email                 text,
  address               jsonb,

  -- Operating Hours
  operating_hours       jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Online Ordering Settings
  is_active             boolean NOT NULL DEFAULT false,
  accepts_pickup        boolean NOT NULL DEFAULT true,
  accepts_delivery      boolean NOT NULL DEFAULT false,
  min_order_cents       integer DEFAULT 0,
  estimated_prep_minutes integer DEFAULT 20,
  max_future_order_days integer DEFAULT 0,

  -- Delivery Settings
  delivery_fee_cents    integer DEFAULT 0,
  free_delivery_threshold_cents integer,
  delivery_radius_miles numeric(5,2),

  -- Tipping
  tip_enabled           boolean NOT NULL DEFAULT true,
  tip_presets           jsonb DEFAULT '[15, 18, 20, 25]'::jsonb,

  -- Payment
  ipospays_tpn          text,

  -- SEO
  meta_title            text,
  meta_description      text,

  -- Analytics
  google_analytics_id   text,
  facebook_pixel_id     text,

  -- State
  published_at          timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_store_per_location UNIQUE (merchant_id, location_id)
);

-- ============================================================================
-- TABLE 2: online_store_pages
-- Custom content blocks for the landing page.
-- ============================================================================

CREATE TABLE public.online_store_pages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_config_id       uuid NOT NULL REFERENCES public.online_store_config(id) ON DELETE CASCADE,

  page_type             text NOT NULL DEFAULT 'home' CHECK (page_type IN ('home', 'about', 'custom')),
  section_type          text NOT NULL CHECK (section_type IN (
                          'hero', 'announcement', 'about', 'gallery', 'hours', 'location_map', 'reviews', 'custom_html'
                        )),

  title                 text,
  subtitle              text,
  body_text             text,
  image_url             text,
  images                jsonb,
  cta_text              text,
  cta_link              text,

  display_order         integer NOT NULL DEFAULT 0,
  is_visible            boolean NOT NULL DEFAULT true,

  style_overrides       jsonb DEFAULT '{}'::jsonb,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- TABLE 3: delivery_zones
-- Geographic delivery zones with per-zone fees and minimum order amounts.
-- ============================================================================

CREATE TABLE public.delivery_zones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_config_id       uuid NOT NULL REFERENCES public.online_store_config(id) ON DELETE CASCADE,

  zone_name             text NOT NULL,

  zone_type             text NOT NULL CHECK (zone_type IN ('radius', 'polygon')),
  radius_miles          numeric(5,2),
  polygon_coordinates   jsonb,

  delivery_fee_cents    integer NOT NULL DEFAULT 0,
  min_order_cents       integer DEFAULT 0,
  free_delivery_threshold_cents integer,

  estimated_minutes     integer DEFAULT 30,

  is_active             boolean NOT NULL DEFAULT true,
  display_order         integer NOT NULL DEFAULT 0,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- TABLE 4: online_order_sessions
-- Tracks customer sessions through the ordering flow.
-- ============================================================================

CREATE TABLE public.online_order_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_config_id       uuid NOT NULL REFERENCES public.online_store_config(id),

  customer_id           uuid REFERENCES public.customers(id),
  customer_phone        text,
  customer_name         text,
  customer_email        text,

  supabase_auth_id      uuid,
  is_authenticated      boolean NOT NULL DEFAULT false,

  order_type            text CHECK (order_type IN ('pickup', 'delivery')),
  delivery_address      jsonb,
  delivery_zone_id      uuid REFERENCES public.delivery_zones(id),

  cart_data             jsonb DEFAULT '[]'::jsonb,

  loyalty_points_balance integer DEFAULT 0,
  loyalty_points_to_apply integer DEFAULT 0,

  order_id              uuid REFERENCES public.orders(id),

  requested_time        timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz DEFAULT (now() + interval '2 hours')
);

-- ============================================================================
-- TRIGGERS: updated_at
-- ============================================================================

CREATE TRIGGER update_online_store_config_updated_at
  BEFORE UPDATE ON public.online_store_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_online_store_pages_updated_at
  BEFORE UPDATE ON public.online_store_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_zones_updated_at
  BEFORE UPDATE ON public.delivery_zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_online_order_sessions_updated_at
  BEFORE UPDATE ON public.online_order_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_online_store_config_slug ON public.online_store_config(slug);
CREATE INDEX idx_online_store_config_custom_domain ON public.online_store_config(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX idx_online_store_config_merchant_id ON public.online_store_config(merchant_id);
CREATE INDEX idx_online_store_config_location_id ON public.online_store_config(location_id);

CREATE INDEX idx_online_store_pages_store_config_id ON public.online_store_pages(store_config_id);
CREATE INDEX idx_delivery_zones_store_config_id ON public.delivery_zones(store_config_id);
CREATE INDEX idx_online_order_sessions_store_config_id ON public.online_order_sessions(store_config_id);
CREATE INDEX idx_online_order_sessions_customer_id ON public.online_order_sessions(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_online_order_sessions_expires_at ON public.online_order_sessions(expires_at);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.online_store_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_store_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_sessions ENABLE ROW LEVEL SECURITY;

-- online_store_config: public read (storefront), authenticated merchant write
CREATE POLICY "Public can read active store configs"
  ON public.online_store_config FOR SELECT
  USING (is_active = true);

CREATE POLICY "Service role full access to store configs"
  ON public.online_store_config FOR ALL
  USING (true)
  WITH CHECK (true);

-- online_store_pages: public read, service role write
CREATE POLICY "Public can read visible store pages"
  ON public.online_store_pages FOR SELECT
  USING (is_visible = true);

CREATE POLICY "Service role full access to store pages"
  ON public.online_store_pages FOR ALL
  USING (true)
  WITH CHECK (true);

-- delivery_zones: public read active zones, service role write
CREATE POLICY "Public can read active delivery zones"
  ON public.delivery_zones FOR SELECT
  USING (is_active = true);

CREATE POLICY "Service role full access to delivery zones"
  ON public.delivery_zones FOR ALL
  USING (true)
  WITH CHECK (true);

-- online_order_sessions: public can create, service role manages
CREATE POLICY "Anyone can create order sessions"
  ON public.online_order_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Sessions readable by session owner or service role"
  ON public.online_order_sessions FOR SELECT
  USING (true);

CREATE POLICY "Service role full access to order sessions"
  ON public.online_order_sessions FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- DATA MIGRATION: Copy existing sites into online_store_config
-- ============================================================================

INSERT INTO public.online_store_config (
  merchant_id,
  location_id,
  slug,
  custom_domain,
  store_name,
  primary_color,
  secondary_color,
  logo_url,
  hero_image_url,
  favicon_url,
  description,
  phone,
  email,
  operating_hours,
  is_active,
  accepts_pickup,
  accepts_delivery,
  min_order_cents,
  estimated_prep_minutes,
  tip_enabled,
  tip_presets,
  delivery_fee_cents,
  free_delivery_threshold_cents,
  created_at,
  updated_at
)
SELECT
  s.merchant_id,
  s.location_id,
  COALESCE(s.subdomain, 'store-' || LEFT(s.id::text, 8)),
  s.custom_domain,
  COALESCE(s.title, 'Online Store'),
  COALESCE((s.theme_config->>'primaryColor'), '#2DD4BF'),
  (s.theme_config->>'secondaryColor'),
  s.logo_url,
  (s.theme_config->>'heroImageUrl'),
  (s.theme_config->>'faviconUrl'),
  s.description,
  l.phone,
  l.email,
  COALESCE(l.business_hours, '[]'::jsonb),
  COALESCE(s.is_active, false),
  COALESCE((s.online_ordering_config->>'pickupEnabled')::boolean, true),
  COALESCE((s.online_ordering_config->>'deliveryEnabled')::boolean, false),
  COALESCE((s.online_ordering_config->>'minimumOrderAmount')::integer * 100, 0),
  COALESCE((s.online_ordering_config->>'preparationLeadTime')::integer, 20),
  COALESCE((s.online_ordering_config->>'tippingEnabled')::boolean, true),
  COALESCE(s.online_ordering_config->'tipConfig'->'presetPercentages', '[15, 18, 20, 25]'::jsonb),
  COALESCE((s.online_ordering_config->>'baseDeliveryFee')::integer * 100, 0),
  CASE
    WHEN (s.online_ordering_config->>'freeDeliveryThreshold') IS NOT NULL
    THEN (s.online_ordering_config->>'freeDeliveryThreshold')::integer * 100
    ELSE NULL
  END,
  s.created_at,
  s.updated_at
FROM public.sites s
LEFT JOIN public.locations l ON l.id = s.location_id
WHERE s.location_id IS NOT NULL;

COMMIT;
