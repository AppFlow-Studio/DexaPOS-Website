'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClerkClient } from '@clerk/backend'
import { createInvitationAdmin } from './clerk-create-invitation-admin'
export async function createCarrierMerchantAccountAdmin({
    userId,
    carrierId,
    merchantName,
    businessAddress,
    ownerName,
    ownerEmail,
    ownerPhone,
    merchantImage
}: {
    userId: string
    carrierId: string
    merchantName: string
    businessAddress: string
    ownerName: string
    ownerEmail: string
    ownerPhone: string
    merchantImage: File
}) {
    try {
        if (!merchantName || !businessAddress || !ownerName || !ownerEmail || !ownerPhone || !merchantImage) {
            throw new Error('Missing required fields')
        }
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        const CreateMerchantResponse = await clerkClient.organizations.createOrganization({
            name: merchantName,
            publicMetadata: {
                // Carrier Organization That handles merchants 
                org_type: 'merchant',
                status: 'active',
                business_address: businessAddress,
                owner_name: ownerName,
                owner_email: ownerEmail,
                owner_phone: ownerPhone,
                carrierId: carrierId,
                createdBy: userId,
            },
        })

        const supabase = await createServerSupabaseClient()
        // Insert Image into Supabase Storage Bucket
        const filepath = CreateMerchantResponse.id.toString() + '.png';

        if (merchantImage && CreateMerchantResponse.id) {
            const { data, error } = await supabase.storage.from('Organizations-Logos').upload(filepath, merchantImage)
            if (error) {
                return {
                    success: false,
                    message: 'Error uploading organization image: ' + error.message,
                    // error: error,
                }
            }
        }

        if (CreateMerchantResponse.id && merchantImage) {
            const { data: publicUrl } = supabase.storage.from('Organizations-Logos').getPublicUrl(filepath)
            // Update the organization image URL in supabase
            const { data, error } = await supabase.from('organizations').update({
                imageURL: publicUrl.publicUrl,
            }).eq('id', CreateMerchantResponse.id).select().single()

            console.log('Created Merchant', data)
            const createInvitationResponse = await createInvitationAdmin(CreateMerchantResponse.id, ownerEmail)
            if (createInvitationResponse?.success) {
                return {
                    success: false,
                    message: 'Error Sending Admin invitation: ' + createInvitationResponse.message,
                    // error: createInvitationResponse.error,
                }
            }
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
            message: 'Merchant Organization created successfully and assigned to carrier',
        }


    } catch (error) {
        console.error('Error creating merchant account admin:', error)
        return {
            success: false,
            message: 'Error creating merchant account admin: ' + error?.errors?.[0]?.longMessage || 'Unknown error',
        }
    }

}