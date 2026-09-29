'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
  StatRow,
  StatTile,
} from '@/components/dashboard/shell'
import { LoadError } from '@/app/manage/transactions/components/ledger-primitives'
import { usePlatformFeesOverview } from '@/app/manage/hooks/usePlatformFees'
import { Money } from '@/components/platform-fees/money'
import { CompositionBreakdown } from '@/components/platform-fees/composition-card'
import { FeeTrendChart } from '@/components/platform-fees/fee-trend-chart'
import { MerchantFeesTable } from '@/components/platform-fees/merchant-fees-table'
import {
  DateRangeSegmented,
  presetToRange,
  type DateRangePreset,
} from '@/components/platform-fees/date-range-segmented'
import type { MerchantFeeRow } from '@/app/manage/actions/hq-platform/platform-fees'

const CHART_HEIGHT = 260

export default function PlatformFeesPage() {
  const [preset, setPreset] = useState<DateRangePreset>('30D')
  const range = useMemo(() => presetToRange(preset), [preset])

  const { data, isLoading, isError, refetch } = usePlatformFeesOverview(range.from, range.to)

  const totals = data?.totals
  const byMerchant = data?.byMerchant ?? []
  const refunded = totals ? totals.refunded_dual_pricing_fee + totals.refunded_tip_fee : 0
  const grossCard = totals?.gross_dual_pricing_fee ?? 0
  const paymentCount = totals?.payment_count ?? 0
  const refundedPctOfGross = grossCard > 0 ? (refunded / grossCard) * 100 : 0
  // With no payments the average is unknown, not zero (§4.9).
  const avgFee = totals && paymentCount > 0 ? totals.net_platform_fee / paymentCount : null
  // Without data every figure is unknown.
  const known = !!totals

  return (
    <PageShell as="div">
      <PageHeader
        title="Platform Fees"
        subtitle="Card surcharge revenue collected across all merchants. Open a merchant for per-location and per-payment detail."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            onClick={() => exportMerchantsCsv(byMerchant, range)}
            disabled={isLoading || byMerchant.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* One control row governs the whole page. The dates are scope, so they stay on phones.
          Sticky for the same reason as the merchant detail page's row. */}
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 bg-background px-4 py-3 sm:-mx-6 sm:px-6">
        <DateRangeSegmented value={preset} onChange={setPreset} />
        <span className="text-sm text-muted-foreground tabular-nums">
          {format(new Date(range.from), 'MMM d, yyyy')} – {format(new Date(range.to), 'MMM d, yyyy')}
        </span>
      </div>

      {isError && (
        <LoadError title="We couldn’t load platform fees" onRetry={() => void refetch()} />
      )}

      <Panel padded>
        <StatRow columns={3}>
          <StatTile
            label="Net platform fee"
            isLoading={isLoading}
            value={<Money value={known ? totals.net_platform_fee : null} />}
            meta={
              known
                ? `${paymentCount.toLocaleString()} payment${paymentCount === 1 ? '' : 's'}`
                : undefined
            }
          />
          <StatTile
            label="Card surcharge"
            isLoading={isLoading}
            value={<Money value={known ? grossCard : null} />}
            meta="Gross dual pricing collected"
          />
          <StatTile
            label="Refunded"
            isLoading={isLoading}
            value={<Money value={known ? -refunded : null} />}
            meta={
              known
                ? refunded > 0
                  ? `${refundedPctOfGross.toFixed(1)}% of gross`
                  : 'No refund credits'
                : undefined
            }
          />
          <StatTile
            label="Avg fee per payment"
            isLoading={isLoading}
            value={<Money value={avgFee} />}
            meta={known && paymentCount === 0 ? 'No payments in this period' : undefined}
            showMetaOnMobile
          />
          <StatTile
            label="Active merchants"
            isLoading={isLoading}
            value={known ? byMerchant.length.toLocaleString() : '—'}
            meta="With at least one captured payment"
          />
        </StatRow>
      </Panel>

      {/* A chart and a short breakdown may pair (§2 E); each keeps its own height. */}
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel>
          <PanelSection label="Fee trend" caption="Card surcharge and net platform fee per day">
            {isLoading ? (
              <Skeleton className="w-full rounded-2xl" style={{ height: CHART_HEIGHT }} />
            ) : (
              <FeeTrendChart
                data={data?.byDay ?? []}
                from={range.from}
                to={range.to}
                height={CHART_HEIGHT}
              />
            )}
          </PanelSection>
        </Panel>

        <Panel>
          <PanelSection label="Composition" caption="How the gross surcharge splits after refunds">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <CompositionBreakdown
                cardSurcharge={grossCard}
                refunded={refunded}
                paymentCount={paymentCount}
              />
            )}
          </PanelSection>
        </Panel>
      </div>

      <Panel>
        <MerchantFeesTable rows={byMerchant} loading={isLoading} />
      </Panel>
    </PageShell>
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
