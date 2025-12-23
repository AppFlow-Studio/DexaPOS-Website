'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { RolesModel, LocationsModel } from '@/types/db-modles'
import { GetUserRole } from '@/utils/get-user-role'

/**
 * Get merchant roles filtered by organization_type = 'merchant'
 */
export async function GetMerchantRoles() {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('organization_type', 'merchant')
        .order('level', { ascending: false })

    if (error) {
        console.error('Error getting merchant roles:', error)
        return []
    }

    return data as RolesModel[]
}

/**
 * Get locations accessible by the current user
 * Uses the materialized view mv_user_location_access for performance
 */
export async function GetUserAccessibleLocations(userId: string, merchantId: string) {
    if (!userId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    // Try materialized view first, fallback to direct query
    const { data: mvData, error: mvError } = await supabase
        .from('mv_user_location_access')
        .select(`
            location_id,
            effective_role,
            access_type,
            is_primary_location,
            locations!inner(
                id,
                name,
                address,
                merchant_id
            )
        `)
        .eq('user_id', userId)

    if (!mvError && mvData && mvData.length > 0) {
        // Transform the data from materialized view
        return mvData.map((item: any) => ({
            id: item.locations.id,
            name: item.locations.name,
            address: item.locations.address,
            merchant_id: item.locations.merchant_id,
            role_code: item.effective_role,
            access_type: item.access_type,
            is_primary: item.is_primary_location || false,
        })) as (LocationsModel & { role_code?: string; access_type?: string; is_primary?: boolean })[]
    }


    // Fallback: try direct query if materialized view fails or is empty
    return await getLocationsFallback(userId, merchantId, supabase)
}

/**
 * Fallback method to get locations if materialized view is not available
 */
async function getLocationsFallback(userId: string, merchantId: string, supabase: any) {
    // Lets Check if the merchant owner is viewing, if so, we can return all locations
    const userRole = await GetUserRole(userId)
    if (userRole === 'merchant.owner') {
        const { data, error } = await supabase
            .from('locations')
            .select('*')
            .eq('merchant_id', merchantId)
        if (error) {
            console.error('[getLocationsFallback] Error getting locations:', error)
            return []
        }
        return data as LocationsModel[]
    }

    // Direct query through location_members
    const { data, error } = await supabase
        .from('location_members')
        .select(`
            location_id,
            role_code,
            is_primary_location,
            locations!inner(
                id,
                name,
                address,
                merchant_id
            )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)

    if (error) {
        console.error('Error in fallback location query:', error)
        return []
    }

    return (data || []).map((item: any) => ({
        id: item.locations.id,
        name: item.locations.name,
        address: item.locations.address,
        merchant_id: item.locations.merchant_id,
        role_code: item.role_code,
        is_primary: item.is_primary_location || false,
    })) as (LocationsModel & { role_code?: string; is_primary?: boolean })[]
}

