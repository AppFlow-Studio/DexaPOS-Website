import { Money } from './money'
import { cn } from '@/lib/utils'

interface CompositionBreakdownProps {
  cardSurcharge: number
  refunded: number
  paymentCount: number
}

/**
 * How the gross card surcharge splits into what was kept and what was refunded.
 * Renders the section body only; the host supplies `Panel > PanelSection`.
 *
 * The bar is chart data (UI-DESIGN-SYSTEM §3.5, use 2): the kept share takes the
 * brand series colour and the refunded share a muted one. Each legend swatch
 * names the segment it matches; the gross row is the whole bar, so it has none.
 */
export function CompositionBreakdown({
  cardSurcharge,
  refunded,
  paymentCount,
}: CompositionBreakdownProps) {
  const gross = Math.max(cardSurcharge, 0)

  if (gross === 0 && refunded === 0) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-medium">No card surcharge in this period</p>
        <p className="text-xs text-muted-foreground">
          The split appears once merchants take card payments with a surcharge.
        </p>
      </div>
    )
  }

  const net = Math.max(gross - refunded, 0)
  const refundedPct = gross > 0 ? Math.min((refunded / gross) * 100, 100) : 0
  const collectedPct = 100 - refundedPct

  return (
    <div className="space-y-5">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${collectedPct.toFixed(1)}% kept, ${refundedPct.toFixed(1)}% refunded`}
      >
        <div className="bg-[#0C4FD1] dark:bg-[#6CA0FF]" style={{ width: `${collectedPct}%` }} />
        <div className="bg-muted-foreground/40" style={{ width: `${refundedPct}%` }} />
      </div>
      <dl className="space-y-3 text-sm">
        <CompositionRow
          label="Card surcharge"
          value={cardSurcharge}
          meta={`${paymentCount.toLocaleString()} payment${paymentCount === 1 ? '' : 's'}`}
        />
        <CompositionRow
          label="Less refunds"
          value={-refunded}
          meta={`${refundedPct.toFixed(1)}% of gross`}
          swatchClass="bg-muted-foreground/40"
        />
        <CompositionRow
          label="Net collected"
          value={net}
          meta="After refund credits"
          swatchClass="bg-[#0C4FD1] dark:bg-[#6CA0FF]"
          emphasize
        />
      </dl>
    </div>
  )
}

function CompositionRow({
  label,
  value,
  meta,
  swatchClass,
  emphasize,
}: {
  label: string
  value: number
  meta?: string
  swatchClass?: string
  emphasize?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-2">
        {/* An empty slot keeps the labels aligned when a row has no swatch. */}
        <span className={cn('mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full', swatchClass)} />
        <div className="flex min-w-0 flex-col">
          <dt className={cn('text-foreground', emphasize && 'font-medium')}>{label}</dt>
          {meta && <span className="text-xs text-muted-foreground tabular-nums">{meta}</span>}
        </div>
      </div>
      <dd className={cn(emphasize && 'font-medium')}>
        <Money value={value} />
      </dd>
    </div>
  )
}
