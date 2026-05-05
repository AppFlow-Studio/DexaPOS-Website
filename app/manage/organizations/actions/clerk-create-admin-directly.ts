'use server'

import crypto from 'crypto'
import { createClerkClient } from '@clerk/backend'
import { assertSuperAdmin } from '@/lib/admin/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { MerchantAccessAssignment } from '@/types/admin'
import { revalidatePath } from 'next/cache'
import { isValidEmail, normalizeEmail } from '@/lib/utils/email'
import { findEmailConflict } from '@/app/manage/actions/email-duplicates'
import { emailConflictMessage } from '@/lib/utils/email'

interface CreateAdminDirectlyParams {
  organizationId: string
  firstName: string
  lastName: string
  email: string
  roleCode: string
  levelType: string
  orgType: string
  merchantAccess: MerchantAccessAssignment[]
  invitedBy?: string
}

function generateSecurePassword(length: number = 14): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  const bytes = crypto.randomBytes(length)
  let password = ''
  for (let i = 0; i < length; i += 1) {
    password += chars[bytes[i] % chars.length]
  }
  return password
}

function getErrorMessage(error: unknown): string {
  const typed = error as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string }
  if (typed?.errors && Array.isArray(typed.errors) && typed.errors.length > 0) {
    return typed.errors[0].longMessage || typed.errors[0].message || 'Unknown Clerk error'
  }
  return typed?.message || 'Unknown error'
}

export async function createAdminDirectly(params: CreateAdminDirectlyParams): Promise<{
  success: boolean
  message: string
  data?: {
    user_id: string
    temp_password: string
    role: string
  }
}> {
  let createdUserId: string | null = null
  const createdAt = new Date().toISOString()

  try {
    const authContext = await assertSuperAdmin()
    const normalizedEmail = normalizeEmail(params.email)
    const firstName = params.firstName.trim()
    const lastName = params.lastName.trim()
    const merchantAccess = (params.merchantAccess || []).filter((entry) => Boolean(entry?.merchantId))

    if (!params.organizationId) {
      return { success: false, message: 'Organization ID is required.' }
    }
    if (!firstName || !lastName) {
      return { success: false, message: 'First name and last name are required.' }
    }
    if (!isValidEmail(normalizedEmail)) {
      return { success: false, message: 'A valid email is required.' }
    }
    const emailConflict = await findEmailConflict(normalizedEmail, { scope: 'global' })
    if (emailConflict) {
      return { success: false, message: emailConflictMessage(emailConflict) }
    }
    if (!params.roleCode) {
      return { success: false, message: 'Role is required.' }
    }
    if (params.roleCode !== 'hq.super_admin' && merchantAccess.length === 0) {
      return { success: false, message: 'At least one merchant assignment is required for this role.' }
    }

    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    const supabase = createServiceRoleClient()
    const tempPassword = generateSecurePassword(14)

    const clerkUser = await clerkClient.users.createUser({
      emailAddress: [normalizedEmail],
      password: tempPassword,
      firstName,
      lastName,
      publicMetadata: {
        creationType: 'direct_admin',
        organizationId: params.organizationId,
        role: params.roleCode,
        level_type: params.levelType || 'hq',
        org_type: params.orgType || 'hq',
        setupRequired: true,
      },
      skipPasswordRequirement: false,
      skipPasswordChecks: false,
    })

    createdUserId = clerkUser.id

    const membership = await clerkClient.organizations.createOrganizationMembership({
      organizationId: params.organizationId,
      userId: clerkUser.id,
      role: 'org:admin',
    })

    const { error: userUpsertError } = await supabase
      .from('users')
      .upsert(
        {
          id: clerkUser.id,
          first_name: firstName,
          last_name: lastName,
          email: normalizedEmail,
          avatar_url: clerkUser.imageUrl || null,
          public_metadata: (clerkUser.publicMetadata as Record<string, unknown>) || {},
          created_at: createdAt,
          updated_at: createdAt,
        },
        { onConflict: 'id' }
      )

    if (userUpsertError) {
      throw new Error(`Failed to sync user record: ${userUpsertError.message}`)
    }

    const membershipId = membership?.id || `${clerkUser.id}-${params.organizationId}`

    const { error: memberUpsertError } = await supabase
      .from('members')
      .upsert(
        {
          id: membershipId,
          user_id: clerkUser.id,
          organization_id: params.organizationId,
          role: params.roleCode,
          created_at: createdAt,
          updated_at: createdAt,
        },
        { onConflict: 'id' }
      )

    if (memberUpsertError) {
      throw new Error(`Failed to sync member record: ${memberUpsertError.message}`)
    }

    const merchantIds = Array.from(
      new Set(merchantAccess.map((entry) => entry.merchantId).filter(Boolean))
    )

    if (merchantIds.length > 0) {
      const { data: existingAccessRows, error: existingAccessError } = await supabase
        .from('admin_merchant_access')
        .select('id, merchant_id, is_active')
        .eq('admin_user_id', clerkUser.id)
        .in('merchant_id', merchantIds)

      if (existingAccessError) {
        throw new Error(`Failed to check merchant access: ${existingAccessError.message}`)
      }

      const existingByMerchant = new Map(
        (existingAccessRows || []).map((row) => [row.merchant_id, row])
      )

      const toInsert = merchantIds
        .filter((merchantId) => !existingByMerchant.has(merchantId))
        .map((merchantId) => ({
          admin_user_id: clerkUser.id,
          merchant_id: merchantId,
          granted_by: authContext.userId,
          granted_at: createdAt,
          is_active: true,
          created_at: createdAt,
          updated_at: createdAt,
        }))

      if (toInsert.length > 0) {
        const { error: insertAccessError } = await supabase
          .from('admin_merchant_access')
          .insert(toInsert)

        if (insertAccessError) {
          throw new Error(`Failed to create merchant access: ${insertAccessError.message}`)
        }
      }

      const toReactivateIds = (existingAccessRows || [])
        .filter((row) => row.is_active === false)
        .map((row) => row.id)

      if (toReactivateIds.length > 0) {
        const { error: reactivateError } = await supabase
          .from('admin_merchant_access')
          .update({
            is_active: true,
            revoked_at: null,
            granted_by: authContext.userId,
            granted_at: createdAt,
            updated_at: createdAt,
          })
          .in('id', toReactivateIds)

        if (reactivateError) {
          throw new Error(`Failed to reactivate merchant access: ${reactivateError.message}`)
        }
      }
    }

    const { data: pendingRecord, error: pendingError } = await supabase
      .from('pending_org_admin_invites')
      .insert({
        organization_id: params.organizationId,
        email: normalizedEmail,
        clerk_invite_id: null,
        status: 'direct_created',
        role: params.roleCode,
        clerk_user_id: clerkUser.id,
        first_name: firstName,
        last_name: lastName,
        merchant_access: merchantAccess.length > 0 ? merchantAccess : null,
        invited_by: params.invitedBy || authContext.userId,
        accepted_at: createdAt,
        created_at: createdAt,
        updated_at: createdAt,
      })
      .select('id')
      .single()

    if (pendingError) {
      throw new Error(`Failed to record direct-create invite row: ${pendingError.message}`)
    }

    await logAdminAction('ADMIN_CREATED_DIRECTLY', {
      clerkOrgId: params.organizationId,
      resourceType: 'user',
      resourceId: clerkUser.id,
      resourceName: normalizedEmail,
      changes: {
        after: {
          role: params.roleCode,
          status: 'direct_created',
        },
      },
      metadata: {
        pending_record_id: pendingRecord?.id || null,
        merchant_access_count: merchantAccess.length,
        created_via: 'admin_direct_create',
      },
    })

    revalidatePath('/manage/users')

    return {
      success: true,
      message: 'Admin account created successfully.',
      data: {
        user_id: clerkUser.id,
        temp_password: tempPassword,
        role: params.roleCode,
      },
    }
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('[createAdminDirectly] Error:', error)

    if (createdUserId) {
      try {
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        await clerkClient.users.deleteUser(createdUserId)
      } catch (cleanupError) {
        console.error('[createAdminDirectly] Cleanup failed:', cleanupError)
      }
    }

    return {
      success: false,
      message: `Error creating direct admin account: ${message}`,
    }
  }
}

