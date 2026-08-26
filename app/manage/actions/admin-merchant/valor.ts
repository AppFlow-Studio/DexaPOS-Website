'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Per-location Valor boarding status for the HQ merchant detail view.
 *
 * A DEXA merchant is one Valor merchant with one store + EPI per location. This
 * reads `merchant_processor_accounts` (processor='valor', purpose='online_order')
 * and reports which locations are provisioned. The encrypted app key is never
 * returned — only whether it is present.
 */
export interface MerchantValorLocationRow {
  locationId: string
  locationName: string
  /** True once the location has an active Valor account with an EPI. */
  boarded: boolean
  valorMerchantId: string | null
  valorStoreId: string | null
  valorEpi: string | null
  /** appid + encrypted appkey both present (runtime credentials exist). */
  hasApiKeys: boolean
  isActive: boolean
  isPrimary: boolean
}

export interface MerchantValorBoardingStatus {
  locations: MerchantValorLocationRow[]
  /** The shared Valor merchant id, if any location has been boarded. */
  valorMerchantId: string | null
  boardedCount: number
}

export async function getMerchantValorBoardingStatus(
  merchantId: string,
): Promise<MerchantValorBoardingStatus> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServiceRoleClient()

  const [{ data: locations, error: locationsError }, { data: accounts, error: accountsError }] =
    await Promise.all([
      supabase
        .from('locations')
        .select('id, name')
        .eq('merchant_id', merchantId)
        .order('name', { ascending: true }),
      supabase
        .from('merchant_processor_accounts')
        .select(
          'location_id, valor_merchant_id, valor_store_id, valor_epi, valor_appid, valor_appkey_encrypted, is_active, is_primary',
        )
        .eq('merchant_id', merchantId)
        .eq('processor', 'valor')
        .eq('purpose', 'online_order'),
    ])

  if (locationsError) {
    console.error('[getMerchantValorBoardingStatus] locations error:', locationsError)
    throw new Error('Failed to load merchant locations.')
  }

  if (accountsError) {
    console.error('[getMerchantValorBoardingStatus] accounts error:', accountsError)
    throw new Error('Failed to load Valor processor accounts.')
  }

  const accountByLocation = new Map(
    (accounts ?? []).map((account: any) => [account.location_id, account]),
  )

  let valorMerchantId: string | null = null

  const rows: MerchantValorLocationRow[] = (locations ?? []).map((location: any) => {
    const account = accountByLocation.get(location.id) ?? null
    if (account?.valor_merchant_id && !valorMerchantId) {
      valorMerchantId = account.valor_merchant_id
    }

    return {
      locationId: location.id,
      locationName: location.name,
      boarded: Boolean(account && account.is_active && account.valor_epi),
      valorMerchantId: account?.valor_merchant_id ?? null,
      valorStoreId: account?.valor_store_id ?? null,
      valorEpi: account?.valor_epi ?? null,
      hasApiKeys: Boolean(account?.valor_appid && account?.valor_appkey_encrypted),
      isActive: Boolean(account?.is_active),
      isPrimary: Boolean(account?.is_primary),
    }
  })

  return {
    locations: rows,
    valorMerchantId,
    boardedCount: rows.filter((row) => row.boarded).length,
  }
}
