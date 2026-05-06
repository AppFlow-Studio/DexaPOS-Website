import { auth } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { HQRoleCode } from '@/types/admin'

const DEXA_HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID!

/**
 * Returns true for any HQ role that is NOT super admin. Super admin sees everything;
 * everyone else (platform_admin, manager) is scoped to assigned merchants.
 */
export function isScoped(roleCode: string | null | undefined): boolean {
  return !!roleCode && roleCode !== 'hq.super_admin'
}

/**
 * Server-side gate for per-merchant actions. Super admins always pass; non-super HQ
 * admins must have an active row in `admin_merchant_access` for the given merchant.
 * Throws on failure.
 */
export async function assertMerchantInScope(merchantId: string): Promise<void> {
  const { userId, orgId } = await auth()
  if (!userId || orgId !== DEXA_HQ_ORG_ID) {
    throw new Error('Unauthorized: HQ admin access required')
  }

  const supabase = createServerSupabaseClient()
  const { data: roleData } = await supabase.rpc('get_my_hq_role').single()
  const role = roleData as { role_code: HQRoleCode } | null

  if (!role) {
    throw new Error('Unauthorized: No HQ role assigned')
  }

  if (!isScoped(role.role_code)) {
    return
  }

  const service = createServiceRoleClient()
  const { data: access } = await service
    .from('admin_merchant_access')
    .select('id')
    .eq('admin_user_id', userId)
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .maybeSingle()

  if (!access) {
    throw new Error('Forbidden: You do not have access to this merchant')
  }
}
