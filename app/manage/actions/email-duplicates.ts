'use server'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizeEmail } from '@/lib/utils/email'
import type { EmailConflict } from '@/lib/utils/email'

export interface FindEmailConflictOptions {
  scope?: 'global' | { merchantId: string }
  ignoreUserId?: string
  ignoreMerchantId?: string
  ignoreLocationId?: string
  /**
   * Tables to scan for a conflict. Defaults to identity-bearing tables only —
   * `users`, `staff_profiles`, pending `location_invites`, and pending
   * `pending_org_admin_invites`. Pass an explicit list to also include the
   * organizational contact-email columns (`locations.email`,
   * `merchants.owner_email`); those should NOT block invites/creates because
   * a location/merchant contact email is org metadata, not a login identity.
   */
  tables?: Array<'users' | 'merchants' | 'locations' | 'staff_profiles' | 'location_invites' | 'pending_org_admin_invites'>
}

const DEFAULT_IDENTITY_TABLES: NonNullable<FindEmailConflictOptions['tables']> = [
  'users',
  'staff_profiles',
  'location_invites',
  'pending_org_admin_invites',
]

/**
 * Looks for an existing row using the given email across the human-email tables.
 * Returns the first hit, or null. All comparisons are case-insensitive.
 */
export async function findEmailConflict(
  email: string,
  opts: FindEmailConflictOptions = {}
): Promise<EmailConflict | null> {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  const supabase = createServiceRoleClient()
  const merchantId = opts.scope && opts.scope !== 'global' ? opts.scope.merchantId : null
  const activeTables = opts.tables ?? DEFAULT_IDENTITY_TABLES
  const allow = (
    t: 'users' | 'merchants' | 'locations' | 'staff_profiles' | 'location_invites' | 'pending_org_admin_invites',
  ) => activeTables.includes(t)

  const usersQ = supabase
    .from('users')
    .select('id')
    .ilike('email', normalized)
    .limit(1)
  const merchantsQ = supabase
    .from('merchants')
    .select('id')
    .ilike('owner_email', normalized)
    .limit(1)
  const locationsQ = supabase
    .from('locations')
    .select('id')
    .ilike('email', normalized)
    .limit(1)
  let staffQ = supabase
    .from('staff_profiles')
    .select('id, user_id')
    .ilike('email', normalized)
    .limit(1)
  if (merchantId) staffQ = staffQ.eq('merchant_id', merchantId)
  // Only treat invites as "in use" if they're still both pending and unexpired —
  // a row that timed out shouldn't block a fresh invite.
  let invitesQ = supabase
    .from('location_invites')
    .select('id')
    .ilike('email', normalized)
    .eq('status', 'pending')
    .gte('expires_at', new Date().toISOString())
    .limit(1)
  if (merchantId) invitesQ = invitesQ.eq('merchant_id', merchantId)
  // HQ admin pending invites are global (not merchant-scoped); only block while still pending.
  const orgAdminInvitesQ = supabase
    .from('pending_org_admin_invites')
    .select('id')
    .ilike('email', normalized)
    .eq('status', 'pending')
    .limit(1)

  const [users, merchants, locations, staff, invites, orgAdminInvites] = await Promise.all([
    usersQ,
    merchantsQ,
    locationsQ,
    staffQ,
    invitesQ,
    orgAdminInvitesQ,
  ])

  if (allow('users')) {
    const userHit = users.data?.find((r) => r.id !== opts.ignoreUserId)
    if (userHit) return { table: 'users', id: userHit.id }
  }

  if (allow('merchants')) {
    const merchantHit = merchants.data?.find((r) => r.id !== opts.ignoreMerchantId)
    if (merchantHit) return { table: 'merchants', id: merchantHit.id }
  }

  if (allow('locations')) {
    const locationHit = locations.data?.find((r) => r.id !== opts.ignoreLocationId)
    if (locationHit) return { table: 'locations', id: locationHit.id }
  }

  if (allow('staff_profiles')) {
    const staffHit = staff.data?.[0]
    if (staffHit) {
      return {
        table: 'staff_profiles',
        id: staffHit.id,
        isPosOnlyProfile: !staffHit.user_id,
      }
    }
  }

  if (allow('location_invites')) {
    const inviteHit = invites.data?.[0]
    if (inviteHit) return { table: 'location_invites', id: inviteHit.id }
  }

  if (allow('pending_org_admin_invites')) {
    const orgAdminHit = orgAdminInvites.data?.[0]
    if (orgAdminHit) return { table: 'pending_org_admin_invites', id: orgAdminHit.id }
  }

  return null
}
