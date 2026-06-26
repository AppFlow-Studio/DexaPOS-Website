'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { LocationMemberWithDetails, LocationInviteWithDetails } from '@/types/merchant_locations'
import { LogAuditEvent } from './audit-logs'
import { isValidEmail, normalizeEmail } from '@/lib/utils/email'
import { findEmailConflict } from '@/app/manage/actions/email-duplicates'
import { emailConflictMessage } from '@/lib/utils/email'

export interface ManagerAssignableUser {
    user_id: string
    email: string
    full_name: string
    role_code: string | null
}

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
            pin_plain,
            pin_hashed,
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
        pin_code: member.pin_plain ?? member.pin_hashed ?? member.pin_code,
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
            pin_plain,
            pin_hashed,
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
            pin_plain: data.pin_code || null,
            pin_hashed: null,
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
    if (data.pin_code !== undefined) {
        updateData.pin_plain = data.pin_code
        updateData.pin_hashed = null
        updateData.pin_code = data.pin_code
    }

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
        invited_by_user_id?: string
    }
) {
    if (!locationId || !data.email || !data.role_code) {
        return { error: 'All fields are required' }
    }

    const normalizedEmail = normalizeEmail(data.email)
    if (!isValidEmail(normalizedEmail)) {
        return { error: 'Invalid email' }
    }

    const supabase = createServerSupabaseClient()
    const serviceRoleSupabase = createServiceRoleClient()
    const { userId: actorUserId } = await auth()

    if (!actorUserId) {
        return { error: 'Unauthorized' }
    }

    // Enforce permission before using service-role writes.
    const { data: hasTeamManagePermission, error: permissionError } = await supabase.rpc(
        'user_has_location_permission',
        {
            p_location_id: locationId,
            p_permission_code: 'location.team.manage',
        }
    )

    if (permissionError) {
        console.error('[CreateLocationInvite] Permission check error:', permissionError)
        return { error: 'Failed to verify invite permission.' }
    }

    if (!hasTeamManagePermission) {
        return { error: 'You do not have permission to invite users to this location.' }
    }

    const { data: location, error: locationError } = await serviceRoleSupabase
        .from('locations')
        .select('id, merchant_id')
        .eq('id', locationId)
        .single()

    if (locationError || !location) {
        console.error('[CreateLocationInvite] Location lookup error:', locationError)
        return { error: 'Location not found.' }
    }

    const conflict = await findEmailConflict(normalizedEmail, {
        scope: { merchantId: location.merchant_id },
    })
    if (conflict) {
        return { error: emailConflictMessage(conflict) }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const clerk = await clerkClient()

    let invitationId: string | null = null
    try {
        const invitation = await clerk.organizations.createOrganizationInvitation({
            organizationId: clerkOrgId,
            inviterUserId: actorUserId,
            emailAddress: normalizedEmail,
            role: 'org:member',
            // New invitees must land on /accept-invitation (which renders the
            // Clerk CAPTCHA anchor required for custom sign-up). /dashboard has
            // no sign-up handling, so a brand-new user would be bounced.
            ...(appUrl && {
                redirectUrl: `${appUrl}/accept-invitation?email=${encodeURIComponent(normalizedEmail)}`,
            }),
            publicMetadata: {
                creationType: 'invitation',
                roleCode: data.role_code,
                organizationId: clerkOrgId,
                merchantId: location.merchant_id,
                locationAssignments: [
                    {
                        locationId,
                        roleCode: data.role_code,
                        isPrimaryLocation: false,
                    },
                ],
            },
        })

        invitationId = invitation.id
    } catch (clerkError: any) {
        console.error('[CreateLocationInvite] Clerk invitation error:', clerkError)
        return {
            error:
                clerkError?.errors?.[0]?.longMessage ||
                clerkError?.message ||
                'Failed to send organization invitation.',
        }
    }

    const { data: invite, error } = await serviceRoleSupabase
        .from('location_invites')
        .insert({
            location_id: locationId,
            merchant_id: location.merchant_id,
            email: normalizedEmail,
            role_code: data.role_code,
            invited_by_user_id: actorUserId,
            invite_type: 'clerk',
            clerk_invite_id: invitationId,
            location_assignments: [
                {
                    locationId,
                    role_code: data.role_code,
                    is_primary_location: false,
                },
            ],
            status: 'pending',
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating location invite:', error)
        if (invitationId) {
            try {
                await clerk.organizations.revokeOrganizationInvitation({
                    organizationId: clerkOrgId,
                    invitationId,
                })
            } catch (revokeError) {
                console.error('[CreateLocationInvite] Failed to rollback Clerk invite:', revokeError)
            }
        }
        return { error: error.message }
    }

    return { data: invite }
}

export async function CancelLocationInvite(inviteId: string) {
    if (!inviteId) {
        return { error: 'Invite ID is required' }
    }

    const { userId: actorUserId } = await auth()
    if (!actorUserId) {
        return { error: 'Unauthorized' }
    }
    const supabase = createServerSupabaseClient()

    // Look up the Clerk invite + org so we can revoke upstream too.
    // Without this, the email stays "in use" on Clerk's side and re-inviting
    // the same address fails even though our DB row is marked cancelled.
    const { data: existing, error: fetchError } = await supabase
        .from('location_invites')
        .select('clerk_invite_id, status, merchant_id')
        .eq('id', inviteId)
        .single()

    if (fetchError || !existing) {
        return { error: 'Invite not found' }
    }
    if (existing.status !== 'pending') {
        return { error: 'Only pending invites can be cancelled' }
    }

    if (existing.clerk_invite_id) {
        try {
            const { data: merchant } = await supabase
                .from('merchants')
                .select('clerk_org_id')
                .eq('id', existing.merchant_id)
                .single()

            if (merchant?.clerk_org_id) {
                const clerk = await clerkClient()
                await clerk.organizations.revokeOrganizationInvitation({
                    organizationId: merchant.clerk_org_id,
                    invitationId: existing.clerk_invite_id,
                    requestingUserId: actorUserId,
                })
            }
        } catch (revokeErr) {
            // Best-effort: a Clerk invite may already be expired/accepted.
            console.warn('[CancelLocationInvite] Clerk revoke failed (continuing):', revokeErr)
        }
    }

    // RLS on location_invites has no UPDATE policy → an authed update silently
    // no-ops. Use the service-role client; auth was enforced above.
    const admin = createServiceRoleClient()
    const { data: invite, error } = await admin
        .from('location_invites')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', inviteId)
        .select()
        .single()

    if (error) {
        console.error('Error cancelling location invite:', error)
        return { error: error.message }
    }
    if (!invite) {
        return { error: 'Failed to cancel invitation in database' }
    }

    return { data: invite }
}

export async function GetManagerAssignableUsers(clerkOrgId: string): Promise<ManagerAssignableUser[]> {
    if (!clerkOrgId) {
        return []
    }

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
        .from('members')
        .select(`
            user_id,
            role,
            users!inner(
                id,
                email,
                first_name,
                last_name
            )
        `)
        .eq('organization_id', clerkOrgId)

    if (error) {
        console.error('[GetManagerAssignableUsers] Error:', error)
        return []
    }

    const mapped = (data || [])
        .map((row: any) => {
            const user = row.users || {}
            const fullName = [user.first_name, user.last_name]
                .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
                .join(' ')
                .trim()

            return {
                user_id: row.user_id as string,
                email: (user.email as string) || '',
                full_name: fullName || (user.email as string) || row.user_id,
                role_code: (row.role as string) || null,
            }
        })
        .filter((row) => typeof row.user_id === 'string' && row.user_id.length > 0)

    const deduped = Array.from(
        new Map(mapped.map((row) => [row.user_id, row])).values()
    )

    deduped.sort((a, b) => a.full_name.localeCompare(b.full_name))
    return deduped
}

// ============================================================================
// ONBOARDING HELPER
// ============================================================================

export async function ApplyLocationManagerAssignment(params: {
    clerkOrgId: string
    locationId: string
    assignmentType: 'skip' | 'invite_new' | 'assign_existing'
    invitedByUserId?: string
    managerInviteEmail?: string
    existingManagerIdentifier?: string
}) {
    const normalizedType = params.assignmentType
    if (normalizedType === 'skip') {
        return { success: true as const }
    }

    const supabase = createServerSupabaseClient()
    const { data: locationInfo, error: locationInfoError } = await supabase
        .from('locations')
        .select('id, merchant_id, name')
        .eq('id', params.locationId)
        .single()

    if (locationInfoError || !locationInfo) {
        return { error: 'Location not found for manager assignment.' }
    }

    if (normalizedType === 'invite_new') {
        if (!params.managerInviteEmail) {
            return { error: 'Missing manager email for manager invite flow.' }
        }

        const inviteResult = await CreateLocationInvite(params.clerkOrgId, params.locationId, {
            email: params.managerInviteEmail.trim(),
            role_code: 'merchant.manager',
            invited_by_user_id: params.invitedByUserId,
        })

        if (inviteResult.error) {
            return { error: inviteResult.error }
        }

        await LogAuditEvent({
            merchantId: locationInfo.merchant_id,
            locationId: locationInfo.id,
            action: `Invited Manager: ${params.managerInviteEmail.trim()}`,
            actionCategory: 'staff',
            resourceType: 'location_invite',
            resourceId: inviteResult.data?.id,
            resourceName: params.managerInviteEmail.trim(),
            changes: {
                after: {
                    assignment_type: 'invite_new',
                    role_code: 'merchant.manager',
                    email: params.managerInviteEmail.trim(),
                },
            },
            metadata: {
                location_id: locationInfo.id,
                location_name: locationInfo.name,
                manager_assignment: true,
            },
        })

        return { success: true as const, mode: 'invite_new' as const }
    }

    if (normalizedType === 'assign_existing') {
        const identifier = params.existingManagerIdentifier?.trim()
        if (!identifier) {
            return { error: 'Missing existing manager identifier.' }
        }

        const { data: userById, error: userByIdError } = await supabase
            .from('users')
            .select('id, email')
            .eq('id', identifier)
            .maybeSingle()

        if (userByIdError) {
            console.error('[ApplyLocationManagerAssignment] userById lookup error:', userByIdError)
            return { error: userByIdError.message }
        }

        let resolvedUser = userById
        if (!resolvedUser) {
            const { data: userByEmail, error: userByEmailError } = await supabase
                .from('users')
                .select('id, email')
                .ilike('email', identifier)
                .maybeSingle()

            if (userByEmailError) {
                console.error('[ApplyLocationManagerAssignment] userByEmail lookup error:', userByEmailError)
                return { error: userByEmailError.message }
            }

            resolvedUser = userByEmail
        }

        if (!resolvedUser) {
            return { error: 'No user found for the provided manager identifier.' }
        }

        const addMemberResult = await AddLocationMember(params.locationId, {
            user_id: resolvedUser.id,
            role_code: 'merchant.manager',
        })

        if (addMemberResult.error) {
            return { error: addMemberResult.error }
        }

        await LogAuditEvent({
            merchantId: locationInfo.merchant_id,
            locationId: locationInfo.id,
            action: `Assigned Manager: ${resolvedUser.email || resolvedUser.id}`,
            actionCategory: 'staff',
            resourceType: 'location_member',
            resourceId: addMemberResult.data?.id,
            resourceName: resolvedUser.email || resolvedUser.id,
            changes: {
                after: {
                    assignment_type: 'assign_existing',
                    role_code: 'merchant.manager',
                    user_id: resolvedUser.id,
                    email: resolvedUser.email || null,
                },
            },
            metadata: {
                location_id: locationInfo.id,
                location_name: locationInfo.name,
                manager_assignment: true,
            },
        })

        return { success: true as const, mode: 'assign_existing' as const }
    }

    return { success: true as const }
}

