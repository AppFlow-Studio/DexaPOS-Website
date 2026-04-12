'use server'

import { createClerkClient } from '@clerk/backend'
import { assertHQPermission } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { revalidatePath } from 'next/cache'

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
  ownerSsn: string
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
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

function isValidSsn(value: string): boolean {
  return /^\d{9}$/.test(normalizeDigits(value))
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
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
  const ownerSsn = normalizeDigits(params.ownerSsn || '')
  const einTaxId = normalizeDigits(params.einTaxId || '')
  const carrierId = params.carrierId?.trim() || null

  if (!businessLegalName || !ownerFirstName || !ownerLastName || !ownerPhone || !ownerDob) {
    return { success: false, error: 'Missing required fields.' }
  }

  if (!isValidEmail(ownerEmail)) {
    return { success: false, error: 'Owner email is invalid.' }
  }

  if (!isValidEinTaxId(einTaxId)) {
    return { success: false, error: 'EIN / Tax ID must be 9 digits.' }
  }

  if (!isValidSsn(ownerSsn)) {
    return { success: false, error: 'Owner SSN must be 9 digits.' }
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
        owner_ssn: ownerSsn,
        online_store_owner_dob: ownerDob,
        online_store_owner_ssn: ownerSsn,
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

    // 2. Send owner invite — they'll land at /join-organization after accepting
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
