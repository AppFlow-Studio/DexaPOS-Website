'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClerkClient } from '@clerk/backend'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { auth } from '@clerk/nextjs/server'
export async function ClerkResendInvitationAdmin(invitationId: string) {
    try {
        // Find the pending invite in the pending_org_admin_invites table
        const supabase = createServerSupabaseClient()
        const { data: existingInvite, error } = await supabase
            .from('pending_org_admin_invites')
            .select('id, email, role, organization_id, first_name, last_name')
            .eq('clerk_invite_id', invitationId)
            .single()
        if (error) {
            return {
                success: false,
                message: 'Error finding pending invite: ' + error?.message,
            }
        }

        const organizationId = existingInvite?.organization_id
        if (!organizationId) {
            return {
                success: false,
                message: 'Missing organization id for invitation',
            }
        }

        const inviteEmail = existingInvite?.email
        if (!inviteEmail) {
            return {
                success: false,
                message: 'Missing invite email',
            }
        }

        const { userId } = await auth()
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        await clerkClient.organizations.revokeOrganizationInvitation({
            organizationId,
            invitationId,
            requestingUserId: userId || '',
        })

        const resendInvitation = await clerkClient.organizations.createOrganizationInvitation({
            organizationId,
            emailAddress: inviteEmail,
            role: 'org:admin',
            publicMetadata: {
                role: existingInvite.role || 'hq.manager',
                level_type: 'hq',
                org_type: 'hq',
                firstName: existingInvite.first_name || '',
                lastName: existingInvite.last_name || '',
            },
        })

        if (!resendInvitation?.id) {
            return {
                success: false,
                message: 'Failed to create replacement invitation',
            }
        }

        const { data: updatedInvite, error: updateError } = await supabase
            .from('pending_org_admin_invites')
            .update({
                clerk_invite_id: resendInvitation.id,
                status: resendInvitation.status || 'pending',
                role: existingInvite.role,
                updated_at: new Date().toISOString(),
            })
            .eq('id', existingInvite.id)
            .select()
            .single()

        if (updateError) {
            return {
                success: false,
                message: 'Error saving resent invitation: ' + updateError.message,
            }
        }

        await logAdminAction('ADMIN_INVITE_RESENT', {
            clerkOrgId: updatedInvite.organization_id || undefined,
            resourceType: 'invitation',
            resourceId: updatedInvite.id,
            resourceName: updatedInvite.email || inviteEmail,
            changes: {
                before: {
                    clerk_invite_id: invitationId,
                    status: 'revoked',
                },
                after: {
                    clerk_invite_id: resendInvitation.id,
                    status: resendInvitation.status || 'pending',
                    role: updatedInvite.role || existingInvite.role || null,
                },
            },
            metadata: {
                previous_clerk_invite_id: invitationId,
            },
        })

        return {
            success: true,
            message: 'Invitation resent successfully',
        }
    } catch (error) {
        console.error('Error revoking invitation:', error)
        const typedError = error as { errors?: Array<{ longMessage?: string }>; message?: string }
        const message = typedError?.errors?.[0]?.longMessage || typedError?.message || 'Unknown error'
        return {
            success: false,
            message: 'Error revoking invitation: ' + message,
        }
    }

}
