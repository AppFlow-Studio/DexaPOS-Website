import { requireAdminAuth } from '@/lib/admin/auth'
import { getPlatformNmiBillingConfigSummary } from '@/app/manage/actions/platform-billing-config'
import { DexaBillingNmiRailCard } from '@/app/manage/settings/integrations/DexaBillingNmiRailCard'
import { IntegrationLoadError } from '@/app/manage/settings/integrations/IntegrationPrimitives'
import { PageHeader, PageShell } from '@/components/dashboard/shell'

export const dynamic = 'force-dynamic'

export default async function NmiIntegrationPage() {
  const auth = await requireAdminAuth('system.config.manage')
  const canManageConfig = auth.hasPermission('system.config.manage')
  // Throws on a failed query; caught so the panel says so (§4.9) instead of
  // the root error screen replacing the page.
  const billingConfig = await getPlatformNmiBillingConfigSummary().catch(() => null)

  return (
    /* `as="div"`: app/manage/layout.tsx already owns this surface's <main> (§14.1).
       `width="narrow"`: a settings/form page (§2 D). */
    <PageShell as="div" width="narrow">
      <PageHeader
        title="NMI Integration"
        subtitle="Configure the Dexa-owned NMI merchant account used for subscription billing and vault-backed merchant billing cards."
      />

      {billingConfig ? (
        <DexaBillingNmiRailCard config={billingConfig} canEdit={canManageConfig} />
      ) : (
        <IntegrationLoadError
          label="Dexa Billing account"
          title="We couldn't load the Dexa Billing NMI account"
        />
      )}
    </PageShell>
  )
}
