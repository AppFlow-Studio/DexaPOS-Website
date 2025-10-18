'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
export async function GetInfoOfUser(userId: string) {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.from('users').select(`
        *,
        members(
            *,
            organizations(id, name, imageURL)
        )
        `).eq('id', userId).single()
    if (error) {
        console.error('Error getting user info:', error)
        return new Error(error.message)
    }
    return data
}