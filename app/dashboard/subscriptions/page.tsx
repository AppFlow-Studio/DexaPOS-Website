import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import {
  MerchantSubscriptionOverviewCard,
  type SubscriptionSection,
} from '@/components/billing/MerchantSubscriptionOverviewCard'
import { getEffectiveMerchantContext } from '@/lib/admin/merchant-context'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Narrows `?section=` to a real section, so a stale or hand-edited link lands
 * on the default rather than an empty page.
 *
 * This lives here, not in the card. Every export of a `'use client'` module is
 * a client reference — calling one from a server component throws
 * "Attempted to call X() from the server but X is on the client".
 */
const SECTIONS: SubscriptionSection[] = ['overview', 'locations', 'billing']

function parseSection(value: string | undefined): SubscriptionSection {
  return SECTIONS.includes(value as SubscriptionSection)
    ? (value as SubscriptionSection)
    : 'overview'
}

export default async function MerchantSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>
}) {
  const { userId } = await auth()
  const { section } = await searchParams

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

  return (
    <MerchantSubscriptionOverviewCard
      merchantName={merchant.name}
      initialSection={parseSection(section)}
    />
  )
}
