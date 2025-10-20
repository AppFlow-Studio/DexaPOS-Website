'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrganizationsModel } from '@/types/db-modles'

export interface CarrierOrganization {
    id: string
    name: string
    imageURL: string
    created_at: string
    updated_at: string
    organizations: OrganizationsModel[]
}
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
        return new Error(error.message)
    }
    return data
}