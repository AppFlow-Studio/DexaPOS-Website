'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
    UnifiedStaffMember,
    InviteStaffFormData,
    UpdateStaffAssignmentData,
    StaffActionResponse,
    ResetPINResult
} from '@/types/staff'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'

// ============================================================================
// GET OPERATIONS
// ============================================================================

/**
 * Fetch unified staff view using RPC function
 * Automatically scoped by merchant via user's organization
 *
 * @param clerkOrgId - Organization ID from Clerk
 * @param locationId - Optional location ID to filter staff (for Location Managers)
 * @returns Array of unified staff members with location assignments
 */
export async function GetUnifiedStaffView(
    clerkOrgId: string,
    locationId?: string | null
): Promise<UnifiedStaffMember[]> {
    if (!clerkOrgId) {
        console.error('[GetUnifiedStaffView] Missing clerkOrgId')
        return []
    }

    const supabase = createServerSupabaseClient()

    try {
        // Get merchant ID from clerk org
        const { data: merchant, error: merchantError } = await supabase
            .from('merchants')
            .select('id')
            .eq('clerk_org_id', clerkOrgId)
            .single()

        if (merchantError || !merchant) {
            console.error('[GetUnifiedStaffView] Error getting merchant:', merchantError)
            return []
        }

        // Call RPC function
        const { data, error } = await supabase
            .rpc('get_unified_staff_view', {
                p_merchant_id: merchant.id,
                p_location_id: locationId || null
            })

        if (error) {
            console.error('[GetUnifiedStaffView] Error fetching unified staff:', error)
            return []
        }

        return (data as UnifiedStaffMember[]) || []
    } catch (error) {
        console.error('[GetUnifiedStaffView] Unexpected error:', error)
        return []
    }
}

/**
 * Get single staff member details by member ID
 *
 * @param memberId - UUID of the member
 * @returns Single unified staff member or null
 */
export async function GetStaffMember(
    memberId: string
): Promise<UnifiedStaffMember | null> {
    if (!memberId) {
        console.error('[GetStaffMember] Missing memberId')
        return null
    }

    const supabase = createServerSupabaseClient()

    try {
        // Get member with location assignments
        const { data: member, error: memberError } = await supabase
            .from('members')
            .select(`
                id,
                user_id,
                clerk_user_id,
                email,
                first_name,
                last_name,
                display_name,
                avatar_url,
                phone,
                created_at,
                updated_at,
                merchant_id
            `)
            .eq('id', memberId)
            .single()

        if (memberError || !member) {
            console.error('[GetStaffMember] Error fetching member:', memberError)
            return null
        }

        // Get location assignments
        const { data: locationData, error: locationError } = await supabase
            .from('location_members')
            .select(`
                location_id,
                role_code,
                is_primary_location,
                is_active,
                pin_code,
                hourly_rate,
                employment_type,
                assigned_at,
                locations (id, name),
                roles (code, name)
            `)
            .eq('user_id', member.user_id || '')

        if (locationError) {
            console.error('[GetStaffMember] Error fetching locations:', locationError)
        }

        // Transform to UnifiedStaffMember format
        const locationAssignments = (locationData || []).map((loc: any) => ({
            location_id: loc.locations?.id || '',
            location_name: loc.locations?.name || '',
            role_code: loc.role_code,
            role_name: loc.roles?.name || loc.role_code,
            is_primary: loc.is_primary_location,
            is_active: loc.is_active,
            has_pin: !!loc.pin_code,
            hourly_rate: loc.hourly_rate,
            employment_type: loc.employment_type,
            assigned_at: loc.assigned_at
        }))

        const primaryLocation = locationAssignments.find(loc => loc.is_primary)

        return {
            member_id: member.id,
            user_id: member.user_id,
            clerk_user_id: member.clerk_user_id,
            email: member.email,
            first_name: member.first_name,
            last_name: member.last_name,
            display_name: member.display_name,
            avatar_url: member.avatar_url,
            phone: member.phone,
            is_clerk_user: !!member.user_id,
            location_assignments: locationAssignments,
            total_locations: locationAssignments.length,
            primary_location_id: primaryLocation?.location_id || null,
            primary_location_name: primaryLocation?.location_name || null,
            overall_is_active: locationAssignments.some(loc => loc.is_active),
            member_created_at: member.created_at,
            last_updated_at: member.updated_at
        }
    } catch (error) {
        console.error('[GetStaffMember] Unexpected error:', error)
        return null
    }
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create POS-only staff member
 *
 * @param clerkOrgId - Organization ID from Clerk
 * @param formData - Staff invitation form data
 * @returns Success response with member data or error
 */
export async function CreatePOSStaff(
    clerkOrgId: string,
    formData: InviteStaffFormData
): Promise<StaffActionResponse<{ member_id: string, generated_pin?: string }>> {
    if (!clerkOrgId) {
        return { error: 'Missing organization ID' }
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
            return { error: 'Merchant not found' }
        }

        // Generate PIN if needed
        let hashedPin: string | null = null
        let generatedPin: string | undefined

        if (formData.auto_generate_pin) {
            generatedPin = Math.floor(1000 + Math.random() * 9000).toString()
            hashedPin = await bcrypt.hash(generatedPin, 10)
        } else if (formData.pin_code) {
            hashedPin = await bcrypt.hash(formData.pin_code, 10)
        }

        // Create member record (POS user has user_id = null)
        const { data: member, error: memberError } = await supabase
            .from('members')
            .insert({
                merchant_id: merchant.id,
                user_id: null,  // No Clerk user for POS staff
                clerk_user_id: null,
                email: formData.email,
                first_name: formData.first_name,
                last_name: formData.last_name,
                display_name: `${formData.first_name} ${formData.last_name}`,
                phone: formData.phone,
            })
            .select()
            .single()

        if (memberError || !member) {
            console.error('[CreatePOSStaff] Failed to create member:', memberError)
            return { error: 'Failed to create staff member' }
        }

        // Create location assignments
        const locationAssignments = formData.location_ids.map(locationId => ({
            user_id: member.user_id,  // Will be null for POS staff
            location_id: locationId,
            role_code: formData.role_code,
            is_primary_location: locationId === formData.primary_location_id,
            is_active: true,
            pin_code: hashedPin,
            hourly_rate: formData.hourly_rate,
            employment_type: formData.employment_type,
        }))

        const { error: assignmentError } = await supabase
            .from('location_members')
            .insert(locationAssignments)

        if (assignmentError) {
            console.error('[CreatePOSStaff] Failed to create assignments:', assignmentError)
            // Rollback member creation
            await supabase.from('members').delete().eq('id', member.id)
            return { error: 'Failed to create location assignments' }
        }

        // Revalidate staff page
        revalidatePath('/dashboard/staff')

        return {
            data: {
                member_id: member.id,
                generated_pin: generatedPin
            }
        }
    } catch (error) {
        console.error('[CreatePOSStaff] Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}

/**
 * Invite Clerk user to organization
 *
 * @param clerkOrgId - Organization ID from Clerk
 * @param formData - Staff invitation form data
 * @returns Success response or error
 */
export async function InviteClerkStaff(
    clerkOrgId: string,
    formData: InviteStaffFormData
): Promise<StaffActionResponse<{ invite_id: string }>> {
    if (!formData.email) {
        return { error: 'Email is required for Clerk invitations' }
    }

    // TODO: Implement Clerk organization invitation
    // This should:
    // 1. Call Clerk API to send invitation email
    // 2. Store invite record in location_invites table with location assignments
    // 3. Webhook will handle creating member + location_members when accepted

    console.log('[InviteClerkStaff] Not implemented yet:', { clerkOrgId, formData })

    return { error: 'Clerk staff invitation not implemented yet' }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update staff member location assignment
 *
 * @param memberId - UUID of the member
 * @param locationId - UUID of the location
 * @param updates - Fields to update
 * @returns Success response or error
 */
export async function UpdateStaffLocationAssignment(
    memberId: string,
    locationId: string,
    updates: UpdateStaffAssignmentData
): Promise<StaffActionResponse<{ success: boolean }>> {
    const supabase = createServerSupabaseClient()

    try {
        const { data: member } = await supabase
            .from('members')
            .select('user_id')
            .eq('id', memberId)
            .single()

        if (!member) {
            return { error: 'Member not found' }
        }

        const { error } = await supabase
            .from('location_members')
            .update(updates)
            .eq('user_id', member.user_id || '')
            .eq('location_id', locationId)

        if (error) {
            console.error('[UpdateStaffLocationAssignment] Error:', error)
            return { error: error.message }
        }

        revalidatePath('/dashboard/staff')

        return { data: { success: true } }
    } catch (error) {
        console.error('[UpdateStaffLocationAssignment] Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}

/**
 * Reset staff PIN
 *
 * @param memberId - UUID of the member
 * @param locationId - UUID of the location
 * @param newPin - Optional new PIN (if not provided, auto-generates)
 * @returns Success response with new PIN or error
 */
export async function ResetStaffPIN(
    memberId: string,
    locationId: string,
    newPin?: string
): Promise<StaffActionResponse<ResetPINResult>> {
    const supabase = createServerSupabaseClient()

    try {
        // Generate or use provided PIN
        const pin = newPin || Math.floor(1000 + Math.random() * 9000).toString()
        const hashedPin = await bcrypt.hash(pin, 10)

        const { data: member } = await supabase
            .from('members')
            .select('user_id')
            .eq('id', memberId)
            .single()

        if (!member) {
            return { error: 'Member not found' }
        }

        const { error } = await supabase
            .from('location_members')
            .update({ pin_code: hashedPin })
            .eq('user_id', member.user_id || '')
            .eq('location_id', locationId)

        if (error) {
            console.error('[ResetStaffPIN] Error:', error)
            return { error: error.message }
        }

        revalidatePath('/dashboard/staff')

        return { data: { pin } }  // Return unhashed PIN to show user
    } catch (error) {
        console.error('[ResetStaffPIN] Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Deactivate staff member (soft delete)
 *
 * @param memberId - UUID of the member
 * @param locationId - Optional location ID (deactivate at specific location only)
 * @returns Success response or error
 */
export async function DeactivateStaffMember(
    memberId: string,
    locationId?: string
): Promise<StaffActionResponse<{ success: boolean }>> {
    const supabase = createServerSupabaseClient()

    try {
        const { data: member } = await supabase
            .from('members')
            .select('user_id')
            .eq('id', memberId)
            .single()

        if (!member) {
            return { error: 'Member not found' }
        }

        let query = supabase
            .from('location_members')
            .update({ is_active: false })
            .eq('user_id', member.user_id || '')

        if (locationId) {
            query = query.eq('location_id', locationId)
        }

        const { error } = await query

        if (error) {
            console.error('[DeactivateStaffMember] Error:', error)
            return { error: error.message }
        }

        revalidatePath('/dashboard/staff')

        return { data: { success: true } }
    } catch (error) {
        console.error('[DeactivateStaffMember] Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}

/**
 * Reactivate staff member
 *
 * @param memberId - UUID of the member
 * @param locationId - Optional location ID (reactivate at specific location only)
 * @returns Success response or error
 */
export async function ReactivateStaffMember(
    memberId: string,
    locationId?: string
): Promise<StaffActionResponse<{ success: boolean }>> {
    const supabase = createServerSupabaseClient()

    try {
        const { data: member } = await supabase
            .from('members')
            .select('user_id')
            .eq('id', memberId)
            .single()

        if (!member) {
            return { error: 'Member not found' }
        }

        let query = supabase
            .from('location_members')
            .update({ is_active: true })
            .eq('user_id', member.user_id || '')

        if (locationId) {
            query = query.eq('location_id', locationId)
        }

        const { error } = await query

        if (error) {
            console.error('[ReactivateStaffMember] Error:', error)
            return { error: error.message }
        }

        revalidatePath('/dashboard/staff')

        return { data: { success: true } }
    } catch (error) {
        console.error('[ReactivateStaffMember] Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}
