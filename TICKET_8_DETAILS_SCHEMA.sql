-- TICKET 8: DEXA-CUST-008 — Details Tab
-- Schema additions to customers table for profile fields, preferences, and notes

-- 1. Add personal detail columns to customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS anniversary DATE,
  ADD COLUMN IF NOT EXISTS dietary_preferences TEXT[] DEFAULT '{}',     -- vegetarian, vegan, gluten_free, halal, kosher, nut_allergy, dairy_free, etc
  ADD COLUMN IF NOT EXISTS allergy_notes TEXT,
  ADD COLUMN IF NOT EXISTS preferred_server_id UUID REFERENCES staff_profiles(id),
  ADD COLUMN IF NOT EXISTS preferred_table TEXT,           -- "Booth 3" or "patio"
  ADD COLUMN IF NOT EXISTS preferred_seating TEXT,         -- indoor, outdoor, bar, booth, window
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS vip_level TEXT DEFAULT 'none';  -- none, silver, gold, platinum (or custom tags)

-- 2. Add tags support to customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';  -- Array of tag strings

-- 3. Create customer_notes table for timestamped, authored notes
CREATE TABLE IF NOT EXISTS customer_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  merchant_id     UUID NOT NULL REFERENCES merchants(id),

  content         TEXT NOT NULL,
  created_by      TEXT REFERENCES users(id),  -- Who created the note
  created_by_name TEXT,                       -- Denormalized for display

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for customer_notes
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_merchant ON customer_notes(merchant_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_created ON customer_notes(created_at);

-- 4. Add RLS policies for customer_notes
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes for customers in their merchant"
  ON customer_notes FOR SELECT
  USING (merchant_id = auth.uid());

CREATE POLICY "Users can insert notes for customers in their merchant"
  ON customer_notes FOR INSERT
  WITH CHECK (merchant_id = auth.uid());

CREATE POLICY "Users can update their own notes"
  ON customer_notes FOR UPDATE
  USING (merchant_id = auth.uid() AND created_by = auth.uid()::TEXT)
  WITH CHECK (merchant_id = auth.uid());

CREATE POLICY "Users can delete their own notes"
  ON customer_notes FOR DELETE
  USING (merchant_id = auth.uid() AND created_by = auth.uid()::TEXT);

-- 5. Create indexes for profile queries
CREATE INDEX IF NOT EXISTS idx_customers_birthday ON customers(merchant_id, birthday)
  WHERE birthday IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_vip_level ON customers(merchant_id, vip_level)
  WHERE vip_level != 'none';

CREATE INDEX IF NOT EXISTS idx_customers_tags ON customers USING GIN(tags);

-- 6. Create a view for customer profile summary
CREATE OR REPLACE VIEW customer_profile_summary AS
SELECT
  c.id,
  c.merchant_id,
  c.name,
  c.phone,
  c.email,
  c.address,
  c.birthday,
  c.anniversary,
  c.dietary_preferences,
  c.allergy_notes,
  c.preferred_server_id,
  c.preferred_table,
  c.preferred_seating,
  c.company_name,
  c.vip_level,
  c.tags,
  c.sms_opt_in,
  c.email_opt_in,
  c.receipt_via_sms,
  c.receipt_via_email,
  c.preferred_language,
  c.created_at,
  c.updated_at,
  COUNT(cn.id)::INTEGER as notes_count
FROM customers c
LEFT JOIN customer_notes cn ON c.id = cn.customer_id
GROUP BY
  c.id, c.merchant_id, c.name, c.phone, c.email, c.address,
  c.birthday, c.anniversary, c.dietary_preferences, c.allergy_notes,
  c.preferred_server_id, c.preferred_table, c.preferred_seating,
  c.company_name, c.vip_level, c.tags,
  c.sms_opt_in, c.email_opt_in, c.receipt_via_sms, c.receipt_via_email,
  c.preferred_language, c.created_at, c.updated_at;

-- 7. Pre-defined common tags (for reference/seeding)
-- These are suggestions for the UI; actual tags are stored as TEXT[] in customer records
-- Common tags: VIP, Regular, New, Corporate, Friend of Owner, Influencer, Complaint History, Catering Client

-- 8. Common dietary preferences (for reference)
-- vegetarian, vegan, gluten_free, halal, kosher, nut_allergy, dairy_free, shellfish_allergy
