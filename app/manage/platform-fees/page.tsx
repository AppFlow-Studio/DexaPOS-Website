'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ChevronRight, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformFeesOverview } from '@/app/manage/hooks/usePlatformFees'
import { Money } from '@/components/platform-fees/money'
import { KpiStrip } from '@/components/platform-fees/kpi-strip'
import { CompositionCard } from '@/components/platform-fees/composition-card'
import { FeeTrendChart } from '@/components/platform-fees/fee-trend-chart'
import { MerchantFeesTable } from '@/components/platform-fees/merchant-fees-table'
import {
  DateRangeSegmented,
  presetToRange,
  type DateRangePreset,
} from '@/components/platform-fees/date-range-segmented'
import { formatCurrency } from '@/lib/utils'
import type { MerchantFeeRow } from '@/app/manage/actions/hq-platform/platform-fees'

export default function PlatformFeesPage() {
  const [preset, setPreset] = useState<DateRangePreset>('30D')
  const range = useMemo(() => presetToRange(preset), [preset])

  const { data, isLoading, isError } = usePlatformFeesOverview(range.from, range.to)

  const totals = data?.totals
  const byMerchant = data?.byMerchant ?? []
  const refunded = totals
    ? totals.refunded_dual_pricing_fee + totals.refunded_tip_fee
    : 0
  const grossCard = totals?.gross_dual_pricing_fee ?? 0
  const refundedPctOfGross = grossCard > 0 ? (refunded / grossCard) * 100 : 0
  const avgFee = totals && totals.payment_count > 0
    ? totals.net_platform_fee / totals.payment_count
    : 0

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <nav className="text-xs text-muted-foreground">
            Operations <span className="px-1">/</span>
            <span className="text-foreground">Platform Fees</span>
          </nav>
          <h1 className="text-3xl font-semibold tracking-tight">Platform Fees</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Card surcharge revenue collected across all merchants. Filter by date range and
            drill into a merchant for per-location and per-payment detail.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => exportMerchantsCsv(byMerchant, range)}
          disabled={isLoading || byMerchant.length === 0}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeSegmented value={preset} onChange={setPreset} />
        <span className="text-xs text-muted-foreground">
          {format(new Date(range.from), 'MMM d, yyyy')} —{' '}
          {format(new Date(range.to), 'MMM d, yyyy')}
        </span>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load platform fees. Please try again.
        </div>
      )}

      <KpiStrip
        loading={isLoading}
        cells={[
          {
            label: 'Net platform fee',
            value: <Money value={totals?.net_platform_fee ?? 0} />,
            hint: totals
              ? `${totals.payment_count.toLocaleString()} payment${totals.payment_count === 1 ? '' : 's'}`
              : '—',
            tone: 'positive',
          },
          {
            label: 'Card surcharge',
            value: <Money value={grossCard} />,
            hint: 'Gross dual-pricing collected',
          },
          {
            label: 'Refunded',
            value: <Money value={-refunded} zeroAsDash />,
            hint: refunded > 0
              ? `${refundedPctOfGross.toFixed(1)}% of gross`
              : 'No refund credits',
            tone: refunded > 0 ? 'negative' : 'default',
          },
          {
            label: 'Avg fee / payment',
            value: <Money value={avgFee} zeroAsDash />,
            hint: totals?.payment_count
              ? `Across ${totals.payment_count} payments`
              : '—',
          },
          {
            label: 'Active merchants',
            value: (
              <span className="font-mono tabular-nums">{byMerchant.length}</span>
            ),
            hint: 'With ≥1 captured payment',
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Fee trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <FeeTrendChart data={data?.byDay ?? []} />
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Composition</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-2 w-full mb-4" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ) : (
          <CompositionCard
            cardSurcharge={grossCard}
            refunded={refunded}
            paymentCount={totals?.payment_count ?? 0}
          />
        )}
      </div>

      <MerchantFeesTable rows={byMerchant} loading={isLoading} />

      <p className="text-[11px] text-muted-foreground">
        Total this period:{' '}
        <Link href="#" className="underline-offset-2 hover:underline">
          {formatCurrency(totals?.net_platform_fee ?? 0)}
        </Link>{' '}
        across {totals?.payment_count ?? 0} payments.
        <ChevronRight className="inline h-3 w-3 align-middle" />
      </p>
    </div>
  )
}

function exportMerchantsCsv(
  rows: MerchantFeeRow[],
  range: { from: string; to: string }
) {
  const header = [
    'merchant_id',
    'merchant_name',
    'locations',
    'gross_card_surcharge',
    'refunded',
    'net_platform_fee',
    'payments',
    'avg_fee_per_payment',
  ]
  const lines = rows.map((r) => {
    const refunded = r.refunded_dual_pricing_fee + r.refunded_tip_fee
    const avg = r.payment_count ? r.net_platform_fee / r.payment_count : 0
    return [
      r.merchant_id,
      escapeCsv(r.merchant_name),
      r.location_count,
      r.gross_dual_pricing_fee.toFixed(2),
      refunded.toFixed(2),
      r.net_platform_fee.toFixed(2),
      r.payment_count,
      avg.toFixed(2),
    ].join(',')
  })
  const blob = new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const fromStr = range.from.slice(0, 10)
  const toStr = range.to.slice(0, 10)
  a.href = url
  a.download = `platform-fees-${fromStr}-to-${toStr}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeCsv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
