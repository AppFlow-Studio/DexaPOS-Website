'use server'
import { createClerkClient } from '@clerk/backend'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function ClerkCreateOrganization({
    organizationName,
    userId,
    organizationImage,
}: {
    organizationName: string
    userId: string
    organizationImage: File
}) {
    try {
        if (!process.env.CLERK_SECRET_KEY) {
            throw new Error('CLERK_SECRET_KEY is not set')
        }
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
            throw new Error('SUPABASE_URL is not set')
        }
        if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
        }


        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        // Create Internal Office Organization With the proper public metadata - will auto sync to supabase with clerk webhooks
        const CreateOrganizationResponse = await clerkClient.organizations.createOrganization({
            name: organizationName,
            publicMetadata: {
                // Carrier Organization That handles merchants 
                org_type: 'carrier',
                createdBy: userId,
            },
            maxAllowedMemberships: 0, // No limit on the number of members
        })
        const supabase = await createServerSupabaseClient()
        // Insert Image into Supabase Storage Bucket
        const filepath = CreateOrganizationResponse.id.toString() + '.png';

        if (organizationImage && CreateOrganizationResponse.id) {
            const { data, error } = await supabase.storage.from('Organizations-Logos').upload(filepath, organizationImage)
            if (error) {
                return {
                    success: false,
                    message: 'Error uploading organization image: ' + error.message,
                    // error: error,
                }
            }
        }

        if (CreateOrganizationResponse.id) {
            const { data: publicUrl } = supabase.storage.from('Organizations-Logos').getPublicUrl(filepath)
            // Update the organization image URL in supabase
            const { data, error } = await supabase.from('organizations').update({
                imageURL: publicUrl.publicUrl,
            }).eq('id', CreateOrganizationResponse.id).select().single()
            if (error) {
                return {
                    success: false,
                    message: 'Error updating organization image: ' + error.message,
                    // error: error,
                }
            }
        }

        return {
            success: true,
            message: 'Carrier Organization created successfully',
        }
    }
    catch (error) {
        console.error('Error creating organization:', error)
        return {
            success: false,
            message: 'Error creating organization: ' + error?.message || 'Unknown error',
            // error: error,
        }
    }
}
