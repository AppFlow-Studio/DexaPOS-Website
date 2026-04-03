--loyalty programs
CREATE TABLE loyalty_programs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  -- Identity
  name                TEXT NOT NULL,                    -- "Coffee Rewards", "VIP Points Club"
  description         TEXT,                             -- Shown to customers
  program_type        TEXT NOT NULL CHECK (program_type IN ('visits', 'points', 'punch_card')),

  -- ═══════════════════════════════════════════
  -- VISITS CONFIG (program_type = 'visits')
  -- ═══════════════════════════════════════════
  visits_required     INTEGER,                          -- Visits to earn reward (e.g., 10)

  -- ═══════════════════════════════════════════
  -- POINTS CONFIG (program_type = 'points')
  -- ═══════════════════════════════════════════
  points_per_dollar   NUMERIC(10,2) DEFAULT 1,          -- How many points per $1 spent
  points_redemption_threshold INTEGER,                  -- Points needed to redeem (e.g., 100)
  points_redemption_value     NUMERIC(10,2),            -- Dollar value when redeemed (e.g., $10)

  -- ═══════════════════════════════════════════
  -- PUNCH CARD CONFIG (program_type = 'punch_card')
  -- ═══════════════════════════════════════════
  punch_target_type   TEXT CHECK (punch_target_type IN ('item', 'category')),
  punch_menu_item_id  UUID REFERENCES menu_items(id),   -- Specific item (NULL if category-based)
  punch_category_id   UUID REFERENCES categories(id),   -- Category (NULL if item-based)
  punches_required    INTEGER,                          -- Punches to earn reward (e.g., 9)

  -- ═══════════════════════════════════════════
  -- REWARD CONFIG (shared across all types)
  -- ═══════════════════════════════════════════
  reward_type         TEXT NOT NULL CHECK (reward_type IN (
                        'discount_fixed',       -- $X off next order
                        'discount_percent',     -- X% off next order
                        'free_item',            -- Specific free item
                        'free_category_item'    -- Free item from a category
                      )),
  reward_value        NUMERIC(10,2),                    -- Dollar amount or percentage
  reward_description  TEXT NOT NULL,                    -- "Free medium coffee" / "$5 off"
  reward_menu_item_id UUID REFERENCES menu_items(id),   -- If free_item, which item
  reward_category_id  UUID REFERENCES categories(id),   -- If free_category_item
  reward_max_value    NUMERIC(10,2),                    -- Cap for percent/category rewards

  -- ═══════════════════════════════════════════
  -- RULES & LIMITS
  -- ═══════════════════════════════════════════
  min_order_amount    NUMERIC(10,2) DEFAULT 0,          -- Minimum spend to earn on this order
  excluded_categories UUID[],                           -- Categories that don't earn (e.g., alcohol)
  excluded_item_ids   UUID[],                           -- Specific items excluded
  earn_on_discounted  BOOLEAN DEFAULT true,             -- Earn on discounted orders?
  reward_expiry_days  INTEGER,                          -- Days before earned reward expires (NULL = never)
  max_active_rewards  INTEGER DEFAULT 5,                -- Max unredeemed rewards a customer can hold
  cooldown_minutes    INTEGER DEFAULT 0,                -- Minutes between earns (prevent gaming)
  is_stackable        BOOLEAN DEFAULT false,            -- Can multiple rewards apply to one order?
  auto_enroll         BOOLEAN DEFAULT true,             -- Auto-enroll when customer identified at POS?

  -- ═══════════════════════════════════════════
  -- STATUS & SCHEDULING
  -- ═══════════════════════════════════════════
  is_active           BOOLEAN DEFAULT true,
  starts_at           TIMESTAMP WITH TIME ZONE,         -- NULL = immediately
  ends_at             TIMESTAMP WITH TIME ZONE,         -- NULL = no end
  location_ids        UUID[],                           -- NULL = all locations, or specific subset

  -- ═══════════════════════════════════════════
  -- DISPLAY
  -- ═══════════════════════════════════════════
  display_color       TEXT DEFAULT '#6366f1',            -- Brand color for progress bars
  display_icon        TEXT DEFAULT 'star',               -- Icon identifier

  created_at          TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by          TEXT REFERENCES users(id)
);

CREATE INDEX idx_loyalty_programs_merchant ON loyalty_programs(merchant_id, is_active);


--loyalty enrollments
CREATE TABLE loyalty_enrollments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id          UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  merchant_id         UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  -- Running balances (denormalized for instant POS lookup)
  current_points      INTEGER NOT NULL DEFAULT 0,       -- Points programs: current balance
  lifetime_points     INTEGER NOT NULL DEFAULT 0,       -- Points programs: total ever earned
  current_visits      INTEGER NOT NULL DEFAULT 0,       -- Visits programs: visits since last reward
  lifetime_visits     INTEGER NOT NULL DEFAULT 0,       -- Visits programs: total visits
  current_punches     INTEGER NOT NULL DEFAULT 0,       -- Punch card: punches since last reward
  lifetime_punches    INTEGER NOT NULL DEFAULT 0,       -- Punch card: total punches

  total_rewards_earned    INTEGER NOT NULL DEFAULT 0,
  total_rewards_redeemed  INTEGER NOT NULL DEFAULT 0,
  total_reward_value      NUMERIC(10,2) NOT NULL DEFAULT 0,  -- Total $ saved

  enrolled_at         TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_earn_at        TIMESTAMP WITH TIME ZONE,          -- Last time they earned (for cooldown)
  last_redeem_at      TIMESTAMP WITH TIME ZONE,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT now(),

  is_active           BOOLEAN DEFAULT true,              -- Can be paused/unpaused

  UNIQUE(program_id, customer_id)
);

CREATE INDEX idx_enrollments_customer ON loyalty_enrollments(customer_id);
CREATE INDEX idx_enrollments_program ON loyalty_enrollments(program_id, is_active);
CREATE INDEX idx_enrollments_merchant ON loyalty_enrollments(merchant_id, customer_id);


--loyalty rewards
CREATE TABLE loyalty_rewards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id       UUID NOT NULL REFERENCES loyalty_enrollments(id) ON DELETE CASCADE,
  program_id          UUID NOT NULL REFERENCES loyalty_programs(id),
  customer_id         UUID NOT NULL REFERENCES customers(id),
  merchant_id         UUID NOT NULL REFERENCES merchants(id),

  -- What the reward is
  reward_type         TEXT NOT NULL,                     -- Copied from program at earn time
  reward_value        NUMERIC(10,2) NOT NULL,
  reward_description  TEXT NOT NULL,                     -- "Free medium coffee"
  reward_menu_item_id UUID REFERENCES menu_items(id),
  reward_category_id  UUID REFERENCES categories(id),
  reward_max_value    NUMERIC(10,2),

  -- Status
  status              TEXT NOT NULL DEFAULT 'available' CHECK (status IN (
                        'available', 'redeemed', 'expired', 'voided'
                      )),
  earned_at           TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at          TIMESTAMP WITH TIME ZONE,          -- NULL = never
  redeemed_at         TIMESTAMP WITH TIME ZONE,
  redeemed_order_id   UUID REFERENCES orders(id),
  redeemed_location_id UUID REFERENCES locations(id),
  voided_at           TIMESTAMP WITH TIME ZONE,
  voided_reason       TEXT,

  created_at          TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_rewards_customer_status ON loyalty_rewards(customer_id, status);
CREATE INDEX idx_rewards_enrollment ON loyalty_rewards(enrollment_id, status);
CREATE INDEX idx_rewards_expiry ON loyalty_rewards(expires_at) WHERE status = 'available';


--loyalty transactions
CREATE TABLE loyalty_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id       UUID NOT NULL REFERENCES loyalty_enrollments(id) ON DELETE CASCADE,
  program_id          UUID NOT NULL REFERENCES loyalty_programs(id),
  customer_id         UUID NOT NULL REFERENCES customers(id),
  merchant_id         UUID NOT NULL REFERENCES merchants(id),
  location_id         UUID REFERENCES locations(id),
  order_id            UUID REFERENCES orders(id),

  -- Transaction details
  transaction_type    TEXT NOT NULL CHECK (transaction_type IN (
                        'earn_points',       -- Spent $X, earned Y points
                        'earn_visit',        -- Completed a visit
                        'earn_punch',        -- Purchased qualifying item
                        'redeem',            -- Used a reward
                        'bonus',             -- Manual bonus by staff/manager
                        'adjust',            -- Manual adjustment (correction)
                        'expire',            -- Points/reward expired
                        'void'               -- Order was voided, reverse the earn
                      )),

  -- Amounts (meaning depends on program_type)
  points_delta        INTEGER NOT NULL DEFAULT 0,        -- +/- points
  visits_delta        INTEGER NOT NULL DEFAULT 0,        -- +/- visits
  punches_delta       INTEGER NOT NULL DEFAULT 0,        -- +/- punches

  -- Balance snapshots AFTER this transaction
  balance_points      INTEGER NOT NULL DEFAULT 0,
  balance_visits      INTEGER NOT NULL DEFAULT 0,
  balance_punches     INTEGER NOT NULL DEFAULT 0,

  -- If this is a redeem, link to the reward
  reward_id           UUID REFERENCES loyalty_rewards(id),

  -- Context
  description         TEXT NOT NULL,                     -- Human-readable: "Earned 25 pts on Order #1042"
  staff_id            UUID REFERENCES staff_profiles(id),-- Who processed it (for manual adjustments)
  metadata            JSONB DEFAULT '{}',                -- Extra context (item_name for punches, etc.)

  created_at          TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_ltx_enrollment ON loyalty_transactions(enrollment_id, created_at DESC);
CREATE INDEX idx_ltx_customer ON loyalty_transactions(customer_id, created_at DESC);
CREATE INDEX idx_ltx_order ON loyalty_transactions(order_id);

--promotions
CREATE TABLE promotions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  -- Identity
  name                TEXT NOT NULL,                     -- "Happy Hour", "Birthday Special"
  description         TEXT,
  promo_code          TEXT,                              -- Optional code entry

  -- Type
  promo_type          TEXT NOT NULL CHECK (promo_type IN (
                        'happy_hour',        -- Auto-applies during time window
                        'birthday',          -- Auto-applies in birth month/week
                        'first_visit',       -- First-time customer
                        'comeback',          -- Haven't visited in X days
                        'referral',          -- Referred by existing customer
                        'seasonal',          -- Date-range based
                        'threshold',         -- Spend over $X on this order
                        'bogo',              -- Buy one get one
                        'bundle'             -- Buy items A+B, get discount
                      )),

  -- Discount
  discount_type       TEXT NOT NULL CHECK (discount_type IN (
                        'percentage', 'fixed_amount', 'free_item', 'bogo'
                      )),
  discount_value      NUMERIC(10,2),
  discount_max        NUMERIC(10,2),                    -- Cap for percentage discounts
  free_item_id        UUID REFERENCES menu_items(id),

  -- Targeting
  applies_to          TEXT DEFAULT 'order' CHECK (applies_to IN ('order', 'item', 'category')),
  target_categories   UUID[],
  target_item_ids     UUID[],
  location_ids        UUID[],                           -- NULL = all locations
  min_order_amount    NUMERIC(10,2) DEFAULT 0,

  -- Scheduling
  is_active           BOOLEAN DEFAULT true,
  starts_at           TIMESTAMP WITH TIME ZONE,
  ends_at             TIMESTAMP WITH TIME ZONE,

  -- Time-of-day rules (for happy hour, etc.)
  active_days         INTEGER[],                        -- 0=Sun, 1=Mon... 6=Sat. NULL = all days
  active_time_start   TIME,                             -- e.g., '16:00'
  active_time_end     TIME,                             -- e.g., '18:00'

  -- Limits
  max_uses_total      INTEGER,                          -- NULL = unlimited
  max_uses_per_customer INTEGER,                        -- NULL = unlimited
  max_uses_per_day    INTEGER,
  current_uses        INTEGER DEFAULT 0,

  -- Comeback-specific
  comeback_days       INTEGER,                          -- Days since last visit to qualify

  -- Birthday-specific
  birthday_window     TEXT DEFAULT 'week' CHECK (birthday_window IN ('day', 'week', 'month')),

  -- BOGO-specific
  bogo_buy_quantity   INTEGER DEFAULT 1,
  bogo_get_quantity   INTEGER DEFAULT 1,
  bogo_get_item_id    UUID REFERENCES menu_items(id),
  bogo_get_category_id UUID REFERENCES categories(id),

  -- Threshold-specific
  threshold_amount    NUMERIC(10,2),

  -- Auto-apply: if true, POS applies this promo automatically without staff action
  auto_apply          BOOLEAN DEFAULT false,

  -- Stats
  total_redemptions   INTEGER DEFAULT 0,
  total_discount_given NUMERIC(10,2) DEFAULT 0,

  created_at          TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by          TEXT REFERENCES users(id)
);

-- Index for merchant lookups (active or not)
CREATE INDEX idx_promos_merchant ON promotions(merchant_id, is_active);

-- Composite index for active promotion queries with time condition
CREATE INDEX idx_promos_active ON promotions(merchant_id, is_active, ends_at);


--promotion usage:
CREATE TABLE promotion_usage (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id        UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  customer_id         UUID REFERENCES customers(id),     -- NULL for anonymous promos
  order_id            UUID NOT NULL REFERENCES orders(id),
  location_id         UUID NOT NULL REFERENCES locations(id),
  merchant_id         UUID NOT NULL REFERENCES merchants(id),

  discount_applied    NUMERIC(10,2) NOT NULL,
  applied_by_staff_id UUID REFERENCES staff_profiles(id),

  created_at          TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_promo_usage_customer ON promotion_usage(customer_id);
CREATE INDEX idx_promo_usage_promo ON promotion_usage(promotion_id);
CREATE INDEX idx_promo_usage_order ON promotion_usage(order_id);