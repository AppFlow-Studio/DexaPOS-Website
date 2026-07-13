-- Direct HQ-created merchants can legitimately exist without a carrier_id.
-- Payment-device rows must support that shape or online-ordering NMI setup
-- fails before activation with a NOT NULL violation on carrier_id.
ALTER TABLE public.location_payment_devices
  ALTER COLUMN carrier_id DROP NOT NULL;
