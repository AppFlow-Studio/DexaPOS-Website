'use server'

import { createClerkClient, Invitation } from '@clerk/backend'
import { createServerSupabaseClient } from '@/lib/supabase/server'
export async function createBulkInvitationAdmin(organizationId: string, invitations: { email: string, role: string }[]) {
    try {
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        const invitationsResponse = await clerkClient.invitations.createInvitationBulk(
            invitations.map((invitation) => ({
                emailAddress: invitation.email,
                redirectUrl: 'http://localhost:3000/',
                publicMetadata: { organizationId: organizationId, role: invitation.role, setupRequired: true },
            }))
        )
        const ParsedInvitationsResponse = JSON.parse(JSON.stringify(invitationsResponse));


        // insert the correct clerk_invite_id into the invitations array with the correct email and role
        const invitationsWithClerkInviteId = invitations.map((invitation) => ({
            organization_id: organizationId,
            email: invitation.email,
            role: invitation.role,
            status: 'pending',
            created_at: new Date().toISOString(),
            clerk_invite_id: ParsedInvitationsResponse.find((inv: Invitation) => inv.emailAddress === invitation.email)?.id,
        }))



        const supabase = createServerSupabaseClient()
        // insert the invitations with the correct clerk_invite_id into the pending_org_admin_invites table
        const { data, error } = await supabase.from('pending_org_admin_invites').insert(invitationsWithClerkInviteId)

        if (error) {
            return {
                success: false,
                message: 'Error creating bulk invitation: ' + error.message,
            }
        }
        return {
            success: true,
            message: 'Bulk invitation sent successfully',
        }
    }
    catch (error) {
        console.error('Error creating bulk invitation:', error)
        return {
            success: false,
            message: 'Error creating bulk invitation: ' + error?.errors[0].longMessage || 'Unknown error',
        }
    }
}