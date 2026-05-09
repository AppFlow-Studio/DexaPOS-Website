'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface MerchantNmiAccountRow {
  locationId: string
  locationName: string
  billingProfileId: string | null
  billingMethod: 'ach' | 'card' | null
  vaultReady: boolean
  isVerified: boolean
  cardBrand: string | null
  cardLastFour: string | null
}

export async function getMerchantNmiAccountsSummary(
  merchantId: string,
): Promise<{ locations: MerchantNmiAccountRow[] }> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServiceRoleClient()

  const [{ data: locations, error: locationsError }, { data: billingProfiles, error: billingProfilesError }] =
    await Promise.all([
      supabase
        .from('locations')
        .select('id, name')
        .eq('merchant_id', merchantId)
        .order('name', { ascending: true }),
      supabase
        .from('merchant_billing_profiles')
        .select('id, location_id, billing_method, customer_vault_id, is_verified, card_brand, card_last_four')
        .eq('merchant_id', merchantId)
        .eq('is_active', true)
        .eq('is_primary', true)
        .not('location_id', 'is', null),
    ])

  if (locationsError) {
    console.error('[getMerchantNmiAccountsSummary] locations error:', locationsError)
    throw new Error('Failed to load merchant NMI accounts.')
  }

  if (billingProfilesError) {
    console.error('[getMerchantNmiAccountsSummary] billing profile error:', billingProfilesError)
    throw new Error('Failed to load merchant billing profiles.')
  }

  const billingProfileByLocation = new Map(
    (billingProfiles ?? []).map((profile: any) => [profile.location_id, profile]),
  )

  const rows: MerchantNmiAccountRow[] = (locations ?? []).map((location: any) => {
    const billingProfile = billingProfileByLocation.get(location.id) ?? null

    return {
      locationId: location.id,
      locationName: location.name,
      billingProfileId: billingProfile?.id ?? null,
      billingMethod: billingProfile?.billing_method ?? null,
      vaultReady: Boolean(billingProfile?.customer_vault_id),
      isVerified: Boolean(billingProfile?.is_verified),
      cardBrand: billingProfile?.card_brand ?? null,
      cardLastFour: billingProfile?.card_last_four ?? null,
    }
  })

  return {
    locations: rows,
  }
}
