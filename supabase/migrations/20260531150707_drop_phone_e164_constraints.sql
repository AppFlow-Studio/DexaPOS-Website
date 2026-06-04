ALTER TABLE customers        DROP CONSTRAINT IF EXISTS customers_phone_e164;
ALTER TABLE staff_profiles   DROP CONSTRAINT IF EXISTS staff_profiles_phone_e164;
ALTER TABLE locations        DROP CONSTRAINT IF EXISTS locations_phone_e164;
ALTER TABLE location_invites DROP CONSTRAINT IF EXISTS location_invites_phone_e164;
ALTER TABLE vendors          DROP CONSTRAINT IF EXISTS vendors_phone_e164;
ALTER TABLE waitlist         DROP CONSTRAINT IF EXISTS waitlist_phone_e164;
ALTER TABLE reservations     DROP CONSTRAINT IF EXISTS reservations_phone_e164;
