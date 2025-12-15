'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { LocationMemberWithDetails, LocationInviteWithDetails } from '@/types/merchant_locations'

// ============================================================================
// GET OPERATIONS
// ============================================================================
// TODO: ALTER THIS TO ACCOUNT FOR MERCHANT OWNER VIEWING ALL LOCATIONS & LOCATION SCOPED VIEWS
export async function GetLocationMembers(locationId: string, merchantId: string): Promise<LocationMemberWithDetails[]> {
    if (!locationId) {
        return []
    }

    const supabase = createServerSupabaseClient()
    if (locationId === 'all' || locationId === null) {
        const { data, error } = await supabase.from('location_members').select(`
           *
        `).eq('merchant_id', merchantId)
        return data as unknown as LocationMemberWithDetails[]
    }

    const { data, error } = await supabase
        .from('location_members')
        .select(`
            id,
            location_id,
            user_id,
            role_code,
            is_active,
            employment_type,
            hourly_rate,
            pin_code,
            assigned_at,
            updated_at,
            users(*)
        `)
        .eq('location_id', locationId)
        .order('assigned_at', { ascending: false })

    if (error) {
        console.error('Error getting location members:', error)
        return []
    }

    // Transform the data to match the expected type
    return (data || []).map((member: any) => ({
        id: member.id,
        location_id: member.location_id,
        user_id: member.user_id,
        role_code: member.role_code,
        is_primary_location: member.is_primary_location,
        is_active: member.is_active,
        employment_type: member.employment_type,
        hourly_rate: member.hourly_rate,
        pin_code: member.pin_code,
        assigned_at: member.assigned_at,
        updated_at: member.updated_at,
        
        user: member.users,
        role: member.role
    })) as LocationMemberWithDetails[]
}

export async function GetLocationInvites(locationId: string, merchantId: string): Promise<LocationInviteWithDetails[]> {
    if (!locationId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    if (locationId === 'all' || locationId === null) {
        const { data, error } = await supabase.from('location_invites').select(`
           *
        `)
            .eq('merchant_id', merchantId)
        return data as unknown as LocationInviteWithDetails[]
    }

    console.log('locationId', locationId)
    const searchCriterionObject = {
        "locationId": locationId
    };

    // Stringify the object and wrap it in a JS array for the 'contains' check
    const filterValue = JSON.stringify([searchCriterionObject]);

    const { data, error } = await supabase
        .from('location_invites')
        .select(`
            id,
            invited_by_user_id,
            email,
            role_code,
            clerk_invite_id,
            status,
            expires_at,
            accepted_at,
            hourly_rate,
            merchant_id,
            created_at,
            updated_at,
            invite_type,
            first_name,
            last_name,
            phone,
            location_assignments,
            invited_by:users!location_invites_invited_by_user_id_fkey(
                id,
                first_name,
                last_name,
                email
            ),
            role:roles!location_invites_role_code_fkey(
                code,
                name,
                level
            )
        `)
        .filter('location_assignments', 'cs', filterValue)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting location invites:', error)
        return []
    }
    console.log('data', data)

    // Transform the data to match the expected type
    return (data || []).map((invite: any) => ({
        id: invite.id,
        location_id: invite.location_id,
        invited_by_user_id: invite.invited_by_user_id,
        email: invite.email,
        role_code: invite.role_code,
        clerk_invite_id: invite.clerk_invite_id,
        status: invite.status,
        accepted_by_user_id: invite.accepted_by_user_id,
        expires_at: invite.expires_at,
        accepted_at: invite.accepted_at,
        created_at: invite.created_at,
        updated_at: invite.updated_at,
        invited_by: invite.invited_by,
        role: invite.role
    })) as LocationInviteWithDetails[]
}

export async function GetLocationMember(memberId: string) {
    if (!memberId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('location_members')
        .select(`
            id,
            location_id,
            user_id,
            role_code,
            is_primary_location,
            is_active,
            employment_type,
            hourly_rate,
            pin_code,
            assigned_at,
            updated_at,
            user:users!location_members_user_id_fkey(
                id,
                first_name,
                last_name,
                email,
                avatar_url
            ),
            role:roles!location_members_role_code_fkey(
                code,
                name,
                level,
                level_type
            )
        `)
        .eq('id', memberId)
        .single()

    if (error) {
        console.error('Error getting location member:', error)
        return null
    }

    return data as unknown as LocationMemberWithDetails
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function AddLocationMember(
    locationId: string,
    data: {
        user_id: string
        role_code: string
        is_primary_location?: boolean
        employment_type?: string
        hourly_rate?: number
        pin_code?: string
    }
) {
    if (!locationId || !data.user_id || !data.role_code) {
        return { error: 'Location ID, user ID, and role are required' }
    }

    const supabase = createServerSupabaseClient()

    // Check if user is already a member
    const { data: existing } = await supabase
        .from('location_members')
        .select('id')
        .eq('location_id', locationId)
        .eq('user_id', data.user_id)
        .single()

    if (existing) {
        return { error: 'User is already a member of this location' }
    }

    const { data: member, error } = await supabase
        .from('location_members')
        .insert({
            location_id: locationId,
            user_id: data.user_id,
            role_code: data.role_code,
            is_primary_location: data.is_primary_location ?? false,
            employment_type: data.employment_type || null,
            hourly_rate: data.hourly_rate || null,
            pin_code: data.pin_code || null,
        })
        .select()
        .single()

    if (error) {
        console.error('Error adding location member:', error)
        return { error: error.message }
    }

    return { data: member }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

export async function UpdateLocationMember(
    memberId: string,
    data: {
        role_code?: string
        is_primary_location?: boolean
        is_active?: boolean
        employment_type?: string | null
        hourly_rate?: number | null
        pin_code?: string | null
    }
) {
    if (!memberId) {
        return { error: 'Member ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const updateData: Record<string, unknown> = {}

    if (data.role_code !== undefined) updateData.role_code = data.role_code
    if (data.is_primary_location !== undefined) updateData.is_primary_location = data.is_primary_location
    if (data.is_active !== undefined) updateData.is_active = data.is_active
    if (data.employment_type !== undefined) updateData.employment_type = data.employment_type
    if (data.hourly_rate !== undefined) updateData.hourly_rate = data.hourly_rate
    if (data.pin_code !== undefined) updateData.pin_code = data.pin_code

    const { data: member, error } = await supabase
        .from('location_members')
        .update(updateData)
        .eq('id', memberId)
        .select()
        .single()

    if (error) {
        console.error('Error updating location member:', error)
        return { error: error.message }
    }

    return { data: member }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function RemoveLocationMember(memberId: string) {
    if (!memberId) {
        return { error: 'Member ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('location_members')
        .delete()
        .eq('id', memberId)

    if (error) {
        console.error('Error removing location member:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// INVITE OPERATIONS
// ============================================================================

export async function CreateLocationInvite(
    clerkOrgId: string,
    locationId: string,
    data: {
        email: string
        role_code: string
        invited_by_user_id: string
    }
) {
    if (!locationId || !data.email || !data.role_code || !data.invited_by_user_id) {
        return { error: 'All fields are required' }
    }

    // Send Clerk Organization Invitation

    const supabase = createServerSupabaseClient()

    // Check for existing pending invite
    const { data: existing } = await supabase
        .from('location_invites')
        .select('id')
        .eq('location_id', locationId)
        .eq('email', data.email)
        .eq('status', 'pending')
        .single()

    if (existing) {
        return { error: 'An invitation has already been sent to this email' }
    }

    const { data: invite, error } = await supabase
        .from('location_invites')
        .insert({
            location_id: locationId,
            email: data.email,
            role_code: data.role_code,
            invited_by_user_id: data.invited_by_user_id,
            status: 'pending',
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating location invite:', error)
        return { error: error.message }
    }

    return { data: invite }
}

export async function CancelLocationInvite(inviteId: string) {
    if (!inviteId) {
        return { error: 'Invite ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { data: invite, error } = await supabase
        .from('location_invites')
        .update({ status: 'cancelled' })
        .eq('id', inviteId)
        .select()
        .single()

    if (error) {
        console.error('Error cancelling location invite:', error)
        return { error: error.message }
    }

    return { data: invite }
}

