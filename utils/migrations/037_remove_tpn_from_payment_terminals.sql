-- Migration: Remove TPN from payment_terminals
-- The Dejavoo SPIN API no longer requires TPN. RegisterId + AuthKey are sufficient.

-- Make register_id required and unique per merchant
ALTER TABLE payment_terminals ALTER COLUMN register_id SET NOT NULL;
ALTER TABLE payment_terminals ADD CONSTRAINT payment_terminals_merchant_register_id_unique
  UNIQUE (merchant_id, register_id);

-- Drop TPN columns
ALTER TABLE payment_terminals DROP COLUMN IF EXISTS tpn;
ALTER TABLE payment_terminals DROP COLUMN IF EXISTS tpn_encrypted;
