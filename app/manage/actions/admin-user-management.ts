'use server'

import crypto from 'crypto'
import { createClerkClient } from '@clerk/backend'
import { revalidatePath } from 'next/cache'
import { assertHQPermission } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { HQ_ROLES } from '@/types/admin'

const DEXA_HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID!

const VALID_HQ_ROLE_CODES = new Set(Object.keys(HQ_ROLES))

function roleLevel(roleCode: string | null | undefined): number {
  if (!roleCode) return 0
  const role = HQ_ROLES[roleCode as keyof typeof HQ_ROLES]
  return role?.level || 0
}

function generateTempPassword(length: number = 14): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  const bytes = crypto.randomBytes(length)
  let password = ''
  for (let i = 0; i < length; i += 1) {
    password += chars[bytes[i] % chars.length]
  }
  return password
}

async function getTargetMemberAndUser(
  userId: string,
  organizationId: string
): Promise<{
  id: string
  user_id: string
  role: string | null
  users: {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
    public_metadata: Record<string, unknown> | null
  } | null
} | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('members')
    .select(
      `
      id,
      user_id,
      role,
      users(
        id,
        email,
        first_name,
        last_name,
        public_metadata
      )
    `
    )
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as any) || null
}

function ensureActorCanManageTarget(
  actorRoleCode: string,
  actorRoleLevel: number,
  targetRoleCode: string | null | undefined
): string | null {
  if (actorRoleCode === 'hq.super_admin') {
    return null
  }

  const targetLevel = roleLevel(targetRoleCode)
  if (targetLevel >= actorRoleLevel) {
    return 'You can only manage users with a lower role level than yours.'
  }
  return null
}

export async function changeAdminUserRole(params: {
  userId: string
  roleCode: string
  organizationId?: string
}): Promise<{ success: boolean; message: string }> {
  try {
    const authContext = await assertHQPermission('hq.team.manage')
    const orgId = params.organizationId || DEXA_HQ_ORG_ID

    if (!params.userId) {
      return { success: false, message: 'User ID is required.' }
    }
    if (!VALID_HQ_ROLE_CODES.has(params.roleCode)) {
      return { success: false, message: 'Invalid HQ role code.' }
    }
    if (params.userId === authContext.userId) {
      return { success: false, message: 'You cannot change your own role.' }
    }

    const target = await getTargetMemberAndUser(params.userId, orgId)
    if (!target) {
      return { success: false, message: 'Target user membership not found.' }
    }

    const actorRoleCode = authContext.role?.role_code || ''
    const actorRoleLevel = authContext.role?.level || 0
    const manageTargetError = ensureActorCanManageTarget(
      actorRoleCode,
      actorRoleLevel,
      target.role
    )
    if (manageTargetError) {
      return { success: false, message: manageTargetError }
    }

    if (
      actorRoleCode !== 'hq.super_admin' &&
      roleLevel(params.roleCode) > actorRoleLevel
    ) {
      return {
        success: false,
        message: 'You cannot assign a role with higher level than yours.',
      }
    }

    const supabase = createServiceRoleClient()
    const { error: updateError } = await supabase
      .from('members')
      .update({
        role: params.roleCode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id)

    if (updateError) {
      return { success: false, message: updateError.message }
    }

    // Keep Clerk user metadata role in sync with members.role.
    try {
      const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
      const currentMetadata = (target.users?.public_metadata || {}) as Record<string, unknown>
      await clerkClient.users.updateUser(params.userId, {
        publicMetadata: {
          ...currentMetadata,
          role: params.roleCode,
        },
      })
    } catch (metadataError) {
      console.warn('[changeAdminUserRole] Failed to sync Clerk metadata:', metadataError)
    }

    await logAdminAction('ADMIN_ROLE_CHANGED', {
      clerkOrgId: orgId,
      resourceType: 'user',
      resourceId: params.userId,
      resourceName: target.users?.email || params.userId,
      changes: {
        role: {
          old: target.role || null,
          new: params.roleCode,
        },
      },
      metadata: {
        member_id: target.id,
        target_user_id: params.userId,
      },
    })

    revalidatePath('/manage/users')
    revalidatePath(`/manage/users/${params.userId}`)

    return { success: true, message: 'User role updated successfully.' }
  } catch (error) {
    console.error('[changeAdminUserRole] Error:', error)
    return {
      success: false,
      message: `Failed to update role: ${(error as Error).message || 'Unknown error'}`,
    }
  }
}

async function countActiveAdminsInOrg(
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

  const adminRoleCodes = new Set([
    'hq.super_admin',
    'hq.platform_admin',
    'hq.manager',
    'merchant.owner',
    'merchant.admin',
  ])

  return data.filter((row: any) => {
    if (excludeUserId && row.user_id === excludeUserId) return false
    if (!row.role || !adminRoleCodes.has(row.role)) return false
    const status =
      (row.users?.public_metadata as Record<string, unknown> | null)?.status
    return status !== 'Inactive'
  }).length
}

export async function deactivateAdminUser(params: {
  userId: string
  organizationId?: string
}): Promise<{ success: boolean; message: string }> {
  try {
    const authContext = await assertHQPermission('hq.team.manage')
    const orgId = params.organizationId || DEXA_HQ_ORG_ID

    if (!params.userId) {
      return { success: false, message: 'User ID is required.' }
    }
    if (params.userId === authContext.userId) {
      return { success: false, message: 'You cannot deactivate your own account.' }
    }

    const target = await getTargetMemberAndUser(params.userId, orgId)
    if (!target) {
      return { success: false, message: 'Target user membership not found.' }
    }

    const actorRoleCode = authContext.role?.role_code || ''
    const actorRoleLevel = authContext.role?.level || 0
    const manageTargetError = ensureActorCanManageTarget(
      actorRoleCode,
      actorRoleLevel,
      target.role
    )
    if (manageTargetError) {
      return { success: false, message: manageTargetError }
    }

    // Only-admin guard: never allow deactivating the last active admin of an org.
    const adminRoleCodes = new Set([
      'hq.super_admin',
      'hq.platform_admin',
      'hq.manager',
      'merchant.owner',
      'merchant.admin',
    ])
    if (target.role && adminRoleCodes.has(target.role)) {
      const remainingActiveAdmins = await countActiveAdminsInOrg(
        orgId,
        params.userId
      )
      if (remainingActiveAdmins === 0) {
        return {
          success: false,
          message:
            'Cannot deactivate the only active admin of this organization. Promote another user to admin first.',
        }
      }
    }

    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    await clerkClient.users.banUser(params.userId)

    const supabase = createServiceRoleClient()
    const existingMetadata = (target.users?.public_metadata || {}) as Record<string, unknown>
    const { error: updateError } = await supabase
      .from('users')
      .update({
        public_metadata: {
          ...existingMetadata,
          status: 'Inactive',
          deactivated_at: new Date().toISOString(),
          deactivated_by: authContext.userId,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.userId)

    if (updateError) {
      return { success: false, message: updateError.message }
    }

    await logAdminAction('ADMIN_DEACTIVATED', {
      clerkOrgId: orgId,
      resourceType: 'user',
      resourceId: params.userId,
      resourceName: target.users?.email || params.userId,
      changes: {
        status: {
          old: existingMetadata?.status || 'Active',
          new: 'Inactive',
        },
      },
      metadata: {
        target_user_id: params.userId,
        deactivated_by: authContext.userId,
        method: 'deactivateAdminUser',
      },
    })

    revalidatePath('/manage/users')
    revalidatePath(`/manage/users/${params.userId}`)

    return { success: true, message: 'User deactivated successfully.' }
  } catch (error) {
    console.error('[deactivateAdminUser] Error:', error)
    return {
      success: false,
      message: `Failed to deactivate user: ${(error as Error).message || 'Unknown error'}`,
    }
  }
}

export async function activateAdminUser(params: {
  userId: string
  organizationId?: string
}): Promise<{ success: boolean; message: string }> {
  try {
    const authContext = await assertHQPermission('hq.team.manage')
    const orgId = params.organizationId || DEXA_HQ_ORG_ID

    if (!params.userId) {
      return { success: false, message: 'User ID is required.' }
    }

    const target = await getTargetMemberAndUser(params.userId, orgId)
    if (!target) {
      return { success: false, message: 'Target user membership not found.' }
    }

    const actorRoleCode = authContext.role?.role_code || ''
    const actorRoleLevel = authContext.role?.level || 0
    const isSelf = params.userId === authContext.userId
    const isSuperAdmin = actorRoleCode === 'hq.super_admin'

    // Self-activation is allowed only for super admins (no one is above them).
    if (isSelf && !isSuperAdmin) {
      return {
        success: false,
        message:
          'You cannot activate your own account. Ask a super admin to activate it.',
      }
    }

    // Standard role-hierarchy check applies when activating someone else.
    if (!isSelf) {
      const manageTargetError = ensureActorCanManageTarget(
        actorRoleCode,
        actorRoleLevel,
        target.role
      )
      if (manageTargetError) {
        return { success: false, message: manageTargetError }
      }
    }

    const existingMetadata =
      (target.users?.public_metadata || {}) as Record<string, unknown>
    const previousStatus = (existingMetadata.status as string) || 'Active'

    if (previousStatus !== 'Inactive') {
      return { success: true, message: 'Account is already active.' }
    }

    // Unban in Clerk so the user can sign in again.
    try {
      const clerkClient = createClerkClient({
        secretKey: process.env.CLERK_SECRET_KEY!,
      })
      await clerkClient.users.unbanUser(params.userId)
    } catch (clerkError) {
      console.error('[activateAdminUser] Clerk unban failed:', clerkError)
      return {
        success: false,
        message: `Failed to unban user in Clerk: ${(clerkError as Error).message || 'Unknown error'}`,
      }
    }

    const supabase = createServiceRoleClient()
    const nextMetadata: Record<string, unknown> = {
      ...existingMetadata,
      status: 'Active',
      activated_at: new Date().toISOString(),
      activated_by: authContext.userId,
    }
    delete nextMetadata.deactivated_at
    delete nextMetadata.deactivated_by

    const { error: updateError } = await supabase
      .from('users')
      .update({
        public_metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.userId)

    if (updateError) {
      return { success: false, message: updateError.message }
    }

    await logAdminAction('ADMIN_ACTIVATED', {
      clerkOrgId: orgId,
      resourceType: 'user',
      resourceId: params.userId,
      resourceName: target.users?.email || params.userId,
      changes: {
        status: { old: 'Inactive', new: 'Active' },
      },
      metadata: {
        target_user_id: params.userId,
        activated_by: authContext.userId,
        method: 'activateAdminUser',
        is_self_activation: isSelf,
        action_category: 'hq_intervention',
      },
    })

    revalidatePath('/manage/users')
    revalidatePath(`/manage/users/${params.userId}`)

    return {
      success: true,
      message: isSelf
        ? 'Your account is now active.'
        : 'User activated successfully.',
    }
  } catch (error) {
    console.error('[activateAdminUser] Error:', error)
    return {
      success: false,
      message: `Failed to activate user: ${(error as Error).message || 'Unknown error'}`,
    }
  }
}

export async function updateAdminUserDetails(params: {
  userId: string
  firstName?: string
  lastName?: string
  organizationId?: string
}): Promise<{ success: boolean; message: string }> {
  try {
    const authContext = await assertHQPermission('hq.team.manage')
    const orgId = params.organizationId || DEXA_HQ_ORG_ID

    if (!params.userId) {
      return { success: false, message: 'User ID is required.' }
    }

    const firstName = params.firstName?.trim() ?? ''
    const lastName = params.lastName?.trim() ?? ''

    if (!firstName && !lastName) {
      return { success: false, message: 'At least one name field is required.' }
    }

    const target = await getTargetMemberAndUser(params.userId, orgId)
    if (!target) {
      return { success: false, message: 'Target user membership not found.' }
    }

    const isSelf = params.userId === authContext.userId
    if (!isSelf) {
      const actorRoleCode = authContext.role?.role_code || ''
      const actorRoleLevel = authContext.role?.level || 0
      const manageTargetError = ensureActorCanManageTarget(
        actorRoleCode,
        actorRoleLevel,
        target.role
      )
      if (manageTargetError) {
        return { success: false, message: manageTargetError }
      }
    }

    const previousFirstName = target.users?.first_name || ''
    const previousLastName = target.users?.last_name || ''

    if (previousFirstName === firstName && previousLastName === lastName) {
      return { success: true, message: 'No changes to save.' }
    }

    try {
      const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
      await clerkClient.users.updateUser(params.userId, {
        firstName,
        lastName,
      })
    } catch (clerkError) {
      console.error('[updateAdminUserDetails] Clerk update failed:', clerkError)
      return {
        success: false,
        message: `Failed to update Clerk profile: ${(clerkError as Error).message || 'Unknown error'}`,
      }
    }

    const supabase = createServiceRoleClient()
    const { error: updateError } = await supabase
      .from('users')
      .update({
        first_name: firstName,
        last_name: lastName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.userId)

    if (updateError) {
      return { success: false, message: updateError.message }
    }

    await logAdminAction('ADMIN_PROFILE_UPDATED', {
      clerkOrgId: orgId,
      resourceType: 'user',
      resourceId: params.userId,
      resourceName: target.users?.email || params.userId,
      changes: {
        first_name: { old: previousFirstName, new: firstName },
        last_name: { old: previousLastName, new: lastName },
      },
      metadata: {
        target_user_id: params.userId,
        updated_by: authContext.userId,
        method: 'updateAdminUserDetails',
        action_category: 'hq_intervention',
      },
    })

    revalidatePath('/manage/users')
    revalidatePath(`/manage/users/${params.userId}`)

    return { success: true, message: 'User details updated successfully.' }
  } catch (error) {
    console.error('[updateAdminUserDetails] Error:', error)
    return {
      success: false,
      message: `Failed to update user details: ${(error as Error).message || 'Unknown error'}`,
    }
  }
}

export async function resetAdminUserPassword(params: {
  userId: string
  organizationId?: string
}): Promise<{ success: boolean; message: string; tempPassword?: string }> {
  try {
    const authContext = await assertHQPermission('hq.team.manage')
    const orgId = params.organizationId || DEXA_HQ_ORG_ID

    if (!params.userId) {
      return { success: false, message: 'User ID is required.' }
    }

    const target = await getTargetMemberAndUser(params.userId, orgId)
    if (!target) {
      return { success: false, message: 'Target user membership not found.' }
    }

    const actorRoleCode = authContext.role?.role_code || ''
    const actorRoleLevel = authContext.role?.level || 0
    const manageTargetError = ensureActorCanManageTarget(
      actorRoleCode,
      actorRoleLevel,
      target.role
    )
    if (manageTargetError) {
      return { success: false, message: manageTargetError }
    }

    const tempPassword = generateTempPassword(14)
    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    await clerkClient.users.updateUser(params.userId, {
      password: tempPassword,
      signOutOfOtherSessions: true,
      skipPasswordChecks: false,
    })

    const supabase = createServiceRoleClient()
    const existingMetadata = (target.users?.public_metadata || {}) as Record<string, unknown>
    await supabase
      .from('users')
      .update({
        public_metadata: {
          ...existingMetadata,
          force_password_reset: true,
          password_reset_at: new Date().toISOString(),
          password_reset_by: authContext.userId,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.userId)

    await logAdminAction('ADMIN_PASSWORD_RESET', {
      clerkOrgId: orgId,
      resourceType: 'user',
      resourceId: params.userId,
      resourceName: target.users?.email || params.userId,
      metadata: {
        method: 'resetAdminUserPassword',
        forced_sign_out: true,
      },
    })

    revalidatePath('/manage/users')
    revalidatePath(`/manage/users/${params.userId}`)

    return {
      success: true,
      message: 'Temporary password generated successfully.',
      tempPassword,
    }
  } catch (error) {
    console.error('[resetAdminUserPassword] Error:', error)
    return {
      success: false,
      message: `Failed to reset password: ${(error as Error).message || 'Unknown error'}`,
    }
  }
}
