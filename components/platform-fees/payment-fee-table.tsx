'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Money } from './money'
import { CardBrandPill } from './card-brand-pill'
import { PaymentStatusBadge } from './status-badge'
import { useMerchantPayments } from '@/app/manage/hooks/usePlatformFees'
import type { GetMerchantPaymentsParams } from '@/app/manage/actions/hq-platform/platform-fees'

type StatusFilter = NonNullable<GetMerchantPaymentsParams['status']>

const filters: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'collected', label: 'Collected' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'disputed', label: 'Disputed' },
]

const PAGE_SIZE = 25

export function PaymentFeeTable({
  merchantId,
  from,
  to,
}: {
  merchantId: string
  from: string
  to: string
}) {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [offset, setOffset] = useState(0)

  const { data, isLoading } = useMerchantPayments(merchantId, {
    from,
    to,
    status,
    limit: PAGE_SIZE,
    offset,
  })

  const rows = data?.rows ?? []
  const total = data?.totalCount ?? 0
  const showingFrom = total === 0 ? 0 : offset + 1
  const showingTo = Math.min(offset + rows.length, total)

  function setFilter(next: StatusFilter) {
    setStatus(next)
    setOffset(0)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => {
          const active = status === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                active
                  ? 'bg-foreground text-background ring-foreground'
                  : 'bg-background text-muted-foreground ring-border hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <div className="rounded-md border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Payment ID</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Card</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Tip</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Card fee</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">
                  No payments match this filter.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {p.captured_at
                      ? format(new Date(p.captured_at), 'MMM d, h:mm a')
                      : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.id.slice(0, 8)}…{p.id.slice(-4)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.location_name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <CardBrandPill brand={p.card_type} last4={p.card_last_four} />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <Money value={p.subtotal_portion} zeroAsDash />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <Money value={p.tip_amount} zeroAsDash />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <Money value={p.total_amount} />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <Money value={p.dual_pricing_fee} zeroAsDash />
                  </TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={p.status} isReturned={p.is_returned} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total === 0 ? 'No results' : `Showing ${showingFrom}–${showingTo} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0 || isLoading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= total || isLoading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
