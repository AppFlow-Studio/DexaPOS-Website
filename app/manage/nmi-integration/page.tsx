import { requireAdminAuth } from '@/lib/admin/auth'
import { getPlatformNmiBillingConfigSummary } from '@/app/manage/actions/platform-billing-config'
import { DexaBillingNmiRailCard } from '@/app/manage/settings/integrations/DexaBillingNmiRailCard'

export const dynamic = 'force-dynamic'

export default async function NmiIntegrationPage() {
  const auth = await requireAdminAuth('system.config.manage')
  const canManageConfig = auth.hasPermission('system.config.manage')
  const billingConfig = await getPlatformNmiBillingConfigSummary()

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">NMI Integration</h1>
        <p className="text-sm text-muted-foreground">
          Configure the Dexa-owned NMI merchant account used for subscription billing and vault-backed merchant billing cards.
        </p>
      </div>

      <DexaBillingNmiRailCard config={billingConfig} canEdit={canManageConfig} />
    </div>
  )
}
