'use server'

import { createClerkClient, Invitation } from '@clerk/backend'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

export async function createBulkInvitationAdmin(organizationId: string, invitations: { email: string, role: string, level_type: string }[]) {

    try {
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        const invitationsResponse = await clerkClient.invitations.createInvitationBulk(
            invitations.map((invitation) => ({
                emailAddress: invitation.email,
                redirectUrl: 'http://localhost:3000/',
                role: invitation.level_type,
                publicMetadata: { organizationId: organizationId, role: invitation.role, level_type: invitation.level_type, setupRequired: true },
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

        // Log audit event
        // Find the merchant ID for this organization to log correctly
        const { data: merchant } = await supabase
            .from('merchants')
            .select('id')
            .eq('clerk_org_id', organizationId)
            .single()

        await LogAuditEvent({
            merchantId: merchant?.id,
            clerkOrgId: organizationId,
            action: `Sent Bulk Admin Invitations (${invitations.length})`,
            actionCategory: 'people',
            resourceType: 'invitation',
            metadata: {
                invitation_count: invitations.length,
                emails: invitations.map(i => i.email),
                roles: Array.from(new Set(invitations.map(i => i.role))),
                admin_action: true,
            },
        })

        return {
            success: true,
            message: 'Bulk invitation sent successfully',
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