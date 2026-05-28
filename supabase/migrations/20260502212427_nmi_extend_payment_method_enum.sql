
-- Add 'card_online' to distinguish gateway-routed payments from
-- physical-terminal card payments (card_spinapi / card_dvpaylite).
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'card_online';
;
