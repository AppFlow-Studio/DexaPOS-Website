-- Add payment configuration columns to online_store_config
-- accepts_online_payments: whether the store accepts card payments at checkout
-- accepts_cash_on_delivery / accepts_card_on_delivery: COD payment options

ALTER TABLE online_store_config
  ADD COLUMN IF NOT EXISTS accepts_online_payments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepts_cash_on_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepts_card_on_delivery boolean NOT NULL DEFAULT false;
