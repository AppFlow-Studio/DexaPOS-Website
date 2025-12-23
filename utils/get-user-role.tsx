'use server'

import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GetUserRole(userId: string) {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.from('user_roles').select('*').eq('user_id', userId).single()
    if (error) {
        console.error('Error getting user role:', error)
        return null
    }
    return data?.role_code
}