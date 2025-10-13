'use server'

import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
export async function GetUserInfo() {
    const { userId } = await auth()
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
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