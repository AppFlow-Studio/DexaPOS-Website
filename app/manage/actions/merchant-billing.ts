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
import { deactivateSubscription, updateSubscription } from '@/lib/payments/valor/subscriptionApi'
import { shouldRebindSubscriptionCard } from '@/supabase/functions/_shared/subscription-billing-scope'

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

/**
 * Pull non-sensitive card metadata (last four, expiry, brand) out of a Valor
 * vault response. The vault endpoints are loosely documented, so every plausible
 * key is probed and anything missing is left null — this is best-effort display
 * data, never a hard dependency. Raw PANs never reach here (Passage tokenizes
 * client-side); a "masked_card_number" style value only exposes the last four.
 */
function extractVaultCardMeta(raw: unknown): {
  lastFour: string | null
  expMonth: number | null
  expYear: number | null
  brand: string | null
} {
  const empty = { lastFour: null, expMonth: null, expYear: null, brand: null }
  if (!raw || typeof raw !== 'object') return empty
  const body = raw as Record<string, unknown>

  const str = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = body[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number') return String(value)
    }
    return null
  }

  // Last four — accept a bare 4-digit field or a masked card number, taking the
  // final four digits either way.
  const lastFourRaw = str([
    'card_last_four', 'last_four', 'last4', 'card_last4', 'cardLastFour',
    'masked_card_number', 'maskedCardNumber', 'card_number', 'cardNumber', 'masked_card', 'maskedCard',
  ])
  const lastFourDigits = digitsOnly(lastFourRaw)
  const lastFour = lastFourDigits.length >= 4 ? lastFourDigits.slice(-4) : null

  // Expiry — either split month/year fields, or a combined MMYY / MM/YY / MMYYYY.
  let expMonth: number | null = null
  let expYear: number | null = null
  const monthRaw = str(['card_exp_month', 'exp_month', 'expiry_month', 'expMonth', 'expiration_month'])
  const yearRaw = str(['card_exp_year', 'exp_year', 'expiry_year', 'expYear', 'expiration_year'])
  if (monthRaw && yearRaw) {
    expMonth = Number(monthRaw) || null
    expYear = Number(yearRaw) || null
  } else {
    const combined = digitsOnly(str(['exp_date', 'expiry', 'card_exp', 'expiration', 'exp', 'expdate']))
    if (combined.length === 4) {
      expMonth = Number(combined.slice(0, 2)) || null
      expYear = 2000 + (Number(combined.slice(2, 4)) || 0)
    } else if (combined.length === 6) {
      expMonth = Number(combined.slice(0, 2)) || null
      expYear = Number(combined.slice(2, 6)) || null
    }
  }
  // Two-digit years → 20xx.
  if (expYear !== null && expYear < 100) expYear += 2000
  if (expMonth !== null && (expMonth < 1 || expMonth > 12)) expMonth = null

  const brand = str(['card_type', 'cardType', 'card_brand', 'cardBrand', 'brand', 'scheme'])

  return { lastFour, expMonth, expYear, brand }
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

/**
 * Provision the Valor SaaS (subscription) rail for a scope by reusing the
 * location's already-boarded online-order Valor credentials.
 *
 * A Valor EPI processes both card-present sales and subscriptions, and the app
 * key is vaulted per (merchant, location) — not per purpose — so the
 * subscription account can safely point at the same vault secret + EPI + app id
 * as the online-order account for that scope. This mirrors how the one working
 * subscription account (verified end-to-end on staging) was set up.
 *
 * Fee-schedule / discount fields are intentionally left null: the CHECK
 * constraint exempts subscription accounts, and the SaaS charge path never reads
 * them (our surcharge comes from the plan's card_surcharge_pct), so we don't
 * carry misleading card-present rates onto the SaaS rail.
 */
export async function provisionSubscriptionBillingRail(
  merchantId: string,
  locationId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const trimmedMerchantId = merchantId?.trim()
  if (!trimmedMerchantId) {
    return { success: false, error: 'Merchant is required.' }
  }

  const { orgId } = await auth()
  if (orgId === DEXA_HQ_ORG_ID) {
    await assertHQPermission('hq.merchant.update')
  } else {
    await assertMerchantScopeForCurrentOrg(trimmedMerchantId)
  }

  const scopedLocationId = normalizeText(locationId)
  const serviceRole = createServiceRoleClient() as any

  // SaaS fees settle to Dexa's bank, so every merchant's subscription rail is
  // charged through the single central Dexa-owned merchant-of-record (the
  // "DEXA POS AI" Valor merchant), NOT the merchant's own EPI. Clone the central
  // credentials — epi/appid plus the app-key vault secret *reference* (shared
  // across all subscription rows; get_valor_account_credentials decrypts it) —
  // onto this scope's subscription account.
  const { data: sourceRows, error: sourceError } = await serviceRole.rpc(
    'get_platform_valor_saas_source',
  )
  const source = (Array.isArray(sourceRows) ? sourceRows[0] : sourceRows) as
    | {
        config_id: string
        valor_epi: string | null
        valor_appid: string | null
        valor_appkey_secret_id: string | null
        is_active: boolean
      }
    | null

  if (sourceError) {
    console.error('[provisionSubscriptionBillingRail] Central config lookup error:', sourceError)
    return { success: false, error: 'Failed to look up the central Dexa SaaS billing credentials.' }
  }

  if (!source?.valor_epi || !source?.valor_appkey_secret_id) {
    return {
      success: false,
      error:
        'Central Dexa SaaS billing (DEXA POS AI) is not configured yet. Set the central Valor credentials in HQ billing settings before enabling subscription billing.',
    }
  }

  const now = new Date().toISOString()

  // Only one active primary may exist per (merchant, location, subscription)
  // across processors — demote any incumbent before promoting this one.
  let demoteQuery = serviceRole
    .from('merchant_processor_accounts')
    .update({ is_primary: false, updated_at: now })
    .eq('merchant_id', trimmedMerchantId)
    .eq('purpose', 'subscription')
    .eq('is_active', true)
    .eq('is_primary', true)
  demoteQuery = scopedLocationId
    ? demoteQuery.eq('location_id', scopedLocationId)
    : demoteQuery.is('location_id', null)
  const { error: demoteError } = await demoteQuery
  if (demoteError) {
    console.error('[provisionSubscriptionBillingRail] Demote error:', demoteError)
    return { success: false, error: 'Failed to update the existing subscription account.' }
  }

  const credentials = {
    valor_epi: source.valor_epi,
    valor_appid: source.valor_appid,
    valor_appkey_encrypted: source.valor_appkey_secret_id,
    pricing_owner: 'dexa' as const,
    is_primary: true,
    is_active: true,
    updated_at: now,
  }

  // One row per (merchant, location, processor, purpose) — reuse it if present.
  let existingQuery = serviceRole
    .from('merchant_processor_accounts')
    .select('id')
    .eq('merchant_id', trimmedMerchantId)
    .eq('processor', 'valor')
    .eq('purpose', 'subscription')
    .limit(1)
  existingQuery = scopedLocationId
    ? existingQuery.eq('location_id', scopedLocationId)
    : existingQuery.is('location_id', null)
  const { data: existing } = await existingQuery.maybeSingle()

  if (existing?.id) {
    const { error } = await serviceRole
      .from('merchant_processor_accounts')
      .update(credentials)
      .eq('id', existing.id)
    if (error) {
      console.error('[provisionSubscriptionBillingRail] Update error:', error)
      return { success: false, error: error.message }
    }
  } else {
    const { error } = await serviceRole
      .from('merchant_processor_accounts')
      .insert({
        merchant_id: trimmedMerchantId,
        location_id: scopedLocationId,
        processor: 'valor',
        purpose: 'subscription',
        ...credentials,
      })
    if (error) {
      console.error('[provisionSubscriptionBillingRail] Insert error:', error)
      return { success: false, error: error.message }
    }
  }

  revalidatePath('/dashboard/settings/billing')
  revalidatePath(`/manage/merchants/${trimmedMerchantId}/billing`)
  return { success: true }
}

/**
 * HQ-only: set or rotate the central Dexa SaaS billing credentials (the
 * "DEXA POS AI" Valor merchant that every merchant's subscription rail clones
 * from). The app key is vaulted; only its secret reference is persisted. Pass
 * `appkeySecretId` instead of `appkey` to point at an already-vaulted key
 * (used on staging, where the sandbox demo EPI's key is already in vault).
 */
export async function setPlatformValorSaasBillingCredentials(params: {
  epi: string
  appid: string
  appkey?: string
  appkeySecretId?: string
  label?: string
  isActive?: boolean
}): Promise<{ success: boolean; configId?: string; error?: string }> {
  await assertHQPermission('system.config.manage')

  const epi = params.epi?.trim()
  const appid = params.appid?.trim()
  if (!epi || !/^2\d{9}$/.test(epi)) {
    return { success: false, error: 'A valid 10-digit Valor EPI (beginning with 2) is required.' }
  }
  if (!appid) {
    return { success: false, error: 'Valor app id is required.' }
  }
  // App key is optional on update — the RPC reuses the existing vaulted key when
  // none is provided, and raises if there is no existing key for a first-time config.
  const appkey = params.appkey?.trim() || null
  const appkeySecretId = params.appkeySecretId?.trim() || null

  const serviceRole = createServiceRoleClient() as any
  const { data, error } = await serviceRole.rpc('upsert_platform_valor_saas_config', {
    p_epi: epi,
    p_appid: appid,
    p_appkey: appkey,
    p_appkey_secret_id: appkeySecretId,
    p_label: params.label?.trim() || 'Dexa SaaS Billing (Valor)',
    p_is_active: params.isActive ?? true,
  })
  if (error) {
    console.error('[setPlatformValorSaasBillingCredentials] error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/manage/settings/billing-catalog')
  return { success: true, configId: data as string }
}

/**
 * HQ-only: re-provision every active subscription rail onto the current central
 * Dexa SaaS credentials. Idempotent — overwrites epi/appid/app-key reference on
 * each active purpose='subscription' account row. Does NOT re-vault cards or tear
 * down native Valor schedules created on old EPIs; those are handled separately.
 */
export async function reprovisionAllSubscriptionRails(): Promise<{
  success: boolean
  updated?: number
  error?: string
}> {
  await assertHQPermission('system.config.manage')

  const serviceRole = createServiceRoleClient() as any
  const { data: sourceRows, error: sourceError } = await serviceRole.rpc(
    'get_platform_valor_saas_source',
  )
  const source = (Array.isArray(sourceRows) ? sourceRows[0] : sourceRows) as
    | { valor_epi: string | null; valor_appid: string | null; valor_appkey_secret_id: string | null }
    | null
  if (sourceError) {
    console.error('[reprovisionAllSubscriptionRails] Central config lookup error:', sourceError)
    return { success: false, error: 'Failed to look up the central Dexa SaaS billing credentials.' }
  }
  if (!source?.valor_epi || !source?.valor_appkey_secret_id) {
    return {
      success: false,
      error: 'Central Dexa SaaS billing (DEXA POS AI) is not configured yet.',
    }
  }

  const { data: rows, error: updateError } = await serviceRole
    .from('merchant_processor_accounts')
    .update({
      valor_epi: source.valor_epi,
      valor_appid: source.valor_appid,
      valor_appkey_encrypted: source.valor_appkey_secret_id,
      pricing_owner: 'dexa',
      updated_at: new Date().toISOString(),
    })
    .eq('processor', 'valor')
    .eq('purpose', 'subscription')
    .eq('is_active', true)
    .select('id')
  if (updateError) {
    console.error('[reprovisionAllSubscriptionRails] Update error:', updateError)
    return { success: false, error: updateError.message }
  }

  return { success: true, updated: rows?.length ?? 0 }
}

interface CutoverDetail {
  merchantId: string
  locationId: string | null
  action: string
}

/**
 * HQ-only: migrate every SaaS billing rail to the central Dexa (DEXA POS AI)
 * credentials, in the safe order that real money movement requires:
 *
 *   1. Tear down native Valor recurring schedules that live on an OLD EPI
 *      (using the rail's still-old creds, BEFORE they are overwritten) so the
 *      merchant is not double-charged; clear processor_subscription_id so the
 *      next cycle recreates the schedule on the central EPI.
 *   2. Reprovision the rail's creds to central.
 *   3. Invalidate cards vaulted under a non-central EPI (they can't be charged
 *      by the central EPI) so the merchant is prompted to re-add — idempotent
 *      via vaulted_under_epi.
 *
 * Rails already on the central EPI are left untouched (protects proven, working
 * central schedules). Pass `dryRun` to preview counts + a per-item plan without
 * mutating anything or calling Valor.
 */
export async function cutoverSubscriptionRailsToCentral(options?: {
  dryRun?: boolean
}): Promise<{
  success: boolean
  dryRun: boolean
  railsMigrated: number
  schedulesTornDown: number
  cardsInvalidated: number
  details: CutoverDetail[]
  error?: string
}> {
  const dryRun = options?.dryRun ?? false
  const empty = { railsMigrated: 0, schedulesTornDown: 0, cardsInvalidated: 0, details: [] as CutoverDetail[] }

  await assertHQPermission('system.config.manage')

  const serviceRole = createServiceRoleClient() as any

  const { data: sourceRows, error: sourceError } = await serviceRole.rpc('get_platform_valor_saas_source')
  const source = (Array.isArray(sourceRows) ? sourceRows[0] : sourceRows) as
    | { valor_epi: string | null; valor_appid: string | null; valor_appkey_secret_id: string | null }
    | null
  if (sourceError) {
    console.error('[cutoverSubscriptionRailsToCentral] Central config lookup error:', sourceError)
    return { success: false, dryRun, ...empty, error: 'Failed to look up the central Dexa SaaS billing credentials.' }
  }
  if (!source?.valor_epi || !source?.valor_appkey_secret_id) {
    return { success: false, dryRun, ...empty, error: 'Central Dexa SaaS billing (DEXA POS AI) is not configured yet.' }
  }
  const centralEpi = source.valor_epi
  const now = new Date().toISOString()

  const details: CutoverDetail[] = []
  let railsMigrated = 0
  let schedulesTornDown = 0
  let cardsInvalidated = 0

  // --- Rails needing migration (their current EPI is not the central EPI) ---
  const { data: rails, error: railsError } = await serviceRole
    .from('merchant_processor_accounts')
    .select('id, merchant_id, location_id, valor_epi')
    .eq('processor', 'valor')
    .eq('purpose', 'subscription')
    .eq('is_active', true)
  if (railsError) {
    console.error('[cutoverSubscriptionRailsToCentral] Rail lookup error:', railsError)
    return { success: false, dryRun, ...empty, error: railsError.message }
  }

  for (const rail of (rails ?? []) as Array<{
    id: string
    merchant_id: string
    location_id: string | null
    valor_epi: string | null
  }>) {
    if ((rail.valor_epi ?? '') === centralEpi) continue // already central — leave it alone

    // 1) Tear down native schedules on the OLD EPI (creds are still old here).
    const { data: subs } = await serviceRole
      .from('merchant_subscriptions')
      .select('id, processor_subscription_id')
      .eq('processor_account_id', rail.id)
      .not('processor_subscription_id', 'is', null)

    for (const sub of (subs ?? []) as Array<{ id: string; processor_subscription_id: string }>) {
      if (dryRun) {
        schedulesTornDown++
        details.push({ merchantId: rail.merchant_id, locationId: rail.location_id, action: `would deactivate + clear native schedule ${sub.processor_subscription_id}` })
        continue
      }
      try {
        const oldCreds = await getValorCredentials(rail.id)
        if (oldCreds) {
          await deactivateSubscription({ credentials: oldCreds }, String(sub.processor_subscription_id))
        }
      } catch (error) {
        // Best-effort: a schedule that no longer exists on Valor still gets cleared locally.
        console.error('[cutoverSubscriptionRailsToCentral] Schedule teardown failed (continuing):', error)
      }
      await serviceRole
        .from('merchant_subscriptions')
        .update({
          processor_subscription_id: null,
          processor_subscription_status: null,
          processor_schedule_created_at: null,
          processor_next_payment_at: null,
          updated_at: now,
        })
        .eq('id', sub.id)
      schedulesTornDown++
      details.push({ merchantId: rail.merchant_id, locationId: rail.location_id, action: `deactivated + cleared native schedule ${sub.processor_subscription_id}` })
    }

    // 2) Reprovision the rail's creds to central.
    if (!dryRun) {
      const { error: reprovisionError } = await serviceRole
        .from('merchant_processor_accounts')
        .update({
          valor_epi: source.valor_epi,
          valor_appid: source.valor_appid,
          valor_appkey_encrypted: source.valor_appkey_secret_id,
          pricing_owner: 'dexa',
          updated_at: now,
        })
        .eq('id', rail.id)
      if (reprovisionError) {
        console.error('[cutoverSubscriptionRailsToCentral] Reprovision error:', reprovisionError)
        return { success: false, dryRun, railsMigrated, schedulesTornDown, cardsInvalidated, details, error: reprovisionError.message }
      }
    }
    railsMigrated++
    details.push({ merchantId: rail.merchant_id, locationId: rail.location_id, action: dryRun ? 'would migrate rail to central EPI' : 'migrated rail to central EPI' })
  }

  // 3) Invalidate cards vaulted under a non-central EPI (idempotent via vaulted_under_epi).
  const { data: profiles, error: profilesError } = await serviceRole
    .from('merchant_billing_profiles')
    .select('id, merchant_id, location_id, vaulted_under_epi')
    .eq('processor', 'valor')
    .eq('is_active', true)
  if (profilesError) {
    console.error('[cutoverSubscriptionRailsToCentral] Profile lookup error:', profilesError)
    return { success: false, dryRun, railsMigrated, schedulesTornDown, cardsInvalidated, details, error: profilesError.message }
  }

  for (const profile of (profiles ?? []) as Array<{
    id: string
    merchant_id: string
    location_id: string | null
    vaulted_under_epi: string | null
  }>) {
    if ((profile.vaulted_under_epi ?? '') === centralEpi) continue // already on central — card is chargeable

    if (!dryRun) {
      const { error: invalidateError } = await serviceRole
        .from('merchant_billing_profiles')
        .update({ is_active: false, is_verified: false, is_primary: false, updated_at: now })
        .eq('id', profile.id)
      if (invalidateError) {
        console.error('[cutoverSubscriptionRailsToCentral] Card invalidation error:', invalidateError)
        return { success: false, dryRun, railsMigrated, schedulesTornDown, cardsInvalidated, details, error: invalidateError.message }
      }
    }
    cardsInvalidated++
    details.push({ merchantId: profile.merchant_id, locationId: profile.location_id, action: dryRun ? 'would invalidate stale card (re-add required)' : 'invalidated stale card (re-add required)' })
  }

  if (!dryRun) {
    revalidatePath('/manage/settings/billing-catalog')
    revalidatePath('/dashboard/settings/billing')
  }

  return { success: true, dryRun, railsMigrated, schedulesTornDown, cardsInvalidated, details }
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

    // Best-effort card metadata for display — probe the vault responses (payment
    // profile first, then customer). Anything Valor doesn't return stays null.
    const vaultCardMeta = extractVaultCardMeta(paymentProfile.raw)
    const fallbackCardMeta = extractVaultCardMeta(customer.raw)
    const resolvedLastFour =
      (cardLastFour.length === 4 ? cardLastFour : null) ??
      vaultCardMeta.lastFour ??
      fallbackCardMeta.lastFour
    const resolvedBrand = cardBrand ?? vaultCardMeta.brand ?? fallbackCardMeta.brand
    const resolvedExpMonth = vaultCardMeta.expMonth ?? fallbackCardMeta.expMonth
    const resolvedExpYear = vaultCardMeta.expYear ?? fallbackCardMeta.expYear

    let previousProfilesQuery = supabase.from('merchant_billing_profiles')
      .select('id').eq('merchant_id', merchantId)
    previousProfilesQuery = locationId
      ? previousProfilesQuery.eq('location_id', locationId)
      : previousProfilesQuery.is('location_id', null)
    const { data: previousProfiles, error: previousProfilesError } = await previousProfilesQuery
    if (previousProfilesError) {
      return { success: false, error: 'Failed to resolve the previous billing cards.' }
    }
    const subscriptionsQuery = supabase
      .from('merchant_subscriptions')
      .select('id, location_id, billing_profile_id, metadata, monthly_amount, next_billing_date, processor_subscription_id')
      .eq('merchant_id', merchantId)
      .neq('status', 'canceled')
    const { data: allSubscriptions, error: subscriptionsError } = await subscriptionsQuery
    if (subscriptionsError) {
      return { success: false, error: 'Failed to load the active subscription schedule.' }
    }
    const subscriptions = (allSubscriptions ?? []).filter((subscription) =>
      shouldRebindSubscriptionCard(subscription, locationId, (previousProfiles ?? []).map((profile) => profile.id)),
    )

    const { data: stagedProfile, error: stagedProfileError } = await supabase
      .from('merchant_billing_profiles')
      .insert({
        merchant_id: merchantId,
        location_id: locationId,
        billing_email: billingEmail,
        billing_method: 'card',
        account_holder_name: cardholderName,
        card_brand: resolvedBrand,
        card_last_four: resolvedLastFour,
        card_exp_month: resolvedExpMonth,
        card_exp_year: resolvedExpYear,
        card_token: null,
        payment_device_id: null,
        platform_billing_config_id: null,
        customer_vault_id: customer.vaultCustomerId,
        vault_initial_transaction_id: null,
        processor: 'valor',
        processor_account_id: subscriptionProcessorAccount.id,
        payment_profile_id: paymentProfile.paymentProfileId,
        vaulted_under_epi: credentials.epi,
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
        // Valor rejects a past subscription start date (SUB08); clamp to today
        // when the scheduled cycle has already elapsed, but keep the original
        // day-of-month as the recurring charge_on.
        const scheduledStart = new Date(`${subscription.next_billing_date}T12:00:00.000Z`)
        const todayStart = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`)
        const startsOn =
          scheduledStart.getTime() < todayStart.getTime() ? todayStart : scheduledStart
        await updateSubscription(
          { credentials },
          {
            subscriptionId: subscription.processor_subscription_id,
            money: {
              amountMinor: Math.round(Number(subscription.monthly_amount) * 100),
              currency: 'USD',
            },
            interval: 'monthly',
            chargeOn: Math.min(scheduledStart.getUTCDate(), 30),
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

    const bindSubscriptions = supabase
      .from('merchant_subscriptions')
      .update({
        billing_profile_id: stagedProfile.id,
        processor: 'valor',
        processor_account_id: subscriptionProcessorAccount.id,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('merchant_id', merchantId)
      .neq('status', 'canceled')
      .in('id', subscriptions.map((subscription) => subscription.id))
    const { error: bindingError } = subscriptions.length ? await bindSubscriptions : { error: null }
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
