import { requireAdminAuth } from '@/lib/admin/auth'
import { getOrderOutPushMenuWebhookStatus } from '@/app/manage/actions/orderout-webhooks'
import { OrderOutPushMenuIntegrationCard } from './OrderOutPushMenuIntegrationCard'

export const dynamic = 'force-dynamic'

export default async function IntegrationsPage() {
  const auth = await requireAdminAuth('hq.merchant.update')
  const canRegister = auth.hasPermission('hq.merchant.update')

  const { data: status } = await getOrderOutPushMenuWebhookStatus()

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide integrations configured by Dexa HQ.
        </p>
      </div>

      <OrderOutPushMenuIntegrationCard
        expectedEndpoint={status?.expectedEndpoint ?? null}
        lastRegisteredAt={status?.lastRegisteredAt ?? null}
        lastRegisteredBy={status?.lastRegisteredBy ?? null}
        dlqCount={status?.dlqCount ?? 0}
        canRegister={canRegister}
      />
    </div>
  )
}
