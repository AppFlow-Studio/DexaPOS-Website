-- ============================================================================
-- DEXA POS - FLOOR PLAN & TABLE MANAGEMENT SYSTEM
-- Complete schema for floor plans, tables, sessions, waitlist, reservations
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Table object types (matches your TABLE_SHAPES categories)
CREATE TYPE floor_object_category AS ENUM (
  'table',      -- Seatable tables
  'booth',      -- Booth seating
  'functional', -- Bar, cashier, host stand, server station, kitchen pass
  'structure',  -- Walls, pillars
  'decor',      -- Plants, decorations
  'zone'        -- Zones, labels
);

-- Table runtime status
CREATE TYPE table_status AS ENUM (
  'available',        -- Ready for seating
  'reserved',         -- Reserved for upcoming reservation
  'seated',           -- Guests seated, no order yet
  'ordered',          -- Order placed, waiting for food
  'served',           -- Food delivered
  'check_presented',  -- Bill given to guest
  'paid',             -- Payment complete, guests leaving
  'cleaning',         -- Being cleaned/reset
  'blocked',          -- Temporarily unavailable (e.g., broken chair)
  'not_in_service'    -- Out of service for the shift
);

-- Session event types (for timing/metrics)
CREATE TYPE session_event_type AS ENUM (
  'seated',           -- Party sat down
  'order_placed',     -- First order submitted
  'order_added',      -- Additional items ordered
  'drinks_served',    -- Drinks delivered
  'appetizers_fired', -- Apps sent to kitchen
  'appetizers_served',-- Apps delivered
  'mains_fired',      -- Mains sent to kitchen
  'mains_served',     -- Mains delivered
  'desserts_fired',   -- Desserts sent to kitchen
  'desserts_served',  -- Desserts delivered
  'check_requested',  -- Guest asked for bill
  'check_presented',  -- Bill given
  'payment_started',  -- Payment initiated
  'payment_complete', -- Payment finished
  'table_cleared',    -- Guests left
  'table_cleaned',    -- Ready for next party
  'server_visit',     -- Server checked on table
  'manager_visit',    -- Manager touched table
  'complaint',        -- Issue logged
  'comped',           -- Item comped
  'custom'            -- Custom event with note
);

-- Waitlist status
CREATE TYPE waitlist_status AS ENUM (
  'waiting',      -- In queue
  'notified',     -- SMS sent, waiting for them to arrive
  'arrived',      -- At host stand ready to sit
  'seated',       -- Now at a table
  'no_show',      -- Didn't show up after notification
  'cancelled',    -- Guest cancelled
  'expired'       -- Removed after timeout
);

-- Reservation status
CREATE TYPE reservation_status AS ENUM (
  'pending',      -- Booked, not confirmed
  'confirmed',    -- Confirmed (deposit paid or confirmed via SMS)
  'reminded',     -- Reminder sent
  'arrived',      -- Guest checked in
  'seated',       -- At table
  'completed',    -- Visit complete
  'no_show',      -- Didn't show
  'cancelled'     -- Cancelled
);

-- ============================================================================
-- FLOOR PLANS
-- ============================================================================

CREATE TABLE public.floor_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,                    -- "Main Dining Room", "Patio", "Bar"
  description TEXT,
  
  -- Canvas settings
  canvas_width INTEGER NOT NULL DEFAULT 1200,
  canvas_height INTEGER NOT NULL DEFAULT 800,
  grid_size INTEGER DEFAULT 20,          -- Snap-to-grid size
  background_color TEXT DEFAULT '#f5f5f5',
  
  -- Display settings
  display_order INTEGER DEFAULT 0,       -- Order in tab list
  is_active BOOLEAN DEFAULT TRUE,        -- Currently in use
  is_default BOOLEAN DEFAULT FALSE,      -- Default floor plan for location
  
  -- Metadata
  created_by UUID REFERENCES public.staff_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_location_floor_plan_name UNIQUE (location_id, name)
);

-- Indexes
CREATE INDEX idx_floor_plans_location ON public.floor_plans(location_id);
CREATE INDEX idx_floor_plans_merchant ON public.floor_plans(merchant_id);
CREATE INDEX idx_floor_plans_active ON public.floor_plans(location_id) WHERE is_active = TRUE;

COMMENT ON TABLE public.floor_plans IS 'Floor plan layouts for each location (Main Dining, Patio, Bar, etc.)';

-- ============================================================================
-- FLOOR PLAN OBJECTS (Tables, Decorations, Walls, etc.)
-- ============================================================================

CREATE TABLE public.floor_plan_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id UUID NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  
  -- Object identification
  name TEXT NOT NULL,                    -- "Table 1", "Booth 5", "Main Bar"
  shape_id TEXT NOT NULL,                -- References your TABLE_SHAPES key
  category floor_object_category NOT NULL,
  
  -- Position & rotation
  x NUMERIC(10, 2) NOT NULL DEFAULT 0,
  y NUMERIC(10, 2) NOT NULL DEFAULT 0,
  rotation NUMERIC(10, 2) DEFAULT 0,     -- Degrees
  
  -- Dimensions (from shape, but can be overridden for zones)
  width NUMERIC(10, 2),
  height NUMERIC(10, 2),
  
  -- Table-specific (only for category = 'table' or 'booth')
  capacity INTEGER,                      -- Max guests (from shape or overridden)
  min_capacity INTEGER DEFAULT 1,        -- Minimum party size
  is_reservable BOOLEAN DEFAULT TRUE,    -- Can be reserved?
  is_combinable BOOLEAN DEFAULT TRUE,    -- Can merge with adjacent tables?
  default_turn_time INTEGER DEFAULT 90,  -- Expected minutes per party
  
  -- Sections & assignments
  section_id UUID,                       -- FK to server_sections (optional)
  zone_name TEXT,                        -- "Window", "Quiet Area", "Near Bar"
  
  -- Display customization
  label_override TEXT,                   -- Override display name on floor plan
  color_override TEXT,                   -- Custom color for this object
  z_index INTEGER DEFAULT 1,             -- Layering order
  is_visible BOOLEAN DEFAULT TRUE,       -- Show on floor plan
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,        -- In service
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_table_capacity CHECK (
    (category IN ('table', 'booth') AND capacity > 0) OR
    (category NOT IN ('table', 'booth'))
  )
);

-- Indexes
CREATE INDEX idx_floor_plan_objects_floor_plan ON public.floor_plan_objects(floor_plan_id);
CREATE INDEX idx_floor_plan_objects_location ON public.floor_plan_objects(location_id);
CREATE INDEX idx_floor_plan_objects_category ON public.floor_plan_objects(category);
CREATE INDEX idx_floor_plan_objects_active_tables ON public.floor_plan_objects(floor_plan_id, category) 
  WHERE is_active = TRUE AND category IN ('table', 'booth');

COMMENT ON TABLE public.floor_plan_objects IS 'All objects on a floor plan: tables, booths, walls, decorations, zones';

-- ============================================================================
-- TABLE SESSIONS (The Guest Visit - Links Table to Order)
-- ============================================================================

CREATE TABLE public.table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  
  -- Session identification
  session_number TEXT,                   -- Auto-generated: "S-20241216-042"
  
  -- Guest information
  party_size INTEGER NOT NULL,
  guest_name TEXT,                       -- "Smith Party"
  guest_phone TEXT,                      -- For SMS updates
  guest_notes TEXT,                      -- "Anniversary", "VIP", "Allergy: peanuts"
  
  -- Linked records
  order_id UUID REFERENCES public.orders(id),         -- Primary order
  reservation_id UUID,                   -- If from reservation
  waitlist_id UUID,                      -- If from waitlist
  
  -- Staff
  server_user_id TEXT,                   -- Clerk user ID of server
  server_staff_id UUID REFERENCES public.staff_profiles(id),
  
  -- Status
  status table_status NOT NULL DEFAULT 'seated',
  
  -- Timing
  seated_at TIMESTAMPTZ DEFAULT NOW(),
  first_order_at TIMESTAMPTZ,
  food_served_at TIMESTAMPTZ,
  check_presented_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  
  -- Estimated & actual timing
  estimated_duration INTEGER,            -- Expected minutes
  actual_duration INTEGER,               -- Calculated on close
  quoted_time TIMESTAMPTZ,               -- When we told them they'd be done
  
  -- Coursing (fine dining)
  current_course INTEGER DEFAULT 0,      -- 0 = not started, 1 = apps, 2 = mains, etc.
  total_courses INTEGER DEFAULT 3,       -- Expected number of courses
  course_pacing TEXT DEFAULT 'normal',   -- 'slow', 'normal', 'fast'
  
  -- Flags
  is_active BOOLEAN DEFAULT TRUE,        -- Currently in progress
  needs_attention BOOLEAN DEFAULT FALSE, -- Server alert
  is_vip BOOLEAN DEFAULT FALSE,
  is_complaint BOOLEAN DEFAULT FALSE,    -- Issue during visit
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_by UUID REFERENCES public.staff_profiles(id),
  closed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_table_sessions_location ON public.table_sessions(location_id);
CREATE INDEX idx_table_sessions_active ON public.table_sessions(location_id, is_active) 
  WHERE is_active = TRUE;
CREATE INDEX idx_table_sessions_order ON public.table_sessions(order_id);
CREATE INDEX idx_table_sessions_server ON public.table_sessions(server_staff_id);
CREATE INDEX idx_table_sessions_seated_at ON public.table_sessions(seated_at);
CREATE INDEX idx_table_sessions_status ON public.table_sessions(status) WHERE is_active = TRUE;

COMMENT ON TABLE public.table_sessions IS 'Active and historical guest visits - links physical tables to orders';

-- ============================================================================
-- TABLE SESSION TABLES (Which tables are part of this session - supports merging)
-- ============================================================================

CREATE TABLE public.table_session_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES public.floor_plan_objects(id) ON DELETE CASCADE,
  
  is_primary BOOLEAN DEFAULT FALSE,      -- Primary table for merged setup
  seated_position INTEGER DEFAULT 0,     -- Order in merged table layout
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_session_table UNIQUE (session_id, table_id)
);

-- Prevent table from being in multiple active sessions
-- 1. Add the column to the junction table
ALTER TABLE public.table_session_tables 
ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

-- 2. Create the Partial Unique Index
-- This ensures a table_id can only appear ONCE where is_active is true
CREATE UNIQUE INDEX idx_unique_active_table 
ON public.table_session_tables (table_id) 
WHERE (is_active = TRUE);

CREATE INDEX idx_table_session_tables_session ON public.table_session_tables(session_id);
CREATE INDEX idx_table_session_tables_table ON public.table_session_tables(table_id);

COMMENT ON TABLE public.table_session_tables IS 'Links sessions to tables - supports merged tables (one session, multiple tables)';

-- ============================================================================
-- TABLE SESSION EVENTS (Timeline for Timing & Metrics)
-- ============================================================================

CREATE TABLE public.table_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE CASCADE,
  
  event_type session_event_type NOT NULL,
  event_data JSONB DEFAULT '{}',         -- Additional context
  notes TEXT,                            -- Human notes
  
  -- Who triggered
  triggered_by_staff_id UUID REFERENCES public.staff_profiles(id),
  triggered_by_user_id TEXT,
  triggered_by_system BOOLEAN DEFAULT FALSE,  -- Auto-triggered
  
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- For metrics: time since last event
  minutes_since_previous NUMERIC(10, 2)
);

-- Indexes
CREATE INDEX idx_table_session_events_session ON public.table_session_events(session_id);
CREATE INDEX idx_table_session_events_type ON public.table_session_events(event_type);
CREATE INDEX idx_table_session_events_occurred ON public.table_session_events(occurred_at);

COMMENT ON TABLE public.table_session_events IS 'Timeline of events during a table session for timing analysis';

-- ============================================================================
-- WAITLIST
-- ============================================================================

CREATE TABLE public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  
  -- Party info
  party_name TEXT NOT NULL,              -- "Johnson"
  party_size INTEGER NOT NULL,
  phone TEXT,                            -- For SMS notifications
  email TEXT,
  
  -- Preferences
  preferred_section TEXT,                -- "patio", "window", etc.
  seating_preference TEXT,               -- "booth", "table", "bar"
  notes TEXT,                            -- "Highchair needed", "Wheelchair"
  
  -- Status
  status waitlist_status NOT NULL DEFAULT 'waiting',
  position_in_queue INTEGER,             -- Current position
  
  -- Timing
  quoted_wait_minutes INTEGER,           -- What we told them
  actual_wait_minutes INTEGER,           -- Calculated when seated
  estimated_ready_at TIMESTAMPTZ,        -- Calculated ETA
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notified_at TIMESTAMPTZ,               -- When we texted "table ready"
  arrived_at TIMESTAMPTZ,                -- When they came to host stand
  seated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  
  -- Links
  seated_session_id UUID REFERENCES public.table_sessions(id),
  created_by_staff_id UUID REFERENCES public.staff_profiles(id),
  
  -- Notification tracking
  notification_count INTEGER DEFAULT 0,
  last_notification_type TEXT,           -- 'sms', 'call'
  notification_failures INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX idx_waitlist_location ON public.waitlist(location_id);
CREATE INDEX idx_waitlist_active ON public.waitlist(location_id, status) 
  WHERE status IN ('waiting', 'notified', 'arrived');
CREATE INDEX idx_waitlist_phone ON public.waitlist(phone);
CREATE INDEX idx_waitlist_created ON public.waitlist(created_at);
CREATE INDEX idx_waitlist_position ON public.waitlist(location_id, position_in_queue) 
  WHERE status = 'waiting';

COMMENT ON TABLE public.waitlist IS 'Walk-in waiting list with SMS notifications';

-- ============================================================================
-- RESERVATIONS
-- ============================================================================

CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  
  -- Reservation details
  confirmation_number TEXT NOT NULL,     -- "RES-A1B2C3"
  party_name TEXT NOT NULL,
  party_size INTEGER NOT NULL,
  
  -- Contact
  phone TEXT NOT NULL,
  email TEXT,
  
  -- Scheduled time
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 90,   -- Expected visit length
  
  -- Table assignment
  assigned_table_ids UUID[],             -- Pre-assigned tables (optional)
  preferred_section TEXT,
  seating_preference TEXT,
  
  -- Status
  status reservation_status NOT NULL DEFAULT 'pending',
  
  -- Guest notes
  notes TEXT,                            -- "Anniversary", "Allergies"
  special_requests TEXT,
  is_vip BOOLEAN DEFAULT FALSE,
  
  -- Deposit/Prepayment (optional)
  deposit_amount NUMERIC(10, 2),
  deposit_paid_at TIMESTAMPTZ,
  deposit_payment_id UUID,               -- Reference to payment
  
  -- Notifications
  confirmation_sent_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  reminder_hours_before INTEGER DEFAULT 24,
  
  -- Arrival
  arrived_at TIMESTAMPTZ,
  seated_at TIMESTAMPTZ,
  no_show_marked_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  
  -- Links
  seated_session_id UUID REFERENCES public.table_sessions(id),
  
  -- Source
  source TEXT DEFAULT 'direct',          -- 'direct', 'phone', 'website', 'opentable', etc.
  external_reference TEXT,               -- External system ID
  
  -- Metadata
  created_by_staff_id UUID REFERENCES public.staff_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_reservations_location ON public.reservations(location_id);
CREATE INDEX idx_reservations_date ON public.reservations(reservation_date, reservation_time);
CREATE INDEX idx_reservations_confirmation ON public.reservations(confirmation_number);
CREATE INDEX idx_reservations_phone ON public.reservations(phone);
CREATE INDEX idx_reservations_upcoming ON public.reservations(location_id, reservation_date, status) 
  WHERE status IN ('pending', 'confirmed', 'reminded');
-- Remove the WHERE CURRENT_DATE clause
CREATE INDEX idx_reservations_today ON public.reservations(location_id, reservation_date);

COMMENT ON TABLE public.reservations IS 'Future table reservations with confirmation and reminders';

-- ============================================================================
-- SERVER SECTIONS (Optional - For Server Assignment)
-- ============================================================================

CREATE TABLE public.server_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id UUID NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,                    -- "Section A", "Patio Section"
  color TEXT,                            -- Visual color on floor plan
  
  -- Current assignment (nullable - unassigned)
  assigned_staff_id UUID REFERENCES public.staff_profiles(id),
  assigned_user_id TEXT,
  
  -- Stats
  current_table_count INTEGER DEFAULT 0,
  current_guest_count INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_server_sections_floor_plan ON public.server_sections(floor_plan_id);
CREATE INDEX idx_server_sections_staff ON public.server_sections(assigned_staff_id);

-- ============================================================================
-- TABLE METRICS (Daily/Hourly aggregates for reporting)
-- ============================================================================

CREATE TABLE public.table_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  table_id UUID NOT NULL REFERENCES public.floor_plan_objects(id),
  
  metric_date DATE NOT NULL,
  metric_hour INTEGER,                   -- 0-23, NULL for daily aggregate
  
  -- Counts
  total_sessions INTEGER DEFAULT 0,
  total_covers INTEGER DEFAULT 0,        -- Total guests
  
  -- Timing averages (minutes)
  avg_turn_time NUMERIC(10, 2),          -- Seated to cleared
  avg_time_to_order NUMERIC(10, 2),      -- Seated to first order
  avg_time_to_food NUMERIC(10, 2),       -- Order to food served
  avg_time_to_check NUMERIC(10, 2),      -- Food served to check requested
  
  -- Revenue
  total_revenue NUMERIC(12, 2) DEFAULT 0,
  avg_check NUMERIC(10, 2),
  revenue_per_seat_hour NUMERIC(10, 2),  -- RevPASH
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_table_metric UNIQUE (table_id, metric_date, metric_hour)
);

CREATE INDEX idx_table_metrics_location_date ON public.table_metrics(location_id, metric_date);
CREATE INDEX idx_table_metrics_table ON public.table_metrics(table_id, metric_date);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-generate session number
CREATE OR REPLACE FUNCTION generate_session_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.session_number := 'S-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
    LPAD((
      SELECT COUNT(*) + 1 
      FROM public.table_sessions 
      WHERE location_id = NEW.location_id 
        AND DATE(created_at) = CURRENT_DATE
    )::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_session_number
  BEFORE INSERT ON public.table_sessions
  FOR EACH ROW EXECUTE FUNCTION generate_session_number();

-- Auto-generate reservation confirmation number
CREATE OR REPLACE FUNCTION generate_confirmation_number()
RETURNS TRIGGER AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := 'RES-';
BEGIN
  FOR i IN 1..6 LOOP
    result := result || SUBSTR(chars, FLOOR(RANDOM() * LENGTH(chars) + 1)::INT, 1);
  END LOOP;
  NEW.confirmation_number := result;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_confirmation_number
  BEFORE INSERT ON public.reservations
  FOR EACH ROW 
  WHEN (NEW.confirmation_number IS NULL)
  EXECUTE FUNCTION generate_confirmation_number();

-- Update queue positions when waitlist changes
CREATE OR REPLACE FUNCTION update_waitlist_positions()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate positions for this location
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as new_position
    FROM public.waitlist
    WHERE location_id = COALESCE(NEW.location_id, OLD.location_id)
      AND status = 'waiting'
  )
  UPDATE public.waitlist w
  SET position_in_queue = ranked.new_position
  FROM ranked
  WHERE w.id = ranked.id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_waitlist_positions
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION update_waitlist_positions();

-- Auto-calculate minutes since previous event
CREATE OR REPLACE FUNCTION calculate_event_timing()
RETURNS TRIGGER AS $$
DECLARE
  last_event_time TIMESTAMPTZ;
BEGIN
  SELECT occurred_at INTO last_event_time
  FROM public.table_session_events
  WHERE session_id = NEW.session_id
    AND occurred_at < NEW.occurred_at
  ORDER BY occurred_at DESC
  LIMIT 1;
  
  IF last_event_time IS NOT NULL THEN
    NEW.minutes_since_previous := EXTRACT(EPOCH FROM (NEW.occurred_at - last_event_time)) / 60;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_event_timing
  BEFORE INSERT ON public.table_session_events
  FOR EACH ROW EXECUTE FUNCTION calculate_event_timing();

-- Update table_sessions timestamps based on events
CREATE OR REPLACE FUNCTION update_session_from_event()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.table_sessions
  SET 
    first_order_at = CASE 
      WHEN NEW.event_type = 'order_placed' AND first_order_at IS NULL 
      THEN NEW.occurred_at 
      ELSE first_order_at 
    END,
    food_served_at = CASE 
      WHEN NEW.event_type IN ('mains_served', 'appetizers_served') AND food_served_at IS NULL 
      THEN NEW.occurred_at 
      ELSE food_served_at 
    END,
    check_presented_at = CASE 
      WHEN NEW.event_type = 'check_presented' 
      THEN NEW.occurred_at 
      ELSE check_presented_at 
    END,
    paid_at = CASE 
      WHEN NEW.event_type = 'payment_complete' 
      THEN NEW.occurred_at 
      ELSE paid_at 
    END,
    cleared_at = CASE 
      WHEN NEW.event_type = 'table_cleared' 
      THEN NEW.occurred_at 
      ELSE cleared_at 
    END,
    status = CASE
      WHEN NEW.event_type = 'order_placed' THEN 'ordered'::table_status
      WHEN NEW.event_type IN ('mains_served', 'appetizers_served', 'desserts_served') THEN 'served'::table_status
      WHEN NEW.event_type = 'check_presented' THEN 'check_presented'::table_status
      WHEN NEW.event_type = 'payment_complete' THEN 'paid'::table_status
      WHEN NEW.event_type = 'table_cleared' THEN 'cleaning'::table_status
      WHEN NEW.event_type = 'table_cleaned' THEN 'available'::table_status
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = NEW.session_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_session_from_event
  AFTER INSERT ON public.table_session_events
  FOR EACH ROW EXECUTE FUNCTION update_session_from_event();

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE public.floor_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floor_plan_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_session_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_metrics ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ENABLE REALTIME
-- ============================================================================

-- Critical for multi-tablet sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.floor_plan_objects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.table_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.table_session_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;

-- Improved Sync Function
CREATE OR REPLACE FUNCTION sync_table_session_status()
RETURNS TRIGGER AS $$
BEGIN
  -- If the session is updated to inactive, update all associated tables
  IF (TG_OP = 'UPDATE') THEN
    UPDATE public.table_session_tables
    SET is_active = NEW.is_active
    WHERE session_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for Updates (Closing sessions)
CREATE TRIGGER trg_sync_session_status_update
AFTER UPDATE OF is_active ON public.table_sessions
FOR EACH ROW
EXECUTE FUNCTION sync_table_session_status();