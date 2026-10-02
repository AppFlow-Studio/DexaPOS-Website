import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'

/** Roles that count toward an organization's "at least one active admin" guard. */
export const ADMIN_ROLE_CODES = new Set([
  'hq.super_admin',
  'hq.platform_admin',
  'hq.manager',
  'merchant.owner',
  'merchant.admin',
])

/**
 * Active admins in an organization, optionally leaving one user out. Lives
 * outside the `'use server'` action files so it is not itself a callable
 * endpoint.
 */
export async function countActiveAdminsInOrg(
  organizationId: string,
  excludeUserId?: string
): Promise<number> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('members')
    .select('user_id, role, users(public_metadata)')
    .eq('organization_id', organizationId)

  if (error || !data) {
    return 0
  }

  return data.filter((row: any) => {
    if (excludeUserId && row.user_id === excludeUserId) return false
    if (!row.role || !ADMIN_ROLE_CODES.has(row.role)) return false
    const status = (row.users?.public_metadata as Record<string, unknown> | null)?.status
    return status !== 'Inactive'
  }).length
}

/**
 * The organizations a user is the last active admin of. Removing or deleting
 * them there would leave the organization with nobody to manage it.
 */
export async function orgsLeftWithoutAdmin(userId: string): Promise<string[]> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('members')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', userId)

  const blocked: string[] = []
  for (const row of (data ?? []) as any[]) {
    if (!row.organization_id || !row.role || !ADMIN_ROLE_CODES.has(row.role)) continue
    if ((await countActiveAdminsInOrg(row.organization_id, userId)) === 0) {
      blocked.push(row.organizations?.name || row.organization_id)
    }
  }
  return blocked
}
