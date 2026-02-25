-- TICKET 6: DEXA-CUST-006 — Loyalty Tab
-- Tables: loyalty_programs, loyalty_tiers, loyalty_transactions, loyalty_rewards

-- 1. Create loyalty_programs table
CREATE TABLE loyalty_programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),

  name            TEXT NOT NULL,           -- "Coffee Club"
  description     TEXT,

  -- Program type
  program_type    TEXT NOT NULL DEFAULT 'points',  -- points, visits, spend_threshold

  -- Points config (if program_type = 'points')
  points_per_dollar   NUMERIC DEFAULT 1,   -- Earn 1 point per $1 spent
  points_per_visit    INTEGER DEFAULT 0,    -- Bonus points per visit

  -- Visits config (if program_type = 'visits')
  visits_to_reward    INTEGER DEFAULT 10,   -- Buy 10 get 1 free

  -- Spend config (if program_type = 'spend_threshold')
  spend_threshold     NUMERIC DEFAULT 100,  -- Spend $100 get reward

  -- Reward
  reward_type         TEXT DEFAULT 'discount_fixed', -- discount_fixed, discount_percent, free_item
  reward_value        NUMERIC DEFAULT 5,     -- $5 off, or 10%, or free item value
  reward_description  TEXT,                  -- "Free medium coffee"
  reward_item_id      UUID REFERENCES menu_items(id), -- If free_item, which item

  -- Rules
  points_expiry_days  INTEGER,              -- NULL = never expire
  min_order_to_earn   NUMERIC DEFAULT 0,    -- Minimum order to earn points
  excluded_categories TEXT[],               -- Categories that don't earn points

  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for merchant_id
CREATE INDEX idx_loyalty_programs_merchant ON loyalty_programs(merchant_id);

-- 2. Create loyalty_tiers table (Optional — Phase 2)
CREATE TABLE loyalty_tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,           -- "Gold", "Platinum"
  min_points      INTEGER NOT NULL,        -- Points needed to reach tier
  multiplier      NUMERIC DEFAULT 1.0,     -- 1.5x = earn 50% more points
  perks           JSONB DEFAULT '[]',      -- List of perk descriptions

  display_order   INTEGER DEFAULT 0,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for program_id
CREATE INDEX idx_loyalty_tiers_program ON loyalty_tiers(program_id);

-- 3. Create loyalty_transactions table
CREATE TABLE loyalty_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID NOT NULL REFERENCES loyalty_programs(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  location_id     UUID REFERENCES locations(id),
  order_id        UUID REFERENCES orders(id),

  transaction_type TEXT NOT NULL,  -- 'earn', 'redeem', 'adjust', 'expire', 'bonus'
  points_amount   INTEGER NOT NULL, -- Positive for earn, negative for redeem/expire

  -- Running balance (denormalized for fast lookup)
  balance_after   INTEGER NOT NULL,

  description     TEXT,            -- "Earned 25 pts on Order #1042"
  staff_id        UUID REFERENCES staff_profiles(id), -- Who processed it

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for loyalty_transactions
CREATE INDEX idx_loyalty_tx_customer ON loyalty_transactions(customer_id, program_id);
CREATE INDEX idx_loyalty_tx_order ON loyalty_transactions(order_id);
CREATE INDEX idx_loyalty_tx_merchant ON loyalty_transactions(merchant_id);
CREATE INDEX idx_loyalty_tx_program ON loyalty_transactions(program_id);

-- 4. Create loyalty_rewards table
CREATE TABLE loyalty_rewards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID NOT NULL REFERENCES loyalty_programs(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),

  reward_type     TEXT NOT NULL,
  reward_value    NUMERIC NOT NULL,
  reward_description TEXT,

  status          TEXT NOT NULL DEFAULT 'available', -- available, redeemed, expired
  earned_at       TIMESTAMP WITH TIME ZONE DEFAULT now(),
  redeemed_at     TIMESTAMP WITH TIME ZONE,
  redeemed_order_id UUID REFERENCES orders(id),
  expires_at      TIMESTAMP WITH TIME ZONE,

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for loyalty_rewards
CREATE INDEX idx_loyalty_rewards_customer ON loyalty_rewards(customer_id, status);
CREATE INDEX idx_loyalty_rewards_merchant ON loyalty_rewards(merchant_id);
CREATE INDEX idx_loyalty_rewards_program ON loyalty_rewards(program_id);

-- Add RLS policies for loyalty_programs
ALTER TABLE loyalty_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view their own loyalty programs"
  ON loyalty_programs FOR SELECT
  USING (merchant_id = auth.uid());

CREATE POLICY "Merchants can insert their own loyalty programs"
  ON loyalty_programs FOR INSERT
  WITH CHECK (merchant_id = auth.uid());

CREATE POLICY "Merchants can update their own loyalty programs"
  ON loyalty_programs FOR UPDATE
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

CREATE POLICY "Merchants can delete their own loyalty programs"
  ON loyalty_programs FOR DELETE
  USING (merchant_id = auth.uid());

-- Add RLS policies for loyalty_tiers
ALTER TABLE loyalty_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view loyalty tiers for programs they own"
  ON loyalty_tiers FOR SELECT
  USING (
    program_id IN (
      SELECT id FROM loyalty_programs WHERE merchant_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert loyalty tiers for programs they own"
  ON loyalty_tiers FOR INSERT
  WITH CHECK (
    program_id IN (
      SELECT id FROM loyalty_programs WHERE merchant_id = auth.uid()
    )
  );

-- Add RLS policies for loyalty_transactions
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view loyalty transactions for their merchant"
  ON loyalty_transactions FOR SELECT
  USING (merchant_id = auth.uid());

CREATE POLICY "Users can insert loyalty transactions for their merchant"
  ON loyalty_transactions FOR INSERT
  WITH CHECK (merchant_id = auth.uid());

-- Add RLS policies for loyalty_rewards
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view loyalty rewards for their merchant"
  ON loyalty_rewards FOR SELECT
  USING (merchant_id = auth.uid());

CREATE POLICY "Users can insert loyalty rewards for their merchant"
  ON loyalty_rewards FOR INSERT
  WITH CHECK (merchant_id = auth.uid());

CREATE POLICY "Users can update loyalty rewards for their merchant"
  ON loyalty_rewards FOR UPDATE
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());
