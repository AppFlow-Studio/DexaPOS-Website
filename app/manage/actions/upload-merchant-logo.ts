'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { revalidatePath } from 'next/cache'
import { logAdminAction } from '@/lib/admin/log-admin-action'

const BUCKET = 'merchant-logos'
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

  // Look up the merchant to get clerk_org_id
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id, name, clerk_org_id')
    .eq('id', merchantId)
    .single()

  if (merchantError || !merchant) {
    return { success: false, error: 'Merchant not found' }
  }

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${merchantId}/logo.${ext}`

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Upsert into storage (replaces existing logo)
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    // Bucket may not exist yet — try creating it then retry
    if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('bucket')) {
      const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_SIZE_BYTES,
        allowedMimeTypes: ALLOWED_TYPES,
      })
      if (bucketError && !bucketError.message?.includes('already exists')) {
        return { success: false, error: `Storage error: ${bucketError.message}` }
      }

      const { error: retryError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: true })

      if (retryError) {
        return { success: false, error: `Upload failed: ${retryError.message}` }
      }
    } else {
      return { success: false, error: `Upload failed: ${uploadError.message}` }
    }
  }

  // Get the public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const logoUrl = urlData.publicUrl

  // Persist to organizations.imageURL (this is what admin_merchant_summary view reads as logo_url)
  const { error: updateError } = await supabase
    .from('organizations')
    .update({ imageURL: logoUrl, updated_at: new Date().toISOString() })
    .eq('id', merchant.clerk_org_id)

  if (updateError) {
    return { success: false, error: `Failed to save logo URL: ${updateError.message}` }
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
