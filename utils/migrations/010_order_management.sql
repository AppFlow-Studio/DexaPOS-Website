-- ============================================================================
-- DEXA POS - ORDER MANAGEMENT SYSTEM
-- Complete Database Schema for Order Processing & Syncing
-- ============================================================================
-- This schema supports:
-- 1. Dejavoo SPINAPI (external terminal via iPad)
-- 2. DVPaylite (native on P18 tablet)
-- 3. Cash payments
-- Real-time syncing between POS tablet and Admin Dashboard
-- ============================================================================

-- ============================================================================
-- ENUMS & TYPES
-- ============================================================================

-- Order Status Enum
CREATE TYPE order_status AS ENUM (
  'draft',              -- Order being built on POS (not yet sent to kitchen)
  'pending',            -- Order sent to kitchen, awaiting preparation
  'preparing',          -- Kitchen is preparing the order
  'ready',              -- Order ready for pickup/service
  'completed',          -- Order fulfilled and closed
  'cancelled',          -- Order cancelled
  'refunded',           -- Order refunded (partial or full)
  'void'                -- Order voided before completion
);

-- Order Type Enum
CREATE TYPE order_type AS ENUM (
  'dine_in',            -- Table service
  'takeout',            -- Pickup
  'delivery',           -- Delivery order
  'online',             -- Online/third-party order
  'catering'            -- Catering order
);

-- Payment Status Enum
CREATE TYPE payment_status AS ENUM (
  'pending',            -- Payment initiated
  'processing',         -- Payment being processed
  'authorized',         -- Card authorized, not captured
  'captured',           -- Payment captured/settled
  'failed',             -- Payment failed
  'declined',           -- Card declined
  'refunded',           -- Payment refunded
  'partially_refunded', -- Partial refund
  'void'                -- Payment voided
);

-- Payment Method Enum
CREATE TYPE payment_method AS ENUM (
  'cash',               -- Cash payment
  'card_spinapi',       -- Card via Dejavoo SPINAPI
  'card_dvpaylite',     -- Card via DVPaylite
  'card_manual',        -- Manual card entry
  'gift_card',          -- Gift card
  'house_account',      -- House account/tab
  'external'            -- External payment (delivery apps, etc)
);

-- Payment Terminal Type Enum
CREATE TYPE terminal_type AS ENUM (
  'dejavoo_spinapi',    -- External Dejavoo terminal
  'dejavoo_p18',        -- Dejavoo P18 tablet with DVPaylite
  'manual',             -- Manual entry
  'none'                -- No terminal (cash, etc)
);

-- ============================================================================
-- MAIN ORDERS TABLE
-- ============================================================================

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identifiers
  order_number TEXT NOT NULL UNIQUE,        -- Human-readable order number (e.g., "1234")
  display_number TEXT,                      -- Display number for kitchen (e.g., "#42")
  external_id TEXT,                         -- External system ID (delivery apps, etc)
  
  -- Organizational Context
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  
  -- Order Details
  order_type order_type NOT NULL DEFAULT 'dine_in',
  status order_status NOT NULL DEFAULT 'draft',
  
  -- Customer Information (optional for most restaurant orders)
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  table_number TEXT,                        -- For dine-in
  seat_number TEXT,                         -- For multi-seat tables
  
  -- Staff Information
  created_by_staff_id UUID REFERENCES public.staff_profiles(id),
  created_by_user_id TEXT REFERENCES public.users(id),
  assigned_server_id UUID REFERENCES public.staff_profiles(id),
  
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_to_kitchen_at TIMESTAMPTZ,          -- When order was fired to kitchen
  started_preparing_at TIMESTAMPTZ,        -- When kitchen started
  ready_at TIMESTAMPTZ,                    -- When order was marked ready
  completed_at TIMESTAMPTZ,                -- When order was completed
  cancelled_at TIMESTAMPTZ,                -- When order was cancelled
  
  -- Financial Information
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  tip_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  service_charge NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  
  -- Payment Status
  payment_status payment_status NOT NULL DEFAULT 'pending',
  amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  amount_due NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  
  -- Dual Pricing Support
  cash_discount_applied BOOLEAN DEFAULT FALSE,
  cash_discount_amount NUMERIC(10, 2) DEFAULT 0.00,
  
  -- Special Instructions & Notes
  special_instructions TEXT,
  internal_notes TEXT,                      -- Staff notes not shown to kitchen
  kitchen_notes TEXT,                       -- Notes shown to kitchen
  cancellation_reason TEXT,
  
  -- Delivery Information (if applicable)
  delivery_address JSONB,                   -- {street, city, state, zip, instructions}
  estimated_delivery_time TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  
  -- Metadata
  device_id TEXT,                           -- POS device that created order
  metadata JSONB DEFAULT '{}'::jsonb,       -- Flexible metadata
  
  -- Audit Fields
  last_synced_at TIMESTAMPTZ,              -- Last sync with backend
  sync_version INTEGER DEFAULT 1,          -- Optimistic locking
  is_offline BOOLEAN DEFAULT FALSE,        -- Created while offline
  
  -- Constraints
  CONSTRAINT positive_amounts CHECK (
    subtotal >= 0 AND 
    tax_amount >= 0 AND 
    tip_amount >= 0 AND 
    discount_amount >= 0 AND 
    service_charge >= 0 AND 
    total_amount >= 0 AND
    amount_paid >= 0 AND
    amount_due >= 0
  ),
  CONSTRAINT valid_status_transitions CHECK (
    (status = 'draft' AND sent_to_kitchen_at IS NULL) OR
    (status != 'draft')
  )
);

-- Indexes for performance
CREATE INDEX idx_orders_merchant_location ON public.orders(merchant_id, location_id);
CREATE INDEX idx_orders_status ON public.orders(status) WHERE status NOT IN ('completed', 'cancelled', 'void');
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_orders_order_number ON public.orders(order_number);
CREATE INDEX idx_orders_customer_phone ON public.orders(customer_phone) WHERE customer_phone IS NOT NULL;
CREATE INDEX idx_orders_payment_status ON public.orders(payment_status) WHERE payment_status != 'captured';
CREATE INDEX idx_orders_sync ON public.orders(last_synced_at, sync_version);

-- ============================================================================
-- ORDER ITEMS TABLE
-- ============================================================================

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- Item Reference
  menu_item_id UUID REFERENCES public.menu_items(id),
  location_exclusive_item_id UUID REFERENCES public.location_exclusive_items(id),
  
  -- Item Details (denormalized for historical accuracy)
  item_name TEXT NOT NULL,
  item_description TEXT,
  category_name TEXT,
  
  -- Quantity & Pricing
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10, 2) NOT NULL,
  cash_price NUMERIC(10, 2),               -- Dual pricing support
  price_paid NUMERIC(10, 2) NOT NULL,      -- Actual price paid (after cash discount if applicable)
  subtotal NUMERIC(10, 2) NOT NULL,        -- quantity * price_paid
  
  -- Size Selection (if applicable)
  selected_size_id UUID REFERENCES public.item_sizes(id),
  selected_size_name TEXT,
  size_price_modifier NUMERIC(10, 2) DEFAULT 0.00,
  
  -- Item State
  item_status TEXT NOT NULL DEFAULT 'pending', -- pending, preparing, ready, served, cancelled
  is_voided BOOLEAN DEFAULT FALSE,
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.staff_profiles(id),
  
  -- Course/Timing for fine dining
  course_number INTEGER,                   -- 1=appetizer, 2=main, 3=dessert, etc
  fire_time TIMESTAMPTZ,                   -- When to start preparing
  rush BOOLEAN DEFAULT FALSE,              -- Rush this item
  
  -- Special Instructions
  special_instructions TEXT,
  kitchen_notes TEXT,
  
  -- Prep Station Assignment
  prep_station TEXT,                       -- grill, fryer, salad, bar, etc
  assigned_to_staff_id UUID REFERENCES public.staff_profiles(id),
  
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_to_kitchen_at TIMESTAMPTZ,
  started_preparing_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Display Order
  display_order INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Constraints
  CONSTRAINT order_items_menu_reference CHECK (
    (menu_item_id IS NOT NULL AND location_exclusive_item_id IS NULL) OR
    (menu_item_id IS NULL AND location_exclusive_item_id IS NOT NULL)
  ),
  CONSTRAINT positive_quantity CHECK (quantity > 0),
  CONSTRAINT positive_prices CHECK (
    unit_price >= 0 AND 
    price_paid >= 0 AND 
    subtotal >= 0
  )
);

-- Indexes
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_menu_item ON public.order_items(menu_item_id);
CREATE INDEX idx_order_items_status ON public.order_items(item_status);
CREATE INDEX idx_order_items_kitchen ON public.order_items(prep_station, item_status) 
  WHERE item_status IN ('pending', 'preparing');

-- ============================================================================
-- ORDER ITEM MODIFIERS TABLE
-- ============================================================================

CREATE TABLE public.order_item_modifiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  
  -- Modifier Reference
  modifier_group_id UUID REFERENCES public.modifier_groups(id),
  modifier_item_id UUID REFERENCES public.modifier_group_items(id),
  
  -- Modifier Details (denormalized)
  modifier_group_name TEXT NOT NULL,
  modifier_name TEXT NOT NULL,
  price_modifier NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  
  -- Quantity (for items like "extra cheese")
  quantity INTEGER NOT NULL DEFAULT 1,
  
  -- Calculated Price
  total_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- quantity * price_modifier
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT positive_modifier_quantity CHECK (quantity > 0)
);

-- Indexes
CREATE INDEX idx_order_item_modifiers_order_item ON public.order_item_modifiers(order_item_id);

-- ============================================================================
-- ORDER PAYMENTS TABLE
-- ============================================================================

CREATE TABLE public.order_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  
  -- Payment Details
  payment_method payment_method NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  tip_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(10, 2) NOT NULL, -- amount + tip_amount
  
  -- Payment Status
  status payment_status NOT NULL DEFAULT 'pending',
  
  -- Terminal Information
  terminal_type terminal_type NOT NULL,
  terminal_id TEXT,                        -- Serial number or ID of terminal
  device_id TEXT,                          -- POS device that processed payment
  
  -- Card Transaction Details (for card payments)
  transaction_id TEXT,                     -- Gateway transaction ID
  authorization_code TEXT,                 -- Auth code from processor
  reference_number TEXT,                   -- Reference number
  
  -- Card Details (masked/tokenized)
  card_type TEXT,                          -- visa, mastercard, amex, discover
  card_last_four TEXT,
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  card_token TEXT,                         -- Tokenized card for future use
  
  -- Dejavoo Specific Fields
  dejavoo_transaction_type TEXT,           -- SALE, RETURN, VOID, etc
  dejavoo_response_code TEXT,
  dejavoo_response_message TEXT,
  dejavoo_batch_number TEXT,
  dejavoo_invoice_number TEXT,
  
  -- DVPaylite Specific Fields  
  dvpaylite_request_id TEXT,
  dvpaylite_application_type TEXT,         -- Always "DVPAYLITE"
  
  -- Processing Details
  processor_name TEXT,                     -- Name of payment processor
  processor_response JSONB,                -- Full response from processor
  gateway_fee NUMERIC(10, 2),              -- Processing fee
  
  -- Dual Pricing
  cash_discount_applied BOOLEAN DEFAULT FALSE,
  original_amount NUMERIC(10, 2),          -- Amount before cash discount
  
  -- Refund Information
  refunded_amount NUMERIC(10, 2) DEFAULT 0.00,
  refund_reason TEXT,
  refunded_at TIMESTAMPTZ,
  refunded_by UUID REFERENCES public.staff_profiles(id),
  parent_payment_id UUID REFERENCES public.order_payments(id), -- For refund tracking
  
  -- Timing
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  authorized_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  
  -- Staff
  processed_by_staff_id UUID REFERENCES public.staff_profiles(id),
  processed_by_user_id TEXT REFERENCES public.users(id),
  
  -- Error Handling
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Constraints
  CONSTRAINT positive_payment_amounts CHECK (
    amount >= 0 AND 
    tip_amount >= 0 AND 
    total_amount >= 0 AND
    refunded_amount >= 0
  ),
  CONSTRAINT valid_card_exp CHECK (
    (card_exp_month IS NULL AND card_exp_year IS NULL) OR
    (card_exp_month BETWEEN 1 AND 12 AND card_exp_year >= EXTRACT(YEAR FROM CURRENT_DATE))
  )
);

-- Indexes
CREATE INDEX idx_order_payments_order ON public.order_payments(order_id);
CREATE INDEX idx_order_payments_status ON public.order_payments(status);
CREATE INDEX idx_order_payments_transaction_id ON public.order_payments(transaction_id);
CREATE INDEX idx_order_payments_card_token ON public.order_payments(card_token) WHERE card_token IS NOT NULL;
CREATE INDEX idx_order_payments_created_at ON public.order_payments(initiated_at DESC);

-- ============================================================================
-- ORDER STATUS HISTORY TABLE (Audit Trail)
-- ============================================================================

CREATE TABLE public.order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- Status Change
  from_status order_status,
  to_status order_status NOT NULL,
  
  -- Who made the change
  changed_by_staff_id UUID REFERENCES public.staff_profiles(id),
  changed_by_user_id TEXT REFERENCES public.users(id),
  device_id TEXT,
  
  -- Why the change was made
  reason TEXT,
  notes TEXT,
  
  -- When
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_order_status_history_order ON public.order_status_history(order_id);
CREATE INDEX idx_order_status_history_changed_at ON public.order_status_history(changed_at DESC);

-- ============================================================================
-- SEQUENCE FOR ORDER NUMBERS
-- ============================================================================

-- Daily sequence for order numbers (resets each day per location)
CREATE TABLE public.order_sequences (
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  sequence_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_order_number INTEGER NOT NULL DEFAULT 0,
  
  PRIMARY KEY (location_id, sequence_date)
);

CREATE INDEX idx_order_sequences_location_date ON public.order_sequences(location_id, sequence_date);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_items_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-record status changes
CREATE OR REPLACE FUNCTION record_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_status_history (
      order_id,
      from_status,
      to_status,
      changed_by_staff_id,
      changed_by_user_id,
      changed_at
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NEW.created_by_staff_id,
      NEW.created_by_user_id,
      NOW()
    );
    
    -- Update timing fields based on status
    IF NEW.status = 'pending' AND NEW.sent_to_kitchen_at IS NULL THEN
      NEW.sent_to_kitchen_at = NOW();
    ELSIF NEW.status = 'preparing' AND NEW.started_preparing_at IS NULL THEN
      NEW.started_preparing_at = NOW();
    ELSIF NEW.status = 'ready' AND NEW.ready_at IS NULL THEN
      NEW.ready_at = NOW();
    ELSIF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at = NOW();
    ELSIF NEW.status IN ('cancelled', 'void') AND NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at = NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_order_status_changes
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION record_order_status_change();

-- Auto-update order totals when items/modifiers change
CREATE OR REPLACE FUNCTION recalculate_order_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_order_id UUID;
  v_subtotal NUMERIC(10, 2);
BEGIN
  -- Determine order_id based on trigger context
  IF TG_OP = 'DELETE' THEN
    v_order_id = OLD.order_id;
  ELSE
    v_order_id = NEW.order_id;
  END IF;
  
  -- Recalculate order subtotal
  SELECT COALESCE(SUM(subtotal), 0)
  INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_order_id
    AND is_voided = FALSE;
  
  -- Update order
  UPDATE public.orders
  SET 
    subtotal = v_subtotal,
    total_amount = v_subtotal + tax_amount + service_charge - discount_amount,
    amount_due = v_subtotal + tax_amount + service_charge - discount_amount - amount_paid,
    updated_at = NOW()
  WHERE id = v_order_id;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recalculate_order_on_item_change
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_order_totals();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.orders IS 'Main orders table storing all order information with support for multiple payment methods and real-time syncing';
COMMENT ON TABLE public.order_items IS 'Individual items within an order with support for sizing, modifiers, and coursing';
COMMENT ON TABLE public.order_item_modifiers IS 'Modifiers selected for each order item';
COMMENT ON TABLE public.order_payments IS 'Payment records supporting cash, SPINAPI, DVPaylite, and other payment methods';
COMMENT ON TABLE public.order_status_history IS 'Complete audit trail of all order status changes';
COMMENT ON TABLE public.order_sequences IS 'Daily sequence tracking for order number generation per location';

COMMENT ON COLUMN public.orders.order_number IS 'Unique order number for the entire system (e.g., "ORD-20240101-0042")';
COMMENT ON COLUMN public.orders.display_number IS 'Customer-facing display number (e.g., "#42")';
COMMENT ON COLUMN public.orders.sync_version IS 'Version number for optimistic locking and conflict resolution';
COMMENT ON COLUMN public.order_payments.terminal_type IS 'Type of terminal used: dejavoo_spinapi (external), dejavoo_p18 (native DVPaylite), manual, or none';
COMMENT ON COLUMN public.order_payments.transaction_id IS 'Unique transaction ID from payment processor/gateway';