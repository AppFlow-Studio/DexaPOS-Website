'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Get merchant UUID from clerk_org_id
 * Lightweight helper for cases where only the merchant ID is needed
 */
export async function getMerchantIdFromClerkOrgId(clerkOrgId: string): Promise<{ id: string } | null> {
    const supabase = createServerSupabaseClient()
    
    const { data, error } = await supabase
        .from('merchants')
        .select('id')
        .eq('clerk_org_id', clerkOrgId)
        .single()
    
    if (error) {
        console.error('Error getting merchant ID:', error)
        return null
    }
    
    return data
}
