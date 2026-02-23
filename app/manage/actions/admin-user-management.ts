'use server'

import crypto from 'crypto'
import { createClerkClient } from '@clerk/backend'
import { revalidatePath } from 'next/cache'
import { assertHQPermission } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { HQ_ROLES } from '@/types/admin'

const DEXA_HQ_ORG_ID =
  process.env.DEXA_POS_INTERNAL_TEAM_ID || 'org_33z36QibAMZy6kc2xZNYmDl5duh'

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
