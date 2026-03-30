'use server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClerkClient } from '@clerk/backend'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { deleteOrganizationLogo } from '@/lib/cdn/server'

export async function DeleteOrganization(organizationId: string) {
    try {
        const supabase = createServerSupabaseClient()
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })

        // Fetch organization details before deletion for audit log
        const clerkOrg = await clerkClient.organizations.getOrganization({ organizationId })
        const orgName = clerkOrg.name
        const orgType = clerkOrg.publicMetadata?.org_type as string | undefined
        const orgImageUrl = typeof clerkOrg.publicMetadata?.imageURL === 'string'
            ? clerkOrg.publicMetadata.imageURL
            : null

        const { data: merchant } = await supabase
            .from('merchants')
            .select('id')
            .eq('clerk_org_id', organizationId)
            .maybeSingle()

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
            const deleteLogoResult = await deleteOrganizationLogo(orgImageUrl, organizationId)
            if (!deleteLogoResult.success) {
                console.warn('Failed to delete organization logo during organization removal:', deleteLogoResult.error)
            }

            if (orgType === 'merchant') {
                await logAdminAction('MERCHANT_DEACTIVATED', {
                    clerkOrgId: organizationId,
                    merchantId: merchant?.id,
                    resourceType: 'merchant_organization',
                    resourceId: organizationId,
                    resourceName: orgName,
                    changes: {
                        before: {
                            status: 'active',
                        },
                        after: {
                            status: 'deactivated',
                        },
                        reason: 'Organization deleted by HQ admin',
                    },
                    metadata: {
                        organization_id: organizationId,
                        method: 'DeleteOrganization',
                        revoked_invites: pendingInvites.length,
                    },
                })
            } else {
                // Keep generic organization audit event for non-merchant organizations.
                await LogAuditEvent({
                    clerkOrgId: organizationId,
                    action: `Deleted Organization: ${orgName}`,
                    actionCategory: 'organization',
                    resourceType: 'organization',
                    resourceId: organizationId,
                    resourceName: orgName,
                    severity: 'info',
                    metadata: {
                        organization_id: organizationId,
                        method: 'DeleteOrganization',
                        admin_action: true,
                        revoked_invites: pendingInvites.length,
                    },
                })
            }
        }
        return { success: true }
    }
    catch (error) {
        console.error('Error deleting organization:', error)
        return {
            success: false,
            message: 'Error deleting organization: ' + (error as Error).message || 'Unknown error',
        }
    }
}

