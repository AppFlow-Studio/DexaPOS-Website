'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { FloorPlan } from '@/types/floor-plan'

export interface LocationFloorPlanStats {
    locationId: string
    floorPlanCount: number
    tableCount: number
}

/**
 * Get all floor plans for a location
 */
export async function GetLocationFloorPlans(locationId: string): Promise<FloorPlan[]> {
    if (!locationId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    try {
        const { data, error } = await supabase.rpc('get_location_floor_plans', {
            p_location_id: locationId,
        })

        if (error) {
            console.error('[GetLocationFloorPlans] Error:', error)
            return []
        }

        return (data as FloorPlan[]) || []
    } catch (error) {
        console.error('[GetLocationFloorPlans] Unexpected error:', error)
        return []
    }
}

/**
 * Get floor plan and table count statistics for a location
 */
export async function GetLocationTableCount(locationId: string): Promise<number> {
    if (!locationId) {
        return 0
    }

    const supabase = createServerSupabaseClient()

    try {
        // Count all table objects (tables and booths) for this location
        const { count, error } = await supabase
            .from('floor_plan_objects')
            .select('*', { count: 'exact', head: true })
            .eq('location_id', locationId)
            .in('category', ['table', 'booth'])
            .eq('is_active', true)

        if (error) {
            console.error('[GetLocationTableCount] Error:', error)
            return 0
        }

        return count || 0
    } catch (error) {
        console.error('[GetLocationTableCount] Unexpected error:', error)
        return 0
    }
}

/**
 * Get floor plan statistics for all locations
 */
export async function GetLocationsWithFloorPlanStats(clerkOrgId: string): Promise<
    Array<{
        locationId: string
        locationName: string
        floorPlanCount: number
        tableCount: number
    }>
> {
    if (!clerkOrgId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    try {
        // Get merchant ID
        const { data: merchant, error: merchantError } = await supabase
            .from('merchants')
            .select('id')
            .eq('clerk_org_id', clerkOrgId)
            .single()

        if (merchantError || !merchant) {
            console.error('[GetLocationsWithFloorPlanStats] Error getting merchant:', merchantError)
            return []
        }

        // Get all locations
        const { data: locations, error: locationsError } = await supabase
            .from('locations')
            .select('id, name')
            .eq('merchant_id', merchant.id)

        if (locationsError || !locations) {
            console.error('[GetLocationsWithFloorPlanStats] Error getting locations:', locationsError)
            return []
        }

        // Get floor plan counts for each location
        const statsPromises = locations.map(async (location) => {
            const [floorPlans, tableCount] = await Promise.all([
                GetLocationFloorPlans(location.id),
                GetLocationTableCount(location.id),
            ])

            return {
                locationId: location.id,
                locationName: location.name,
                floorPlanCount: floorPlans.length,
                tableCount,
            }
        })

        return await Promise.all(statsPromises)
    } catch (error) {
        console.error('[GetLocationsWithFloorPlanStats] Unexpected error:', error)
        return []
    }
}

