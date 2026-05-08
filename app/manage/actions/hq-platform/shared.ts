'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function getAssignedMerchantScope(
    userId: string,
    roleCode?: string | null
): Promise<string[] | null> {
    if (roleCode === 'hq.super_admin') return null

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
        .from('admin_merchant_access')
        .select('merchant_id')
        .eq('admin_user_id', userId)
        .eq('is_active', true)

    if (error) {
        console.error('[getAssignedMerchantScope] Error:', error)
        return []
    }

    return Array.from(
        new Set(
            (data ?? [])
                .map((row: { merchant_id: string | null }) => row.merchant_id)
                .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
    )
}

export async function applyMerchantScope(
    requestedMerchantIds: string[] | undefined,
    scopedMerchantIds: string[] | null
): Promise<string[] | undefined> {
    if (scopedMerchantIds === null) return requestedMerchantIds
    if (!requestedMerchantIds || requestedMerchantIds.length === 0) return scopedMerchantIds
    const allowed = new Set(scopedMerchantIds)
    return requestedMerchantIds.filter((id) => allowed.has(id))
}
