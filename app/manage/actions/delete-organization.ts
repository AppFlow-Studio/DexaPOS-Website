'use server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClerkClient } from '@clerk/backend'
export async function DeleteOrganization(organizationId: string) {
    try {
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        const organization = await clerkClient.organizations.deleteOrganization(organizationId)
        if (organization) {
            // Delete Image from Supabase Storage and all pending invites
            
            const supabase = createServerSupabaseClient()
            const { data, error } = await supabase.storage.from('Organizations-Logos').remove([organizationId.toString() + '.png'])
            
        }
    }
    catch (error) {
        console.error('Error deleting organization:', error)
        return {
            success: false,
            message: 'Error deleting organization: ' + (error as Error).message || 'Unknown error',
        }
    }
}
