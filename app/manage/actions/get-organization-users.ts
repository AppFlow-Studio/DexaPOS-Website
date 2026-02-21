'use server'

import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function getOrganizationUsers(organizationId: string) {
    if (!organizationId) {
        return new Error('Organization ID is required')
    }

    const supabase = createServerSupabaseClient()
    const [
        { data: members, error: membersError },
        { data: pendingAdminInvites, error: pendingAdminInvitesError },
    ] = await Promise.all([
        supabase
            .from('members')
            .select(`
                *,
                users(*)
            `)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false }),
        supabase
            .from('pending_org_admin_invites')
            .select(`
                *,
                clerk_user:users!clerk_user_id(*),
                invited_by_user:users!invited_by(*)
            `)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false }),
    ])

    if (membersError) {
        console.error('Error getting organization members:', membersError)
        return new Error(membersError.message)
    }

    if (pendingAdminInvitesError) {
        console.error('Error getting pending admin invites:', pendingAdminInvitesError)
        return new Error(pendingAdminInvitesError.message)
    }

    return {
        id: organizationId,
        members: members || [],
        pending_org_admin_invites: pendingAdminInvites || [],
    }
}
