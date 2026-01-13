'use server'

// ============================================================================
// Stations Server Actions
// Description: CRUD operations for location-specific POS stations
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export type StationType = 'register' | 'checkout' | 'kds' | 'self_service'
export type SyncRole = 'leader' | 'follower'
export type ViewScope = 'own' | 'location'

export interface Station {
    id: string
    merchant_id: string
    location_id: string

    // Station Identity
    station_name: string
    station_code: string | null
    station_type: StationType
    station_number: number | null

    // Device Identification (optional - populated by POS app)
    device_id: string | null
    device_name: string | null
    hardware_model: string | null
    os_version: string | null
    app_version: string | null

    // Network (optional - populated by POS app)
    ip_address: string | null
    mac_address: string | null

    // Sync Configuration
    sync_role: SyncRole
    is_online: boolean
    last_heartbeat_at: string | null
    last_sync_at: string | null

    // Capabilities
    can_create_orders: boolean
    can_process_payments: boolean
    can_void_orders: boolean
    can_apply_discounts: boolean
    can_update_kitchen_status: boolean
    view_scope: ViewScope

    // Status
    is_active: boolean
    deactivated_at: string | null
    deactivated_by: string | null

    // Timestamps
    created_at: string
    updated_at: string
}

export interface CreateStationInput {
    location_id: string
    station_name: string
    station_code?: string | null
    station_type: StationType
    station_number?: number | null
    device_name?: string | null
    hardware_model?: string | null
    sync_role?: SyncRole
    view_scope?: ViewScope
    can_create_orders?: boolean
    can_process_payments?: boolean
    can_void_orders?: boolean
    can_apply_discounts?: boolean
    can_update_kitchen_status?: boolean
}

export interface UpdateStationInput {
    station_name?: string
    station_code?: string | null
    station_type?: StationType
    station_number?: number | null
    device_name?: string | null
    hardware_model?: string | null
    sync_role?: SyncRole
    view_scope?: ViewScope
    can_create_orders?: boolean
    can_process_payments?: boolean
    can_void_orders?: boolean
    can_apply_discounts?: boolean
    can_update_kitchen_status?: boolean
}

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get all stations for a specific location
 */
export async function getStationsForLocation(locationId: string) {
    try {
        const supabase = createServerSupabaseClient()

        const { data, error } = await supabase
            .from('stations')
            .select('*')
            .eq('location_id', locationId)
            .order('station_number', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[getStationsForLocation] Error:', error)
            return { success: false, error: error.message, data: null }
        }

        return { success: true, data: data as Station[], error: null }
    } catch (error) {
        console.error('[getStationsForLocation] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: null,
        }
    }
}

/**
 * Get all stations for a merchant (across all locations)
 */
export async function getStationsForMerchant(clerkOrgId: string) {
    try {
        const supabase = createServerSupabaseClient()

        // First, get the merchant ID from the clerk_org_id
        const { data: merchant, error: merchantError } = await supabase
            .from('merchants')
            .select('id')
            .eq('clerk_org_id', clerkOrgId)
            .single()

        if (merchantError || !merchant) {
            console.error('[getStationsForMerchant] Error getting merchant:', merchantError)
            return { success: false, error: 'Merchant not found', data: null }
        }

        const { data, error } = await supabase
            .from('stations')
            .select('*')
            .eq('merchant_id', merchant.id)
            .order('location_id')
            .order('station_number', { ascending: true, nullsFirst: false })

        if (error) {
            console.error('[getStationsForMerchant] Error:', error)
            return { success: false, error: error.message, data: null }
        }

        return { success: true, data: data as Station[], error: null }
    } catch (error) {
        console.error('[getStationsForMerchant] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: null,
        }
    }
}

/**
 * Get a specific station by ID
 */
export async function getStationById(stationId: string) {
    try {
        const supabase = createServerSupabaseClient()

        const { data, error } = await supabase
            .from('stations')
            .select('*')
            .eq('id', stationId)
            .single()

        if (error) {
            console.error('[getStationById] Error:', error)
            return { success: false, error: error.message, data: null }
        }

        return { success: true, data: data as Station, error: null }
    } catch (error) {
        console.error('[getStationById] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: null,
        }
    }
}

/**
 * Get the next available station number for a location and type
 */
export async function getNextStationNumber(locationId: string, stationType: StationType) {
    try {
        const supabase = createServerSupabaseClient()

        const { data, error } = await supabase
            .from('stations')
            .select('station_number')
            .eq('location_id', locationId)
            .eq('station_type', stationType)
            .not('station_number', 'is', null)
            .order('station_number', { ascending: false })
            .limit(1)

        if (error) {
            console.error('[getNextStationNumber] Error:', error)
            return { success: false, error: error.message, data: 1 }
        }

        const nextNumber = data && data.length > 0 && data[0].station_number
            ? data[0].station_number + 1
            : 1

        return { success: true, data: nextNumber, error: null }
    } catch (error) {
        console.error('[getNextStationNumber] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: 1,
        }
    }
}

// ============================================================================
// CREATE Operations
// ============================================================================

/**
 * Create a new station
 */
export async function createStation(clerkOrgId: string, input: CreateStationInput) {
    try {
        const supabase = createServerSupabaseClient()

        // Get merchant ID
        const { data: merchant, error: merchantError } = await supabase
            .from('merchants')
            .select('id')
            .eq('clerk_org_id', clerkOrgId)
            .single()

        if (merchantError || !merchant) {
            console.error('[createStation] Error getting merchant:', merchantError)
            return { success: false, error: 'Merchant not found', data: null }
        }

        // Validate station_number uniqueness at location level if provided
        if (input.station_number) {
            const { data: existingStation } = await supabase
                .from('stations')
                .select('id')
                .eq('location_id', input.location_id)
                .eq('station_number', input.station_number)
                .single()

            if (existingStation) {
                return {
                    success: false,
                    error: `Station number ${input.station_number} already exists at this location`,
                    data: null
                }
            }
        }

        // Validate station_code uniqueness at location level if provided
        if (input.station_code) {
            const { data: existingCode } = await supabase
                .from('stations')
                .select('id')
                .eq('location_id', input.location_id)
                .eq('station_code', input.station_code)
                .single()

            if (existingCode) {
                return {
                    success: false,
                    error: `Station code "${input.station_code}" already exists at this location`,
                    data: null
                }
            }
        }

        const now = new Date().toISOString()

        const { data, error } = await supabase
            .from('stations')
            .insert({
                merchant_id: merchant.id,
                location_id: input.location_id,
                station_name: input.station_name,
                station_code: input.station_code || null,
                station_type: input.station_type,
                station_number: input.station_number || null,
                device_name: input.device_name || null,
                hardware_model: input.hardware_model || null,
                sync_role: input.sync_role || 'follower',
                view_scope: input.view_scope || 'own',
                is_online: false,
                can_create_orders: input.can_create_orders ?? true,
                can_process_payments: input.can_process_payments ?? false,
                can_void_orders: input.can_void_orders ?? false,
                can_apply_discounts: input.can_apply_discounts ?? true,
                can_update_kitchen_status: input.can_update_kitchen_status ?? false,
                is_active: true,
                created_at: now,
                updated_at: now,
            })
            .select()
            .single()

        if (error) {
            console.error('[createStation] Error:', error)
            return { success: false, error: error.message, data: null }
        }

        return { success: true, data: data as Station, error: null }
    } catch (error) {
        console.error('[createStation] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: null,
        }
    }
}

// ============================================================================
// UPDATE Operations
// ============================================================================

/**
 * Update a station
 */
export async function updateStation(stationId: string, input: UpdateStationInput) {
    try {
        const supabase = createServerSupabaseClient()

        // Get current station to check location
        const { data: currentStation, error: fetchError } = await supabase
            .from('stations')
            .select('location_id, station_number, station_code')
            .eq('id', stationId)
            .single()

        if (fetchError || !currentStation) {
            console.error('[updateStation] Error fetching station:', fetchError)
            return { success: false, error: 'Station not found', data: null }
        }

        // Validate station_number uniqueness if being changed
        if (input.station_number !== undefined && input.station_number !== currentStation.station_number) {
            const { data: existingStation } = await supabase
                .from('stations')
                .select('id')
                .eq('location_id', currentStation.location_id)
                .eq('station_number', input.station_number)
                .neq('id', stationId)
                .single()

            if (existingStation) {
                return {
                    success: false,
                    error: `Station number ${input.station_number} already exists at this location`,
                    data: null
                }
            }
        }

        // Validate station_code uniqueness if being changed
        if (input.station_code !== undefined && input.station_code !== currentStation.station_code && input.station_code) {
            const { data: existingCode } = await supabase
                .from('stations')
                .select('id')
                .eq('location_id', currentStation.location_id)
                .eq('station_code', input.station_code)
                .neq('id', stationId)
                .single()

            if (existingCode) {
                return {
                    success: false,
                    error: `Station code "${input.station_code}" already exists at this location`,
                    data: null
                }
            }
        }

        // Build update object
        const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        }

        if (input.station_name !== undefined) updateData.station_name = input.station_name
        if (input.station_code !== undefined) updateData.station_code = input.station_code || null
        if (input.station_type !== undefined) updateData.station_type = input.station_type
        if (input.station_number !== undefined) updateData.station_number = input.station_number
        if (input.device_name !== undefined) updateData.device_name = input.device_name || null
        if (input.hardware_model !== undefined) updateData.hardware_model = input.hardware_model || null
        if (input.sync_role !== undefined) updateData.sync_role = input.sync_role
        if (input.view_scope !== undefined) updateData.view_scope = input.view_scope
        if (input.can_create_orders !== undefined) updateData.can_create_orders = input.can_create_orders
        if (input.can_process_payments !== undefined) updateData.can_process_payments = input.can_process_payments
        if (input.can_void_orders !== undefined) updateData.can_void_orders = input.can_void_orders
        if (input.can_apply_discounts !== undefined) updateData.can_apply_discounts = input.can_apply_discounts
        if (input.can_update_kitchen_status !== undefined) updateData.can_update_kitchen_status = input.can_update_kitchen_status

        const { data, error } = await supabase
            .from('stations')
            .update(updateData)
            .eq('id', stationId)
            .select()
            .single()

        if (error) {
            console.error('[updateStation] Error:', error)
            return { success: false, error: error.message, data: null }
        }

        return { success: true, data: data as Station, error: null }
    } catch (error) {
        console.error('[updateStation] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: null,
        }
    }
}

/**
 * Deactivate a station (soft delete)
 */
export async function deactivateStation(stationId: string, deactivatedBy?: string) {
    try {
        const supabase = createServerSupabaseClient()

        const now = new Date().toISOString()

        const { data, error } = await supabase
            .from('stations')
            .update({
                is_active: false,
                deactivated_at: now,
                deactivated_by: deactivatedBy || null,
                updated_at: now,
            })
            .eq('id', stationId)
            .select()
            .single()

        if (error) {
            console.error('[deactivateStation] Error:', error)
            return { success: false, error: error.message, data: null }
        }

        return { success: true, data: data as Station, error: null }
    } catch (error) {
        console.error('[deactivateStation] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: null,
        }
    }
}

/**
 * Reactivate a station
 */
export async function reactivateStation(stationId: string) {
    try {
        const supabase = createServerSupabaseClient()

        const { data, error } = await supabase
            .from('stations')
            .update({
                is_active: true,
                deactivated_at: null,
                deactivated_by: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', stationId)
            .select()
            .single()

        if (error) {
            console.error('[reactivateStation] Error:', error)
            return { success: false, error: error.message, data: null }
        }

        return { success: true, data: data as Station, error: null }
    } catch (error) {
        console.error('[reactivateStation] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: null,
        }
    }
}

// ============================================================================
// DELETE Operations
// ============================================================================

/**
 * Permanently delete a station
 */
export async function deleteStation(stationId: string) {
    try {
        const supabase = createServerSupabaseClient()

        const { error } = await supabase
            .from('stations')
            .delete()
            .eq('id', stationId)

        if (error) {
            console.error('[deleteStation] Error:', error)
            return { success: false, error: error.message }
        }

        return { success: true, error: null }
    } catch (error) {
        console.error('[deleteStation] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

/**
 * Permanently delete multiple stations
 */
export async function deleteMultipleStations(stationIds: string[]) {
    try {
        const supabase = createServerSupabaseClient()

        const { error } = await supabase
            .from('stations')
            .delete()
            .in('id', stationIds)

        if (error) {
            console.error('[deleteMultipleStations] Error:', error)
            return { success: false, error: error.message }
        }

        return { success: true, error: null }
    } catch (error) {
        console.error('[deleteMultipleStations] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

// ============================================================================
// Device Registration (Called by POS App)
// ============================================================================

/**
 * Register or update device info for a station (called when POS app connects)
 */
export async function registerStationDevice(
    stationId: string,
    deviceInfo: {
        device_id: string
        device_name?: string
        hardware_model?: string
        os_version?: string
        app_version?: string
        ip_address?: string
        mac_address?: string
    }
) {
    try {
        const supabase = createServerSupabaseClient()

        const now = new Date().toISOString()

        const { data, error } = await supabase
            .from('stations')
            .update({
                device_id: deviceInfo.device_id,
                device_name: deviceInfo.device_name || null,
                hardware_model: deviceInfo.hardware_model || null,
                os_version: deviceInfo.os_version || null,
                app_version: deviceInfo.app_version || null,
                ip_address: deviceInfo.ip_address || null,
                mac_address: deviceInfo.mac_address || null,
                is_online: true,
                last_heartbeat_at: now,
                updated_at: now,
            })
            .eq('id', stationId)
            .select()
            .single()

        if (error) {
            console.error('[registerStationDevice] Error:', error)
            return { success: false, error: error.message, data: null }
        }

        return { success: true, data: data as Station, error: null }
    } catch (error) {
        console.error('[registerStationDevice] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: null,
        }
    }
}

/**
 * Update station heartbeat (called periodically by POS app)
 */
export async function updateStationHeartbeat(stationId: string) {
    try {
        const supabase = createServerSupabaseClient()

        const now = new Date().toISOString()

        const { error } = await supabase
            .from('stations')
            .update({
                is_online: true,
                last_heartbeat_at: now,
            })
            .eq('id', stationId)

        if (error) {
            console.error('[updateStationHeartbeat] Error:', error)
            return { success: false, error: error.message }
        }

        return { success: true, error: null }
    } catch (error) {
        console.error('[updateStationHeartbeat] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

/**
 * Update station sync timestamp
 */
export async function updateStationSync(stationId: string) {
    try {
        const supabase = createServerSupabaseClient()

        const now = new Date().toISOString()

        const { error } = await supabase
            .from('stations')
            .update({
                last_sync_at: now,
                is_online: true,
                last_heartbeat_at: now,
            })
            .eq('id', stationId)

        if (error) {
            console.error('[updateStationSync] Error:', error)
            return { success: false, error: error.message }
        }

        return { success: true, error: null }
    } catch (error) {
        console.error('[updateStationSync] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

/**
 * Mark station as offline (can be called by a cron job or when disconnect detected)
 */
export async function markStationOffline(stationId: string) {
    try {
        const supabase = createServerSupabaseClient()

        const { error } = await supabase
            .from('stations')
            .update({
                is_online: false,
            })
            .eq('id', stationId)

        if (error) {
            console.error('[markStationOffline] Error:', error)
            return { success: false, error: error.message }
        }

        return { success: true, error: null }
    } catch (error) {
        console.error('[markStationOffline] Exception:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}
