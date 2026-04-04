import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { HQPermission, HQRole, ServerAdminAuth } from '@/types/admin'

const DEXA_HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID!

interface RequireAdminAuthOptions {
  redirectToDashboard?: boolean
  requiredLabel?: string
  minRoleLevel?: number
}

function buildDashboardDeniedUrl(required?: string): string {
  const params = new URLSearchParams()
  params.set('denied', '1')
  if (required) {
    params.set('required', required)
  }
  return `/manage?${params.toString()}`
}

/**
 * Server-side admin auth check. Throws redirect if not authorized.
 * Use in server components or pages that require HQ admin access.
 *
 * @param requiredPermission - Optional permission code to check
 * @returns ServerAdminAuth object with role and permissions
 */
export async function requireAdminAuth(
  requiredPermission?: HQPermission,
  options: RequireAdminAuthOptions = {}
): Promise<ServerAdminAuth> {
  const deny = (reason: string): never => {
    if (options.redirectToDashboard) {
      redirect(buildDashboardDeniedUrl(options.requiredLabel ?? requiredPermission))
    }

    if (reason === 'not_hq_admin') {
      redirect('/unauthorized?reason=not_hq_admin')
    }

    redirect(`/manage/unauthorized?reason=${reason}`)
  }

  const { userId, orgId } = await auth()

  if (!userId) {
    redirect('/sign-in?redirect=/manage')
  }

  if (orgId !== DEXA_HQ_ORG_ID) {
    deny('not_hq_admin')
  }
  const normalizedOrgId = orgId as string

  const supabase = createServerSupabaseClient()

  const { data: roleData, error: roleError } = await supabase
    .rpc('get_my_hq_role')
    .single()

  if (roleError || !roleData) {
    deny('no_hq_role')
  }

  const { data: permissions } = await supabase
    .rpc('get_my_hq_permissions')

  const permissionList = (permissions as HQPermission[]) || []

  const hasPermission = (permission: HQPermission): boolean => {
    return permissionList.includes(permission)
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    deny('insufficient_permissions')
  }

  const role = roleData as HQRole
  if (options.minRoleLevel != null && role.level < options.minRoleLevel) {
    deny('insufficient_role_level')
  }

  return {
    userId,
    orgId: normalizedOrgId,
    role,
    permissions: permissionList,
    hasPermission,
  }
}

/**
 * For server actions - throws error instead of redirect.
 * Use when protecting server actions that need permission checks.
 *
 * @param permission - Required permission code
 * @returns ServerAdminAuth object with role and permissions
 * @throws Error if user doesn't have the required permission
 */
export async function assertHQPermission(
  permission: HQPermission
): Promise<ServerAdminAuth> {
  const { userId, orgId } = await auth()

  if (!userId || orgId !== DEXA_HQ_ORG_ID) {
    throw new Error('Unauthorized: HQ admin access required')
  }

  const supabase = createServerSupabaseClient()

  const { data: hasPermission } = await supabase
    .rpc('hq_has_permission', { p_permission_code: permission })

  if (!hasPermission) {
    throw new Error(`Unauthorized: Missing permission ${permission}`)
  }

  const { data: roleData } = await supabase.rpc('get_my_hq_role').single()
  const { data: permissions } = await supabase.rpc('get_my_hq_permissions')

  const permissionList = (permissions as HQPermission[]) || []

  return {
    userId,
    orgId,
    role: roleData as HQRole,
    permissions: permissionList,
    hasPermission: (p: HQPermission) => permissionList.includes(p),
  }
}

/**
 * Check if current user is an HQ admin without redirecting.
 * Useful for conditional logic in server components.
 *
 * @returns boolean indicating if user is an HQ admin
 */
export async function isHQAdmin(): Promise<boolean> {
  const { userId, orgId } = await auth()
  return !!userId && orgId === DEXA_HQ_ORG_ID
}

/**
 * Get the current HQ user's role without redirecting.
 * Returns null if user is not an HQ admin or has no role.
 *
 * @returns HQRole or null
 */
export async function getHQRole(): Promise<HQRole | null> {
  const { userId, orgId } = await auth()

  if (!userId || orgId !== DEXA_HQ_ORG_ID) {
    return null
  }

  const supabase = createServerSupabaseClient()

  const { data: roleData } = await supabase
    .rpc('get_my_hq_role')
    .single()

  return roleData as HQRole | null
}
