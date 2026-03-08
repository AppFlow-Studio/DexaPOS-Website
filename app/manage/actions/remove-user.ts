'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClerkClient } from '@clerk/backend'
import { logAdminAction } from '@/lib/admin/log-admin-action'

export async function RemoveUser(userId: string) {
    console.log('Removing user:', userId)
    try {
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        
        // Fetch user info before deletion for audit log
        const clerkUser = await clerkClient.users.getUser(userId)
        const userName = `${clerkUser.firstName} ${clerkUser.lastName}`.trim() || clerkUser.emailAddresses[0]?.emailAddress || userId

        const userDeleted = await clerkClient.users.deleteUser(userId)
        
        if (userDeleted) {
            const supabase = createServerSupabaseClient()
            const { data, error } = await supabase.from('users').delete().eq('id', userId)
            
            if (error) {
                console.error('Error removing user from database:', error)
                return new Error(error.message)
            }

            // Log audit event
            await logAdminAction('ADMIN_DEACTIVATED', {
                resourceType: 'user',
                resourceId: userId,
                resourceName: userName,
                changes: {
                    before: { status: 'active' },
                    after: { status: 'deleted' },
                },
                metadata: {
                    user_id: userId,
                    method: 'RemoveUser',
                },
            })

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
