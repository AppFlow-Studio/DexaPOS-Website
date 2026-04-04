-- ============================================================================
-- Migration 026: Invite Lifecycle — status constraint expansion
-- ============================================================================
-- Purpose:
--   The original location_invites.status CHECK only allows:
--     'pending' | 'accepted' | 'expired' | 'cancelled'
--
--   Phase 3 requires a 'direct_created' status for Path-C (CreateClerkUserDirectly)
--   audit records — these are NOT pending invitations; they are completed creations
--   that are recorded purely for audit/history.
--
--   We drop and recreate the CHECK constraint to add 'direct_created'.
-- ============================================================================

-- Drop the auto-generated check constraint (name varies across PG versions)
ALTER TABLE location_invites
  DROP CONSTRAINT IF EXISTS location_invites_status_check;

-- Also try the explicit name that may have been used in migration 003
ALTER TABLE location_invites
  DROP CONSTRAINT IF EXISTS location_invites_status_fkey;

-- Recreate with the expanded value set
ALTER TABLE location_invites
  ADD CONSTRAINT location_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled', 'direct_created'));

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- ✓ location_invites.status CHECK expanded to include 'direct_created'
-- ✓ 'direct_created' is used by CreateClerkUserDirectly for audit trail
-- ✓ 'pending' | 'accepted' | 'expired' | 'cancelled' unchanged
-- ✓ Safe to re-run (DROP CONSTRAINT IF EXISTS)
