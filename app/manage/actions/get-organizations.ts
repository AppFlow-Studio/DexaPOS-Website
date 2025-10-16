'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GetCarrierOrganizations() {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.from('carriers').select(
    `
    *,
    organizations(
        *,
        members(
            *,
            users(id, first_name, last_name, email, avatar_url)
        )
    )
    `
    )
    .order('created_at', { ascending: false })
    if (error) {
        console.error('Error getting carrier organizations:', error)
        return {
            success: false,
            message: 'Error getting carrier organizations: ' + error.message,
        }
    }
    return data
}