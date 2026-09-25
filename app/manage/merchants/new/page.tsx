import { PageHeader, PageShell } from '@/components/dashboard/shell'
import { requireAdminAuth } from '@/lib/admin/auth'
import { CreateMerchantWizard } from './wizard'

export default async function NewMerchantPage() {
  await requireAdminAuth('hq.merchant.create', {
    redirectToDashboard: true,
    requiredLabel: 'merchants.create',
  })

  /* A server component rendering the client shell primitives — standard App
     Router usage (§3.3); only strings and nodes cross the boundary.
     `width="narrow"` replaces the hand-rolled `mx-auto max-w-5xl`. */
  return (
    <PageShell as="div" width="narrow">
      <PageHeader
        title="Create New Merchant"        backHref="/manage/merchants"
        backLabel="Back to Merchants"
      />

      <CreateMerchantWizard />
    </PageShell>
  )
}
