-- ============================================================================
-- DEXA POS: Customer Profile Tabs - SQL Schema Updates
-- TICKETS: 3, 4, 5
-- Created: 2026-02-25
-- ============================================================================

-- IMPORTANT: Run this script in your Supabase SQL Editor
-- After running, you can insert test data as needed

-- ============================================================================
-- TICKET 3: DEXA-CUST-003 — Orders Tab
-- No additional schema changes required (uses existing tables)
-- ============================================================================
-- orders, order_items, order_payments tables are already used
-- customer_id column should already exist on orders table from previous work
-- If not present, uncomment and run:
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);
-- CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

-- ============================================================================
-- TICKET 4: DEXA-CUST-004 — Bookings Tab Schema Changes
-- ============================================================================

-- Step 1: Add customer_id foreign key to reservations table
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

-- Step 2: Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_reservations_customer
  ON reservations(customer_id);

-- Step 3: Add customer_id foreign key to waitlist table
ALTER TABLE waitlist
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

-- Step 4: Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_waitlist_customer
  ON waitlist(customer_id);

-- Step 5: Add customer_id foreign key to table_sessions table
ALTER TABLE table_sessions
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

-- Step 6: Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_table_sessions_customer
  ON table_sessions(customer_id);

-- Step 7-9: Backfill existing records (OPTIONAL)
-- Link existing reservations/waitlist/table_sessions to customers by phone number
-- Run these queries to automatically link records where phone numbers match

-- Backfill reservations: Link by phone number
UPDATE reservations r
SET customer_id = c.id
FROM customers c
WHERE r.phone = c.phone
  AND r.merchant_id = c.merchant_id
  AND r.customer_id IS NULL
  AND r.phone IS NOT NULL;

-- Backfill waitlist: Link by phone number
UPDATE waitlist w
SET customer_id = c.id
FROM customers c
WHERE w.phone = c.phone
  AND w.merchant_id = c.merchant_id
  AND w.customer_id IS NULL
  AND w.phone IS NOT NULL;

-- Backfill table_sessions: Link by phone number (if phone column exists)
-- Note: Uncomment if table_sessions has a phone column
-- UPDATE table_sessions ts
-- SET customer_id = c.id
-- FROM customers c
-- WHERE ts.phone = c.phone
--   AND ts.merchant_id = c.merchant_id
--   AND ts.customer_id IS NULL
--   AND ts.phone IS NOT NULL;

-- ============================================================================
-- TICKET 5: DEXA-CUST-005 — Feedback Tab - New Table
-- ============================================================================

-- Step 1: Create customer_feedback table
CREATE TABLE IF NOT EXISTS customer_feedback (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       UUID NOT NULL REFERENCES merchants(id),
  location_id       UUID NOT NULL REFERENCES locations(id),
  customer_id       UUID NOT NULL REFERENCES customers(id),
  order_id          UUID REFERENCES orders(id),
  session_id        UUID REFERENCES table_sessions(id),

  -- Rating fields (1-5 scale)
  overall_rating    SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  food_rating       SMALLINT CHECK (food_rating BETWEEN 1 AND 5),
  service_rating    SMALLINT CHECK (service_rating BETWEEN 1 AND 5),
  ambiance_rating   SMALLINT CHECK (ambiance_rating BETWEEN 1 AND 5),
  value_rating      SMALLINT CHECK (value_rating BETWEEN 1 AND 5),

  -- Customer's written feedback
  comment           TEXT,

  -- Staff who served them (for attribution)
  server_staff_id   UUID REFERENCES staff_profiles(id),

  -- How the feedback was collected
  source            TEXT NOT NULL DEFAULT 'receipt_link',
    -- Allowed values: receipt_link, text_link, in_app, manual, kiosk

  -- Merchant response to feedback
  response          TEXT,
  responded_at      TIMESTAMP WITH TIME ZONE,
  responded_by      TEXT REFERENCES users(id),

  -- Status flags
  is_public         BOOLEAN DEFAULT false,   -- Can be displayed publicly
  is_flagged        BOOLEAN DEFAULT false,   -- Flagged for follow-up

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Step 2: Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_feedback_customer
  ON customer_feedback(customer_id);

CREATE INDEX IF NOT EXISTS idx_feedback_merchant_location
  ON customer_feedback(merchant_id, location_id);

CREATE INDEX IF NOT EXISTS idx_feedback_order
  ON customer_feedback(order_id);

CREATE INDEX IF NOT EXISTS idx_feedback_rating
  ON customer_feedback(overall_rating);

CREATE INDEX IF NOT EXISTS idx_feedback_created
  ON customer_feedback(created_at);

CREATE INDEX IF NOT EXISTS idx_feedback_flagged
  ON customer_feedback(is_flagged)
  WHERE is_flagged = true;

-- Step 3: Enable Row Level Security (OPTIONAL)
-- ALTER TABLE customer_feedback ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies should be configured based on your actual Clerk/auth schema
-- Example pattern (adjust column names/types as needed):
-- CREATE POLICY "view_own_feedback" ON customer_feedback
--   FOR SELECT USING (merchant_id IN (SELECT merchant_id FROM user_merchants WHERE user_id = auth.uid()));
-- CREATE POLICY "update_own_feedback" ON customer_feedback
--   FOR UPDATE USING (merchant_id IN (SELECT merchant_id FROM user_merchants WHERE user_id = auth.uid()));

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these to confirm schema is set up correctly
-- ============================================================================

-- Check reservations has customer_id column
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'reservations' AND column_name = 'customer_id';

-- Check waitlist has customer_id column
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'waitlist' AND column_name = 'customer_id';

-- Check table_sessions has customer_id column
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'table_sessions' AND column_name = 'customer_id';

-- Check customer_feedback table exists
SELECT table_name FROM information_schema.tables
WHERE table_name = 'customer_feedback';

-- Count how many records were backfilled with customer_id
SELECT 'reservations' as table_name, COUNT(*) as customer_linked_count
FROM reservations WHERE customer_id IS NOT NULL
UNION ALL
SELECT 'waitlist', COUNT(*) FROM waitlist WHERE customer_id IS NOT NULL
UNION ALL
SELECT 'table_sessions', COUNT(*) FROM table_sessions WHERE customer_id IS NOT NULL;

-- ============================================================================
-- END OF SCHEMA UPDATES
-- ============================================================================
