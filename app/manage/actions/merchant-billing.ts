'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveProcessorAccount } from '@/lib/payments/resolver'
import { resolveValorEndpoints } from '@/lib/payments/valor/config'
import {
  attachPaymentProfile,
  createCustomerProfile,
  sanitizeCustomerName,
} from '@/lib/payments/valor/customerProfileApi'
import { getClientToken } from '@/lib/payments/valor/saleApi'
import { updateSubscription } from '@/lib/payments/valor/subscriptionApi'

const DEXA_HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID!

export type MerchantBillingMethod = 'ach' | 'card'
export type MerchantBankAccountType = 'checking' | 'savings'

export interface MerchantBillingProfileRecord {
  id: string
  merchant_id: string
  location_id: string | null
  location_name: string | null
  billing_email: string | null
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
  processor: 'nmi' | 'valor'
  processor_account_id: string | null
  payment_profile_id: string | null
  is_verified: boolean
  verified_at: string | null
  is_primary: boolean
  is_active: boolean
  created_at: string
}

export interface MerchantBillingCardSetupRecord {
  configured: boolean
  provider: 'valor'
  label: string | null
  clientToken: string | null
  epi: string | null
  isDemo: boolean
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

interface ValorCredentialRow {
  valor_appid: string
  valor_epi: string
  decrypted_appkey: string
}

async function getValorCredentials(accountId: string): Promise<{
  appId: string
  appKey: string
  epi: string
} | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await (supabase as any).rpc('get_valor_account_credentials', {
    p_account_id: accountId,
  })

  if (error) {
    console.error('[merchant-billing:getValorCredentials] Error:', error)
    return null
  }

  const row = (Array.isArray(data) ? data[0] : data) as ValorCredentialRow | null
  const appId = row?.valor_appid?.trim()
  const appKey = row?.decrypted_appkey?.trim()
  const epi = row?.valor_epi?.trim()
  return appId && appKey && epi ? { appId, appKey, epi } : null
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
        billing_email,
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
        processor,
        processor_account_id,
        payment_profile_id,
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

export async function getMerchantBillingCardSetup(
  merchantId: string,
  locationId?: string | null,
): Promise<MerchantBillingCardSetupRecord> {
  const unavailable: MerchantBillingCardSetupRecord = {
    configured: false,
    provider: 'valor',
    label: null,
    clientToken: null,
    epi: null,
    isDemo: false,
  }

  if (!merchantId?.trim()) {
    return unavailable
  }

  const { orgId } = await auth()
  if (orgId === DEXA_HQ_ORG_ID) {
    await assertHQPermission('hq.merchant.view')
  } else {
    await assertMerchantScopeForCurrentOrg(merchantId)
  }

  try {
    const account = await resolveProcessorAccount(merchantId, 'subscription', {
      locationId: normalizeText(locationId),
      forceNmi: false,
    })
    if (!account || account.processor !== 'valor') return unavailable

    const credentials = await getValorCredentials(account.id)
    if (!credentials) return unavailable

    const token = await getClientToken({ credentials })
    return {
      configured: true,
      provider: 'valor',
      label: `Valor SaaS - EPI ${credentials.epi.slice(-4)}`,
      clientToken: token.clientToken,
      epi: credentials.epi,
      isDemo: resolveValorEndpoints().isDemo,
    }
  } catch (error) {
    console.error('[getMerchantBillingCardSetup] Error:', error)
    return unavailable
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

  if (billingMethod === 'card') {
    return {
      success: false,
      error: 'Cards must be tokenized and stored through the Valor payment form.',
    }
  }

  const achAccountDigits = digitsOnly(params.accountNumber)
  const achRoutingDigits = digitsOnly(params.routingNumber)

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

  const insertPayload = {
    merchant_id: merchantId,
    location_id: locationId,
    billing_email: null,
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

    const supabase = createServiceRoleClient()
    const subscriptionProcessorAccount = await resolveProcessorAccount(
      merchantId,
      'subscription',
      { locationId, forceNmi: false },
    )

    if (!subscriptionProcessorAccount || subscriptionProcessorAccount.processor !== 'valor') {
      return {
        success: false,
        error:
          'An active primary Valor subscription account must be provisioned before saving a SaaS billing card.',
      }
    }

    const credentials = await getValorCredentials(subscriptionProcessorAccount.id)
    if (!credentials) {
      return {
        success: false,
        error: 'The selected Valor subscription account is missing valid API credentials.',
      }
    }

    const [{ data: merchant, error: merchantError }, { data: location }] = await Promise.all([
      supabase
        .from('merchants')
        .select('name, owner_phone, business_address_line1, business_city, business_state, business_postal_code')
        .eq('id', merchantId)
        .single(),
      locationId
        ? supabase
            .from('locations')
            .select('name, city, state, postal_code, address_line1')
            .eq('id', locationId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    if (merchantError || !merchant) {
      return { success: false, error: 'Merchant billing identity could not be loaded.' }
    }

    const billingZip = digitsOnly(location?.postal_code || merchant.business_postal_code).slice(0, 5)
    if (billingZip.length !== 5) {
      return {
        success: false,
        error: 'A valid 5-digit billing ZIP is required in the merchant or location business profile.',
      }
    }

    const customer = await createCustomerProfile(
      { credentials },
      {
        customerName: cardholderName,
        companyName: merchant.name,
        phone: digitsOnly(merchant.owner_phone).slice(-10) || undefined,
        email: billingEmail,
        address: {
          customer_name: sanitizeCustomerName(cardholderName),
          street_name: normalizeText(location?.address_line1 || merchant.business_address_line1) ?? undefined,
          city: normalizeText(location?.city || merchant.business_city) ?? undefined,
          state: normalizeText(location?.state || merchant.business_state) ?? undefined,
          zip: billingZip,
        },
      },
    )
    const paymentProfile = await attachPaymentProfile(
      { credentials },
      {
        vaultCustomerId: customer.vaultCustomerId,
        token: paymentToken,
        cardholderName,
      },
    )

    let subscriptionsQuery = supabase
      .from('merchant_subscriptions')
      .select('id, monthly_amount, next_billing_date, processor_subscription_id')
      .eq('merchant_id', merchantId)
      .neq('status', 'canceled')
    if (locationId) subscriptionsQuery = subscriptionsQuery.eq('location_id', locationId)
    const { data: subscriptions, error: subscriptionsError } = await subscriptionsQuery
    if (subscriptionsError) {
      return { success: false, error: 'Failed to load the active subscription schedule.' }
    }

    const { data: stagedProfile, error: stagedProfileError } = await supabase
      .from('merchant_billing_profiles')
      .insert({
        merchant_id: merchantId,
        location_id: locationId,
        billing_email: billingEmail,
        billing_method: 'card',
        account_holder_name: cardholderName,
        card_brand: cardBrand,
        card_last_four: cardLastFour.length === 4 ? cardLastFour : null,
        card_exp_month: null,
        card_exp_year: null,
        card_token: null,
        payment_device_id: null,
        platform_billing_config_id: null,
        customer_vault_id: customer.vaultCustomerId,
        vault_initial_transaction_id: null,
        processor: 'valor',
        processor_account_id: subscriptionProcessorAccount.id,
        payment_profile_id: paymentProfile.paymentProfileId,
        is_primary: false,
        is_verified: false,
        is_active: false,
      } as any)
      .select('id')
      .single()

    if (stagedProfileError || !stagedProfile) {
      console.error('[saveMerchantBillingCardWithVault] Staged insert error:', stagedProfileError)
      return { success: false, error: stagedProfileError?.message || 'Failed to stage the Valor billing profile.' }
    }

    try {
      for (const subscription of subscriptions ?? []) {
        if (!subscription.processor_subscription_id || Number(subscription.monthly_amount) <= 0) continue
        const startsOn = new Date(`${subscription.next_billing_date}T12:00:00.000Z`)
        await updateSubscription(
          { credentials },
          {
            subscriptionId: subscription.processor_subscription_id,
            money: {
              amountMinor: Math.round(Number(subscription.monthly_amount) * 100),
              currency: 'USD',
            },
            interval: 'monthly',
            chargeOn: Math.min(startsOn.getUTCDate(), 30),
            startsOn,
            vaultCustomerId: customer.vaultCustomerId,
            paymentProfileId: paymentProfile.paymentProfileId ?? undefined,
            billingCustomerName: sanitizeCustomerName(cardholderName),
            billingZip,
            email: billingEmail,
            retryCount: 1,
            validateOnly: true,
          },
        )
      }
    } catch (scheduleError) {
      await supabase.from('merchant_billing_profiles').delete().eq('id', stagedProfile.id)
      throw scheduleError
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

    const { error: activateError } = await supabase
      .from('merchant_billing_profiles')
      .update({
        is_primary: true,
        is_verified: true,
        verified_at: new Date().toISOString(),
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stagedProfile.id)

    if (activateError) {
      console.error('[saveMerchantBillingCardWithVault] Activation error:', activateError)
      return { success: false, error: activateError.message }
    }

    let bindSubscriptions = supabase
      .from('merchant_subscriptions')
      .update({
        billing_profile_id: stagedProfile.id,
        processor: 'valor',
        processor_account_id: subscriptionProcessorAccount.id,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('merchant_id', merchantId)
      .neq('status', 'canceled')
    if (locationId) bindSubscriptions = bindSubscriptions.eq('location_id', locationId)
    const { error: bindingError } = await bindSubscriptions
    if (bindingError) {
      console.error('[saveMerchantBillingCardWithVault] Subscription binding error:', bindingError)
      return { success: false, error: 'Valor card was saved, but the subscription binding failed.' }
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
        'Failed to store the card in the Valor vault.',
    }
  }
}
