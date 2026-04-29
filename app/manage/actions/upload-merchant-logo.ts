'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { deleteOrganizationLogo, uploadOrganizationLogo } from '@/lib/cdn/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createClerkClient } from '@clerk/backend'
import { revalidatePath } from 'next/cache'

const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function uploadMerchantLogo(
  merchantId: string,
  formData: FormData
): Promise<{ success: boolean; logoUrl?: string; error?: string }> {
  await assertHQPermission('hq.merchant.update')

  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) {
    return { success: false, error: 'No file provided' }
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { success: false, error: 'Invalid file type. Use JPG, PNG, WebP, or GIF.' }
  }

  if (file.size > MAX_SIZE_BYTES) {
    return { success: false, error: 'File too large. Maximum size is 2 MB.' }
  }

  const supabase = createServiceRoleClient()
  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })

  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id, name, clerk_org_id, organizations(imageURL)')
    .eq('id', merchantId)
    .single()

  if (merchantError || !merchant) {
    return { success: false, error: 'Merchant not found' }
  }

  const uploadResult = await uploadOrganizationLogo(file, merchant.clerk_org_id)
  if (!uploadResult.success || !uploadResult.cdnUrl) {
    return { success: false, error: uploadResult.error || 'Upload failed' }
  }

  const logoUrl = uploadResult.cdnUrl
  const clerkOrg = await clerkClient.organizations.getOrganization({
    organizationId: merchant.clerk_org_id,
  })
  const previousClerkLogoUrl =
    typeof clerkOrg.publicMetadata?.imageURL === 'string' ? clerkOrg.publicMetadata.imageURL : null
  const previousDatabaseLogoUrl =
    merchant.organizations && !Array.isArray(merchant.organizations)
      ? merchant.organizations.imageURL
      : null

  try {
    await clerkClient.organizations.updateOrganization(merchant.clerk_org_id, {
      publicMetadata: {
        ...(clerkOrg.publicMetadata as Record<string, unknown>),
        imageURL: logoUrl,
      },
    })
  } catch (error) {
    await deleteOrganizationLogo(logoUrl, merchant.clerk_org_id)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update organization metadata',
    }
  }

  const { error: updateError } = await supabase
    .from('organizations')
    .update({ imageURL: logoUrl, updated_at: new Date().toISOString() })
    .eq('id', merchant.clerk_org_id)

  if (updateError) {
    await deleteOrganizationLogo(logoUrl, merchant.clerk_org_id)
    await clerkClient.organizations.updateOrganization(merchant.clerk_org_id, {
      publicMetadata: {
        ...(clerkOrg.publicMetadata as Record<string, unknown>),
        imageURL: previousClerkLogoUrl,
      },
    })
    return { success: false, error: `Failed to save logo URL: ${updateError.message}` }
  }

  const previousLogoUrl = previousClerkLogoUrl || previousDatabaseLogoUrl
  if (previousLogoUrl && previousLogoUrl !== logoUrl) {
    const deleteResult = await deleteOrganizationLogo(previousLogoUrl, merchant.clerk_org_id)
    if (!deleteResult.success) {
      console.warn('Failed to delete previous merchant logo:', deleteResult.error)
    }
  }

  await logAdminAction('MERCHANT_LOGO_UPDATED', {
    merchantId: merchant.id,
    resourceType: 'merchant',
    resourceId: merchant.id,
    resourceName: merchant.name,
    metadata: { logoUrl },
  })

  revalidatePath(`/manage/merchants/${merchantId}`)
  revalidatePath('/manage/merchants')

  return { success: true, logoUrl }
}
