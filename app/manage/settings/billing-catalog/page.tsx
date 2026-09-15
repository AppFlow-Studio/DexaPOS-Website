import { requireAdminAuth } from '@/lib/admin/auth'
import { SubscriptionCatalogAdmin } from '@/components/billing/SubscriptionCatalogAdmin'

export const dynamic = 'force-dynamic'

export default async function BillingCatalogPage() {
  await requireAdminAuth('system.billing.manage')

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Billing Catalog</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide subscription pricing configured by Dexa HQ — plan/station pricing, billable services and
          add-ons, and device-to-service mappings. Applies to every merchant; existing invoices are unaffected.
        </p>
      </div>

      <SubscriptionCatalogAdmin />
    </div>
  )
}
