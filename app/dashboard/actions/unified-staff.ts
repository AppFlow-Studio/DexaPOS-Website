'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
    UnifiedStaffMember,
    InviteStaffFormData,
    UpdateStaffAssignmentData,
    StaffActionResponse,
    ResetPINResult
} from '@/types/staff'
import { clerkClient } from '@clerk/nextjs/server'
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
        console.log('[GetUnifiedStaffView] Unified staff data:', data)

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
        // 1. Get merchant ID
        const { data: merchant, error: merchantError } = await supabase
            .from('merchants')
            .select('id')
            .eq('clerk_org_id', clerkOrgId)
            .single()

        if (merchantError || !merchant) {
            return { error: 'Merchant not found' }
        }

        // 2. Generate PIN if needed
        let hashedPin: string | null = null
        let generatedPin: string | undefined

        if (formData.auto_generate_pin) {
            generatedPin = Math.floor(1000 + Math.random() * 9000).toString()
            hashedPin = await bcrypt.hash(generatedPin, 10)
        } else if (formData.pin_code) {
            hashedPin = await bcrypt.hash(formData.pin_code, 10)
        }

        // 3. Create staff_profile record (POS-only)
        const { data: staffProfile, error: profileError } = await supabase
            .from('staff_profiles')
            .insert({
                merchant_id: merchant.id,
                user_id: null,  // No Clerk user for POS staff
                first_name: formData.first_name,
                last_name: formData.last_name,
                email: formData.email,
                phone: formData.phone,
                account_type: 'pos_only',
                is_active: true,
            })
            .select()
            .single()

        if (profileError || !staffProfile) {
            console.error('[CreatePOSStaff] Failed to create staff profile:', profileError)
            return { error: 'Failed to create staff profile' }
        }

        // 4. Create member record (links to organization)
        const { data: member, error: memberError } = await supabase
            .from('members')
            .insert({
                user_id: null,  // No Clerk user
                staff_profile_id: staffProfile.id,
                organization_id: clerkOrgId,
            })
            .select()
            .single()

        if (memberError || !member) {
            console.error('[CreatePOSStaff] Failed to create member:', memberError)
            // Rollback staff profile
            await supabase.from('staff_profiles').delete().eq('id', staffProfile.id)
            return { error: 'Failed to create member record' }
        }

        // 5. Create location assignments
        const locationAssignments = formData.location_ids.map(locationId => ({
            location_id: locationId,
            merchant_id: merchant.id,
            user_id: null,  // POS staff has no user_id
            staff_profile_id: staffProfile.id,
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
            // Rollback
            await supabase.from('members').delete().eq('id', member.id)
            await supabase.from('staff_profiles').delete().eq('id', staffProfile.id)
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
 * Helper function to generate secure password
 */
function generateSecurePassword(length: number = 12): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let password = ''
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length))
    }
    return password
}

/**
 * Create Clerk user directly with password (no invitation email)
 *
 * @param clerkOrgId - Organization ID from Clerk
 * @param formData - Staff creation form data
 * @returns Success response with member data or error
 */
export async function CreateClerkUserDirectly(
    clerkOrgId: string,
    formData: InviteStaffFormData
): Promise<StaffActionResponse<{ member_id: string, user_id: string, generated_pin?: string, temp_password: string }>> {
    if (!clerkOrgId) {
        return { error: 'Missing organization ID' }
    }

    if (!formData.email) {
        return { error: 'Email is required for Clerk users' }
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
            return { error: 'Merchant not found' }
        }

        const merchantId = merchant.id
        // 1. Generate permanent password
        const tempPassword = generateSecurePassword(12)

        // 2. Prepare location assignments for publicMetadata
        const locationAssignments = formData.location_ids.map(locationId => ({
            locationId: locationId,
            roleCode: formData.role_code,
            isPrimaryLocation: locationId === formData.primary_location_id,
            hourlyRate: formData.hourly_rate,
            employmentType: formData.employment_type,
        }))

        // 3. Generate PIN if needed
        let hashedPin: string | null = null
        let generatedPin: string | undefined

        if (formData.auto_generate_pin) {
            generatedPin = Math.floor(1000 + Math.random() * 9000).toString()
            hashedPin = await bcrypt.hash(generatedPin, 10)
        } else if (formData.pin_code) {
            hashedPin = await bcrypt.hash(formData.pin_code, 10)
        }

        // Add PIN to location assignments if provided
        const locationAssignmentsWithPin = hashedPin
            ? locationAssignments.map(la => ({ ...la, pinCode: hashedPin }))
            : locationAssignments

        // 4. Create Clerk user with password
        const clerk = await clerkClient()
        const clerkUser = await clerk.users.createUser({
            emailAddress: [formData.email],
            password: tempPassword,
            firstName: formData.first_name,
            lastName: formData.last_name,
            phoneNumber: formData?.phone ? [formData.phone] : undefined,
            publicMetadata: {
                creationType: 'direct',  // Mark as direct creation
                organizationId: clerkOrgId,
                merchantId: merchantId,
                roleCode: formData.role_code,
                locationAssignments: locationAssignmentsWithPin,
                phone: formData.phone,
            },
            skipPasswordRequirement: false,
            skipPasswordChecks: false,
            
        })

        if (!clerkUser || !clerkUser.id) {
            return { error: 'Failed to create Clerk user' }
        }

        // 5. Add user to organization
        await clerk.organizations.createOrganizationMembership({
            organizationId: clerkOrgId,
            userId: clerkUser.id,
            role: 'org:member',
        })

        // 6. Create staff_profile record
        // const { data: staffProfile, error: profileError } = await supabase
        //     .from('staff_profiles')
        //     .insert({
        //         merchant_id: merchantId,
        //         user_id: clerkUser.id,
        //         first_name: formData.first_name,
        //         last_name: formData.last_name,
        //         email: formData.email,
        //         phone: formData.phone,
        //         account_type: 'clerk',
        //         is_active: true,
        //     })
        //     .select()
        //     .single()

        // if (profileError || !staffProfile) {
        //     console.error('[CreateClerkUserDirectly] Failed to create staff profile:', profileError)
        //     // Rollback Clerk user
        //     await clerk.users.deleteUser(clerkUser.id)
        //     return { error: 'Failed to create staff profile' }
        // }

        // 7. The organizationMembership.created webhook will handle:
        //    - Creating members record
        //    - Creating location_members records
        //    - Using publicMetadata.locationAssignments

        // 8. Wait a moment for webhook to process, then verify member was created
        await new Promise(resolve => setTimeout(resolve, 2000))

        const { data: member } = await supabase
            .from('members')
            .select('id')
            .eq('user_id', clerkUser.id)
            .eq('organization_id', clerkOrgId)
            .single()

        if (!member) {
            console.warn('[CreateClerkUserDirectly] Member not created yet by webhook')
            // Don't fail - webhook might still be processing
        }

        revalidatePath('/dashboard/staff')

        return {
            data: {
                member_id: member?.id || '',
                user_id: clerkUser.id,
                generated_pin: generatedPin,
                temp_password: tempPassword,
            }
        }
    } catch (error) {
        console.error('[CreateClerkUserDirectly] Unexpected error:', error)
        console.error('[CreateClerkUserDirectly] Failed to create Clerk user:', error?.errors)

        return { error: 'An unexpected error occurred' }
    }
}

/**
 * Invite Clerk user to organization
 * @param userId - User who invited 
 * @param clerkOrgId - Organization ID from Clerk
 * @param formData - Staff invitation form data
 * @returns Success response or error
 */
export async function InviteClerkStaff(
    userId : string,
    clerkOrgId: string,
    formData: InviteStaffFormData
): Promise<StaffActionResponse<{ invite_id: string | null }>> {
    const supabase = createServerSupabaseClient()

    if (!formData.email) {
        return { error: 'Email is required for Clerk invitations' }
    }

    try {
        // Get merchant ID from clerk org
        const { data: merchant, error: merchantError } = await supabase
            .from('merchants')
            .select('id')
            .eq('clerk_org_id', clerkOrgId)
            .single()

        if (merchantError || !merchant) {
            return { error: 'Merchant not found' }
        }

        const merchantId = merchant.id
        // 1. Prepare location assignments for publicMetadata (using camelCase)
        const locationAssignments = formData.location_ids.map(locationId => ({
            locationId: locationId,
            roleCode: formData.role_code,
            isPrimaryLocation: locationId === formData.primary_location_id,
            hourlyRate: formData.hourly_rate,
            employmentType: formData.employment_type,
        }))

        // 2. Generate/hash PIN if needed (will be stored in location_assignments)
        let hashedPin: string | null = null
        if (formData.auto_generate_pin) {
            const generatedPin = Math.floor(1000 + Math.random() * 9000).toString()
            hashedPin = await bcrypt.hash(generatedPin, 10)
        } else if (formData.pin_code) {
            hashedPin = await bcrypt.hash(formData.pin_code, 10)
        }

        const locationAssignmentsWithPin = hashedPin
            ? locationAssignments.map(la => ({ ...la, pinCode: hashedPin }))
            : locationAssignments

        // 3. Create Clerk organization invitation
        const clerk = await clerkClient()
        const invitation = await clerk.organizations.createOrganizationInvitation({
            organizationId: clerkOrgId,
            emailAddress: formData.email,
            role: 'org:member',
            publicMetadata: {
                creationType: 'invitation',  // Mark as invitation flow
                roleCode: formData.role_code,
                organizationId: clerkOrgId,
                merchantId: merchantId,
                locationAssignments: locationAssignmentsWithPin,
                firstName: formData.first_name,
                lastName: formData.last_name,
                phone: formData.phone,
            },
        })

        if (!invitation || !invitation.id) {
            return { error: 'Failed to create invitation' }
        }

        console.log('[InviteClerkStaff] Clerk invitation created:', invitation.id)

        // 4. Store invite in location_invites for tracking
        const { error: inviteError } = await supabase
            .from('location_invites')
            .insert({
                merchant_id: merchantId,
                location_id: null,  // Null for merchant-wide invites
                invited_by_user_id: userId,
                email: formData.email,
                first_name: formData.first_name,
                last_name: formData.last_name,
                phone: formData.phone,
                role_code: formData.role_code,
                invite_type: 'clerk',
                clerk_invite_id: invitation.id,
                hourly_rate: formData.hourly_rate,
                location_assignments: locationAssignmentsWithPin,
                status: 'pending',
            })

        if (inviteError) {
            console.error('[InviteClerkStaff] Failed to store invite:', inviteError)
            // Don't fail - Clerk invitation was sent
        }

        revalidatePath('/dashboard/staff')

        return {
            data: {
                invite_id: invitation.id
            }
        }
    } catch (error) {
        console.error('[InviteClerkStaff] Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
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
