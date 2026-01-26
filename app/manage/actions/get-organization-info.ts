'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GetOrganizationInfo(organizationId: string) {
    const supabase = createServerSupabaseClient()
    const { data: MembersInfo, error } = await supabase.from('organizations').select(
        `*, 
       members(
            *, 
            users(*)
        ), 
        carriers(id, merchants(*))
        `).eq('id', organizationId).single()

    const { data: PendingInvitesInfo, error: PendingInvitesError } = await supabase.from('pending_org_admin_invites').select(
        `*, 
        clerk_user:users!clerk_user_id (id, first_name, last_name, email),
        invited_by_user:users!invited_by (id, first_name, last_name, email)
        `).eq('organization_id', organizationId)
    if (PendingInvitesError) {
        console.error('Error getting pending invites info:', PendingInvitesError)
        return new Error(PendingInvitesError.message)
    }
    const combinedData = {
        ...MembersInfo,
        pending_org_admin_invites: PendingInvitesInfo
    }
    if (error) {
        console.error('Error getting organization   info:', error)
        return new Error(error.message)
    }
    return combinedData
}