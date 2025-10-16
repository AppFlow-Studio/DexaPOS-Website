'use server'

import { createClerkClient } from '@clerk/backend'
export const createOrganizationBulkInvite = async (organizationId: string, invites: any[], inviterId: string) => {

    try {
        if (!organizationId || !invites || !inviterId) {
            throw new Error('Invalid organizationId, invites, or inviterId')
        }
        if (!process.env.CLERK_SECRET_KEY) {
            throw new Error('CLERK_SECRET_KEY is not set')
        }
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
            throw new Error('SUPABASE_URL is not set')
        }
        if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
        }

        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        // Change this flow for the first time after creating the organization -> Send private invite to admin them invite them to the organization
        const invitesResponse = await clerkClient.organizations.createOrganizationInvitationBulk(
            organizationId,
            invites.map((invite: any) => ({
                inviterUserId: inviterId,
                emailAddress: invite.email,
                role: 'org:' + invite.role,
            }))
        )
        console.log('invitesResponse', invitesResponse)
        if (invitesResponse.length > 0) {
            return {
                success: true,
                message: 'Organization bulk invite created successfully',
            }
        }
    }
    catch (error) {
        console.error('Error creating organization bulk invite:', error)
        return {
            success: false,
            message: 'Error creating organization bulk invite: ' + (error as Error).message || 'Unknown error',
        }
    }
}