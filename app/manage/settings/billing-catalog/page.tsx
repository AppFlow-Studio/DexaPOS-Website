import { requireAdminAuth } from '@/lib/admin/auth'
import { PageHeader, PageShell } from '@/components/dashboard/shell'
import { SubscriptionCatalogAdmin } from '@/components/billing/SubscriptionCatalogAdmin'

export const dynamic = 'force-dynamic'

export default async function BillingCatalogPage() {
  await requireAdminAuth('system.billing.manage')

  return (
    // `as="div"`: the manage layout already renders the route's <main> (§14.1).
    <PageShell as="div">
      <PageHeader
        title="Billing Catalog"
        subtitle="Platform-wide subscription pricing for every merchant: the station plan, billable services and add-ons, and which service each device bills as."
      />
      <SubscriptionCatalogAdmin />
    </PageShell>
  )
}
