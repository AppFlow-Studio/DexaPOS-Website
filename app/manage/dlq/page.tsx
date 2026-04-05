import { requireAdminAuth } from '@/lib/admin/auth'
import { DeadLetterQueueTable } from './DeadLetterQueueTable'

export const dynamic = 'force-dynamic'

// HQ Dead Letter Queue viewer — shows failed webhook deliveries (currently
// just OrderOut order + push_menu events) and lets admins retry, resolve, or
// abandon them.
export default async function DeadLetterQueuePage() {
  const auth = await requireAdminAuth('hq.merchant.update', {
    redirectToDashboard: true,
    requiredLabel: 'hq.merchant.update',
  })

  const canMutate = auth.hasPermission('hq.merchant.update')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dead Letter Queue</h1>
        <p className="text-muted-foreground">
          Webhook payloads that failed processing. Retry after fixing the root
          cause (merchant onboarding, menu link, etc) or abandon if stale.
        </p>
      </div>
      <DeadLetterQueueTable canMutate={canMutate} />
    </div>
  )
}
