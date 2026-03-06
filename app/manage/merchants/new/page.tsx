import { requireAdminAuth } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateMerchantWizard } from './wizard'

interface CarrierOption {
  id: string
  name: string
}

export default async function NewMerchantPage() {
  await requireAdminAuth('hq.merchant.create', {
    redirectToDashboard: true,
    requiredLabel: 'merchants.create',
  })

  const supabase = createServerSupabaseClient()
  const { data: carriers, error } = await supabase
    .from('carriers')
    .select('id, name')
    .order('name', { ascending: true })

  if (error) {
    console.error('[NewMerchantPage] Failed to load carriers:', error)
  }

  const carrierOptions: CarrierOption[] = (carriers || []).map((carrier) => ({
    id: carrier.id,
    name: carrier.name,
  }))

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create New Merchant</h1>
        <p className="text-muted-foreground">
          Lightweight onboarding flow for business profile, owner contact, and carrier assignment.
        </p>
      </div>

      <CreateMerchantWizard carriers={carrierOptions} />
    </div>
  )
}
