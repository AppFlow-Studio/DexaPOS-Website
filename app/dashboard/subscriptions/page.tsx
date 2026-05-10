import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { MerchantSubscriptionOverviewCard } from '@/components/billing/MerchantSubscriptionOverviewCard'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function MerchantSubscriptionsPage() {
  const { userId, orgId } = await auth()

  if (!userId || !orgId) {
    redirect('/sign-in?redirect=/dashboard/subscriptions')
  }

  const supabase = createServerSupabaseClient()
  const { data: merchant, error } = await supabase
    .from('merchants')
    .select('id, name')
    .eq('clerk_org_id', orgId)
    .single()

  if (error || !merchant) {
    console.error('[MerchantSubscriptionsPage] Failed to resolve merchant from org:', error)
    redirect('/dashboard')
  }

  return <MerchantSubscriptionOverviewCard merchantName={merchant.name} />
}
