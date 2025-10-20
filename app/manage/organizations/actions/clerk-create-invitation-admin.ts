'use server'

import { createClerkClient } from '@clerk/backend'
import { createServerSupabaseClient } from '@/lib/supabase/server'
export async function createInvitationAdmin(organizationId: string, email: string, role: string, level_type: string) {
    try {
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        const supabase = createServerSupabaseClient()
        const invitation = await clerkClient.invitations.createInvitation({
            emailAddress: email,
            redirectUrl: 'http://localhost:3000/',
            publicMetadata: {
                organizationId: organizationId,
                role: role,
                level_type: level_type,
                setupRequired: true
            }
        })

        if (invitation.id) {
            // Insert Into Pending_organization_invitations table
            const { data, error } = await supabase.from('pending_org_admin_invites').insert({
                organization_id: organizationId,
                clerk_invite_id: invitation.id,
                email: email,
                status: invitation.status,
                role: role,
                created_at: new Date().toISOString(),
            })
            if (error) {
                return {
                    success: false,
                    message: 'Error creating invitation: ' + error.message,
                }
            }
            return {
                success: true,
                message: 'Admin invitation sent successfully',
            }
        }

    }
    catch (error) {
        return {
            success: false,
            message: 'Error creating invitation: ' + error?.errors[0].longMessage || 'Unknown error',
        }
    }
}