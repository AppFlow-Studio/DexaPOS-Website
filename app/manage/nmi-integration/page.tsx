import { requireAdminAuth } from '@/lib/admin/auth'
import { getPlatformNmiBillingConfigSummary } from '@/app/manage/actions/platform-billing-config'
import { DexaBillingNmiRailCard } from '@/app/manage/settings/integrations/DexaBillingNmiRailCard'
import { PageHeader, PageShell } from '@/components/dashboard/shell'

export const dynamic = 'force-dynamic'

export default async function NmiIntegrationPage() {
  const auth = await requireAdminAuth('system.config.manage')
  const canManageConfig = auth.hasPermission('system.config.manage')
  const billingConfig = await getPlatformNmiBillingConfigSummary()

  return (
    /* `as="div"`: app/manage/layout.tsx already owns this surface's <main> (§14.1).
       `width="narrow"`: a settings/form page (§2 D). */
    <PageShell as="div" width="narrow">
      <PageHeader
        title="NMI Integration"
        subtitle="Configure the Dexa-owned NMI merchant account used for subscription billing and vault-backed merchant billing cards."
      />

      <DexaBillingNmiRailCard config={billingConfig} canEdit={canManageConfig} />
    </PageShell>
  )
}
