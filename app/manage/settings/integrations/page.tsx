import { requireAdminAuth } from '@/lib/admin/auth'
import { getOrderOutPushMenuWebhookStatus } from '@/app/manage/actions/orderout-webhooks'
import {
  getPlatformNmiBillingConfigSummary,
  getPlatformValorSaasBillingConfigSummary,
} from '@/app/manage/actions/platform-billing-config'
import { PageHeader, PageShell } from '@/components/dashboard/shell'
import { OrderOutPushMenuIntegrationCard } from './OrderOutPushMenuIntegrationCard'
import { DexaBillingNmiRailCard } from './DexaBillingNmiRailCard'
import { IntegrationLoadError } from './IntegrationPrimitives'
import {
  DexaSaasBillingValorRailCard,
  SubscriptionRailCutoverCard,
} from './DexaSaasBillingValorRailCard'

export const dynamic = 'force-dynamic'

export default async function IntegrationsPage() {
  const auth = await requireAdminAuth('system.config.manage')
  const canManageConfig = auth.hasPermission('system.config.manage')
  const canRegisterOrderOut = auth.hasPermission('hq.merchant.update')

  const [{ data: status }, billingConfig, valorSaasConfig] = await Promise.all([
    getOrderOutPushMenuWebhookStatus(),
    // These two throw on a failed query. Caught here, a failure costs only its
    // own panel, which says so (§4.9), rather than the whole page.
    getPlatformNmiBillingConfigSummary().catch(() => null),
    getPlatformValorSaasBillingConfigSummary().catch(() => null),
  ])

  return (
    /* `as="div"`: app/manage/layout.tsx already owns this surface's <main> (§14.1).
       `width="narrow"`: a settings/form page (§2 D). One Panel per integration. */
    <PageShell as="div" width="narrow">
      <PageHeader
        title="Integrations"
        subtitle="Platform-wide integrations and payment rails configured by Dexa HQ."
      />

      {valorSaasConfig ? (
        <>
          <DexaSaasBillingValorRailCard config={valorSaasConfig} canEdit={canManageConfig} />

          <SubscriptionRailCutoverCard
            configured={valorSaasConfig.configured}
            canEdit={canManageConfig}
          />
        </>
      ) : (
        <IntegrationLoadError
          label="Central SaaS billing (DEXA POS AI)"
          title="We couldn't load the central SaaS billing configuration"
          detail="The subscription-rail cutover needs it, so it is unavailable until this loads."
        />
      )}

      {billingConfig ? (
        <DexaBillingNmiRailCard config={billingConfig} canEdit={canManageConfig} />
      ) : (
        <IntegrationLoadError
          label="Dexa Billing account"
          title="We couldn't load the Dexa Billing NMI account"
        />
      )}

      <OrderOutPushMenuIntegrationCard
        expectedEndpoint={status?.expectedEndpoint ?? null}
        lastRegisteredAt={status?.lastRegisteredAt ?? null}
        lastRegisteredBy={status?.lastRegisteredBy ?? null}
        /* Unknown is not zero (§4.9): a failed status load reads "—", not "All clear". */
        dlqCount={status ? status.dlqCount : null}
        statusUnavailable={!status}
        canRegister={canRegisterOrderOut}
      />
    </PageShell>
  )
}
