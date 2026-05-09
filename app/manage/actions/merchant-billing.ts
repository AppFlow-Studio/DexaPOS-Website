'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createNmiVaultCustomer } from '@/lib/payments/nmi'

const DEXA_HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID!

export type MerchantBillingMethod = 'ach' | 'card'
export type MerchantBankAccountType = 'checking' | 'savings'

export interface MerchantBillingProfileRecord {
  id: string
  merchant_id: string
  location_id: string | null
  location_name: string | null
  billing_method: MerchantBillingMethod
  bank_name: string | null
  account_holder_name: string | null
  account_number_last_four: string | null
  routing_number_last_four: string | null
  account_type: MerchantBankAccountType | null
  card_brand: string | null
  card_last_four: string | null
  card_exp_month: number | null
  card_exp_year: number | null
  card_token: string | null
  payment_device_id: string | null
  platform_billing_config_id: string | null
  customer_vault_id: string | null
  vault_initial_transaction_id: string | null
  is_verified: boolean
  verified_at: string | null
  is_primary: boolean
  is_active: boolean
  created_at: string
}

export interface MerchantBillingCardSetupRecord {
  configured: boolean
  label: string | null
  tokenizationKey: string | null
}

export interface SaveMerchantBillingParams {
  merchantId: string
  locationId?: string | null
  billingMethod: MerchantBillingMethod
  bankName?: string
  accountHolderName?: string
  routingNumber?: string
  accountNumber?: string
  accountType?: MerchantBankAccountType
  cardToken?: string
  cardBrand?: string
  cardLastFour?: string
  cardExpMonth?: number
  cardExpYear?: number
}

export interface SaveMerchantBillingCardWithVaultParams {
  merchantId: string
  locationId?: string | null
  paymentToken: string
  cardholderName: string
  billingEmail: string
  cardBrand?: string | null
  cardLastFour?: string | null
}

function normalizeText(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function digitsOnly(value?: string | null): string {
  if (!value) return ''
  return value.replace(/\D/g, '')
}

async function assertMerchantScopeForCurrentOrg(merchantId: string): Promise<void> {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) {
    throw new Error('Unauthorized')
  }

  if (orgId === DEXA_HQ_ORG_ID) {
    return
  }

  const supabase = createServerSupabaseClient()
  const { data: merchant, error } = await supabase
    .from('merchants')
    .select('id')
    .eq('id', merchantId)
    .eq('clerk_org_id', orgId)
    .single()

  if (error || !merchant) {
    throw new Error('Unauthorized merchant scope')
  }
}

export async function getMerchantBillingProfiles(merchantId: string): Promise<MerchantBillingProfileRecord[]> {
  if (!merchantId?.trim()) return []

  const { orgId } = await auth()
  if (orgId === DEXA_HQ_ORG_ID) {
    await assertHQPermission('hq.merchant.view')
  } else {
    await assertMerchantScopeForCurrentOrg(merchantId)
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('merchant_billing_profiles')
    .select(
      `
        id,
        merchant_id,
        location_id,
        billing_method,
        bank_name,
        account_holder_name,
        account_number_last_four,
        routing_number_last_four,
        account_type,
        card_brand,
        card_last_four,
        card_exp_month,
        card_exp_year,
        card_token,
        payment_device_id,
        platform_billing_config_id,
        customer_vault_id,
        vault_initial_transaction_id,
        is_verified,
        verified_at,
        is_primary,
        is_active,
        created_at,
        location:locations!merchant_billing_profiles_location_id_fkey(id, name)
      `
    )
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .order('location_id', { ascending: true, nullsFirst: true })
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getMerchantBillingProfiles] Error:', error)
    throw new Error('Failed to load merchant billing profiles.')
  }

  return ((data || []) as any[]).map((row) => {
    const location = Array.isArray(row.location) ? row.location[0] : row.location
    return {
      ...row,
      location_name: location?.name ?? null,
    }
  }) as MerchantBillingProfileRecord[]
}

export async function getMerchantBillingCardSetup(merchantId: string): Promise<MerchantBillingCardSetupRecord> {
  if (!merchantId?.trim()) {
    return { configured: false, label: null, tokenizationKey: null }
  }

  const { orgId } = await auth()
  if (orgId === DEXA_HQ_ORG_ID) {
    await assertHQPermission('hq.merchant.view')
  } else {
    await assertMerchantScopeForCurrentOrg(merchantId)
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('platform_billing_provider_configs')
    .select('label, tokenization_key, is_active')
    .eq('provider', 'nmi')
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[getMerchantBillingCardSetup] Error:', error)
    throw new Error('Failed to load billing card setup.')
  }

  return {
    configured: Boolean(data?.tokenization_key),
    label: data?.label ?? null,
    tokenizationKey: data?.tokenization_key ?? null,
  }
}

export async function saveMerchantBilling(
  params: SaveMerchantBillingParams
): Promise<{ success: boolean; error?: string }> {
  const merchantId = params.merchantId?.trim()
  if (!merchantId) {
    return { success: false, error: 'Merchant is required.' }
  }

  const locationId = normalizeText(params.locationId)

  const { orgId } = await auth()
  if (orgId === DEXA_HQ_ORG_ID) {
    await assertHQPermission('hq.merchant.update')
  } else {
    await assertMerchantScopeForCurrentOrg(merchantId)
  }

  const billingMethod = params.billingMethod
  if (!billingMethod || !['ach', 'card'].includes(billingMethod)) {
    return { success: false, error: 'Invalid billing method.' }
  }

  const achAccountDigits = digitsOnly(params.accountNumber)
  const achRoutingDigits = digitsOnly(params.routingNumber)
  const cardLastFourDigits = digitsOnly(params.cardLastFour)

  if (billingMethod === 'ach') {
    if (!normalizeText(params.bankName)) {
      return { success: false, error: 'Bank name is required for ACH.' }
    }
    if (!normalizeText(params.accountHolderName)) {
      return { success: false, error: 'Account holder name is required for ACH.' }
    }
    if (achRoutingDigits.length !== 9) {
      return { success: false, error: 'Routing number must be 9 digits.' }
    }
    if (achAccountDigits.length < 4) {
      return { success: false, error: 'Account number is invalid.' }
    }
    if (!params.accountType || !['checking', 'savings'].includes(params.accountType)) {
      return { success: false, error: 'Account type must be checking or savings.' }
    }
  }

  if (billingMethod === 'card') {
    if (!normalizeText(params.cardToken)) {
      return { success: false, error: 'Card token is required.' }
    }
    if (!normalizeText(params.cardBrand)) {
      return { success: false, error: 'Card brand is required.' }
    }
    if (cardLastFourDigits.length !== 4) {
      return { success: false, error: 'Card last 4 is required.' }
    }
    if (!params.cardExpMonth || params.cardExpMonth < 1 || params.cardExpMonth > 12) {
      return { success: false, error: 'Card expiration month is invalid.' }
    }
    if (!params.cardExpYear || params.cardExpYear < 2000) {
      return { success: false, error: 'Card expiration year is invalid.' }
    }
  }

  const supabase = createServerSupabaseClient()

  let deactivateQuery = supabase
    .from('merchant_billing_profiles')
    .update({
      is_primary: false,
      updated_at: new Date().toISOString(),
    })
    .eq('merchant_id', merchantId)
    .eq('is_primary', true)

  deactivateQuery = locationId
    ? deactivateQuery.eq('location_id', locationId)
    : deactivateQuery.is('location_id', null)

  const { error: deactivateError } = await deactivateQuery

  if (deactivateError) {
    console.error('[saveMerchantBilling] Failed to deactivate existing primary profile:', deactivateError)
    return { success: false, error: 'Failed to update existing billing profile.' }
  }

  const insertPayload: any =
    billingMethod === 'ach'
      ? {
          merchant_id: merchantId,
          location_id: locationId,
          billing_method: 'ach' as const,
          bank_name: normalizeText(params.bankName),
          account_holder_name: normalizeText(params.accountHolderName),
          account_number_last_four: achAccountDigits.slice(-4),
          routing_number_last_four: achRoutingDigits.slice(-4),
          account_type: params.accountType as MerchantBankAccountType,
          card_brand: null,
          card_last_four: null,
          card_exp_month: null,
          card_exp_year: null,
          card_token: null,
          is_primary: true,
          is_verified: false,
          is_active: true,
        }
      : {
          merchant_id: merchantId,
          location_id: locationId,
          billing_method: 'card' as const,
          bank_name: null,
          account_holder_name: null,
          account_number_last_four: null,
          routing_number_last_four: null,
          account_type: null,
          card_brand: normalizeText(params.cardBrand),
          card_last_four: cardLastFourDigits.slice(-4),
          card_exp_month: params.cardExpMonth as number,
          card_exp_year: params.cardExpYear as number,
          card_token: normalizeText(params.cardToken),
          is_primary: true,
          is_verified: false,
          is_active: true,
        }

  const { error: insertError } = await supabase
    .from('merchant_billing_profiles')
    .insert(insertPayload)

  if (insertError) {
    console.error('[saveMerchantBilling] Insert error:', insertError)
    return { success: false, error: insertError.message }
  }

  revalidatePath('/dashboard/settings/billing')
  revalidatePath(`/manage/merchants/${merchantId}/billing`)
  revalidatePath('/manage/merchants')

  return { success: true }
}

export async function saveMerchantBillingCardWithVault(
  params: SaveMerchantBillingCardWithVaultParams,
): Promise<{ success: boolean; error?: string }> {
  try {
    const merchantId = params.merchantId?.trim()
    if (!merchantId) {
      return { success: false, error: 'Merchant is required.' }
    }

    const locationId = normalizeText(params.locationId)

    const { orgId } = await auth()
    if (orgId === DEXA_HQ_ORG_ID) {
      await assertHQPermission('hq.merchant.update')
    } else {
      await assertMerchantScopeForCurrentOrg(merchantId)
    }

    const paymentToken = normalizeText(params.paymentToken)
    const cardholderName = normalizeText(params.cardholderName)
    const billingEmail = normalizeText(params.billingEmail)
    const cardBrand = normalizeText(params.cardBrand)
    const cardLastFour = digitsOnly(params.cardLastFour)

    if (!paymentToken) {
      return { success: false, error: 'Card tokenization failed. Please try again.' }
    }
    if (!cardholderName) {
      return { success: false, error: 'Cardholder name is required.' }
    }
    if (!billingEmail) {
      return { success: false, error: 'Billing email is required.' }
    }

    const [firstName, ...rest] = cardholderName.split(/\s+/)
    const lastName = rest.join(' ').trim() || 'Cardholder'

    const supabase = createServiceRoleClient()
    const { data: platformCredentialRows, error: platformCredentialError } = await supabase.rpc(
      'get_platform_billing_provider_secret',
      {
        p_provider: 'nmi',
      },
    )

    if (platformCredentialError) {
      console.error('[saveMerchantBillingCardWithVault] Platform credential error:', platformCredentialError)
      return { success: false, error: 'Failed to load the Dexa Billing NMI configuration.' }
    }

    const platformCredential = Array.isArray(platformCredentialRows)
      ? platformCredentialRows[0]
      : platformCredentialRows

    if (!platformCredential?.config_id || !platformCredential?.decrypted_secret?.trim()) {
      return {
        success: false,
        error: 'Dexa Billing NMI is not configured yet. Ask HQ to set the platform billing keys first.',
      }
    }

    const vaultResult = await createNmiVaultCustomer(
      {
        apiKey: platformCredential.decrypted_secret.trim(),
      },
      {
        paymentToken,
        firstName,
        lastName,
        email: billingEmail,
      },
    )

    if (!vaultResult.success || !vaultResult.vault.customerVaultId) {
      return {
        success: false,
        error:
          vaultResult.details.responseText ||
          vaultResult.body.message?.toString() ||
          'Failed to store the card in NMI Customer Vault.',
      }
    }

    let deactivateQuery = supabase
      .from('merchant_billing_profiles')
      .update({
        is_primary: false,
        updated_at: new Date().toISOString(),
      })
      .eq('merchant_id', merchantId)
      .eq('is_primary', true)

    deactivateQuery = locationId
      ? deactivateQuery.eq('location_id', locationId)
      : deactivateQuery.is('location_id', null)

    const { error: deactivateError } = await deactivateQuery

    if (deactivateError) {
      console.error('[saveMerchantBillingCardWithVault] Failed to deactivate existing primary profile:', deactivateError)
      return { success: false, error: 'Failed to update existing billing profile.' }
    }

    const { error: insertError } = await supabase
      .from('merchant_billing_profiles')
      .insert({
        merchant_id: merchantId,
        location_id: locationId,
        billing_method: 'card',
        account_holder_name: cardholderName,
        card_brand: cardBrand,
        card_last_four: cardLastFour.length === 4 ? cardLastFour : null,
        card_exp_month: null,
        card_exp_year: null,
        card_token: null,
        payment_device_id: null,
        platform_billing_config_id: platformCredential.config_id,
        customer_vault_id: vaultResult.vault.customerVaultId,
        vault_initial_transaction_id: vaultResult.vault.initialTransactionId || null,
        is_primary: true,
        is_verified: true,
        verified_at: new Date().toISOString(),
        is_active: true,
      })

    if (insertError) {
      console.error('[saveMerchantBillingCardWithVault] Insert error:', insertError)
      return { success: false, error: insertError.message }
    }

    revalidatePath('/dashboard/settings/billing')
    revalidatePath(`/manage/merchants/${merchantId}/billing`)
    revalidatePath('/manage/merchants')

    return { success: true }
  } catch (error: any) {
    console.error('[saveMerchantBillingCardWithVault] Unhandled error:', error)
    return {
      success: false,
      error:
        error?.message ||
        'Failed to store the card in NMI Customer Vault.',
    }
  }
}
