-- Add 'threshold_crossed' to loyalty_transactions.transaction_type CHECK constraint
-- This transaction type is used when a customer reaches a loyalty program goal (points, visits, or punch threshold)
-- and automatically unlocks a reward

-- Drop the existing constraint
ALTER TABLE loyalty_transactions
DROP CONSTRAINT loyalty_transactions_transaction_type_check;

-- Add the new constraint with 'threshold_crossed' included
ALTER TABLE loyalty_transactions
ADD CONSTRAINT loyalty_transactions_transaction_type_check CHECK (transaction_type IN (
  'earn_points',       -- Spent $X, earned Y points
  'earn_visit',        -- Completed a visit
  'earn_punch',        -- Purchased qualifying item
  'threshold_crossed', -- Reached goal and unlocked reward (for points/visits/punch programs)
  'redeem',            -- Used a reward
  'bonus',             -- Manual bonus by staff/manager
  'adjust',            -- Manual adjustment (correction)
  'expire',            -- Points/reward expired
  'void'               -- Order was voided, reverse the earn
));
