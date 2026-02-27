'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClerkClient } from '@clerk/backend'
export async function ClerkResendInvitationAdmin(invitationId: string) {
    try {
        // Find the pending invite in the pending_org_admin_invites table
        const supabase = createServerSupabaseClient()
        const { data, error } = await supabase.from('pending_org_admin_invites').select('id').eq('clerk_invite_id', invitationId).single()
        if (error) {
            return {
                success: false,
                message: 'Error finding pending invite: ' + error?.message,
            }
        }

        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        const invitation = await clerkClient.invitations.revokeInvitation(invitationId)
        if (invitation?.id) {
            const { data: OrgAdminInviteData, error } = await supabase.from('pending_org_admin_invites').update({
                status: 'revoked',
            }).eq('clerk_invite_id', invitationId).select().single()
            if (error) {
                return {
                    success: false,
                    message: 'Error revoking invitation: ' + error.message,
                }
            }

            const ResendInvitationResponse = await clerkClient.invitations.createInvitation({
                emailAddress: invitation.emailAddress,
                redirectUrl: 'http://localhost:3000/',
                publicMetadata: invitation?.publicMetadata || undefined,
            })

            if (ResendInvitationResponse.id) {
                const { data, error } = await supabase.from('pending_org_admin_invites').update({
                    clerk_invite_id: ResendInvitationResponse.id,
                    status: 'pending',
                    role: ResendInvitationResponse.publicMetadata?.role,
                    created_at: new Date().toISOString(),
                }).eq('id', OrgAdminInviteData?.id).select().single()
                if (error) {
                    return {
                        success: false,
                        message: 'Error Saving resending invitation: ' + error.message,
                    }
                }
                return {
                    success: true,
                    message: 'Invitation resend successfully',
                }
            }

            return {
                success: true,
                message: 'Invitation revoked successfully',
            }
        }
    } catch (error) {
        console.error('Error revoking invitation:', error)
        return {
            success: false,
            message: 'Error revoking invitation: ' + error?.errors?.[0]?.longMessage || 'Unknown error',
        }
    }

}