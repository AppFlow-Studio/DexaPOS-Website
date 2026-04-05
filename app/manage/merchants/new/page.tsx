import { requireAdminAuth } from '@/lib/admin/auth'
import { CreateMerchantWizard } from './wizard'

export default async function NewMerchantPage() {
  await requireAdminAuth('hq.merchant.create', {
    redirectToDashboard: true,
    requiredLabel: 'merchants.create',
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create New Merchant</h1>
        <p className="text-muted-foreground">
          Onboarding flow for business profile and owner contact.
        </p>
      </div>

      <CreateMerchantWizard />
    </div>
  )
}
