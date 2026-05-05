'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createClerkClient } from '@clerk/backend'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { auth } from '@clerk/nextjs/server'
export async function ClerkRevokeInvitation(invitationId: string) {
    try {

        // Find the pending invite in the pending_org_admin_invites table
        const supabase = createServerSupabaseClient()
        const { data: existingInvite, error } = await supabase
            .from('pending_org_admin_invites')
            .select('id, email, role, organization_id')
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

        const { userId } = await auth()
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })

        await clerkClient.organizations.revokeOrganizationInvitation({
            organizationId,
            invitationId,
            requestingUserId: userId || '',
        })

        // RLS on pending_org_admin_invites can silently no-op the UPDATE for
        // the Clerk-authed client when the actor's claims don't match the
        // policy. Auth was enforced above; use service role for the write.
        const admin = createServiceRoleClient()
        const { data: updatedInvite, error: updateError } = await admin
            .from('pending_org_admin_invites')
            .update({
                status: 'revoked',
                updated_at: new Date().toISOString(),
            })
            .eq('clerk_invite_id', invitationId)
            .select()
            .single()

        if (updateError) {
            return {
                success: false,
                message: 'Error revoking invitation: ' + updateError.message,
            }
        }
        if (!updatedInvite) {
            return {
                success: false,
                message: 'Failed to mark invitation revoked in database',
            }
        }

        await logAdminAction('ADMIN_INVITE_REVOKED', {
            clerkOrgId: updatedInvite.organization_id || undefined,
            resourceType: 'invitation',
            resourceId: updatedInvite.id,
            resourceName: updatedInvite.email || existingInvite.email || invitationId,
            changes: {
                before: {
                    status: 'pending',
                },
                after: {
                    status: 'revoked',
                    role: updatedInvite.role || null,
                },
            },
            metadata: {
                revoked_clerk_invite_id: invitationId,
            },
        })

        return {
            success: true,
            message: 'Invitation revoked successfully',
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
