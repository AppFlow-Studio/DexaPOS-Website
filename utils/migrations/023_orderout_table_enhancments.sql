-- ============================================================================
-- MIGRATION: OrderOut Third-Party Delivery Integration
-- ============================================================================
-- Covers:
--   TICKET-OO-001: Integration configuration tables (4 new tables)
--   TICKET-OO-002: Extend orders table for online order support
--   TICKET-OO-009-A: Delivery pricing across all 5 cascade levels
--   TICKET-OO-020: Webhook dead letter queue
--
-- Safe to run: All operations are additive (ADD COLUMN, CREATE TABLE).
--              No existing columns or tables are modified or dropped.
-- ============================================================================


-- ============================================================================
-- PART 1: EXTEND ORDERS TABLE FOR ONLINE ORDER SUPPORT  (TICKET-OO-002)
-- ============================================================================
-- The orders table already has: customer_name, customer_phone, customer_email,
-- delivery_address (jsonb), external_id, estimated_delivery_time, metadata.
-- The order_type enum already has: dine_in, takeout, delivery, online, catering.
-- We map OrderOut PICKUP -> takeout and DELIVERY -> delivery. No enum changes.
--
-- These new columns tell us WHERE the order came from, WHICH platform sent it,
-- the platform own order number (for receipts/KDS), when it should be ready,
-- and whether payment was already collected externally.
-- ============================================================================

-- Where the order originated: pos (default), orderout, online_store, phone
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_source text DEFAULT 'pos';

COMMENT ON COLUMN orders.order_source IS
  'Origin of the order. pos = in-house POS, orderout = delivery platform via OrderOut, online_store = branded online ordering, phone = phone-in order.';

-- Which delivery platform sent it (NULL for non-delivery orders)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_platform text;

COMMENT ON COLUMN orders.delivery_platform IS
  'Delivery platform name: UberEats, DoorDash, Grubhub, etc. NULL for non-delivery orders.';

-- Platform order number (shown on receipts, KDS, for customer communication)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS platform_order_number text;

COMMENT ON COLUMN orders.platform_order_number IS
  'External platform order number for display on receipts and KDS. Different from our internal order_number.';

-- When the platform expects the order to be ready for pickup/handoff
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz;

COMMENT ON COLUMN orders.estimated_ready_at IS
  'When the delivery platform expects the order ready. Drives KDS countdown timers and urgency colors.';

-- Delivery platform orders come pre-paid
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_prepaid boolean DEFAULT false;

COMMENT ON COLUMN orders.is_prepaid IS
  'When true, customer already paid through the delivery platform. No payment processing needed on POS.';

-- Index: filter/report by order source
CREATE INDEX IF NOT EXISTS idx_orders_order_source_created
  ON orders (order_source, created_at DESC);

-- Index: filter by delivery platform
CREATE INDEX IF NOT EXISTS idx_orders_delivery_platform_created
  ON orders (delivery_platform, created_at DESC)
  WHERE delivery_platform IS NOT NULL;


-- ============================================================================
-- PART 2: DELIVERY PRICING  ALL 5 CASCADE LEVELS  (TICKET-OO-009-A)
-- ============================================================================
-- Merchants commonly mark up 15-30% for delivery to offset platform commissions.
-- Delivery price follows the SAME 5-level COALESCE cascade as regular price:
--
--   L1 menu_items.delivery_price
--   L2 category_items.custom_delivery_price
--   L3 location_item_overrides.custom_delivery_price
--   L4 location_category_item_overrides.custom_delivery_price
--   L5 location_menu_item_overrides.custom_delivery_price
--
-- When use_delivery_price=false OR all delivery columns are NULL at every level,
-- the system falls back to the regular effective_price.
-- ============================================================================

-- LEVEL 1: Global Base (menu_items)
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS delivery_price numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS use_delivery_price boolean DEFAULT false;

COMMENT ON COLUMN menu_items.delivery_price IS
  'Base delivery price in dollars. NULL = fall back to regular price when delivery pricing is active.';
COMMENT ON COLUMN menu_items.use_delivery_price IS
  'Master toggle per item. When true, the delivery price cascade is evaluated for this item.';

-- LEVEL 2: Category Assignment (category_items)
ALTER TABLE category_items
  ADD COLUMN IF NOT EXISTS custom_delivery_price numeric DEFAULT NULL;

COMMENT ON COLUMN category_items.custom_delivery_price IS
  'Delivery price override when item appears in this category. Overrides menu_items.delivery_price.';

-- LEVEL 3: Location-Item Override (location_item_overrides)
ALTER TABLE location_item_overrides
  ADD COLUMN IF NOT EXISTS custom_delivery_price numeric DEFAULT NULL;

COMMENT ON COLUMN location_item_overrides.custom_delivery_price IS
  'Location-level delivery price override for this item across all contexts at this location.';

-- LEVEL 4: Location-Category-Item Override (location_category_item_overrides)
ALTER TABLE location_category_item_overrides
  ADD COLUMN IF NOT EXISTS custom_delivery_price numeric DEFAULT NULL;

COMMENT ON COLUMN location_category_item_overrides.custom_delivery_price IS
  'Location+category-specific delivery price override. More specific than location_item_overrides.';

-- LEVEL 5: Location-Menu-Item Override (location_menu_item_overrides)
ALTER TABLE location_menu_item_overrides
  ADD COLUMN IF NOT EXISTS custom_delivery_price numeric DEFAULT NULL;

COMMENT ON COLUMN location_menu_item_overrides.custom_delivery_price IS
  'Most specific delivery price: per location, per menu context. Wins over all other levels.';

-- MODIFIERS: 2-level cascade
ALTER TABLE modifier_group_items
  ADD COLUMN IF NOT EXISTS delivery_price_modifier numeric DEFAULT NULL;

COMMENT ON COLUMN modifier_group_items.delivery_price_modifier IS
  'Base delivery surcharge for this modifier. NULL = use regular price_modifier for delivery.';

ALTER TABLE location_modifier_item_overrides
  ADD COLUMN IF NOT EXISTS delivery_price_modifier numeric DEFAULT NULL;

COMMENT ON COLUMN location_modifier_item_overrides.delivery_price_modifier IS
  'Location-specific delivery surcharge override for this modifier option.';


-- ============================================================================
-- PART 3: ORDEROUT INTEGRATION TABLES  (TICKET-OO-001)
-- ============================================================================
-- Relationship chain:
--   merchants(1) <-> (1)orderout_accounts
--   orderout_accounts(1) <-> (N)orderout_restaurants
--   locations(1) <-> (1)orderout_restaurants
--   orderout_restaurants(1) <-> (N)orderout_menu_syncs
--   orderout_restaurants(1) <-> (N)orderout_orders
--   orders(1) <-> (1)orderout_orders
-- ============================================================================

-- 3A: orderout_accounts
CREATE TABLE IF NOT EXISTS orderout_accounts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id            uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  oo_account_id          text,
  oo_billing_account_id  text NOT NULL DEFAULT '5546155819794432',
  account_manager_email  text NOT NULL,
  status                 text NOT NULL DEFAULT 'pending',
  raw_response           jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_orderout_accounts_merchant UNIQUE (merchant_id),
  CONSTRAINT chk_orderout_accounts_status
    CHECK (status IN ('pending', 'active', 'suspended', 'error'))
);

COMMENT ON TABLE orderout_accounts IS
  'Links each DexaPOS merchant to their OrderOut account. One-to-one with merchants.';

-- 3B: orderout_restaurants
CREATE TABLE IF NOT EXISTS orderout_restaurants (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orderout_account_id    uuid NOT NULL REFERENCES orderout_accounts(id) ON DELETE CASCADE,
  location_id            uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  oo_restaurant_id       text,
  pos_uuid               text NOT NULL,
  status                 text NOT NULL DEFAULT 'pending',
  connected_channels     jsonb DEFAULT '[]'::jsonb,
  auto_accept_orders     boolean NOT NULL DEFAULT true,
  auto_print             boolean NOT NULL DEFAULT true,
  prep_time_minutes      integer NOT NULL DEFAULT 20,
  is_accepting_orders    boolean NOT NULL DEFAULT true,
  use_delivery_pricing   boolean NOT NULL DEFAULT true,
  last_order_received_at timestamptz,
  raw_response           jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_orderout_restaurants_location UNIQUE (location_id),
  CONSTRAINT uq_orderout_restaurants_pos_uuid UNIQUE (pos_uuid),
  CONSTRAINT chk_orderout_restaurants_status
    CHECK (status IN ('pending', 'active', 'paused', 'error')),
  CONSTRAINT chk_orderout_restaurants_prep_time
    CHECK (prep_time_minutes > 0 AND prep_time_minutes <= 120)
);

COMMENT ON TABLE orderout_restaurants IS
  'Links each DexaPOS location to an OrderOut restaurant. Stores per-location delivery settings.';
COMMENT ON COLUMN orderout_restaurants.pos_uuid IS
  'Critical: OrderOut routes incoming orders using this ID. Must match what we send during onboarding.';
COMMENT ON COLUMN orderout_restaurants.use_delivery_pricing IS
  'Master toggle. When false, all items push at regular POS prices to delivery platforms.';

-- 3C: orderout_menu_syncs
CREATE TABLE IF NOT EXISTS orderout_menu_syncs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orderout_restaurant_id uuid NOT NULL REFERENCES orderout_restaurants(id) ON DELETE CASCADE,
  oo_menu_id             text,
  menu_id                uuid REFERENCES menus(id) ON DELETE SET NULL,
  sync_direction         text NOT NULL,
  sync_status            text NOT NULL DEFAULT 'pending',
  items_synced           integer NOT NULL DEFAULT 0,
  items_failed           integer NOT NULL DEFAULT 0,
  error_details          jsonb,
  pushed_to_channels     text[],
  menu_payload_snapshot  jsonb,
  synced_at              timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_menu_syncs_direction
    CHECK (sync_direction IN ('push', 'pull')),
  CONSTRAINT chk_menu_syncs_status
    CHECK (sync_status IN ('pending', 'syncing', 'success', 'failed', 'partial'))
);

COMMENT ON TABLE orderout_menu_syncs IS
  'Audit log for every menu sync between DexaPOS and OrderOut.';
COMMENT ON COLUMN orderout_menu_syncs.menu_payload_snapshot IS
  'Complete OrderOut-format JSON that was pushed. Useful for debugging menu discrepancies.';

-- 3D: orderout_orders
CREATE TABLE IF NOT EXISTS orderout_orders (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  orderout_restaurant_id   uuid NOT NULL REFERENCES orderout_restaurants(id) ON DELETE CASCADE,
  oo_order_number          text NOT NULL,
  oo_external_reference_id text,
  delivery_platform        text NOT NULL,
  event_type               text NOT NULL,
  order_type               text NOT NULL,
  customer_name            text,
  customer_phone           text,
  customer_email           text,
  delivery_address         jsonb,
  ready_by                 timestamptz,
  placed_on                timestamptz,
  platform_payment_status  text,
  platform_subtotal        numeric,
  platform_tax             numeric,
  platform_delivery_fee    numeric,
  platform_service_fee     numeric,
  platform_tip             numeric,
  platform_discount        numeric,
  platform_total           numeric,
  accept_status            text NOT NULL DEFAULT 'pending',
  accepted_at              timestamptz,
  rejected_at              timestamptz,
  reject_reason            text,
  cancelled_at             timestamptz,
  cancel_source            text,
  raw_webhook_payload      jsonb NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_orderout_orders_order UNIQUE (order_id),
  CONSTRAINT chk_oo_orders_accept_status
    CHECK (accept_status IN ('pending', 'accepted', 'rejected')),
  CONSTRAINT chk_oo_orders_event_type
    CHECK (event_type IN ('received', 'cancelled', 'modified')),
  CONSTRAINT chk_oo_orders_order_type
    CHECK (order_type IN ('PICKUP', 'DELIVERY')),
  CONSTRAINT chk_oo_orders_cancel_source
    CHECK (cancel_source IS NULL OR cancel_source IN ('platform', 'merchant', 'customer'))
);

COMMENT ON TABLE orderout_orders IS
  'Bridge table linking OrderOut delivery orders to DexaPOS orders. Stores platform-specific metadata.';
COMMENT ON COLUMN orderout_orders.raw_webhook_payload IS
  'Complete incoming webhook JSON. Never delete: needed for dispute resolution and reconciliation.';
COMMENT ON COLUMN orderout_orders.oo_order_number IS
  'OrderOut order number. Used as idempotency key to prevent duplicate order creation.';


-- ============================================================================
-- PART 4: WEBHOOK DEAD LETTER QUEUE  (TICKET-OO-020)
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_dead_letter_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL DEFAULT 'orderout',
  event_type      text,
  raw_payload     jsonb NOT NULL,
  error_message   text,
  retry_count     integer NOT NULL DEFAULT 0,
  max_retries     integer NOT NULL DEFAULT 5,
  next_retry_at   timestamptz,
  status          text NOT NULL DEFAULT 'pending',
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_dlq_status
    CHECK (status IN ('pending', 'retrying', 'resolved', 'abandoned'))
);

COMMENT ON TABLE webhook_dead_letter_queue IS
  'Stores failed webhook payloads for retry. Ensures no delivery orders are lost.';


-- ============================================================================
-- PART 5: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_oo_accounts_merchant
  ON orderout_accounts (merchant_id);

CREATE INDEX IF NOT EXISTS idx_oo_restaurants_oo_id
  ON orderout_restaurants (oo_restaurant_id)
  WHERE oo_restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oo_restaurants_location
  ON orderout_restaurants (location_id);

CREATE INDEX IF NOT EXISTS idx_oo_menu_syncs_restaurant_created
  ON orderout_menu_syncs (orderout_restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oo_orders_oo_number
  ON orderout_orders (oo_order_number);

CREATE INDEX IF NOT EXISTS idx_oo_orders_order
  ON orderout_orders (order_id);

CREATE INDEX IF NOT EXISTS idx_oo_orders_restaurant_created
  ON orderout_orders (orderout_restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oo_orders_platform_created
  ON orderout_orders (delivery_platform, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dlq_pending_retry
  ON webhook_dead_letter_queue (status, next_retry_at)
  WHERE status IN ('pending', 'retrying');


-- ============================================================================
-- PART 6: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE orderout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orderout_restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orderout_menu_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orderout_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_dead_letter_queue ENABLE ROW LEVEL SECURITY;

-- orderout_accounts
CREATE POLICY "oo_accounts_select_own" ON orderout_accounts
  FOR SELECT USING (is_merchant_admin(merchant_id));

CREATE POLICY "oo_accounts_insert_own" ON orderout_accounts
  FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));

CREATE POLICY "oo_accounts_update_own" ON orderout_accounts
  FOR UPDATE USING (is_merchant_admin(merchant_id));

-- orderout_restaurants
CREATE POLICY "oo_restaurants_select_own" ON orderout_restaurants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orderout_accounts oa
      WHERE oa.id = orderout_restaurants.orderout_account_id
        AND is_merchant_admin(oa.merchant_id)
    )
  );

CREATE POLICY "oo_restaurants_insert_own" ON orderout_restaurants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orderout_accounts oa
      WHERE oa.id = orderout_restaurants.orderout_account_id
        AND is_merchant_admin(oa.merchant_id)
    )
  );

CREATE POLICY "oo_restaurants_update_own" ON orderout_restaurants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM orderout_accounts oa
      WHERE oa.id = orderout_restaurants.orderout_account_id
        AND is_merchant_admin(oa.merchant_id)
    )
  );

-- orderout_menu_syncs
CREATE POLICY "oo_menu_syncs_select_own" ON orderout_menu_syncs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orderout_restaurants orr
      JOIN orderout_accounts oa ON oa.id = orr.orderout_account_id
      WHERE orr.id = orderout_menu_syncs.orderout_restaurant_id
        AND is_merchant_admin(oa.merchant_id)
    )
  );

CREATE POLICY "oo_menu_syncs_insert_own" ON orderout_menu_syncs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orderout_restaurants orr
      JOIN orderout_accounts oa ON oa.id = orr.orderout_account_id
      WHERE orr.id = orderout_menu_syncs.orderout_restaurant_id
        AND is_merchant_admin(oa.merchant_id)
    )
  );

-- orderout_orders
CREATE POLICY "oo_orders_select_own" ON orderout_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orderout_restaurants orr
      JOIN orderout_accounts oa ON oa.id = orr.orderout_account_id
      WHERE orr.id = orderout_orders.orderout_restaurant_id
        AND is_merchant_admin(oa.merchant_id)
    )
  );

CREATE POLICY "oo_orders_update_own" ON orderout_orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM orderout_restaurants orr
      JOIN orderout_accounts oa ON oa.id = orr.orderout_account_id
      WHERE orr.id = orderout_orders.orderout_restaurant_id
        AND is_merchant_admin(oa.merchant_id)
    )
  );

-- webhook_dead_letter_queue: admin-only, managed via service_role. No client policies.


-- ============================================================================
-- PART 7: UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_oo_accounts_updated_at
  BEFORE UPDATE ON orderout_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_oo_restaurants_updated_at
  BEFORE UPDATE ON orderout_restaurants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_dlq_updated_at
  BEFORE UPDATE ON webhook_dead_letter_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================================
-- PART 8: HELPER FUNCTION  RESOLVE EFFECTIVE DELIVERY PRICE
-- ============================================================================
-- Resolves delivery price for a menu item at a specific location through the
-- 5-level cascade. Returns NULL when no delivery price is set, signaling the
-- caller to fall back to the regular effective_price.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_effective_delivery_price(
  p_menu_item_id uuid,
  p_location_id uuid,
  p_category_id uuid DEFAULT NULL,
  p_menu_id uuid DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
  v_delivery_price numeric;
BEGIN
  SELECT COALESCE(
    (SELECT lmio.custom_delivery_price
     FROM location_menu_item_overrides lmio
     WHERE lmio.menu_item_id = p_menu_item_id
       AND lmio.location_id = p_location_id
       AND lmio.menu_id = p_menu_id
       AND lmio.custom_delivery_price IS NOT NULL
     LIMIT 1),
    (SELECT lcio.custom_delivery_price
     FROM location_category_item_overrides lcio
     WHERE lcio.menu_item_id = p_menu_item_id
       AND lcio.location_id = p_location_id
       AND lcio.category_id = p_category_id
       AND lcio.custom_delivery_price IS NOT NULL
     LIMIT 1),
    (SELECT lio.custom_delivery_price
     FROM location_item_overrides lio
     WHERE lio.menu_item_id = p_menu_item_id
       AND lio.location_id = p_location_id
       AND lio.custom_delivery_price IS NOT NULL
     LIMIT 1),
    (SELECT ci.custom_delivery_price
     FROM category_items ci
     WHERE ci.menu_item_id = p_menu_item_id
       AND ci.category_id = p_category_id
       AND ci.custom_delivery_price IS NOT NULL
     LIMIT 1),
    (SELECT mi.delivery_price
     FROM menu_items mi
     WHERE mi.id = p_menu_item_id
       AND mi.delivery_price IS NOT NULL)
  ) INTO v_delivery_price;

  RETURN v_delivery_price;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_effective_delivery_price IS
  'Resolves delivery price through the 5-level cascade. Returns NULL if no delivery price is set (caller falls back to regular effective_price).';