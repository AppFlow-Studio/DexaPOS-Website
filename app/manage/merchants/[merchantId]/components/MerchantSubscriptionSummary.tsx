'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import { subscriptionBillingScope } from '@/supabase/functions/_shared/subscription-billing-scope'
import {
  getMerchantTierStatus,
  getMerchantSubscriptions,
  getSubscriptionInvoices,
} from '@/app/manage/actions/subscription-billing'
import {
  getMerchantBillingProfiles,
  type MerchantBillingProfileRecord,
} from '@/app/manage/actions/merchant-billing'

/**
 * One neutral pill for every billing state (§4.6b). The status word carries
 * the meaning — "Past Due", "Failed" — so the fill does not need to shout it a
 * second time in red. `variant="outline"` supplies the canonical material.
 */
const STATUS_BADGE = 'w-fit shrink-0 px-2.5 text-xs font-medium capitalize'

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return '—'
  // The year only earns its width when it isn't this one.
  const sameYear = value.getFullYear() === new Date().getFullYear()
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function cardOnFileLabel(profiles: MerchantBillingProfileRecord[]): string | null {
  const card =
    profiles.find(
      (p) => p.processor === 'valor' && p.billing_method === 'card' && p.is_primary && p.is_active,
    ) ?? profiles.find((p) => p.billing_method === 'card' && p.card_last_four)

  if (!card || !card.card_last_four) return null

  const brand = card.card_brand || 'Card'
  const exp =
    card.card_exp_month && card.card_exp_year
      ? ` · ${String(card.card_exp_month).padStart(2, '0')}/${String(card.card_exp_year).slice(-2)}`
      : ''
  return `${brand} •••• ${card.card_last_four}${exp}`
}

/**
 * A status pill only when the state needs attention — "Past Due", "Failed".
 * The healthy state is the default reading, so it gets no pill of its own.
 */
function StatusBadge({ status, healthy }: { status: string | null | undefined; healthy: string }) {
  if (!status || status === healthy) return null
  return (
    <Badge variant="outline" className={STATUS_BADGE}>
      {status.replace('_', ' ')}
    </Badge>
  )
}

/**
 * Label on the left, value right-aligned, so every row reads down one edge.
 * A status pill goes on its own line under the value, matching the location
 * rows, so it never competes with the value for width on a phone.
 */
function SummaryRow({
  label,
  badge,
  children,
}: {
  label: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-col items-end gap-1 text-right">
        <span className="max-w-full truncate">{children}</span>
        {badge}
      </span>
    </div>
  )
}

interface MerchantSubscriptionSummaryProps {
  merchantId: string
  /** Link to the full Subscriptions tab. */
  manageHref: string
  /** True when nothing sits above this block in the card (no top spacing). */
  isFirstBlock?: boolean
}

export function MerchantSubscriptionSummary({
  merchantId,
  manageHref,
  isFirstBlock = false,
}: MerchantSubscriptionSummaryProps) {
  const { hasPermission } = useAdminPermissions()
  const canView = hasPermission('system.billing.manage')

  const { data, isLoading } = useQuery({
    queryKey: ['merchant-subscription-summary', merchantId],
    enabled: !!merchantId && canView,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const [tierStatus, subscriptions, invoices, billingProfiles] = await Promise.all([
        getMerchantTierStatus(merchantId),
        getMerchantSubscriptions(merchantId),
        getSubscriptionInvoices(merchantId, null, 10),
        getMerchantBillingProfiles(merchantId),
      ])
      return { tierStatus, subscriptions, invoices, billingProfiles }
    },
  })

  const locationSubscriptions = useMemo(
    () =>
      (data?.subscriptions ?? [])
        .filter(
          (subscription) =>
            subscriptionBillingScope(subscription.metadata) === 'location' &&
            subscription.status !== 'canceled',
        )
        .sort((a, b) => (a.location_name || '').localeCompare(b.location_name || '')),
    [data?.subscriptions],
  )

  const lastInvoice = useMemo(() => {
    const invoices = data?.invoices ?? []
    if (invoices.length === 0) return null
    return [...invoices].sort((a, b) => {
      const aDate = a.paid_at || a.created_at || ''
      const bDate = b.paid_at || b.created_at || ''
      return bDate.localeCompare(aDate)
    })[0]
  }, [data?.invoices])

  const cardLabel = useMemo(
    () => (data?.billingProfiles ? cardOnFileLabel(data.billingProfiles) : null),
    [data?.billingProfiles],
  )

  // Card-on-file and billing amounts stay behind the same permission that gates
  // the Subscriptions tab and every getter above.
  if (!canView) return null

  // Mirrors the loaded block: plan row, card row, last charge, then the
  // location list — so the card keeps its height while loading. Spacing, not
  // a rule, separates it from the checklist above (§5.5).
  if (isLoading) {
    return (
      <div className={cn('space-y-3', !isFirstBlock && 'pt-4')}>
        <p className="text-sm font-medium">Subscription</p>
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-4 w-60" />
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    )
  }

  const tier = data?.tierStatus
  const hasTier = Boolean(tier?.plan)

  return (
    <div className={cn('space-y-3', !isFirstBlock && 'pt-4')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Subscription</p>
        <Button variant="ghost" size="sm" className="-mr-2 h-7" asChild>
          <Link href={manageHref}>
            Manage
            <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <SummaryRow
        label="Plan"
        badge={<StatusBadge status={tier?.subscription_status} healthy="active" />}
      >
        <span className="font-medium">{tier?.plan?.name ?? 'No plan'}</span>
      </SummaryRow>

      <SummaryRow label="Card">
        {cardLabel ? (
          <span className="font-medium tabular-nums">{cardLabel}</span>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </SummaryRow>

      <SummaryRow
        label="Last charge"
        badge={lastInvoice && <StatusBadge status={lastInvoice.status} healthy="paid" />}
      >
        {lastInvoice ? (
          <span className="tabular-nums">
            <span className="font-medium">{formatMoney(Number(lastInvoice.total_amount))}</span>
            <span className="text-muted-foreground"> · {formatDate(lastInvoice.paid_at || lastInvoice.created_at)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">None yet</span>
        )}
      </SummaryRow>

      {/* Location-level subscriptions */}
      <div className="space-y-1.5 pt-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Locations</p>
        {locationSubscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {hasTier ? 'No location add-ons.' : 'No subscription configured.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {locationSubscriptions.map((subscription) => (
              // The status pill sits under the name rather than beside it, so a
              // problem row doesn't truncate the location name on a phone.
              <li key={subscription.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="flex min-w-0 flex-col items-start gap-1">
                  <span className="max-w-full truncate">{subscription.location_name || 'Location'}</span>
                  <StatusBadge status={subscription.status} healthy="active" />
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatMoney(Number(subscription.monthly_amount))}/mo
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
