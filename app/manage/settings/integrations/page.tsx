import { requireAdminAuth } from '@/lib/admin/auth'
import { getOrderOutPushMenuWebhookStatus } from '@/app/manage/actions/orderout-webhooks'
import {
  getPlatformNmiBillingConfigSummary,
  getPlatformValorSaasBillingConfigSummary,
} from '@/app/manage/actions/platform-billing-config'
import { OrderOutPushMenuIntegrationCard } from './OrderOutPushMenuIntegrationCard'
import { DexaBillingNmiRailCard } from './DexaBillingNmiRailCard'
import { DexaSaasBillingValorRailCard } from './DexaSaasBillingValorRailCard'

export const dynamic = 'force-dynamic'

export default async function IntegrationsPage() {
  const auth = await requireAdminAuth('system.config.manage')
  const canManageConfig = auth.hasPermission('system.config.manage')
  const canRegisterOrderOut = auth.hasPermission('hq.merchant.update')

  const [{ data: status }, billingConfig, valorSaasConfig] = await Promise.all([
    getOrderOutPushMenuWebhookStatus(),
    getPlatformNmiBillingConfigSummary(),
    getPlatformValorSaasBillingConfigSummary(),
  ])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide integrations and payment rails configured by Dexa HQ.
        </p>
      </div>

      <DexaSaasBillingValorRailCard config={valorSaasConfig} canEdit={canManageConfig} />

      <DexaBillingNmiRailCard config={billingConfig} canEdit={canManageConfig} />

      <OrderOutPushMenuIntegrationCard
        expectedEndpoint={status?.expectedEndpoint ?? null}
        lastRegisteredAt={status?.lastRegisteredAt ?? null}
        lastRegisteredBy={status?.lastRegisteredBy ?? null}
        dlqCount={status?.dlqCount ?? 0}
        canRegister={canRegisterOrderOut}
      />
    </div>
  )
}
