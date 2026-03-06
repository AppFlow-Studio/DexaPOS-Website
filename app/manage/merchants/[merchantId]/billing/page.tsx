import { requireAdminAuth } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MerchantBillingSetupCard } from '@/components/billing/MerchantBillingSetupCard'
import { notFound } from 'next/navigation'

interface AdminMerchantBillingPageProps {
  params: Promise<{ merchantId: string }>
}

export default async function AdminMerchantBillingPage({ params }: AdminMerchantBillingPageProps) {
  const { hasPermission } = await requireAdminAuth('hq.merchant.view', {
    redirectToDashboard: true,
    requiredLabel: 'merchants.view',
  })

  const routeParams = await params
  const merchantParam = routeParams.merchantId
  const isClerkOrgId = merchantParam.startsWith('org_')
  const idField = isClerkOrgId ? 'clerk_org_id' : 'id'

  const supabase = createServerSupabaseClient()
  const { data: merchant, error } = await supabase
    .from('merchants')
    .select('id, name, clerk_org_id')
    .eq(idField, merchantParam)
    .single()

  if (error || !merchant) {
    console.error('[AdminMerchantBillingPage] Merchant lookup error:', error)
    notFound()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <MerchantBillingSetupCard
        merchantId={merchant.id}
        merchantName={merchant.name}
        context="admin"
        canEdit={hasPermission('hq.merchant.update')}
      />
    </div>
  )
}
