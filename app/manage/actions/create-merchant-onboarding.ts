'use server'

import { createClerkClient } from '@clerk/backend'
import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { revalidatePath } from 'next/cache'

export interface CreateMerchantOnboardingParams {
  businessLegalName: string
  dbaName?: string
  businessType: 'llc' | 'corporation' | 'sole_proprietor' | 'partnership' | 'nonprofit'
  einLastFour: string
  ownerFirstName: string
  ownerLastName: string
  ownerEmail: string
  ownerPhone: string
  businessAddress?: {
    line1: string
    line2?: string
    city: string
    state: string
    postalCode: string
    country?: string
  }
  carrierId: string
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

function isValidEinLastFour(value: string): boolean {
  return /^[0-9]{4}$/.test(value)
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
  const einLastFour = params.einLastFour?.trim()
  const carrierId = params.carrierId?.trim()

  if (!businessLegalName || !ownerFirstName || !ownerLastName || !ownerPhone || !carrierId) {
    return { success: false, error: 'Missing required fields.' }
  }

  if (!isValidEmail(ownerEmail)) {
    return { success: false, error: 'Owner email is invalid.' }
  }

  if (!isValidEinLastFour(einLastFour)) {
    return { success: false, error: 'EIN must be exactly 4 digits.' }
  }

  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
  const supabase = createServerSupabaseClient()

  let organizationId: string | null = null

  try {
    const organization = await clerkClient.organizations.createOrganization({
      name: businessLegalName,
      publicMetadata: {
        org_type: 'merchant',
        carrierId,
        merchant_type: params.businessType,
        business_legal_name: businessLegalName,
        dba_name: normalizeValue(params.dbaName),
        owner_first_name: ownerFirstName,
        owner_last_name: ownerLastName,
        owner_email: ownerEmail,
        owner_phone: ownerPhone,
        ein_last_four: einLastFour,
        onboarding_status: 'onboarding',
        created_by: userId,
      },
    })

    organizationId = organization.id

    const merchantName = normalizeValue(params.dbaName) || businessLegalName

    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .upsert(
        {
          clerk_org_id: organization.id,
          carrier_id: carrierId,
          type: params.businessType,
          name: merchantName,
          business_legal_name: businessLegalName,
          dba_name: normalizeValue(params.dbaName),
          business_type: params.businessType,
          ein_last_four: einLastFour,
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
        },
        { onConflict: 'clerk_org_id' }
      )
      .select('id, clerk_org_id, name')
      .single()

    if (merchantError || !merchant) {
      throw new Error(merchantError?.message || 'Failed to persist merchant record.')
    }

    await clerkClient.organizations.createOrganizationInvitation({
      organizationId: organization.id,
      emailAddress: ownerEmail,
      role: 'org:admin',
      publicMetadata: {
        org_type: 'merchant',
        roleCode: 'merchant.owner',
        merchantId: merchant.id,
        level_type: 'org:admin',
        firstName: ownerFirstName,
        lastName: ownerLastName,
      },
    })

    await logAdminAction('MERCHANT_CREATED', {
      merchantId: merchant.id,
      clerkOrgId: merchant.clerk_org_id,
      resourceType: 'merchant',
      resourceId: merchant.id,
      resourceName: merchant.name,
      changes: {
        after: {
          business_legal_name: businessLegalName,
          dba_name: normalizeValue(params.dbaName),
          business_type: params.businessType,
          carrier_id: carrierId,
          onboarding_status: 'onboarding',
          owner_email: ownerEmail,
        },
      },
      metadata: {
        source: 'createMerchantOnboarding',
      },
    })

    revalidatePath('/manage/merchants')

    return {
      success: true,
      merchantId: merchant.id,
      organizationId: merchant.clerk_org_id,
    }
  } catch (error: any) {
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
