import 'server-only'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { ValorRequestOptions } from '@/lib/payments/valor/client'
import type { ValorMerchantCredentials } from '@/lib/payments/valor/config'
import {
  getPaymentProfiles,
  type ValorPaymentProfile,
} from '@/lib/payments/valor/customerProfileApi'
import { normalizeBillingCardBrand, readCardLastFour } from './card-display'

// Display metadata (brand, last four, expiry) for a card held in the Valor
// vault. Everything here is best-effort: a card that saved without it is still
// a working card, so nothing in this module throws.

export interface VaultCardMeta {
  lastFour: string | null
  expMonth: number | null
  expYear: number | null
  brand: string | null
}

// A display lookup must not hold a card save or a page load for Valor's full
// request timeout.
const CARD_META_TIMEOUT_MS = 5_000

/**
 * Pull non-sensitive card metadata (last four, expiry, brand) out of a Valor
 * response. The vault endpoints are loosely documented, so every plausible
 * key is probed and anything missing is left null. Raw PANs never reach here
 * (Passage tokenizes client-side); a "masked_pan" style value only exposes the
 * last four.
 *
 * `card_type` is deliberately not read as a brand: on Valor it is "C" / "D"
 * (credit / debit), and the network is `card_brand` (`card_scheme` on the
 * webhook).
 */
export function extractVaultCardMeta(raw: unknown): VaultCardMeta {
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
  const lastFour = readCardLastFour(
    str([
      'card_last_four', 'last_four', 'last4', 'card_last4', 'cardLastFour',
      'masked_pan', 'maskedPan', 'pan', 'masked_card_no',
      'masked_card_number', 'maskedCardNumber', 'card_number', 'cardNumber', 'masked_card', 'maskedCard',
    ]),
  )

  // Expiry — either split month/year fields, or a combined MMYY / MM/YY / MMYYYY.
  let expMonth: number | null = null
  let expYear: number | null = null
  const monthRaw = str(['card_exp_month', 'exp_month', 'expiry_month', 'expMonth', 'expiration_month'])
  const yearRaw = str(['card_exp_year', 'exp_year', 'expiry_year', 'expYear', 'expiration_year'])
  if (monthRaw && yearRaw) {
    expMonth = Number(monthRaw) || null
    expYear = Number(yearRaw) || null
  } else {
    const combined = (str(['exp_date', 'expiry', 'card_exp', 'expiration', 'exp', 'expdate']) ?? '').replace(/\D/g, '')
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

  const brand = normalizeBillingCardBrand(
    str(['card_brand', 'cardBrand', 'card_scheme', 'brand', 'scheme']),
  )

  return { lastFour, expMonth, expYear, brand }
}

function pickPaymentProfile(
  profiles: ValorPaymentProfile[],
  paymentProfileId: string | null,
): ValorPaymentProfile | null {
  if (paymentProfileId) {
    return profiles.find((profile) => profile.paymentId === paymentProfileId) ?? null
  }
  // No id to match on: only a customer holding exactly one card is unambiguous.
  return profiles.length === 1 ? profiles[0] : null
}

/**
 * Resolve brand + last four for a vaulted card: first from responses already in
 * hand (attach, sale), then from Valor's Get Payment Profile matched on
 * `payment_id`. Valor does not return an expiry there, so expiry is only ever
 * what a supplied response carried.
 *
 * Never throws — a failed lookup returns whatever was found before it.
 */
export async function resolveVaultCardMeta(
  options: ValorRequestOptions,
  params: {
    vaultCustomerId: string | null
    paymentProfileId: string | null
    responses?: unknown[]
  },
): Promise<VaultCardMeta> {
  const meta: VaultCardMeta = { lastFour: null, expMonth: null, expYear: null, brand: null }

  for (const response of params.responses ?? []) {
    const found = extractVaultCardMeta(response)
    meta.lastFour = meta.lastFour ?? found.lastFour
    meta.brand = meta.brand ?? found.brand
    if (meta.expMonth === null && found.expMonth !== null && found.expYear !== null) {
      meta.expMonth = found.expMonth
      meta.expYear = found.expYear
    }
  }

  if ((meta.lastFour && meta.brand) || !params.vaultCustomerId) return meta

  try {
    const profiles = await getPaymentProfiles(
      { timeoutMs: CARD_META_TIMEOUT_MS, ...options },
      params.vaultCustomerId,
    )
    const profile = pickPaymentProfile(profiles, params.paymentProfileId)
    if (profile) {
      meta.lastFour = meta.lastFour ?? readCardLastFour(profile.maskedPan)
      meta.brand = meta.brand ?? normalizeBillingCardBrand(profile.cardBrand)
    }
  } catch (error) {
    console.error(
      '[resolveVaultCardMeta] Valor lookup failed (continuing):',
      error instanceof Error ? error.message : error,
    )
  }

  return meta
}

interface BillingProfileVaultRow {
  id: string
  card_brand: string | null
  customer_vault_id: string
  payment_profile_id: string | null
  processor_account_id: string
  vaulted_under_epi: string | null
}

async function loadValorCredentials(
  db: ReturnType<typeof createServiceRoleClient>,
  accountId: string,
): Promise<ValorMerchantCredentials | null> {
  const { data, error } = await (db as any).rpc('get_valor_account_credentials', {
    p_account_id: accountId,
  })
  if (error) return null

  const row = Array.isArray(data) ? data[0] : data
  const appId = row?.valor_appid?.trim()
  const appKey = row?.decrypted_appkey?.trim()
  const epi = row?.valor_epi?.trim()
  return appId && appKey && epi ? { appId, appKey, epi } : null
}

async function healProfile(
  db: ReturnType<typeof createServiceRoleClient>,
  profile: BillingProfileVaultRow,
  requestOptions: Pick<ValorRequestOptions, 'endpoints' | 'fetchImpl'>,
): Promise<{ card_brand: string | null; card_last_four: string } | null> {
  const credentials = await loadValorCredentials(db, profile.processor_account_id)
  if (!credentials) return null
  // A card vaulted under another EPI sits in a vault these credentials cannot read.
  if (profile.vaulted_under_epi && profile.vaulted_under_epi !== credentials.epi) return null

  const meta = await resolveVaultCardMeta(
    { credentials, ...requestOptions },
    {
      vaultCustomerId: profile.customer_vault_id,
      paymentProfileId: profile.payment_profile_id,
    },
  )
  if (!meta.lastFour) return null

  const healed = {
    card_brand: meta.brand ?? normalizeBillingCardBrand(profile.card_brand),
    card_last_four: meta.lastFour,
  }
  const { error } = await db
    .from('merchant_billing_profiles')
    .update({ ...healed, updated_at: new Date().toISOString() })
    .eq('id', profile.id)
  if (error) {
    // The values are still right for this response; the next listing retries the write.
    console.error('[healBillingProfileCardMeta] Update failed (continuing):', error.message)
  }
  return healed
}

/**
 * Backfill display metadata on billing cards that were saved without it.
 *
 * Cards vaulted before brand/last-four capture have no `card_last_four`. When
 * a listing contains one, its details are read from Valor, written back, and
 * returned in place, so a row is only looked up until it heals.
 *
 * Callers pass rows they were already permitted to read; only those ids are
 * touched. Any failure returns the rows exactly as given.
 */
export async function healBillingProfileCardMeta<
  T extends {
    id: string
    billing_method?: string | null
    card_brand: string | null
    card_last_four: string | null
  },
>(
  rows: T[],
  requestOptions: Pick<ValorRequestOptions, 'endpoints' | 'fetchImpl'> = {},
): Promise<T[]> {
  const candidateIds = rows
    .filter((row) => row.billing_method === 'card' && !readCardLastFour(row.card_last_four))
    .map((row) => row.id)
  if (candidateIds.length === 0) return rows

  try {
    const db = createServiceRoleClient()
    const { data, error } = await db
      .from('merchant_billing_profiles')
      .select('id, card_brand, customer_vault_id, payment_profile_id, processor_account_id, vaulted_under_epi')
      .in('id', candidateIds)
      .eq('processor', 'valor')
      .eq('billing_method', 'card')
      .not('customer_vault_id', 'is', null)
      .not('processor_account_id', 'is', null)
    if (error) throw new Error(error.message)

    const healedById = new Map<string, { card_brand: string | null; card_last_four: string }>()
    await Promise.all(
      ((data ?? []) as BillingProfileVaultRow[]).map(async (profile) => {
        try {
          const healed = await healProfile(db, profile, requestOptions)
          if (healed) healedById.set(profile.id, healed)
        } catch (error) {
          console.error(
            '[healBillingProfileCardMeta] Profile skipped (continuing):',
            error instanceof Error ? error.message : error,
          )
        }
      }),
    )

    return rows.map((row) => {
      const healed = healedById.get(row.id)
      return healed ? { ...row, ...healed } : row
    })
  } catch (error) {
    console.error(
      '[healBillingProfileCardMeta] Skipped (continuing):',
      error instanceof Error ? error.message : error,
    )
    return rows
  }
}
