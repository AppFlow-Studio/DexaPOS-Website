import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { MerchantSubscriptionOverviewCard } from '@/components/billing/MerchantSubscriptionOverviewCard'
import { getEffectiveMerchantContext } from '@/lib/admin/merchant-context'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function MerchantSubscriptionsPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in?redirect=/dashboard/subscriptions')
  }

  const merchantContext = await getEffectiveMerchantContext(null)
  const supabase = createServerSupabaseClient()
  const { data: merchant, error } = await supabase
    .from('merchants')
    .select('id, name')
    .eq('id', merchantContext.merchantId)
    .single()

  if (error || !merchant) {
    console.error('[MerchantSubscriptionsPage] Failed to resolve merchant from org:', error)
    redirect('/dashboard')
  }

  return <MerchantSubscriptionOverviewCard merchantName={merchant.name} />
}
