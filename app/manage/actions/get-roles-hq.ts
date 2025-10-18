'use server'

import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GetRolesHQ() {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.from('roles').select('*').eq('organization_type', 'hq')
    if (error) {
        console.error('Error getting roles:', error)
        return new Error(error.message)
    }
    return data
}