'use server'

import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GetRolesHQ(role_types?: string) {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.from('roles').select('*').eq('organization_type', role_types)
    if (error) {
        console.error('Error getting roles:', error)
        return new Error(error.message)
    }
    return data
}