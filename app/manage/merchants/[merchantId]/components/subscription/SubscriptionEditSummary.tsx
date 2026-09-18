'use client'

import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SubscriptionQuoteResult } from '@/app/manage/actions/subscription-billing'
import { InfoHint } from './InfoHint'
import { formatMoney } from './helpers'

function readString(item: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return fallback
}

function readNumber(item: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return fallback
}

interface SubscriptionEditSummaryProps {
  tierName: string
  tierPriceLabel: string
  locationName: string | null
  quote: SubscriptionQuoteResult | null
  isQuoteLoading: boolean
  cardLabel: string
  nextBillingDateLabel?: string | null
}

/**
 * Sticky live "order summary" for the edit wizard — merchant tier, the selected
 * location's quoted line items, subtotal / surcharge / total, and the card that
 * will be charged. Reads the workspace's debounced `quote` so it updates live.
 */
export function SubscriptionEditSummary({
  tierName,
  tierPriceLabel,
  locationName,
  quote,
  isQuoteLoading,
  cardLabel,
  nextBillingDateLabel,
}: SubscriptionEditSummaryProps) {
  const lineItems = quote?.line_items ?? []

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Summary
          {isQuoteLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* Merchant tier */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Merchant tier</span>
          <span className="text-right font-medium">
            {tierName} · {tierPriceLabel}
          </span>
        </div>

        <div className="border-t pt-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            {locationName ? `Location · ${locationName}` : 'Location'}
          </div>
          {lineItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">No add-ons selected yet.</p>
          ) : (
            <ul className="space-y-1">
              {lineItems.map((item, index) => (
                <li key={index} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {readString(item, ['description', 'label', 'name'], 'Item')}
                  </span>
                  <span className="shrink-0 font-medium">
                    {formatMoney(readNumber(item, ['amount', 'total', 'line_total', 'subtotal']))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Totals */}
        <div className="space-y-1 border-t pt-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatMoney(quote?.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1">
              Card surcharge
              <InfoHint label="Card payments include a processing surcharge. ACH has none." />
            </span>
            <span>{formatMoney(quote?.card_surcharge)}</span>
          </div>
          <div className="flex items-center justify-between pt-1 text-base font-semibold">
            <span>Total</span>
            <span>
              {formatMoney(quote?.total_amount)}
              <span className="text-xs font-normal text-muted-foreground">/mo</span>
            </span>
          </div>
        </div>

        {/* Card + cadence */}
        <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>Charged to</span>
            <span className="text-right font-medium text-foreground">{cardLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Billing</span>
            <span className="text-right">Monthly{nextBillingDateLabel ? ` · next ${nextBillingDateLabel}` : ''}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
