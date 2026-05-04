import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Money } from './money'
import { cn } from '@/lib/utils'

interface CompositionCardProps {
  cardSurcharge: number
  refunded: number
  paymentCount: number
}

export function CompositionCard({
  cardSurcharge,
  refunded,
  paymentCount,
}: CompositionCardProps) {
  const gross = Math.max(cardSurcharge, 0)
  const net = Math.max(gross - refunded, 0)
  const refundedPct = gross > 0 ? Math.min((refunded / gross) * 100, 100) : 0
  const collectedPct = 100 - refundedPct
  const grossPctOfNet = gross > 0 ? 100 : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Composition</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-2 w-full overflow-hidden rounded bg-muted">
          <div
            className="bg-primary"
            style={{ width: `${collectedPct}%` }}
            aria-label={`Net ${collectedPct.toFixed(1)}%`}
          />
          <div
            className="bg-destructive/70"
            style={{ width: `${refundedPct}%` }}
            aria-label={`Refunded ${refundedPct.toFixed(1)}%`}
          />
        </div>
        <dl className="space-y-3 text-sm">
          <CompositionRow
            label="Card surcharge"
            value={cardSurcharge}
            meta={`${grossPctOfNet ? '100' : '0'}% of gross · ${paymentCount} payment${paymentCount === 1 ? '' : 's'}`}
            dotClass="bg-primary"
          />
          <CompositionRow
            label="Less refunds"
            value={-refunded}
            meta={`${refundedPct.toFixed(1)}% of gross`}
            dotClass="bg-destructive/70"
            negative
          />
          <CompositionRow
            label="Net collected"
            value={net}
            meta="After refund credits"
            dotClass="bg-foreground"
            emphasize
          />
        </dl>
      </CardContent>
    </Card>
  )
}

function CompositionRow({
  label,
  value,
  meta,
  dotClass,
  negative,
  emphasize,
}: {
  label: string
  value: number
  meta?: string
  dotClass: string
  negative?: boolean
  emphasize?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-2">
        <span className={cn('mt-1.5 inline-block h-2 w-2 rounded-full', dotClass)} />
        <div className="flex flex-col">
          <dt className={cn('text-foreground', emphasize && 'font-semibold')}>{label}</dt>
          {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
        </div>
      </div>
      <dd className={cn(emphasize && 'font-semibold', negative && 'text-destructive')}>
        <Money value={value} zeroAsDash={!emphasize} />
      </dd>
    </div>
  )
}
