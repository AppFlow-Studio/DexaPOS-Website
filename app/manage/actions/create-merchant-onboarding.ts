'use server'

import { createClerkClient } from '@clerk/backend'
import { assertHQPermission } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { verifyDefaultEntitiesForMerchant } from '@/app/manage/actions/admin-merchant/verify-default-entities'
import { revalidatePath } from 'next/cache'
import { normalizeEmail, isValidEmail } from '@/lib/utils/email'
import { findEmailConflict } from '@/app/manage/actions/email-duplicates'
import { emailConflictMessage } from '@/lib/utils/email'

export async function updateMerchantLogo(
  organizationId: string,
  cdnUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertHQPermission('hq.merchant.create')
    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    const org = await clerkClient.organizations.getOrganization({ organizationId })
    await clerkClient.organizations.updateOrganization(organizationId, {
      publicMetadata: {
        ...(org.publicMetadata as Record<string, unknown>),
        imageURL: cdnUrl,
      },
    })
    return { success: true }
  } catch (error: any) {
    console.error('[updateMerchantLogo] Error:', error)
    return { success: false, error: error?.message || 'Failed to update logo.' }
  }
}

export async function updateMerchantOnboardingMetadata(
  organizationId: string,
  metadata: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertHQPermission('hq.merchant.create')
    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    const org = await clerkClient.organizations.getOrganization({ organizationId })
    await clerkClient.organizations.updateOrganization(organizationId, {
      publicMetadata: {
        ...(org.publicMetadata as Record<string, unknown>),
        ...metadata,
      },
    })
    return { success: true }
  } catch (error: any) {
    console.error('[updateMerchantOnboardingMetadata] Error:', error)
    return { success: false, error: error?.message || 'Failed to update merchant metadata.' }
  }
}

export interface CreateMerchantOnboardingParams {
  businessLegalName: string
  dbaName?: string
  businessType: 'llc' | 'corporation' | 'sole_proprietor' | 'partnership' | 'nonprofit'
  einTaxId: string
  ownerFirstName: string
  ownerLastName: string
  ownerEmail: string
  ownerPhone: string
  ownerDob: string
  businessAddress?: {
    line1: string
    line2?: string
    city: string
    state: string
    postalCode: string
    country?: string
  }
  carrierId?: string
}

export interface CreateMerchantOnboardingResult {
  success: boolean
  merchantId?: string
  organizationId?: string
  error?: string
}

function normalizeValue(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function isValidEinTaxId(value: string): boolean {
  return /^\d{9}$/.test(normalizeDigits(value))
}

export async function createMerchantOnboarding(
  params: CreateMerchantOnboardingParams
): Promise<CreateMerchantOnboardingResult> {
  const { userId } = await assertHQPermission('hq.merchant.create')

  const businessLegalName = params.businessLegalName?.trim()
  const ownerFirstName = params.ownerFirstName?.trim()
  const ownerLastName = params.ownerLastName?.trim()
  const ownerEmail = normalizeEmail(params.ownerEmail || '')
  const ownerPhone = params.ownerPhone?.trim()
  const ownerDob = params.ownerDob?.trim()
  const einTaxId = normalizeDigits(params.einTaxId || '')
  const carrierId = params.carrierId?.trim() || null

  if (!businessLegalName || !ownerFirstName || !ownerLastName || !ownerPhone || !ownerDob) {
    return { success: false, error: 'Missing required fields.' }
  }

  if (!isValidEmail(ownerEmail)) {
    return { success: false, error: 'Owner email is invalid.' }
  }

  const ownerConflict = await findEmailConflict(ownerEmail, { scope: 'global' })
  if (ownerConflict) {
    return { success: false, error: emailConflictMessage(ownerConflict) }
  }

  if (!isValidEinTaxId(einTaxId)) {
    return { success: false, error: 'EIN / Tax ID must be 9 digits.' }
  }

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })

  let organizationId: string | null = null

  try {
    // 1. Create Clerk organization — the webhook will populate organizations + merchants tables
    const organization = await clerkClient.organizations.createOrganization({
      name: normalizeValue(params.dbaName) || businessLegalName,
      publicMetadata: {
        org_type: 'merchant',
        ...(carrierId && { carrierId }),
        merchant_type: params.businessType,
        business_legal_name: businessLegalName,
        dba_name: normalizeValue(params.dbaName),
        owner_first_name: ownerFirstName,
        owner_last_name: ownerLastName,
        owner_email: ownerEmail,
        owner_phone: ownerPhone,
        owner_dob: ownerDob,
        online_store_owner_dob: ownerDob,
        ein_last_four: einTaxId.slice(-4),
        ein_tax_id: einTaxId,
        online_store_ein_tax_id: einTaxId,
        business_address_line1: normalizeValue(params.businessAddress?.line1),
        business_address_line2: normalizeValue(params.businessAddress?.line2),
        business_city: normalizeValue(params.businessAddress?.city),
        business_state: normalizeValue(params.businessAddress?.state),
        business_postal_code: normalizeValue(params.businessAddress?.postalCode),
        business_country: normalizeValue(params.businessAddress?.country) || 'US',
        onboarding_status: 'onboarding',
        created_by: userId,
      },
    })

    organizationId = organization.id

    // 2a. Pre-create the DB rows so the merchant detail page loads immediately
    //     without waiting for the async Clerk webhook to fire.
    const supabase = createServiceRoleClient()
    const orgTs = new Date(organization.createdAt).toISOString()

    await supabase.from('organizations').upsert(
      [{
        id: organization.id,
        name: organization.name,
        created_at: orgTs,
        updated_at: orgTs,
        public_metadata: (organization.publicMetadata as Record<string, unknown>) || {},
      }],
      { onConflict: 'id' }
    )

    const { data: merchantRow } = await supabase
      .from('merchants')
      .upsert(
        [{
          name: organization.name,
          clerk_org_id: organization.id,
          carrier_id: carrierId || null,
          public_metadata: (organization.publicMetadata as Record<string, unknown>) || {},
          type: params.businessType,
          business_legal_name: businessLegalName,
          dba_name: normalizeValue(params.dbaName),
          business_type: params.businessType || null,
          ein_last_four: einTaxId.slice(-4),
          owner_first_name: ownerFirstName,
          owner_last_name: ownerLastName,
          owner_email: ownerEmail,
          owner_phone: ownerPhone,
          business_address_line1: normalizeValue(params.businessAddress?.line1),
          business_address_line2: normalizeValue(params.businessAddress?.line2),
          business_city: normalizeValue(params.businessAddress?.city),
          business_state: normalizeValue(params.businessAddress?.state),
          business_postal_code: normalizeValue(params.businessAddress?.postalCode),
          business_country: normalizeValue(params.businessAddress?.country) || 'US',
          onboarding_status: 'onboarding',
          created_at: orgTs,
          updated_at: orgTs,
        }],
        { onConflict: 'clerk_org_id' }
      )
      .select('id')
      .single()

    // 2b. Verify the auto-provisioning DB trigger populated default entities
    //     (default station / payment terminal / prep station). The trigger is
    //     the source of truth — we only read & log a warning if anything is
    //     missing, never re-insert. Onboarding still proceeds either way.
    if (merchantRow?.id) {
      const report = await verifyDefaultEntitiesForMerchant(merchantRow.id)
      if (!report.ok) {
        await logAdminAction('MERCHANT_DEFAULT_ENTITIES_MISSING', {
          clerkOrgId: organization.id,
          merchantId: merchantRow.id,
          resourceType: 'merchant',
          resourceId: merchantRow.id,
          resourceName: normalizeValue(params.dbaName) || businessLegalName,
          metadata: {
            missing: report.missing,
            counts: report.counts,
            source: 'createMerchantOnboarding',
          },
          severity: 'warning',
        })
      }
    }

    // 2. Send owner invite — they'll land at /join-organization after accepting.
    //    The first admin of a merchant must be auto-active: there's no one
    //    above them in the merchant org to manually activate them.
    await clerkClient.organizations.createOrganizationInvitation({
      organizationId: organization.id,
      emailAddress: ownerEmail,
      role: 'org:admin',
      publicMetadata: {
        org_type: 'merchant',
        roleCode: 'merchant.owner',
        level_type: 'org:admin',
        firstName: ownerFirstName,
        lastName: ownerLastName,
        status: 'Active',
        auto_activated: true,
        auto_activated_reason: 'first_merchant_admin',
        auto_activated_at: new Date().toISOString(),
      },
    })

    // 3. Audit log
    await logAdminAction('MERCHANT_CREATED', {
      clerkOrgId: organization.id,
      resourceType: 'merchant',
      resourceId: organization.id,
      resourceName: normalizeValue(params.dbaName) || businessLegalName,
      changes: {
        after: {
          business_legal_name: businessLegalName,
          dba_name: normalizeValue(params.dbaName),
          business_type: params.businessType,
          carrier_id: carrierId,
          onboarding_status: 'onboarding',
          owner_email: ownerEmail,
          owner_dob: ownerDob,
          ein_tax_id: einTaxId,
        },
      },
      metadata: {
        source: 'createMerchantOnboarding',
      },
    })

    revalidatePath('/manage/merchants')

    return {
      success: true,
      organizationId: organization.id,
    }
  } catch (error: any) {
    // Rollback: delete the Clerk org if it was created but something else failed
    if (organizationId) {
      try {
        await clerkClient.organizations.deleteOrganization(organizationId)
      } catch (cleanupError) {
        console.error('[createMerchantOnboarding] Failed to rollback Clerk organization:', cleanupError)
      }
    }

    return {
      success: false,
      error: error?.message || 'Failed to create merchant.',
    }
  }
}
