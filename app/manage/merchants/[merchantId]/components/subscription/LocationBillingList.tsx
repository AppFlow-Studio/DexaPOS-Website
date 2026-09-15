'use client'

import { Cpu, MapPin, Puzzle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  MerchantSubscriptionRecord,
  SubscriptionServiceAssignmentRecord,
} from '@/app/manage/actions/subscription-billing'
import type { MerchantBillingProfileRecord } from '@/app/manage/actions/merchant-billing'
import { InfoHint } from './InfoHint'
import { formatDate, formatMoney, subscriptionStatusVariant } from './helpers'

interface LocationBillingListProps {
  subscriptions: MerchantSubscriptionRecord[]
  assignmentsBySubscription: Record<string, SubscriptionServiceAssignmentRecord[]>
  billingProfilesByLocation: Record<string, MerchantBillingProfileRecord>
}

function AssignmentChips({
  assignments,
  emptyLabel,
}: {
  assignments: SubscriptionServiceAssignmentRecord[]
  emptyLabel: string
}) {
  if (assignments.length === 0) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {assignments.map((assignment) => (
        <Badge key={assignment.id} variant="secondary" className="font-normal">
          {assignment.display_name}
          {assignment.quantity > 1 ? ` ×${assignment.quantity}` : ''}
        </Badge>
      ))}
    </div>
  )
}

/**
 * One card per location that has a subscription — its own billing detail
 * (stations, devices, features, amount, status, card readiness), mirroring the
 * merchant-level overview. Locations are billed on what they use, not a tier.
 */
export function LocationBillingList({
  subscriptions,
  assignmentsBySubscription,
  billingProfilesByLocation,
}: LocationBillingListProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Location billing
          <InfoHint label="Each location has its own subscription billed to its own card — stations plus any devices and features (loyalty, orderout, …) it enables. No tier at the location level." />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {subscriptions.map((subscription) => {
          const assignments = assignmentsBySubscription[subscription.id] ?? []
          const devices = assignments.filter((a) => a.service_category === 'hardware')
          const features = assignments.filter((a) => a.service_category !== 'hardware')
          const cardReady = Boolean(billingProfilesByLocation[subscription.location_id])

          return (
            <div key={subscription.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{subscription.location_name || 'Location'}</span>
                  <Badge variant={subscriptionStatusVariant(subscription.status)} className="capitalize">
                    {subscription.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">
                    {formatMoney(subscription.monthly_amount)}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Next charge {formatDate(subscription.next_billing_date)}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Stations</div>
                  <div className="mt-1 text-sm font-medium">{subscription.station_count}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                    <Cpu className="h-3 w-3" /> Devices
                  </div>
                  <div className="mt-1">
                    <AssignmentChips assignments={devices} emptyLabel="None" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                    <Puzzle className="h-3 w-3" /> Features
                  </div>
                  <div className="mt-1">
                    <AssignmentChips assignments={features} emptyLabel="None" />
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs">
                {cardReady ? (
                  <span className="text-emerald-600">Location card ready</span>
                ) : (
                  <span className="text-amber-600">No location card on file</span>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
