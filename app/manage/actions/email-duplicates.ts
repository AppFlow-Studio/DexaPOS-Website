'use server'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizeEmail } from '@/lib/utils/email'
import type { EmailConflict } from '@/lib/utils/email'

export interface FindEmailConflictOptions {
  scope?: 'global' | { merchantId: string }
  ignoreUserId?: string
  ignoreMerchantId?: string
  ignoreLocationId?: string
}

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
  let invitesQ = supabase
    .from('location_invites')
    .select('id')
    .ilike('email', normalized)
    .eq('status', 'pending')
    .limit(1)
  if (merchantId) invitesQ = invitesQ.eq('merchant_id', merchantId)

  const [users, merchants, locations, staff, invites] = await Promise.all([
    usersQ,
    merchantsQ,
    locationsQ,
    staffQ,
    invitesQ,
  ])

  const userHit = users.data?.find((r) => r.id !== opts.ignoreUserId)
  if (userHit) return { table: 'users', id: userHit.id }

  const merchantHit = merchants.data?.find((r) => r.id !== opts.ignoreMerchantId)
  if (merchantHit) return { table: 'merchants', id: merchantHit.id }

  const locationHit = locations.data?.find((r) => r.id !== opts.ignoreLocationId)
  if (locationHit) return { table: 'locations', id: locationHit.id }

  const staffHit = staff.data?.[0]
  if (staffHit) {
    return {
      table: 'staff_profiles',
      id: staffHit.id,
      isPosOnlyProfile: !staffHit.user_id,
    }
  }

  const inviteHit = invites.data?.[0]
  if (inviteHit) return { table: 'location_invites', id: inviteHit.id }

  return null
}
