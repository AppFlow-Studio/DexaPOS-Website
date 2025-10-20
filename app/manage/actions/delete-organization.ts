'use server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClerkClient } from '@clerk/backend'
export async function DeleteOrganization(organizationId: string) {
    try {
        const supabase = createServerSupabaseClient()
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        // Delete pending invites for this organization
        const { data: pendingInvites, error: pendingInvitesError } = await supabase.from('pending_org_admin_invites').select('*').eq('organization_id', organizationId)
        if (pendingInvitesError) {
            return {
                success: false,
                message: 'Error getting pending invites: ' + pendingInvitesError.message,
            }
        }
        if (pendingInvites.length > 0) {
            for (const invite of pendingInvites) {
                await clerkClient.invitations.revokeInvitation(invite.clerk_invite_id)
            }
            const { data: deletedInvites, error: deletedInvitesError } = await supabase.from('pending_org_admin_invites').delete().in('clerk_invite_id', pendingInvites.map((invite: any) => invite.clerk_invite_id))
        }

        const organization = await clerkClient.organizations.deleteOrganization(organizationId)

        if (organization) {
            // Delete Image from Supabase Storage and all pending invites
            const { data, error } = await supabase.storage.from('Organizations-Logos').remove([organizationId.toString() + '.png'])
        }
    }
    catch (error) {
        console.error('Error deleting organization:', error)
        return {
            success: false,
            message: 'Error deleting organization: ' + (error as Error).message || 'Unknown error',
        }
    }
}
