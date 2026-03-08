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

    const memberUserIds = (members || [])
        .map((member) => member.user_id)
        .filter((id): id is string => Boolean(id))

    let merchantAccessCounts: Record<string, number> = {}

    if (memberUserIds.length > 0) {
        const { data: accessRows, error: accessError } = await supabase
            .from('admin_merchant_access')
            .select('admin_user_id, merchant_id')
            .in('admin_user_id', memberUserIds)
            .eq('is_active', true)

        if (accessError) {
            console.error('Error getting admin merchant access counts:', accessError)
        } else {
            merchantAccessCounts = (accessRows || []).reduce<Record<string, number>>((acc, row) => {
                const key = row.admin_user_id
                if (!key) return acc
                acc[key] = (acc[key] || 0) + 1
                return acc
            }, {})
        }
    }

    const membersWithAccessCounts = (members || []).map((member) => ({
        ...member,
        assigned_merchant_count: merchantAccessCounts[member.user_id] || 0,
    }))

    return {
        id: organizationId,
        members: membersWithAccessCounts,
        pending_org_admin_invites: pendingAdminInvites || [],
    }
}
