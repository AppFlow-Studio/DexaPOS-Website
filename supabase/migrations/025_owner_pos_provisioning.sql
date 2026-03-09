-- ============================================================================
-- Migration 025: Owner/Admin Auto-Provisioning to All Locations
-- ============================================================================
-- Purpose:
--   1. Trigger: when a new location is created, automatically insert
--      location_members rows for every owner/admin-level member (role.level >= 9).
--   2. Backfill: ensure existing owner/admin members already have
--      location_members rows for all current merchant locations.
--
-- Why this is safe:
--   • Uses WHERE NOT EXISTS — fully idempotent, safe to re-run.
--   • Only affects members with role.level >= 9 (merchant.owner = 10,
--     merchant.admin = 9).  Lower-level roles keep manual assignment.
--   • Sets is_primary_location = false for auto-provisioned rows
--     (owner/admins typically don't need a "primary" POS location).
-- ============================================================================

-- ============================================================================
-- 1. TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_provision_owners_to_new_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- For each owner/admin-level member in the same merchant, insert a
  -- location_members row for this new location — if one doesn't exist yet.
  INSERT INTO location_members (
    location_id,
    merchant_id,
    user_id,
    staff_profile_id,
    role_code,
    is_primary_location,
    is_active,
    assigned_at,
    updated_at
  )
  SELECT
    NEW.id            AS location_id,
    NEW.merchant_id   AS merchant_id,
    m.user_id,
    m.staff_profile_id,
    m.role            AS role_code,
    false             AS is_primary_location,
    true              AS is_active,
    NOW()             AS assigned_at,
    NOW()             AS updated_at
  FROM members m
  INNER JOIN merchants mc  ON mc.clerk_org_id = m.organization_id
  INNER JOIN roles    r    ON r.code          = m.role
  WHERE mc.id = NEW.merchant_id
    AND r.level >= 9   -- merchant.owner (10) and merchant.admin (9)
    AND (m.user_id IS NOT NULL OR m.staff_profile_id IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1
      FROM location_members lm
      WHERE lm.location_id = NEW.id
        AND (
          (m.user_id         IS NOT NULL AND lm.user_id         = m.user_id)
          OR
          (m.staff_profile_id IS NOT NULL AND lm.staff_profile_id = m.staff_profile_id)
        )
    );

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. TRIGGER: fire on every new location
-- ============================================================================

DROP TRIGGER IF EXISTS trg_auto_provision_owners_to_new_location ON locations;

CREATE TRIGGER trg_auto_provision_owners_to_new_location
  AFTER INSERT ON locations
  FOR EACH ROW
  EXECUTE FUNCTION auto_provision_owners_to_new_location();

-- ============================================================================
-- 3. BACKFILL: existing owners/admins → all existing merchant locations
-- ============================================================================
-- Insert location_members for any (member × location) pairing that is missing.

INSERT INTO location_members (
  location_id,
  merchant_id,
  user_id,
  staff_profile_id,
  role_code,
  is_primary_location,
  is_active,
  assigned_at,
  updated_at
)
SELECT
  l.id              AS location_id,
  l.merchant_id,
  m.user_id,
  m.staff_profile_id,
  m.role            AS role_code,
  false             AS is_primary_location,
  true              AS is_active,
  NOW()             AS assigned_at,
  NOW()             AS updated_at
FROM locations l
INNER JOIN merchants mc ON mc.id             = l.merchant_id
INNER JOIN members   m  ON m.organization_id = mc.clerk_org_id
INNER JOIN roles     r  ON r.code            = m.role
WHERE r.level >= 9
  AND (m.user_id IS NOT NULL OR m.staff_profile_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM location_members lm
    WHERE lm.location_id = l.id
      AND (
        (m.user_id         IS NOT NULL AND lm.user_id         = m.user_id)
        OR
        (m.staff_profile_id IS NOT NULL AND lm.staff_profile_id = m.staff_profile_id)
      )
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- ✓ auto_provision_owners_to_new_location() trigger function created
-- ✓ Trigger fires AFTER INSERT ON locations (for each row)
-- ✓ Backfill applied for all existing merchant/location/owner-admin combos
-- ✓ WHERE NOT EXISTS — idempotent and safe to re-run
