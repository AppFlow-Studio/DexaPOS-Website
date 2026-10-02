'use server'

import { createClerkClient } from '@clerk/backend'
import { assertCanManageOrgInvites, assertHQPermission } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const DEXA_HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID!

/**
 * A pending Clerk invitation with no `pending_org_admin_invites` row: someone
 * invited as a plain member. Admin invites are tracked in that table; member
 * invites only exist in Clerk, so this is where they are read from.
 */
export interface OrgMemberInvite {
    id: string
    email: string
    /** The app role code from the invite's public metadata, else Clerk's role name ("Member"). */
    role: string | null
    createdAt: string
    expiresAt: string | null
}

type ActionResult = { success: boolean; message: string }

function clerk() {
    return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
}

/**
 * Admin invites are tracked in `pending_org_admin_invites` and have their own
 * resend/revoke actions that keep that row in step. The member-invite actions
 * refuse them, so the table never points at a revoked Clerk invite.
 */
async function isTrackedAdminInvite(invitationId: string): Promise<boolean> {
    const { data } = await createServiceRoleClient()
        .from('pending_org_admin_invites')
        .select('id')
        .eq('clerk_invite_id', invitationId)
        .maybeSingle()
    return !!data
}

function errorMessage(error: unknown): string {
    const typed = error as { errors?: Array<{ longMessage?: string }>; message?: string }
    return typed?.errors?.[0]?.longMessage || typed?.message || 'Unknown error'
}

export async function getOrgMemberInvites(
    organizationId: string
): Promise<{ data: OrgMemberInvite[]; error?: string }> {
    try {
        await assertHQPermission(organizationId === DEXA_HQ_ORG_ID ? 'hq.team.view' : 'hq.org.view')

        const [{ data: invitations }, { data: adminInvites, error: adminError }] = await Promise.all([
            clerk().organizations.getOrganizationInvitationList({
                organizationId,
                status: ['pending'],
                limit: 100,
            }),
            createServiceRoleClient()
                .from('pending_org_admin_invites')
                .select('clerk_invite_id')
                .eq('organization_id', organizationId),
        ])
        if (adminError) return { data: [], error: adminError.message }

        const adminInviteIds = new Set((adminInvites ?? []).map((row) => row.clerk_invite_id).filter(Boolean))

        const data = invitations
            .filter((invitation) => !adminInviteIds.has(invitation.id))
            .map((invitation) => ({
                id: invitation.id,
                email: invitation.emailAddress,
                role:
                    (invitation.publicMetadata?.role as string | undefined) ||
                    invitation.roleName ||
                    invitation.role ||
                    null,
                createdAt: new Date(invitation.createdAt).toISOString(),
                expiresAt: invitation.expiresAt ? new Date(invitation.expiresAt).toISOString() : null,
            }))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

        return { data }
    } catch (error) {
        console.error('[getOrgMemberInvites] Error:', error)
        return { data: [], error: errorMessage(error) }
    }
}

/** The accept-invite URL Clerk issued, for any pending invite (admin or member). */
export async function getOrgInvitationLink(
    organizationId: string,
    invitationId: string
): Promise<ActionResult & { url?: string }> {
    try {
        await assertCanManageOrgInvites(organizationId)
        const invitation = await clerk().organizations.getOrganizationInvitation({
            organizationId,
            invitationId,
        })
        if (invitation.status && invitation.status !== 'pending') {
            return { success: false, message: `This invite is ${invitation.status}, so its link no longer works.` }
        }
        if (!invitation.url) {
            return { success: false, message: 'Clerk returned no link for this invite. Resend it instead.' }
        }
        return { success: true, message: 'Invite link ready', url: invitation.url }
    } catch (error) {
        console.error('[getOrgInvitationLink] Error:', error)
        return { success: false, message: `Could not get the invite link: ${errorMessage(error)}` }
    }
}

/** Resend = revoke the old invite and issue a new one with the same email, role and metadata. */
export async function resendOrgMemberInvite(
    organizationId: string,
    invitationId: string
): Promise<ActionResult> {
    try {
        const authContext = await assertCanManageOrgInvites(organizationId)
        if (await isTrackedAdminInvite(invitationId)) {
            return { success: false, message: 'That is an admin invite. Resend it from the admin invites list.' }
        }
        const client = clerk()
        const existing = await client.organizations.getOrganizationInvitation({ organizationId, invitationId })

        // Clerk has no resend: the old invite must go before a new one can be
        // issued to the same address, so this is two steps, not one.
        await client.organizations.revokeOrganizationInvitation({
            organizationId,
            invitationId,
            requestingUserId: authContext.userId,
        })
        let replacement
        try {
            replacement = await client.organizations.createOrganizationInvitation({
                organizationId,
                emailAddress: existing.emailAddress,
                role: existing.role,
                inviterUserId: authContext.userId,
                publicMetadata: existing.publicMetadata,
            })
        } catch (createError) {
            console.error('[resendOrgMemberInvite] Revoked, but the new invite failed:', createError)
            return {
                success: false,
                message: `The old invite was revoked, but a new one could not be sent: ${errorMessage(createError)}. Invite ${existing.emailAddress} again.`,
            }
        }

        await logAdminAction('ADMIN_INVITE_RESENT', {
            clerkOrgId: organizationId,
            resourceType: 'invitation',
            resourceName: existing.emailAddress,
            metadata: {
                invite_kind: 'member',
                previous_clerk_invite_id: invitationId,
                clerk_invite_id: replacement.id,
            },
        })

        return { success: true, message: 'Invitation resent' }
    } catch (error) {
        console.error('[resendOrgMemberInvite] Error:', error)
        return { success: false, message: `Failed to resend invitation: ${errorMessage(error)}` }
    }
}

export async function revokeOrgMemberInvite(
    organizationId: string,
    invitationId: string
): Promise<ActionResult> {
    try {
        const authContext = await assertCanManageOrgInvites(organizationId)
        if (await isTrackedAdminInvite(invitationId)) {
            return { success: false, message: 'That is an admin invite. Revoke it from the admin invites list.' }
        }
        const invitation = await clerk().organizations.revokeOrganizationInvitation({
            organizationId,
            invitationId,
            requestingUserId: authContext.userId,
        })

        await logAdminAction('ADMIN_INVITE_REVOKED', {
            clerkOrgId: organizationId,
            resourceType: 'invitation',
            resourceName: invitation.emailAddress,
            changes: { before: { status: 'pending' }, after: { status: 'revoked' } },
            metadata: { invite_kind: 'member', revoked_clerk_invite_id: invitationId },
        })

        return { success: true, message: 'Invitation revoked' }
    } catch (error) {
        console.error('[revokeOrgMemberInvite] Error:', error)
        return { success: false, message: `Failed to revoke invitation: ${errorMessage(error)}` }
    }
}
