'use server'

import { assertSuperAdmin } from '@/lib/admin/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { logAdminAction } from '@/lib/admin/log-admin-action'

interface GrantAccessInput {
  adminUserId: string
  merchantId: string
  notes?: string
}

interface RevokeAccessInput {
  adminUserId: string
  merchantId: string
}

async function getActorAndTargetNames(
  adminUserId: string,
  merchantId: string
): Promise<{ targetUserName: string; merchantName: string }> {
  const supabase = createServiceRoleClient()

  const [{ data: targetUser }, { data: merchant }] = await Promise.all([
    supabase
      .from('users')
      .select('first_name, last_name, email')
      .eq('id', adminUserId)
      .maybeSingle(),
    supabase
      .from('merchants')
      .select('name')
      .eq('id', merchantId)
      .maybeSingle(),
  ])

  const targetUserName =
    `${targetUser?.first_name || ''} ${targetUser?.last_name || ''}`.trim() ||
    targetUser?.email ||
    adminUserId

  return {
    targetUserName,
    merchantName: merchant?.name || merchantId,
  }
}

export async function grantAdminMerchantAccess(input: GrantAccessInput): Promise<{ success: boolean; message?: string }> {
  try {
    const authContext = await assertSuperAdmin()

    if (input.adminUserId === authContext.userId) {
      return { success: false, message: 'Cannot assign merchants to yourself.' }
    }

    const supabase = createServiceRoleClient()
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('admin_merchant_access')
      .upsert(
        {
          admin_user_id: input.adminUserId,
          merchant_id: input.merchantId,
          granted_by: authContext.userId,
          granted_at: now,
          revoked_at: null,
          is_active: true,
          notes: input.notes || null,
          updated_at: now,
        },
        { onConflict: 'admin_user_id,merchant_id' }
      )
      .select('id')
      .single()

    if (error) {
      return { success: false, message: error.message }
    }

    const { targetUserName, merchantName } = await getActorAndTargetNames(input.adminUserId, input.merchantId)

    await logAdminAction('ADMIN_MERCHANT_ACCESS_GRANTED', {
      merchantId: input.merchantId,
      resourceType: 'admin_merchant_access',
      resourceId: data?.id || undefined,
      resourceName: `${targetUserName} -> ${merchantName}`,
      changes: {
        after: {
          admin_user_id: input.adminUserId,
          merchant_id: input.merchantId,
          is_active: true,
        },
      },
      metadata: {
        source: 'grantAdminMerchantAccess',
        target_admin_user_id: input.adminUserId,
        merchant_name: merchantName,
      },
    })

    return { success: true }
  } catch (error: any) {
    console.error('[grantAdminMerchantAccess] Error:', error)
    return { success: false, message: error?.message || 'Unknown error' }
  }
}

export async function revokeAdminMerchantAccess(input: RevokeAccessInput): Promise<{ success: boolean; message?: string }> {
  try {
    await assertSuperAdmin()
    const supabase = createServiceRoleClient()

    const { data: existing } = await supabase
      .from('admin_merchant_access')
      .select('id, is_active')
      .eq('admin_user_id', input.adminUserId)
      .eq('merchant_id', input.merchantId)
      .maybeSingle()

    const { error } = await supabase
      .from('admin_merchant_access')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('admin_user_id', input.adminUserId)
      .eq('merchant_id', input.merchantId)

    if (error) {
      return { success: false, message: error.message }
    }

    const { targetUserName, merchantName } = await getActorAndTargetNames(input.adminUserId, input.merchantId)

    await logAdminAction('ADMIN_MERCHANT_ACCESS_REVOKED', {
      merchantId: input.merchantId,
      resourceType: 'admin_merchant_access',
      resourceId: existing?.id || undefined,
      resourceName: `${targetUserName} -> ${merchantName}`,
      changes: {
        is_active: {
          old: existing?.is_active ?? true,
          new: false,
        },
      },
      metadata: {
        source: 'revokeAdminMerchantAccess',
        target_admin_user_id: input.adminUserId,
        merchant_name: merchantName,
      },
    })

    return { success: true }
  } catch (error: any) {
    console.error('[revokeAdminMerchantAccess] Error:', error)
    return { success: false, message: error?.message || 'Unknown error' }
  }
}

export async function bulkGrantAdminMerchantAccess(
  adminUserId: string,
  merchantIds: string[],
  notes?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const authContext = await assertSuperAdmin()

    if (adminUserId === authContext.userId) {
      return { success: false, message: 'Cannot assign merchants to yourself.' }
    }
    const supabase = createServiceRoleClient()
    const now = new Date().toISOString()

    if (!merchantIds.length) {
      return { success: true }
    }

    const records = merchantIds.map((merchantId) => ({
      admin_user_id: adminUserId,
      merchant_id: merchantId,
      granted_by: authContext.userId,
      granted_at: now,
      revoked_at: null,
      is_active: true,
      notes: notes || null,
      updated_at: now,
    }))

    const { error } = await supabase
      .from('admin_merchant_access')
      .upsert(records, { onConflict: 'admin_user_id,merchant_id' })

    if (error) {
      return { success: false, message: error.message }
    }

    const { data: merchants } = await supabase
      .from('merchants')
      .select('id, name')
      .in('id', merchantIds)

    await logAdminAction('ADMIN_MERCHANT_ACCESS_GRANTED', {
      resourceType: 'admin_merchant_access',
      resourceName: `bulk_grant_${adminUserId}`,
      changes: {
        after: {
          admin_user_id: adminUserId,
          merchant_ids: merchantIds,
          is_active: true,
        },
      },
      metadata: {
        source: 'bulkGrantAdminMerchantAccess',
        bulk: true,
        target_admin_user_id: adminUserId,
        merchant_ids: merchantIds,
        merchant_names: (merchants || []).map((m) => m.name),
      },
    })

    return { success: true }
  } catch (error: any) {
    console.error('[bulkGrantAdminMerchantAccess] Error:', error)
    return { success: false, message: error?.message || 'Unknown error' }
  }
}

export async function bulkRevokeAdminMerchantAccess(
  adminUserId: string,
  merchantIds: string[]
): Promise<{ success: boolean; message?: string }> {
  try {
    await assertSuperAdmin()
    const supabase = createServiceRoleClient()

    if (!merchantIds.length) {
      return { success: true }
    }

    const { error } = await supabase
      .from('admin_merchant_access')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('admin_user_id', adminUserId)
      .in('merchant_id', merchantIds)

    if (error) {
      return { success: false, message: error.message }
    }

    await logAdminAction('ADMIN_MERCHANT_ACCESS_REVOKED', {
      resourceType: 'admin_merchant_access',
      resourceName: `bulk_revoke_${adminUserId}`,
      changes: {
        after: {
          admin_user_id: adminUserId,
          merchant_ids: merchantIds,
          is_active: false,
        },
      },
      metadata: {
        source: 'bulkRevokeAdminMerchantAccess',
        bulk: true,
        target_admin_user_id: adminUserId,
        merchant_ids: merchantIds,
      },
    })

    return { success: true }
  } catch (error: any) {
    console.error('[bulkRevokeAdminMerchantAccess] Error:', error)
    return { success: false, message: error?.message || 'Unknown error' }
  }
}

