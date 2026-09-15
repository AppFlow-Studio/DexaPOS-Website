'use server'

import { revalidatePath } from 'next/cache'
import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function listSubscriptionCutoverReviews(merchantId: string) {
  await assertHQPermission('system.billing.manage')
  const db = createServerSupabaseClient()
  const { data, error } = await db.from('merchant_subscriptions')
    .select('id, location_id, metadata, locations(name), subscription_plans(display_name)')
    .eq('merchant_id', merchantId)
    .contains('metadata', { billing_setup_required: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error('Could not load migrated billing reviews.')
  return (data ?? []).map(row => {
    const location = Array.isArray(row.locations) ? row.locations[0] : row.locations
    const plan = Array.isArray(row.subscription_plans) ? row.subscription_plans[0] : row.subscription_plans
    return {
      id: row.id,
      locationId: row.location_id,
      locationName: location?.name ?? 'Location',
      planName: plan?.display_name ?? 'Subscription',
      scope: (row.metadata as Record<string, unknown> | null)?.billing_scope === 'merchant_tier'
        ? 'merchant_tier' as const : 'location' as const,
    }
  })
}

export async function prepareSubscriptionCutover(params: {
  subscriptionId: string
  startDate: string
  externalBillingReviewed: boolean
}) {
  await assertHQPermission('system.billing.manage')
  if (!params.externalBillingReviewed || !/^\d{4}-\d{2}-\d{2}$/.test(params.startDate)) {
    return { success: false, error: 'Choose a billing date and confirm the reconciliation first.' }
  }
  // Uses the signed-in HQ session so the database audit retains the reviewer.
  // Replace this temporary cast after generating types from the deployed migration.
  const db = createServerSupabaseClient()
  const { error } = await (db as any).rpc('prepare_migrated_subscription', {
    p_subscription_id: params.subscriptionId,
    p_start_date: params.startDate,
    p_external_billing_reviewed: params.externalBillingReviewed,
  })
  if (error) return { success: false, error: error.code === 'PGRST202'
    ? 'Apply the billing scope migration before preparing billing.' : error.message as string }
  revalidatePath('/manage/subscriptions', 'layout')
  revalidatePath('/dashboard/subscriptions')
  return { success: true }
}
