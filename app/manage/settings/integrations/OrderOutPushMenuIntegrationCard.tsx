'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel, PanelSection } from '@/components/dashboard/shell'
import { LoadError } from '@/app/manage/transactions/components/ledger-primitives'
import { platformLabel } from '@/lib/orderout/platform'
import { registerOrderOutPushMenuWebhook } from '@/app/manage/actions/orderout-webhooks'
import { StatusItem, StatusWell, formatTimestamp } from './IntegrationPrimitives'

interface Props {
  expectedEndpoint: string | null
  lastRegisteredAt: string | null
  lastRegisteredBy: string | null
  /** Live push_menu dead-letter entries; null when the count is unknown. */
  dlqCount: number | null
  /** The status load failed: every field above is unknown, not empty. */
  statusUnavailable: boolean
  canRegister: boolean
}

const DELIVERY_SERVICES = ['UBEREATS', 'GRUBHUB', 'DOORDASH']

/**
 * The platform-wide OrderOut push_menu webhook registration.
 *
 * Unprocessed dead-letter entries are the panel's one alarm (§14.3 HQ-2): a
 * red glyph beside the count, with the count and "unprocessed" saying it in
 * words. Everything else is neutral.
 */
export function OrderOutPushMenuIntegrationCard({
  expectedEndpoint,
  lastRegisteredAt,
  lastRegisteredBy,
  dlqCount,
  statusUnavailable,
  canRegister,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleRegister = () => {
    startTransition(async () => {
      try {
        const result = await registerOrderOutPushMenuWebhook()
        if (!result.success) {
          toast.error(result.error ?? 'Failed to register the OrderOut webhook.')
          return
        }
        // The action revalidates this route, so "Last registered" and its
        // author arrive with the refreshed props.
        toast.success('Registered with OrderOut.')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to register the OrderOut webhook.')
      }
    })
  }

  return (
    <Panel>
      <PanelSection
        label="OrderOut menu-push webhook"
        caption="One-time, platform-wide registration. After it, OrderOut sends each merchant menu push's per-platform result back to Dexa."
      >
        <div className="space-y-5">
          {statusUnavailable && (
            <LoadError
              title="We couldn't load the registration status"
              onRetry={() => router.refresh()}
            />
          )}

          <StatusWell className="sm:grid-cols-3">
            <StatusItem
              term="Endpoint"
              className="col-span-2 sm:col-span-3"
              mono={Boolean(expectedEndpoint)}
              value={expectedEndpoint ?? (statusUnavailable ? '—' : 'Not available')}
              note={
                expectedEndpoint || statusUnavailable ? undefined : 'NEXT_PUBLIC_SUPABASE_URL is not set'
              }
            />
            <StatusItem
              term="Delivery services"
              value={DELIVERY_SERVICES.map((service) => platformLabel(service)).join(', ')}
            />
            <StatusItem
              term="Last registered"
              value={formatTimestamp(lastRegisteredAt, statusUnavailable ? '—' : 'Never')}
              note={lastRegisteredAt && lastRegisteredBy ? `by ${lastRegisteredBy}` : undefined}
            />
            <StatusItem
              term="Dead-letter queue"
              value={
                dlqCount === null ? (
                  '—'
                ) : dlqCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400"
                      aria-hidden
                    />
                    {dlqCount} unprocessed
                  </span>
                ) : (
                  'None unprocessed'
                )
              }
              note={
                dlqCount === null ? (
                  statusUnavailable ? undefined : 'Could not load the count'
                ) : dlqCount > 0 ? (
                  <Link href="/manage/dlq" className="underline underline-offset-4 hover:text-foreground">
                    Review in the dead-letter queue
                  </Link>
                ) : (
                  'All clear'
                )
              }
              /* Only "All clear" drops on phones, where "None unprocessed"
                 already says it; the review link and the load failure stay. */
              hideNoteOnMobile={dlqCount === 0}
            />
          </StatusWell>

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p className="min-w-0 flex-1 basis-64 text-xs text-muted-foreground">
              {canRegister ? (
                <>
                  Requires <code className="font-mono">ORDEROUT_API_KEY</code> and{' '}
                  <code className="font-mono">ORDEROUT_WEBHOOK_SECRET</code> in Supabase project
                  secrets.
                </>
              ) : (
                'Registering needs the hq.merchant.update permission.'
              )}
            </p>
            {/* 44px on phones (§13.6); busy is said by the label, not a spinner (§4.10). */}
            <Button
              onClick={handleRegister}
              disabled={isPending || !canRegister}
              className="h-11 w-full sm:h-9 sm:w-auto"
            >
              {isPending ? 'Registering…' : lastRegisteredAt ? 'Re-register' : 'Register with OrderOut'}
            </Button>
          </div>
        </div>
      </PanelSection>
    </Panel>
  )
}
