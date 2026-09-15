'use client'

import { CreditCard, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  MerchantTierStatusRecord,
  MerchantTierSubscriptionRecord,
} from '@/app/manage/actions/subscription-billing'
import type { MerchantBillingProfileRecord } from '@/app/manage/actions/merchant-billing'
import { InfoHint } from './InfoHint'
import {
  buildPaymentMethodLabel,
  formatDate,
  formatTierPrice,
  tierStatusVariant,
} from './helpers'

interface MerchantBillingSectionProps {
  tierStatus: MerchantTierStatusRecord
  tierSubscription: MerchantTierSubscriptionRecord | null
  cardProfile: MerchantBillingProfileRecord | null
}

/**
 * Merchant-wide billing overview: the auto tier (chosen by active-location
 * count) with its price + coverage + status, the billing card on file, and the
 * merchant-level unlocks block (e.g. Fine Dining) that layers on top of the tier.
 */
export function MerchantBillingSection({
  tierStatus,
  tierSubscription,
  cardProfile,
}: MerchantBillingSectionProps) {
  const tierName = tierSubscription?.display_name || tierStatus.plan?.name || 'No tier assigned'
  const priceCents = tierSubscription?.monthly_price_cents ?? tierStatus.plan?.monthly_price_cents ?? 0
  const status = tierStatus.subscription_status ?? tierSubscription?.status ?? null
  const periodEnd = tierStatus.current_period_end ?? tierSubscription?.current_period_end ?? null
  const maxLocations = tierStatus.plan?.max_locations ?? null
  const coverage =
    maxLocations === null
      ? `${tierStatus.active_location_count} locations`
      : `${tierStatus.active_location_count} of ${maxLocations} locations`

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Merchant subscription
          <InfoHint label="One merchant tier is billed to the merchant's card. The tier is selected automatically by how many active locations the merchant runs." />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tier + price */}
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-muted/40 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{tierName}</span>
              {status && (
                <Badge variant={tierStatusVariant(status)} className="capitalize">
                  {status.replace('_', ' ')}
                </Badge>
              )}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {coverage}
              {tierStatus.is_over_limit && (
                <span className="ml-2 font-medium text-destructive">Over limit</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-2xl font-semibold">
              {formatTierPrice(priceCents)}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </div>
            {periodEnd && (
              <div className="text-xs text-muted-foreground">Renews {formatDate(periodEnd)}</div>
            )}
          </div>
        </div>

        {/* Card on file */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              Billing card on file
              <InfoHint label="The card charged for the merchant tier subscription. Each location's stations, devices, and features are billed to that location's own card." />
            </div>
            <div className="mt-1 font-medium">{buildPaymentMethodLabel(cardProfile)}</div>
            {cardProfile?.billing_email && (
              <div className="mt-1 text-xs text-muted-foreground">{cardProfile.billing_email}</div>
            )}
          </div>

          {/* Merchant-level unlocks */}
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              Merchant unlocks
              <InfoHint label="Merchant-wide feature unlocks that add to the tier (e.g. Fine Dining: table mapping, reservations, tableside). A merchant can run many locations and still be Quick Service." />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Quick Service (default)</Badge>
              <Badge variant="outline" className="text-muted-foreground">
                Fine Dining — not enabled
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Billing wiring pending — unlocks are display-only for now.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
