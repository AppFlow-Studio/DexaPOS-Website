'use server'
import { createClerkClient } from '@clerk/backend'
import { uploadOrganizationLogo, deleteOrganizationLogo } from '@/lib/cdn/server'
import { DeleteOrganization } from '../../actions/delete-organization'
// TODO: Add more info here refer to the Notion 11-17-2025
// TODO: Save public_metadata to supabase for organizations
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
        let uploadedLogoUrl: string | null = null

        if (organizationImage && CreateOrganizationResponse.id) {
            const uploadResult = await uploadOrganizationLogo(
                organizationImage,
                CreateOrganizationResponse.id,
            )

            if (!uploadResult.success || !uploadResult.cdnUrl) {
                await DeleteOrganization(CreateOrganizationResponse.id)
                return {
                    success: false,
                    message: 'Error uploading organization image: ' + (uploadResult.error || 'Unknown error'),
                }
            }

            uploadedLogoUrl = uploadResult.cdnUrl
        }

        if (CreateOrganizationResponse.id && uploadedLogoUrl) {
            try {
                await clerkClient.organizations.updateOrganizationMetadata(
                    CreateOrganizationResponse.id,
                    {
                        publicMetadata: {
                            imageURL: uploadedLogoUrl,
                        },
                    })
            } catch (error) {
                await deleteOrganizationLogo(uploadedLogoUrl, CreateOrganizationResponse.id)
                await DeleteOrganization(CreateOrganizationResponse.id)
                return {
                    success: false,
                    message: 'Error updating organization image metadata: ' + ((error as Error)?.message || 'Unknown error'),
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
