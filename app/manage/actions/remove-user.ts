'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClerkClient } from '@clerk/backend'
export async function RemoveUser(userId: string) {
    console.log('Removing user:', userId)
    try {
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        const user = await clerkClient.users.deleteUser(userId)
        if (user) {
            const supabase = createServerSupabaseClient()
            const { data, error } = await supabase.from('users').delete().eq('id', userId)
            if (error) {
                console.error('Error removing user:', error)
                return new Error(error.message)
            }
            return {
                success: true,
                message: 'User removed successfully',
            }
        }
    } catch (error) {
        console.error('Error removing user:', error)
        return {
            success: false,
            message: 'Error removing user: ' + (error as Error).message || 'Unknown error',
        }
    }
}