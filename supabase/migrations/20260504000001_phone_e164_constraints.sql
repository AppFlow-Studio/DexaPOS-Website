-- Phone E.164 CHECK constraints (defense in depth)
-- Enforces that all phone columns store E.164 format: +[country code][number]
-- NOT VALID: constraint is added without scanning existing rows.
-- Run VALIDATE CONSTRAINT after backfill is complete.

ALTER TABLE customers
  ADD CONSTRAINT customers_phone_e164
  CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{1,14}$') NOT VALID;

ALTER TABLE staff_profiles
  ADD CONSTRAINT staff_profiles_phone_e164
  CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{1,14}$') NOT VALID;

ALTER TABLE locations
  ADD CONSTRAINT locations_phone_e164
  CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{1,14}$') NOT VALID;

ALTER TABLE location_invites
  ADD CONSTRAINT location_invites_phone_e164
  CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{1,14}$') NOT VALID;

ALTER TABLE vendors
  ADD CONSTRAINT vendors_phone_e164
  CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{1,14}$') NOT VALID;

ALTER TABLE waitlist
  ADD CONSTRAINT waitlist_phone_e164
  CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{1,14}$') NOT VALID;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_phone_e164
  CHECK (phone ~ '^\+[1-9]\d{1,14}$') NOT VALID;

-- Dedup unique indexes (partial — skip NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS customers_merchant_phone_unique
  ON customers (merchant_id, phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS location_invites_merchant_phone_unique
  ON location_invites (merchant_id, phone)
  WHERE phone IS NOT NULL AND status = 'pending';

-- Digit-only generated column for partial-match phone search
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS phone_digits text
  GENERATED ALWAYS AS (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS customers_phone_digits_idx ON customers (phone_digits);
