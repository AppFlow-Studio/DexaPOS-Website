import { requireAdminAuth } from '@/lib/admin/auth'
import { PageHeader, PageShell } from '@/components/dashboard/shell'
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
    /* `as="div"`: app/manage/layout.tsx already owns this surface's <main> (§14.1). */
    <PageShell as="div">
      <PageHeader
        title="Dead Letter Queue"
        subtitle="Webhook payloads that failed processing. Retry after fixing the root cause (merchant onboarding, menu link, etc) or abandon if stale."
      />
      <DeadLetterQueueTable canMutate={canMutate} />
    </PageShell>
  )
}
