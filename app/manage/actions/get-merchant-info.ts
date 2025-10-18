'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MerchantInfoModel } from '@/types/db-modles'

export async function GetMerchantInfo(clerkOrgId: string) {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.from('merchants').select(
        `
        *,
        organizations(
        imageURL, 
        members(*, users(*)),
        pending_org_admin_invites(*, users(*))
        ),
        carriers(*)
        `
    ).eq('clerk_org_id', clerkOrgId).single()
    if (error) {
        console.error('Error getting merchant info:', error)
        return new Error(error.message)
    }
    return data as MerchantInfoModel
}