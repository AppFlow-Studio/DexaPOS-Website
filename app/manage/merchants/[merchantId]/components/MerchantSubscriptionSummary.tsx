'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CreditCard } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
 * One neutral badge for every billing state (D-03). The status word carries
 * the meaning — "Past Due", "Failed" — so the fill does not need to shout it a
 * second time in red. The per-status `variant` maps this replaced were the
 * source of the solid red/blue pills in the status card.
 */
const STATUS_BADGE = 'w-fit shrink-0 rounded-full border-0 px-2.5 text-xs font-medium capitalize'

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return '—'
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

interface MerchantSubscriptionSummaryProps {
  merchantId: string
}

export function MerchantSubscriptionSummary({ merchantId }: MerchantSubscriptionSummaryProps) {
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

  // Mirrors the loaded block: tier row, card-on-file row, last charge, then
  // the location list — so the card keeps its height while loading.
  if (isLoading) {
    return (
      <div className="space-y-3 border-t pt-3">
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
    <div className="space-y-3 border-t pt-3">
      <p className="text-sm font-medium">Subscription</p>

      {/* Merchant tier + status */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Tier</span>
        <span className="font-medium">{tier?.plan?.name ?? 'No tier'}</span>
        {tier?.subscription_status && (
          <Badge variant="secondary" className={STATUS_BADGE}>
            {tier.subscription_status.replace('_', ' ')}
          </Badge>
        )}
      </div>

      {/* Card on file */}
      <div className="flex items-center gap-2 text-sm">
        <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">Card on file</span>
        <span className="font-medium">{cardLabel ?? 'No card on file'}</span>
      </div>

      {/* Last charge */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Last charge</span>
        {lastInvoice ? (
          <>
            <span className="font-medium">{formatMoney(Number(lastInvoice.total_amount))}</span>
            <span className="text-muted-foreground">· {formatDate(lastInvoice.paid_at || lastInvoice.created_at)}</span>
            <Badge variant="secondary" className={STATUS_BADGE}>
              {lastInvoice.status}
            </Badge>
          </>
        ) : (
          <span className="font-medium">No charges yet</span>
        )}
      </div>

      {/* Location-level subscriptions */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Locations</p>
        {locationSubscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {hasTier ? 'No location add-ons.' : 'No subscription configured.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {locationSubscriptions.map((subscription) => (
              <li key={subscription.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{subscription.location_name || 'Location'}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary" className={STATUS_BADGE}>
                    {subscription.status.replace('_', ' ')}
                  </Badge>
                  <span className="font-medium">{formatMoney(Number(subscription.monthly_amount))}/mo</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
