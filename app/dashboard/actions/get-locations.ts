'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { LocationsModel } from '@/types/db-modles'

export async function GetLocations(clerkOrgId: string) {
    if (!clerkOrgId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    // First, get the merchant ID from the clerk_org_id
    const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id')
        .eq('clerk_org_id', clerkOrgId)
        .single()

    if (merchantError || !merchant) {
        console.error('Error getting merchant:', merchantError)
        return []
    }

    // Then get locations for this merchant
    const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting locations:', error)
        return []
    }
    return data as LocationsModel[]
}
