'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClerkClient } from '@clerk/backend'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

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
            await LogAuditEvent({
                action: `Removed User: ${userName}`,
                actionCategory: 'people',
                resourceType: 'user',
                resourceId: userId,
                resourceName: userName,
                severity: 'info',
                metadata: {
                    user_id: userId,
                    method: 'RemoveUser',
                    admin_action: true,
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