'use client'

import { useId, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react'
import { InfoIcon } from '@/components/ui/info-icon'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  PlatformMerchantBreakdown,
  PlatformMerchantBreakdownFilters,
} from '@/app/manage/actions/hq-platform/transactions'
import { usePlatformMerchantBreakdown } from '@/lib/queries/use-platform-analytics'
import { LoadError, TableEmptyRow } from './ledger-primitives'

type MerchantBreakdownSortKey =
  | 'merchant_name'
  | 'location_count'
  | 'transaction_count'
  | 'card_revenue'
  | 'cash_revenue'
  | 'total_revenue'
  | 'avg_ticket'
  | 'tip_total'
  | 'void_count'
  | 'void_rate_pct'

type SortDirection = 'asc' | 'desc'

/**
 * A comparison table — the columns are the point, so phones get a column
 * picker rather than cards (UI-DESIGN-SYSTEM §5.8). Merchant, volume, revenue
 * and void rate are what a phone user compares; the rest start hidden.
 */
const COLUMNS: ReportColumn[] = [
  { id: 'merchant', label: 'Merchant', locked: true },
  { id: 'locations', label: 'Locations', defaultHidden: true },
  { id: 'transactions', label: 'Transactions' },
  { id: 'cardRevenue', label: 'Card revenue', defaultHidden: true },
  { id: 'cashRevenue', label: 'Cash revenue', defaultHidden: true },
  { id: 'totalRevenue', label: 'Total revenue' },
  { id: 'avgTicket', label: 'Avg ticket', defaultHidden: true },
  { id: 'tipTotal', label: 'Tip total', defaultHidden: true },
  { id: 'voidCount', label: 'Void count', defaultHidden: true },
  { id: 'voidRate', label: 'Void rate' },
  { id: 'trend', label: 'Trend', defaultHidden: true },
]

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

/**
 * The period the breakdown covers, in words. Exported so the host section can
 * carry it as its caption — the component no longer renders a heading.
 */
export function formatBreakdownRangeLabel(filters: PlatformMerchantBreakdownFilters): string {
  const from = filters.dateFrom
  const to = filters.dateTo

  if (!from && !to) {
    return 'Last 30 days (default)'
  }

  if (from && to) {
    return `${format(parseISO(from), 'MMM d, yyyy')} – ${format(parseISO(to), 'MMM d, yyyy')}`
  }

  if (from) {
    return `From ${format(parseISO(from), 'MMM d, yyyy')}`
  }

  return `Until ${format(parseISO(to || ''), 'MMM d, yyyy')}`
}

function getSortIndicator(active: boolean, direction: SortDirection) {
  if (!active) {
    return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
  }

  if (direction === 'asc') {
    return <ArrowUp className="ml-1 h-3 w-3" />
  }

  return <ArrowDown className="ml-1 h-3 w-3" />
}

function getSortValue(row: PlatformMerchantBreakdown, key: MerchantBreakdownSortKey): string | number {
  if (key === 'merchant_name') return row.merchant_name
  if (key === 'location_count') return row.location_count
  if (key === 'transaction_count') return row.transaction_count
  if (key === 'card_revenue') return row.card_revenue
  if (key === 'cash_revenue') return row.cash_revenue
  if (key === 'total_revenue') return row.total_revenue
  if (key === 'avg_ticket') return row.avg_ticket
  if (key === 'tip_total') return row.tip_total
  if (key === 'void_count') return row.void_count
  return row.void_rate_pct
}

function Sparkline({ points }: { points: Array<{ date: string; revenue: number }> }) {
  if (!points || points.length < 2) {
    return <span className="text-muted-foreground">—</span>
  }

  const width = 120
  const height = 30
  const padding = 2
  const values = points.map((point) => point.revenue)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = (width - padding * 2) / Math.max(points.length - 1, 1)

  const path = points
    .map((point, index) => {
      const x = padding + step * index
      const normalized = (point.revenue - min) / range
      const y = height - padding - normalized * (height - padding * 2)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Single series → the brand token, which follows the theme (§6.1, C2). */}
      <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

interface MerchantBreakdownSectionProps {
  filters: PlatformMerchantBreakdownFilters
  /** Hold the request back (the host's primary list goes first). Reads as loading meanwhile. */
  enabled?: boolean
}

export function MerchantBreakdownSection({ filters, enabled = true }: MerchantBreakdownSectionProps) {
  const bodyId = useId()
  const [open, setOpen] = useState(false)
  const [sortBy, setSortBy] = useState<MerchantBreakdownSortKey>('total_revenue')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const isMobile = useIsMobile()
  const [hidden, setHidden] = useState<Set<string>>(() => initialHiddenColumns(COLUMNS))
  const showCol = (id: string) => !isMobile || !hidden.has(id)
  const visibleColumnCount = COLUMNS.filter((column) => showCol(column.id)).length

  const {
    data: breakdown,
    // `isPending` (no data yet), not `isLoading`: it also covers a held-back query.
    isPending: isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = usePlatformMerchantBreakdown(filters, enabled)

  // Rank before slicing (§5.7): page 1 always holds the top of the sort.
  const sortedRows = useMemo(() => {
    const rows = [...(breakdown || [])]

    rows.sort((a, b) => {
      const left = getSortValue(a, sortBy)
      const right = getSortValue(b, sortBy)

      if (typeof left === 'string' && typeof right === 'string') {
        const cmp = left.localeCompare(right)
        return sortDirection === 'asc' ? cmp : -cmp
      }

      const cmp = Number(left) - Number(right)
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return rows
  }, [breakdown, sortBy, sortDirection])

  const { pageRows, pagination, setPage } = useClientPagination(sortedRows, 10)

  const hasActiveFilters =
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    Boolean(filters.merchantIds && filters.merchantIds.length > 0) ||
    Boolean(filters.locationIds && filters.locationIds.length > 0) ||
    Boolean(filters.paymentStatuses && filters.paymentStatuses.length > 0)

  const toggleSort = (key: MerchantBreakdownSortKey) => {
    setPage(1)

    if (sortBy === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortBy(key)
    setSortDirection(key === 'merchant_name' ? 'asc' : 'desc')
  }

  const totalRevenue = sortedRows.reduce((sum, row) => sum + row.total_revenue, 0)
  const totalTransactions = sortedRows.reduce((sum, row) => sum + row.transaction_count, 0)

  const sortButton = (key: MerchantBreakdownSortKey, label: string) => (
    <Button variant="ghost" className="h-8 px-2" onClick={() => toggleSort(key)}>
      {label}
      {getSortIndicator(sortBy === key, sortDirection)}
    </Button>
  )

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground tabular-nums">
          {isLoading || isError
            ? '—'
            : `${sortedRows.length.toLocaleString()} merchants · Total revenue ${formatCurrency(totalRevenue)} · ${totalTransactions.toLocaleString()} transactions`}
        </p>
        <div className="flex items-center gap-2">
          {open && <MobileColumnsButton columns={COLUMNS} hidden={hidden} onChange={setHidden} />}
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-4"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? 'Hide breakdown' : 'Show breakdown'}
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {isError && (
        <LoadError
          title="Merchant breakdown is unavailable"
          detail={error instanceof Error ? error.message : 'Unknown error.'}
          onRetry={() => void refetch()}
        />
      )}

      {open && (
        <div id={bodyId} className="min-w-0">
          <Table variant="data" className={cn(!isMobile && 'min-w-[1100px]')}>
            <TableHeader>
              <TableRow>
                <TableHead>{sortButton('merchant_name', 'Merchant')}</TableHead>
                {showCol('locations') && (
                  <TableHead className="text-right tabular-nums">{sortButton('location_count', 'Locations')}</TableHead>
                )}
                {showCol('transactions') && (
                  <TableHead className="text-right tabular-nums">{sortButton('transaction_count', 'Transactions')}</TableHead>
                )}
                {showCol('cardRevenue') && (
                  <TableHead className="text-right tabular-nums">{sortButton('card_revenue', 'Card revenue')}</TableHead>
                )}
                {showCol('cashRevenue') && (
                  <TableHead className="text-right tabular-nums">{sortButton('cash_revenue', 'Cash revenue')}</TableHead>
                )}
                {showCol('totalRevenue') && (
                  <TableHead className="text-right tabular-nums">{sortButton('total_revenue', 'Total revenue')}</TableHead>
                )}
                {showCol('avgTicket') && (
                  <TableHead className="text-right tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      {sortButton('avg_ticket', 'Avg ticket')}
                      <InfoIcon tip="Mean transaction value (total revenue ÷ transaction count) for this merchant. A useful proxy for order size." side="bottom" />
                    </span>
                  </TableHead>
                )}
                {showCol('tipTotal') && (
                  <TableHead className="text-right tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      {sortButton('tip_total', 'Tip total')}
                      <InfoIcon tip="Sum of all tips collected by this merchant in the selected period." side="bottom" />
                    </span>
                  </TableHead>
                )}
                {showCol('voidCount') && (
                  <TableHead className="text-right tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      {sortButton('void_count', 'Void count')}
                      <InfoIcon tip="Number of transactions cancelled before settlement. A high void count may indicate staff errors or system issues." side="bottom" />
                    </span>
                  </TableHead>
                )}
                {showCol('voidRate') && (
                  <TableHead className="text-right tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      {sortButton('void_rate_pct', 'Void rate %')}
                      <InfoIcon tip="Voids as a percentage of total transactions. Industry average is under 2%. Consistently above 5% warrants investigation." side="bottom" />
                    </span>
                  </TableHead>
                )}
                {showCol('trend') && (
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      Trend
                      <InfoIcon tip="Daily revenue sparkline for the selected period. Rising line = growing revenue, flat = stable, falling = declining." side="bottom" />
                    </span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading || isFetching ? (
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <TableRow key={`merchant-breakdown-loading-${rowIndex}`}>
                    {Array.from({ length: visibleColumnCount }).map((__, cellIndex) => (
                      <TableCell key={`merchant-breakdown-loading-${rowIndex}-${cellIndex}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sortedRows.length === 0 ? (
                <TableEmptyRow
                  colSpan={visibleColumnCount}
                  title={
                    hasActiveFilters
                      ? 'No merchant activity matches these filters'
                      : 'No merchant activity in this period'
                  }
                  hint={
                    hasActiveFilters
                      ? 'Clear the filters to widen the results.'
                      : 'Merchants appear here once they take payments in the selected period.'
                  }
                />
              ) : (
                pageRows.map((row) => (
                  <TableRow key={row.merchant_id}>
                    <TableCell className="font-medium">{row.merchant_name}</TableCell>
                    {showCol('locations') && (
                      <TableCell className="text-right tabular-nums">
                        {row.active_locations !== undefined &&
                        row.total_locations !== undefined &&
                        row.active_locations !== row.total_locations
                          ? `${row.active_locations.toLocaleString()} / ${row.total_locations.toLocaleString()}`
                          : row.location_count.toLocaleString()}
                      </TableCell>
                    )}
                    {showCol('transactions') && (
                      <TableCell className="text-right tabular-nums">{row.transaction_count.toLocaleString()}</TableCell>
                    )}
                    {showCol('cardRevenue') && (
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.card_revenue)}</TableCell>
                    )}
                    {showCol('cashRevenue') && (
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.cash_revenue)}</TableCell>
                    )}
                    {showCol('totalRevenue') && (
                      <TableCell className="text-right font-medium tabular-nums">{formatCurrency(row.total_revenue)}</TableCell>
                    )}
                    {showCol('avgTicket') && (
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.avg_ticket)}</TableCell>
                    )}
                    {showCol('tipTotal') && (
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.tip_total)}</TableCell>
                    )}
                    {showCol('voidCount') && (
                      <TableCell className="text-right tabular-nums">{row.void_count.toLocaleString()}</TableCell>
                    )}
                    {showCol('voidRate') && (
                      <TableCell className="text-right tabular-nums">{formatPercent(row.void_rate_pct)}</TableCell>
                    )}
                    {showCol('trend') && (
                      <TableCell>
                        <Sparkline points={row.daily_revenue_trend} />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="merchants" />
        </div>
      )}
    </div>
  )
}
