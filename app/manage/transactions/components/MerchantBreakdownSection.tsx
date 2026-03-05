'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
  PlatformMerchantBreakdown,
  PlatformMerchantBreakdownFilters,
} from '@/app/manage/actions/hq-platform/transactions'
import { usePlatformMerchantBreakdown } from '@/lib/queries/use-platform-analytics'

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

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

function formatRangeLabel(filters: PlatformMerchantBreakdownFilters): string {
  const from = filters.dateFrom
  const to = filters.dateTo

  if (!from && !to) {
    return 'Last 30 days (default)'
  }

  if (from && to) {
    return `${format(parseISO(from), 'MMM d, yyyy')} - ${format(parseISO(to), 'MMM d, yyyy')}`
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
    return <span className="text-xs text-muted-foreground">-</span>
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
      <path d={path} fill="none" stroke="hsl(var(--chart-2))" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

interface MerchantBreakdownSectionProps {
  filters: PlatformMerchantBreakdownFilters
}

export function MerchantBreakdownSection({ filters }: MerchantBreakdownSectionProps) {
  const [open, setOpen] = useState(false)
  const [sortBy, setSortBy] = useState<MerchantBreakdownSortKey>('total_revenue')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const {
    data: breakdown,
    isLoading,
    isFetching,
    isError,
    error,
  } = usePlatformMerchantBreakdown(filters)

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

  const rangeLabel = useMemo(() => formatRangeLabel(filters), [filters])
  const hasActiveFilters =
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    Boolean(filters.merchantIds && filters.merchantIds.length > 0) ||
    Boolean(filters.locationIds && filters.locationIds.length > 0) ||
    Boolean(filters.paymentStatuses && filters.paymentStatuses.length > 0)

  const toggleSort = (key: MerchantBreakdownSortKey) => {
    if (sortBy === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortBy(key)
    setSortDirection(key === 'merchant_name' ? 'asc' : 'desc')
  }

  const totalRevenue = sortedRows.reduce((sum, row) => sum + row.total_revenue, 0)
  const totalTransactions = sortedRows.reduce((sum, row) => sum + row.transaction_count, 0)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Merchant Breakdown
              </CardTitle>
              <CardDescription>
                Compare merchant volume and revenue for {rangeLabel}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{sortedRows.length.toLocaleString()} merchants</Badge>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  {open ? (
                    <>
                      Hide
                      <ChevronUp className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Show
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>Total revenue: {formatCurrency(totalRevenue)}</span>
              <span>Total transactions: {totalTransactions.toLocaleString()}</span>
            </div>

            {isError && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Merchant breakdown is unavailable right now.
                {` ${error instanceof Error ? error.message : 'Unknown error.'}`}
              </div>
            )}

            <Table containerClassName="max-h-[46vh] overflow-auto rounded-md border">
              <TableHeader className="sticky top-0 z-20 bg-card">
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" className="h-8 px-2" onClick={() => toggleSort('merchant_name')}>
                      Merchant
                      {getSortIndicator(sortBy === 'merchant_name', sortDirection)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" className="h-8 px-2" onClick={() => toggleSort('location_count')}>
                      Locations
                      {getSortIndicator(sortBy === 'location_count', sortDirection)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" className="h-8 px-2" onClick={() => toggleSort('transaction_count')}>
                      Transactions
                      {getSortIndicator(sortBy === 'transaction_count', sortDirection)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" className="h-8 px-2" onClick={() => toggleSort('card_revenue')}>
                      Card Revenue
                      {getSortIndicator(sortBy === 'card_revenue', sortDirection)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" className="h-8 px-2" onClick={() => toggleSort('cash_revenue')}>
                      Cash Revenue
                      {getSortIndicator(sortBy === 'cash_revenue', sortDirection)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" className="h-8 px-2" onClick={() => toggleSort('total_revenue')}>
                      Total Revenue
                      {getSortIndicator(sortBy === 'total_revenue', sortDirection)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" className="h-8 px-2" onClick={() => toggleSort('avg_ticket')}>
                      Avg Ticket
                      {getSortIndicator(sortBy === 'avg_ticket', sortDirection)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" className="h-8 px-2" onClick={() => toggleSort('tip_total')}>
                      Tip Total
                      {getSortIndicator(sortBy === 'tip_total', sortDirection)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" className="h-8 px-2" onClick={() => toggleSort('void_count')}>
                      Void Count
                      {getSortIndicator(sortBy === 'void_count', sortDirection)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" className="h-8 px-2" onClick={() => toggleSort('void_rate_pct')}>
                      Void Rate %
                      {getSortIndicator(sortBy === 'void_rate_pct', sortDirection)}
                    </Button>
                  </TableHead>
                  <TableHead>Trend</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading || isFetching ? (
                  Array.from({ length: 5 }).map((_, rowIndex) => (
                    <TableRow key={`merchant-breakdown-loading-${rowIndex}`}>
                      {Array.from({ length: 11 }).map((__, cellIndex) => (
                        <TableCell key={`merchant-breakdown-loading-${rowIndex}-${cellIndex}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : sortedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                      {hasActiveFilters
                        ? 'No merchant data for the current filters/date range.'
                        : 'No merchant data available for this period.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRows.map((row) => (
                    <TableRow key={row.merchant_id}>
                      <TableCell className="font-medium">{row.merchant_name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {row.active_locations !== undefined &&
                        row.total_locations !== undefined &&
                        row.active_locations !== row.total_locations
                          ? `${row.active_locations.toLocaleString()} / ${row.total_locations.toLocaleString()}`
                          : row.location_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.transaction_count.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(row.card_revenue)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(row.cash_revenue)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{formatCurrency(row.total_revenue)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(row.avg_ticket)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(row.tip_total)}</TableCell>
                      <TableCell className="text-right font-mono">{row.void_count.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{formatPercent(row.void_rate_pct)}</TableCell>
                      <TableCell>
                        <Sparkline points={row.daily_revenue_trend} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
