'use server'

import { createClerkClient } from '@clerk/backend'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { MerchantAccessAssignment } from '@/types/admin'

interface BulkInviteOptions {
    merchantAccess?: MerchantAccessAssignment[]
    invitedBy?: string
    firstName?: string
    lastName?: string
    orgType?: string
}

export async function createBulkInvitationAdmin(
    organizationId: string,
    invitations: { email: string, role: string, level_type: string }[],
    options?: BulkInviteOptions
) {

    try {
        const normalizedInvitations = invitations
            .map((invite) => ({
                email: invite.email.trim(),
                role: invite.role,
                level_type: invite.level_type,
            }))
            .filter((invite) => Boolean(invite.email))

        if (normalizedInvitations.length === 0) {
            return {
                success: false,
                message: 'At least one valid email is required.',
            }
        }

        const requiresMerchantAssignment = normalizedInvitations.some((invite) => invite.role !== 'hq.super_admin')
        if (requiresMerchantAssignment && (!options?.merchantAccess || options.merchantAccess.length === 0)) {
            return {
                success: false,
                message: 'At least one merchant assignment is required for this role.',
            }
        }

        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })

        const supabase = createServerSupabaseClient()
        const createdInvitations: Array<{
            organization_id: string
            clerk_invite_id: string
            email: string
            first_name: string | null
            last_name: string | null
            status: string
            role: string
            merchant_access: MerchantAccessAssignment[] | null
            invited_by: string | null
            created_at: string
            updated_at: string
        }> = []

        for (const invitation of normalizedInvitations) {
            const clerkInvitation = await clerkClient.organizations.createOrganizationInvitation({
                organizationId,
                emailAddress: invitation.email,
                role: 'org:admin',
                publicMetadata: {
                    role: invitation.role,
                    level_type: invitation.level_type,
                    org_type: options?.orgType || 'hq',
                    firstName: options?.firstName || '',
                    lastName: options?.lastName || '',
                },
            })

            createdInvitations.push({
                organization_id: organizationId,
                clerk_invite_id: clerkInvitation.id,
                email: invitation.email,
                first_name: options?.firstName?.trim() || null,
                last_name: options?.lastName?.trim() || null,
                status: clerkInvitation.status || 'pending',
                role: invitation.role,
                merchant_access: options?.merchantAccess?.length ? options.merchantAccess : null,
                invited_by: options?.invitedBy || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
        }

        const { error } = await supabase.from('pending_org_admin_invites').insert(createdInvitations)

        if (error) {
            // Best effort rollback so Clerk does not keep orphaned invites.
            for (const invitation of createdInvitations) {
                try {
                    await clerkClient.organizations.revokeOrganizationInvitation({
                        organizationId,
                        invitationId: invitation.clerk_invite_id,
                        requestingUserId: options?.invitedBy || '',
                    })
                } catch (revokeError) {
                    console.error('[createBulkInvitationAdmin] rollback revoke failed:', revokeError)
                }
            }

            return {
                success: false,
                message: 'Error creating bulk invitation: ' + error.message,
            }
        }

        // Log audit event
        // Find the merchant ID for this organization to log correctly
        const { data: merchant } = await supabase
            .from('merchants')
            .select('id')
            .eq('clerk_org_id', organizationId)
            .single()

        await logAdminAction('ADMIN_INVITED', {
            merchantId: merchant?.id,
            clerkOrgId: organizationId,
            resourceType: 'invitation',
            resourceName: `bulk_invite_${new Date().toISOString()}`,
            changes: {
                after: {
                    invitation_count: normalizedInvitations.length,
                    status: 'pending',
                },
            },
            metadata: {
                bulk_invite: true,
                emails: normalizedInvitations.map(i => i.email),
                roles: Array.from(new Set(normalizedInvitations.map(i => i.role))),
                merchant_access_count: options?.merchantAccess?.length || 0,
            },
        })

        return {
            success: true,
            message: 'Bulk invitation sent successfully',
            count: createdInvitations.length,
        }

    }
    catch (error: any) {
        console.error('Error creating bulk invitation:', error)
        let errorMessage = 'Unknown error'
        if (error?.errors && Array.isArray(error.errors) && error.errors.length > 0) {
            errorMessage = error.errors[0].longMessage || error.errors[0].message || errorMessage
        } else if (error?.message) {
            errorMessage = error.message
        }
        return {
            success: false,
            message: 'Error creating bulk invitation: ' + errorMessage,
        }
    }
}
