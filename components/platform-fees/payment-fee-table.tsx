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
import { PanelSection } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import {
  CardField,
  CardFields,
  CardGridEmpty,
  LoadError,
  RecordCardSkeletons,
  TableEmptyRow,
} from '@/app/manage/transactions/components/ledger-primitives'
import { cn } from '@/lib/utils'
import type { PaginationMeta } from '@/types/pagination'
import { Money } from './money'
import { CardBrandPill, cardBrandLabel } from './card-brand-pill'
import { PaymentStatusBadge, paymentStatusLabel } from './status-badge'
import { useMerchantPayments } from '@/app/manage/hooks/usePlatformFees'
import type { GetMerchantPaymentsParams } from '@/app/manage/actions/hq-platform/platform-fees'

type StatusFilter = NonNullable<GetMerchantPaymentsParams['status']>

const filters: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'collected', label: 'Collected' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'disputed', label: 'Disputed' },
]

const PAGE_SIZE = 10
const COLUMN_COUNT = 9

/**
 * A merchant's payments with the surcharge each carried (a `PanelSection`; the
 * host supplies the `Panel`). Server-paged at 10 (§5.7). The table shows from
 * `xl`, where its `min-w` fits; below that, record cards (§5.3).
 */
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
  // The page belongs to the range it was chosen in: a new range can have fewer
  // pages, so it starts from the top (derived in render, not reset in an effect).
  const rangeKey = `${from}|${to}`
  const [paging, setPaging] = useState({ rangeKey, page: 1 })
  const page = paging.rangeKey === rangeKey ? paging.page : 1
  const setPage = (next: number) => setPaging({ rangeKey, page: next })

  const { data, isLoading, isError, refetch } = useMerchantPayments(merchantId, {
    from,
    to,
    status,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

  const rows = data?.rows ?? []
  const total = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pagination: PaginationMeta = {
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }

  function setFilter(next: StatusFilter) {
    setStatus(next)
    setPage(1)
  }

  const emptyTitle =
    status === 'all'
      ? 'No payments in this period'
      : `No ${filters.find((f) => f.key === status)?.label.toLowerCase()} payments in this period`
  const emptyHint =
    status === 'all'
      ? 'Card payments will appear here once this merchant takes them.'
      : 'Choose “All” or widen the date range to see more.'

  return (
    <PanelSection
      label="Payments"
      caption="Captured card payments and the surcharge each one carried."
      action={
        <div className="thin-scrollbar min-w-0 max-w-full overflow-x-auto">
          <div
            role="group"
            aria-label="Payment status"
            className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1"
          >
            {filters.map((f) => {
              const active = status === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>
      }
    >
      {isError ? (
        <LoadError title="We couldn’t load this merchant’s payments" onRetry={() => void refetch()} />
      ) : (
        <>
          <Table variant="data" containerClassName="hidden xl:block" className="min-w-[940px]">
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
                    <TableCell colSpan={COLUMN_COUNT}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableEmptyRow colSpan={COLUMN_COUNT} title={emptyTitle} hint={emptyHint} />
              ) : (
                rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {p.captured_at ? format(new Date(p.captured_at), 'MMM d, h:mm a') : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.id.slice(0, 8)}…{p.id.slice(-4)}
                    </TableCell>
                    <TableCell>{p.location_name ?? '—'}</TableCell>
                    <TableCell>
                      <CardBrandPill brand={p.card_type} last4={p.card_last_four} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={p.subtotal_portion} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={p.tip_amount} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={p.total_amount} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Money value={p.dual_pricing_fee} />
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={p.status} isReturned={p.is_returned} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
            {isLoading ? (
              <RecordCardSkeletons count={4} />
            ) : rows.length === 0 ? (
              <CardGridEmpty title={emptyTitle} hint={emptyHint} />
            ) : (
              rows.map((p) => (
                <div key={p.id} className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums">
                        {p.captured_at ? format(new Date(p.captured_at), 'MMM d, h:mm a') : '—'}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {p.id.slice(0, 8)}…{p.id.slice(-4)}
                      </p>
                    </div>
                    {/* Plain text on a muted card, not a pill (§3.5). */}
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {paymentStatusLabel(p.status, p.is_returned)}
                    </span>
                  </div>
                  <CardFields>
                    <CardField label="Total" value={<Money value={p.total_amount} />} />
                    <CardField label="Card fee" value={<Money value={p.dual_pricing_fee} />} />
                    <CardField label="Subtotal" value={<Money value={p.subtotal_portion} />} />
                    <CardField label="Tip" value={<Money value={p.tip_amount} />} />
                    <CardField label="Location" value={p.location_name ?? '—'} />
                    <CardField
                      label="Card"
                      value={`${cardBrandLabel(p.card_type)}${p.card_last_four ? ` ····${p.card_last_four}` : ''}`}
                    />
                  </CardFields>
                </div>
              ))
            )}
          </div>

          <PaginationBar
            pagination={pagination}
            onPageChange={setPage}
            isLoading={isLoading}
            itemLabel="payments"
          />
          {!isLoading && total > 0 && total <= PAGE_SIZE && (
            <p className="mt-3 text-xs text-muted-foreground tabular-nums sm:text-sm">
              {total} payment{total === 1 ? '' : 's'}
            </p>
          )}
        </>
      )}
    </PanelSection>
  )
}
