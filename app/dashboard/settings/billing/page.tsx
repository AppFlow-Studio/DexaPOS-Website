import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { MerchantBillingSetupCard } from '@/components/billing/MerchantBillingSetupCard'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function MerchantBillingSettingsPage() {
  const { userId, orgId } = await auth()

  if (!userId || !orgId) {
    redirect('/sign-in?redirect=/dashboard/settings/billing')
  }

  const supabase = createServerSupabaseClient()
  const { data: merchant, error } = await supabase
    .from('merchants')
    .select('id, name, clerk_org_id, locations(id, name)')
    .eq('clerk_org_id', orgId)
    .single()

  if (error || !merchant) {
    console.error('[MerchantBillingSettingsPage] Failed to resolve merchant from org:', error)
    redirect('/dashboard')
  }

  return (
    <MerchantBillingSetupCard
      merchantId={merchant.id}
      merchantName={merchant.name}
      context="merchant"
      canEdit
      locations={(merchant.locations ?? []) as Array<{ id: string; name: string }>}
    />
  )
}
