'use client'

import { use, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Download, ExternalLink } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
  StatRow,
  StatTile,
} from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import {
  CardField,
  CardFields,
  CardGridEmpty,
  LoadError,
  RecordCardSkeletons,
  TableEmptyRow,
} from '@/app/manage/transactions/components/ledger-primitives'
import { useMerchantPlatformFees } from '@/app/manage/hooks/usePlatformFees'
import { Money } from '@/components/platform-fees/money'
import { FeeTrendChart } from '@/components/platform-fees/fee-trend-chart'
import { StatusBadge } from '@/components/platform-fees/status-badge'
import { PaymentFeeTable } from '@/components/platform-fees/payment-fee-table'
import { RecentActivityTimeline } from '@/components/platform-fees/recent-activity-timeline'
import {
  DateRangeSegmented,
  presetToRange,
  type DateRangePreset,
} from '@/components/platform-fees/date-range-segmented'
import type { LocationFeeRow } from '@/app/manage/actions/hq-platform/platform-fees'

const CHART_HEIGHT = 260
const TAB_PILL_CLASS =
  'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border'

export default function MerchantPlatformFeesPage({
  params,
}: {
  params: Promise<{ merchantId: string }>
}) {
  const { merchantId } = use(params)
  const [preset, setPreset] = useState<DateRangePreset>('30D')
  const range = useMemo(() => presetToRange(preset), [preset])
  const [activeTab, setActiveTab] = useState('overview')

  const { data, isLoading, isError, refetch } = useMerchantPlatformFees(
    merchantId,
    range.from,
    range.to
  )

  const totals = data?.totals
  const byLocation = data?.byLocation ?? []
  const merchantName = data?.merchant.name ?? (isLoading ? 'Loading…' : 'Merchant')
  const refunded = totals ? totals.refunded_dual_pricing_fee + totals.refunded_tip_fee : 0
  const grossCard = totals?.gross_dual_pricing_fee ?? 0
  const paymentCount = totals?.payment_count ?? 0
  const refundedPct = grossCard > 0 ? (refunded / grossCard) * 100 : 0
  // With no payments the average is unknown, not zero (§4.9).
  const avgFee = totals && paymentCount > 0 ? totals.net_platform_fee / paymentCount : null
  const activeLocations = byLocation.filter((l) => l.payment_count > 0).length
  const known = !!totals

  // The identity line is scope (record id, size, status), so it stays on phones.
  const identity = [
    `${merchantId.slice(0, 8)}…`,
    data ? `${byLocation.length} location${byLocation.length === 1 ? '' : 's'}` : null,
    data?.merchant.type ? capitalize(data.merchant.type) : null,
    data?.merchant.onboarding_status
      ? data.merchant.onboarding_status === 'completed'
        ? 'Active'
        : capitalize(data.merchant.onboarding_status.replace(/_/g, ' '))
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // The section rail keeps the active tab in view (§13.2): scroll the rail
  // itself, clamped, and re-measure once it has a width.
  const railRef = useRef<HTMLDivElement>(null)
  const railPositioned = useRef(false)
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    let done = false
    const align = () => {
      const max = rail.scrollWidth - rail.clientWidth
      const tab = rail.querySelector<HTMLElement>('[data-state="active"]')
      if (done || !tab || max <= 0) return
      const left = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2
      const smooth = railPositioned.current && !matchMedia('(prefers-reduced-motion: reduce)').matches
      rail.scrollTo({ left: Math.max(0, Math.min(left, max)), behavior: smooth ? 'smooth' : 'auto' })
      railPositioned.current = done = true
    }
    align()
    const observer = new ResizeObserver(align)
    observer.observe(rail)
    return () => observer.disconnect()
  }, [activeTab])

  return (
    <PageShell as="div">
      <PageHeader
        title={merchantName}
        subtitle={identity}
        showSubtitleOnMobile
        subtitleClassName="tabular-nums"
        backHref="/manage/platform-fees"
        backLabel="Back to Platform Fees"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => exportLocationsCsv(merchantName, byLocation, range)}
              disabled={isLoading || byLocation.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="ghost" size="sm" className="h-9 gap-2 rounded-full px-4 text-[0.8125rem]" asChild>
              <Link href={`/manage/merchants/${merchantId}`}>
                <ExternalLink className="h-4 w-4" />
                View merchant
              </Link>
            </Button>
          </>
        }
      />

      {/* One control row governs every tab. The dates are scope, so they stay on phones. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeSegmented value={preset} onChange={setPreset} />
        <span className="text-sm text-muted-foreground tabular-nums">
          {format(new Date(range.from), 'MMM d, yyyy')} – {format(new Date(range.to), 'MMM d, yyyy')}
        </span>
      </div>

      {isError && (
        <LoadError title="We couldn’t load this merchant’s fees" onRetry={() => void refetch()} />
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
            meta="Gross dual pricing"
          />
          <StatTile
            label="Refunded"
            isLoading={isLoading}
            value={<Money value={known ? -refunded : null} />}
            meta={
              known
                ? refunded > 0
                  ? `${refundedPct.toFixed(1)}% of gross`
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
            label="Active locations"
            isLoading={isLoading}
            value={
              known ? (
                <>
                  {activeLocations}{' '}
                  <span className="text-muted-foreground">/ {byLocation.length}</span>
                </>
              ) : (
                '—'
              )
            }
            meta="With at least one captured payment"
          />
        </StatRow>
      </Panel>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Pill rail (§4.5). Classes are literal, not tokens (C7). */}
        <div ref={railRef} className="thin-scrollbar relative w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            <TabsTrigger value="overview" className={TAB_PILL_CLASS}>
              Overview
            </TabsTrigger>
            <TabsTrigger value="locations" className={TAB_PILL_CLASS}>
              Locations
              <span className="ml-1.5 text-muted-foreground tabular-nums">{byLocation.length}</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className={TAB_PILL_CLASS}>
              Payments
              <span className="ml-1.5 text-muted-foreground tabular-nums">
                {paymentCount.toLocaleString()}
              </span>
            </TabsTrigger>
            <TabsTrigger value="config" className={TAB_PILL_CLASS}>
              Fee configuration
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-6">
          {/* A chart and a short list may pair (§2 E); each keeps its own height. */}
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
              <PanelSection label="Top locations" caption="By net platform fee">
                {isLoading ? <Skeleton className="h-32 w-full" /> : <TopLocationsList rows={byLocation} />}
              </PanelSection>
            </Panel>
          </div>

          <Panel>
            <PanelSection label="Recent activity" caption="The latest payments in this period">
              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <RecentActivityTimeline entries={data?.recentActivity ?? []} />
              )}
            </PanelSection>
          </Panel>
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <Panel>
            <PanelSection label="Locations" caption="Fees collected at each location in this period">
              <LocationsTable rows={byLocation} loading={isLoading} />
            </PanelSection>
          </Panel>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Panel>
            <PaymentFeeTable merchantId={merchantId} from={range.from} to={range.to} />
          </Panel>
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <FeeConfigReadOnly
            merchantPercentage={data?.merchant.dual_pricing_percentage ?? 0}
            rows={byLocation}
            loading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}

function TopLocationsList({ rows }: { rows: LocationFeeRow[] }) {
  const top = [...rows]
    .filter((r) => r.payment_count > 0)
    .sort((a, b) => b.net_platform_fee - a.net_platform_fee)
    .slice(0, 5)
  if (top.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        No location took a card payment in this period.
      </p>
    )
  }
  const max = top[0].net_platform_fee || 1
  return (
    <ul className="space-y-4">
      {top.map((r) => {
        const pct = Math.max(0, (r.net_platform_fee / max) * 100)
        return (
          <li key={r.location_id} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{r.location_name}</span>
              <Money value={r.net_platform_fee} className="font-medium" />
            </div>
            {/* A bar is chart data, so it takes the brand series colour (§3.5 use 2). */}
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-[#0C4FD1] dark:bg-[#6CA0FF]" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {r.payment_count.toLocaleString()} payment{r.payment_count === 1 ? '' : 's'}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

const LOCATION_COLUMNS = 7

function LocationsTable({
  rows,
  loading,
}: {
  rows: LocationFeeRow[]
  loading: boolean
}) {
  const { pageRows, pagination, setPage } = useClientPagination(rows, 10)
  const totals = rows.reduce(
    (acc, r) => {
      acc.gross += r.gross_dual_pricing_fee
      acc.refunded += r.refunded_dual_pricing_fee + r.refunded_tip_fee
      acc.net += r.net_platform_fee
      acc.payments += r.payment_count
      return acc
    },
    { gross: 0, refunded: 0, net: 0, payments: 0 }
  )

  const emptyTitle = 'No locations for this merchant'
  const emptyHint = 'Locations appear here once they are added to the merchant.'

  return (
    <>
      <Table variant="data" containerClassName="hidden xl:block" className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead>Location</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Card %</TableHead>
            <TableHead className="text-right">Card fees</TableHead>
            <TableHead className="text-right">Refunded</TableHead>
            <TableHead className="text-right">Net fee</TableHead>
            <TableHead className="text-right">Payments</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={LOCATION_COLUMNS}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : pageRows.length === 0 ? (
            <TableEmptyRow colSpan={LOCATION_COLUMNS} title={emptyTitle} hint={emptyHint} />
          ) : (
            pageRows.map((r) => (
              <TableRow key={r.location_id}>
                <TableCell className="font-medium">{r.location_name}</TableCell>
                <TableCell className="text-muted-foreground">{r.location_address ?? '—'}</TableCell>
                <TableCell className="tabular-nums">
                  {r.dual_pricing_percentage > 0 ? `${r.dual_pricing_percentage}%` : 'Off'}
                </TableCell>
                <TableCell className="text-right">
                  <Money value={r.gross_dual_pricing_fee} />
                </TableCell>
                <TableCell className="text-right">
                  <Money value={-(r.refunded_dual_pricing_fee + r.refunded_tip_fee)} />
                </TableCell>
                <TableCell className="text-right font-medium">
                  <Money value={r.net_platform_fee} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.payment_count.toLocaleString()}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        {loading ? (
          <RecordCardSkeletons count={2} />
        ) : pageRows.length === 0 ? (
          <CardGridEmpty title={emptyTitle} hint={emptyHint} />
        ) : (
          pageRows.map((r) => (
            <div key={r.location_id} className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
              <p className="truncate font-medium">{r.location_name}</p>
              <p className="truncate text-xs text-muted-foreground">{r.location_address ?? '—'}</p>
              <CardFields>
                <CardField label="Net fee" value={<Money value={r.net_platform_fee} />} />
                <CardField label="Card fees" value={<Money value={r.gross_dual_pricing_fee} />} />
                <CardField
                  label="Refunded"
                  value={<Money value={-(r.refunded_dual_pricing_fee + r.refunded_tip_fee)} />}
                />
                <CardField label="Payments" value={r.payment_count.toLocaleString()} />
                <CardField
                  label="Card %"
                  value={r.dual_pricing_percentage > 0 ? `${r.dual_pricing_percentage}%` : 'Off'}
                />
              </CardFields>
            </div>
          ))
        )}
      </div>

      <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="locations" />

      {/* All-location totals. A line under the table, not a tinted row that repeats on every page. */}
      {!loading && rows.length > 0 && (
        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground tabular-nums">
          <span>
            {rows.length} location{rows.length === 1 ? '' : 's'}
          </span>
          <span>
            Card fees <Money value={totals.gross} className="font-medium text-foreground" />
          </span>
          <span>
            Refunded <Money value={-totals.refunded} className="font-medium text-foreground" />
          </span>
          <span>
            Net fee <Money value={totals.net} className="font-medium text-foreground" />
          </span>
          <span>
            <span className="font-medium text-foreground">{totals.payments.toLocaleString()}</span> payments
          </span>
        </p>
      )}
    </>
  )
}

const PLATFORM_DEFAULT_DUAL_PRICING_PCT = 3.5
const CONFIG_COLUMNS = 3

function FeeConfigReadOnly({
  merchantPercentage,
  rows,
  loading,
}: {
  merchantPercentage: number
  rows: LocationFeeRow[]
  loading: boolean
}) {
  const { pageRows, pagination, setPage } = useClientPagination(rows, 10)

  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <Panel>
        <PanelSection
          label="Card surcharge by location"
          caption="Read-only. Snapshots on captured payments are immutable."
        >
          {/* Three short columns and no min-width: it cannot overflow, so it may share a row (§5.6). */}
          <Table variant="data">
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Card surcharge</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={CONFIG_COLUMNS}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableEmptyRow
                  colSpan={CONFIG_COLUMNS}
                  title="No locations for this merchant"
                  hint="Rates appear here once locations are added to the merchant."
                />
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.location_id}>
                    <TableCell className="font-medium">{r.location_name}</TableCell>
                    <TableCell className="tabular-nums">{r.dual_pricing_percentage}%</TableCell>
                    <TableCell className="text-right">
                      <StatusBadge>{r.dual_pricing_percentage > 0 ? 'Enabled' : 'Off'}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="locations" />
        </PanelSection>
      </Panel>

      <Panel>
        <PanelSection label="Defaults">
          <dl className="space-y-3 text-sm">
            <ConfigRow label="Merchant default" value={`${merchantPercentage}%`} />
            <ConfigRow label="Platform default" value={`${PLATFORM_DEFAULT_DUAL_PRICING_PCT}%`} />
          </dl>
          <p className="mt-5 text-xs text-muted-foreground">
            To change rates, edit the merchant or location through the merchant management flow.
          </p>
        </PanelSection>
      </Panel>
    </div>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function exportLocationsCsv(
  merchantName: string,
  rows: LocationFeeRow[],
  range: { from: string; to: string }
) {
  const header = [
    'merchant_name',
    'location_id',
    'location_name',
    'address',
    'dual_pricing_percentage',
    'gross_card_surcharge',
    'refunded',
    'net_platform_fee',
    'payments',
  ]
  const lines = rows.map((r) => {
    const refunded = r.refunded_dual_pricing_fee + r.refunded_tip_fee
    return [
      escapeCsv(merchantName),
      r.location_id,
      escapeCsv(r.location_name),
      escapeCsv(r.location_address ?? ''),
      r.dual_pricing_percentage,
      r.gross_dual_pricing_fee.toFixed(2),
      refunded.toFixed(2),
      r.net_platform_fee.toFixed(2),
      r.payment_count,
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
  a.download = `${slugify(merchantName)}-locations-${fromStr}-to-${toStr}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeCsv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
