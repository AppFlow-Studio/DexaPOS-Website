-- ============================================================================
-- Migration 023: Fix Staff Member Constraints
-- ============================================================================
-- Purpose: The XOR constraint added in 009 prevents Clerk users from having
-- both user_id and staff_profile_id set in the same row. The server action
-- (CreateClerkUserDirectly) and the webhook both intentionally write both
-- columns so that the unified view can join either way. Change XOR → OR.
--
-- Also adds the `role` column to members if it isn't already there — the
-- webhook writes it for HQ and merchant role lookups.
-- ============================================================================

-- ============================================================================
-- 1. MEMBERS TABLE
-- ============================================================================

-- Add role column (needed by createOrUpdateMember webhook helper + get_my_hq_role)
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS role TEXT;

-- Relax the XOR constraint → OR (at least one of the two must be non-null)
ALTER TABLE members
  DROP CONSTRAINT IF EXISTS members_requires_user_or_profile;

ALTER TABLE members
  ADD CONSTRAINT members_requires_user_or_profile CHECK (
    user_id IS NOT NULL OR staff_profile_id IS NOT NULL
  );

-- ============================================================================
-- 2. LOCATION_MEMBERS TABLE
-- ============================================================================

-- Same XOR → OR fix (CreateClerkUserDirectly also writes both columns here)
ALTER TABLE location_members
  DROP CONSTRAINT IF EXISTS location_members_requires_user_or_profile;

ALTER TABLE location_members
  ADD CONSTRAINT location_members_requires_user_or_profile CHECK (
    user_id IS NOT NULL OR staff_profile_id IS NOT NULL
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- ✓ members.role column added (IF NOT EXISTS — safe to re-run)
-- ✓ members XOR constraint relaxed to OR
-- ✓ location_members XOR constraint relaxed to OR
--
-- Why this is safe:
-- All existing POS-only rows have staff_profile_id set → OR is satisfied
-- All existing Clerk-only rows have user_id set → OR is satisfied
-- New rows created by CreateClerkUserDirectly have both set → now valid
