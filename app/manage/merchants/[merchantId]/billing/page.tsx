import { requireAdminAuth } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MerchantBillingSetupCard } from '@/components/billing/MerchantBillingSetupCard'
import { SubscriptionBillingAdminCard } from '@/components/billing/SubscriptionBillingAdminCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ShieldAlert } from 'lucide-react'
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
    .select('id, name, clerk_org_id, locations(id, name)')
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

      {hasPermission('system.billing.manage') ? (
        <SubscriptionBillingAdminCard
          merchantId={merchant.id}
          merchantName={merchant.name}
          locations={(merchant.locations ?? []) as Array<{ id: string; name: string }>}
          canManageBilling
        />
      ) : (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Billing Management Restricted</AlertTitle>
          <AlertDescription>
            You can view the merchant billing method, but subscription billing management requires the
            `system.billing.manage` HQ permission.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
