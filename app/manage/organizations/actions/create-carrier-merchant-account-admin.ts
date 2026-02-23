'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClerkClient } from '@clerk/backend'
import { createInvitationAdmin } from './clerk-create-invitation-admin'
import { DeleteOrganization } from '../../actions/delete-organization'
import { logAdminAction } from '@/lib/admin/log-admin-action'
export async function createCarrierMerchantAccountAdmin({
    userId,
    carrierId,
    merchantName,
    merchantType,
    businessAddress,
    ownerName,
    ownerEmail,
    ownerPhone,
    merchantImage

}: {
    userId: string
    carrierId: string
    merchantName: string
    merchantType: string
    businessAddress: string
    ownerName: string
    ownerEmail: string
    ownerPhone: string
    merchantImage: File
}) {
    try {
        if (!merchantName || !merchantType || !businessAddress || !ownerName || !ownerEmail || !ownerPhone || !merchantImage) {
            throw new Error('Missing required fields')
        }
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })

        const CreateMerchantResponse = await clerkClient.organizations.createOrganization({
            name: merchantName,
            publicMetadata: {
                // Carrier Organization That handles merchants 
                org_type: 'merchant',
                merchant_type: merchantType,
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
                const deleteOrganizationResponse = await DeleteOrganization(CreateMerchantResponse.id)
                return {
                    success: false,
                    message: 'Error uploading organization image: ' + error.message,
                    // error: error,
                }
            }
        }

        if (CreateMerchantResponse.id && merchantImage) {
            const { data } = supabase.storage.from('Organizations-Logos').getPublicUrl(filepath)
            const UpdateClerkOrganizationResponse = await clerkClient.organizations.updateOrganizationMetadata(
                CreateMerchantResponse.id,
                {
                    publicMetadata: {
                        imageURL: data.publicUrl,
                    },
                })

            const createInvitationResponse = await createInvitationAdmin({organizationId: CreateMerchantResponse.id, email: ownerEmail, role: 'merchant.owner', level_type: 'org:manager', org_type: 'merchant'})

            if (createInvitationResponse?.success === false) {
                const deleteOrganizationResponse = await DeleteOrganization(CreateMerchantResponse.id)

                return {
                    success: false,
                    message: 'Error Sending Admin invitation: ' + createInvitationResponse.message,
                    // error: createInvitationResponse.error,
                }
            }
        }

        const { data: createdMerchant } = await supabase
            .from('merchants')
            .select('id')
            .eq('clerk_org_id', CreateMerchantResponse.id)
            .maybeSingle()

        await logAdminAction('MERCHANT_CREATED', {
            clerkOrgId: CreateMerchantResponse.id,
            merchantId: createdMerchant?.id,
            resourceType: 'merchant_organization',
            resourceId: CreateMerchantResponse.id,
            resourceName: merchantName,
            changes: {
                after: {
                    merchant_name: merchantName,
                    merchant_type: merchantType,
                    owner_email: ownerEmail,
                    status: 'active',
                },
            },
            metadata: {
                carrier_id: carrierId,
                source: 'createCarrierMerchantAccountAdmin',
            },
        })

        return {
            success: true,
            message: 'Merchant Organization created successfully and assigned to carrier',
        }


    } catch (error) {
        console.error('Error creating merchant account admin:', error)
        return {
            success: false,
            message: 'Error creating merchant account admin: ' + (error as any)?.errors?.[0]?.longMessage || 'Unknown error',
        }
    }

}
