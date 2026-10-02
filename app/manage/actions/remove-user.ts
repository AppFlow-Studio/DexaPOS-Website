'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClerkClient } from '@clerk/backend'
import { assertSuperAdmin } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { orgsLeftWithoutAdmin } from '@/lib/admin/org-admins'

/** Permanently deletes a user from Clerk and the `users` table. Super admins only. */
export async function RemoveUser(userId: string): Promise<{ success: boolean; message: string }> {
    try {
        // A server action is a public endpoint: without this, any signed-in
        // caller could delete any account.
        const authContext = await assertSuperAdmin()
        if (userId === authContext.userId) {
            return { success: false, message: 'You cannot delete your own account.' }
        }

        // Same guard as deactivating or removing a membership: never leave an
        // organization with no active admin.
        const orphaned = await orgsLeftWithoutAdmin(userId)
        if (orphaned.length > 0) {
            return {
                success: false,
                message: `This user is the only active admin of ${orphaned.join(', ')}. Promote another admin there first.`,
            }
        }

        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })

        // Fetch user info before deletion for audit log
        const clerkUser = await clerkClient.users.getUser(userId)
        const userName = `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim() || clerkUser.emailAddresses[0]?.emailAddress || userId

        await clerkClient.users.deleteUser(userId)

        const supabase = createServerSupabaseClient()
        const { error } = await supabase.from('users').delete().eq('id', userId)
        if (error) {
            console.error('Error removing user from database:', error)
            return { success: false, message: `Deleted in Clerk, but not from the database: ${error.message}` }
        }

        await logAdminAction('ADMIN_DELETED', {
            resourceType: 'user',
            resourceId: userId,
            resourceName: userName,
            changes: {
                before: { status: 'active' },
                after: { status: 'deleted' },
            },
            metadata: {
                user_id: userId,
                target_user_id: userId,
                method: 'RemoveUser',
            },
        })

        return { success: true, message: 'User removed successfully' }
    } catch (error) {
        console.error('Error removing user:', error)
        return {
            success: false,
            message: 'Error removing user: ' + ((error as Error).message || 'Unknown error'),
        }
    }
}
