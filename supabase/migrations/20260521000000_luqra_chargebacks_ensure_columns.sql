-- Self-heal luqra_chargebacks schema.
--
-- Two earlier migrations both define this table with CREATE TABLE IF NOT EXISTS:
--   - 20260505140000_luqra_cache_tables.sql            (full, correct schema)
--   - 20260509000000_luqra_chargebacks_and_reconcile_rpc.sql  (stripped schema)
-- Whichever ran first won. On databases where the May 9 migration created the
-- table, app/manage/actions/admin-merchant/luqra-sync.ts blows up at upsert
-- time with three distinct errors:
--   PGRST204  "Could not find the 'application_id' column ..."
--   23502/22023 "cannot insert a non-DEFAULT value into column 'id'"
--   22007     "invalid input syntax for type date: 'M'"  (Luqra resolutionTo
--             is "M"/"B"/null, but May 9 declared resolution_to as DATE)
-- because the May 9 schema is (a) missing columns the sync writes,
-- (b) declares id as GENERATED ALWAYS AS IDENTITY even though Luqra returns
-- the case-version id we use as the stable PK, and (c) gives several columns
-- the wrong type for the Luqra payload (TEXT vs DATE, INT vs VARCHAR).
--
-- This migration is idempotent: every block guards on current state so it is
-- a no-op on databases where the May 5 migration already won.

-- 1) Add missing columns the sync writes.
ALTER TABLE public.luqra_chargebacks
  ADD COLUMN IF NOT EXISTS application_id    text,
  ADD COLUMN IF NOT EXISTS doing_business_as text,
  ADD COLUMN IF NOT EXISTS last_date_loaded  timestamptz,
  ADD COLUMN IF NOT EXISTS is_reversal       text,
  ADD COLUMN IF NOT EXISTS first_seen_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at      timestamptz NOT NULL DEFAULT now();
-- 2) Drop GENERATED ALWAYS AS IDENTITY on id so the sync can supply Luqra's
--    case-version id. Existing rows keep their values; only the auto-generator
--    is removed. No-op if the identity is already absent.
ALTER TABLE public.luqra_chargebacks
  ALTER COLUMN id DROP IDENTITY IF EXISTS;
-- 3) Drop the May 9 UNIQUE(case_number) constraint. Luqra case numbers are not
--    globally unique across merchants/MIDs, only within a merchant — the May 5
--    schema correctly enforces uniqueness via the id PRIMARY KEY and indexes
--    case_number for lookups instead. No-op if the constraint isn't present.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.luqra_chargebacks'::regclass
    AND contype  = 'u'
    AND (
      SELECT array_agg(attname ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = conrelid AND attnum = ANY(conkey)
    ) = ARRAY['case_number']::name[];
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.luqra_chargebacks DROP CONSTRAINT %I', con_name);
  END IF;
END $$;
-- 4) Correct column types that May 9 declared wrongly. Each ALTER is guarded
--    by a current-type check so the migration is a no-op (no table rewrite,
--    no AccessExclusive lock) on databases where May 5 already won.
DO $$
DECLARE
  cur_type text;
BEGIN
  -- resolution_to: date -> text. Luqra sends single-letter codes ("M", "B", null).
  SELECT data_type INTO cur_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'luqra_chargebacks'
    AND column_name  = 'resolution_to';
  IF cur_type = 'date' THEN
    ALTER TABLE public.luqra_chargebacks
      ALTER COLUMN resolution_to TYPE text USING resolution_to::text;
  END IF;

  -- date_loaded: date -> timestamptz. Luqra sends ISO timestamps.
  SELECT data_type INTO cur_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'luqra_chargebacks'
    AND column_name  = 'date_loaded';
  IF cur_type = 'date' THEN
    ALTER TABLE public.luqra_chargebacks
      ALTER COLUMN date_loaded TYPE timestamptz USING date_loaded::timestamptz;
  END IF;

  -- date_transaction: date -> timestamptz.
  SELECT data_type INTO cur_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'luqra_chargebacks'
    AND column_name  = 'date_transaction';
  IF cur_type = 'date' THEN
    ALTER TABLE public.luqra_chargebacks
      ALTER COLUMN date_transaction TYPE timestamptz USING date_transaction::timestamptz;
  END IF;

  -- case_type: varchar -> integer. Luqra sends ints (21, 1, 23, 24, ...).
  SELECT data_type INTO cur_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'luqra_chargebacks'
    AND column_name  = 'case_type';
  IF cur_type IN ('character varying', 'text') THEN
    ALTER TABLE public.luqra_chargebacks
      ALTER COLUMN case_type TYPE integer USING NULLIF(case_type, '')::integer;
  END IF;

  -- item_type: varchar -> integer.
  SELECT data_type INTO cur_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'luqra_chargebacks'
    AND column_name  = 'item_type';
  IF cur_type IN ('character varying', 'text') THEN
    ALTER TABLE public.luqra_chargebacks
      ALTER COLUMN item_type TYPE integer USING NULLIF(item_type, '')::integer;
  END IF;

  -- card_brand: varchar -> integer.
  SELECT data_type INTO cur_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'luqra_chargebacks'
    AND column_name  = 'card_brand';
  IF cur_type IN ('character varying', 'text') THEN
    ALTER TABLE public.luqra_chargebacks
      ALTER COLUMN card_brand TYPE integer USING NULLIF(card_brand, '')::integer;
  END IF;
END $$;
-- 5) Force PostgREST to refresh its schema cache so changes are visible to the
--    API immediately without a process restart.
NOTIFY pgrst, 'reload schema';
