'use server'

import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function getOrganizationUsers(organizationId: string) {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.from('organizations').select(
        `
        *,
        members(*, users(*)),
        pending_org_admin_invites(*, users(*))
        `
    ).eq('id', organizationId).single()
    if (error) {
        console.error('Error getting organization users:', error)
        return new Error(error.message)
    }
    console.log(data)
    return data
}