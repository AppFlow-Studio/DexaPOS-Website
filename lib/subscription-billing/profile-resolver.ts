import 'server-only'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SubscriptionBillingScope } from '@/supabase/functions/_shared/subscription-billing-scope'

export async function resolveSubscriptionBillingProfile(params: {
  merchantId: string
  locationId?: string | null
  scope: SubscriptionBillingScope
  profileId?: string | null
}) {
  // Regenerate Supabase types after the scope migration is deployed.
  const db = createServiceRoleClient()
  const { data, error } = await (db as any).rpc('resolve_subscription_billing_profile', {
    p_merchant_id: params.merchantId,
    p_location_id: params.locationId ?? null,
    p_scope: params.scope,
    p_profile_id: params.profileId ?? null,
  })
  if (error || !data) {
    return { profile: null, error: error?.code === 'PGRST202'
      ? 'Subscription billing scope migration is required before saving.'
      : error?.message || 'Save an active primary Valor card for this billing scope first.' }
  }
  const result = await db.from('merchant_billing_profiles')
    .select('id, location_id, created_at')
    .eq('id', data as string)
    .eq('merchant_id', params.merchantId)
    .single()
  return { profile: result.data, error: result.error?.message ?? null }
}
