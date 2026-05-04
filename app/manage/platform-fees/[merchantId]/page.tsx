'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Download, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useMerchantPlatformFees } from '@/app/manage/hooks/usePlatformFees'
import { Money } from '@/components/platform-fees/money'
import { KpiStrip } from '@/components/platform-fees/kpi-strip'
import { FeeTrendChart } from '@/components/platform-fees/fee-trend-chart'
import { MerchantAvatar } from '@/components/platform-fees/merchant-avatar'
import { StatusBadge } from '@/components/platform-fees/status-badge'
import { PaymentFeeTable } from '@/components/platform-fees/payment-fee-table'
import { RecentActivityTimeline } from '@/components/platform-fees/recent-activity-timeline'
import {
  DateRangeSegmented,
  presetToRange,
  type DateRangePreset,
} from '@/components/platform-fees/date-range-segmented'
import type { LocationFeeRow } from '@/app/manage/actions/hq-platform/platform-fees'
import { cn } from '@/lib/utils'

export default function MerchantPlatformFeesPage({
  params,
}: {
  params: Promise<{ merchantId: string }>
}) {
  const { merchantId } = use(params)
  const [preset, setPreset] = useState<DateRangePreset>('30D')
  const range = useMemo(() => presetToRange(preset), [preset])

  const { data, isLoading, isError } = useMerchantPlatformFees(
    merchantId,
    range.from,
    range.to
  )

  const totals = data?.totals
  const byLocation = data?.byLocation ?? []
  const merchantName = data?.merchant.name ?? 'Loading…'
  const refunded = totals
    ? totals.refunded_dual_pricing_fee + totals.refunded_tip_fee
    : 0
  const grossCard = totals?.gross_dual_pricing_fee ?? 0
  const refundedPct = grossCard > 0 ? (refunded / grossCard) * 100 : 0
  const avgFee = totals && totals.payment_count > 0
    ? totals.net_platform_fee / totals.payment_count
    : 0
  const activeLocations = byLocation.filter((l) => l.payment_count > 0).length

  const onboardingTone = data?.merchant.onboarding_status === 'completed'
    ? 'success'
    : 'info'

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/manage/platform-fees"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Platform Fees
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <MerchantAvatar name={merchantName} size={44} className="text-base" />
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">{merchantName}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono">{merchantId.slice(0, 12)}…</span>
                <span>·</span>
                <span>
                  {byLocation.length} location{byLocation.length === 1 ? '' : 's'}
                </span>
                {data?.merchant.type && (
                  <>
                    <span>·</span>
                    <span className="capitalize">{data.merchant.type}</span>
                  </>
                )}
                {data?.merchant.onboarding_status && (
                  <StatusBadge tone={onboardingTone}>
                    {data.merchant.onboarding_status === 'completed'
                      ? 'Active'
                      : data.merchant.onboarding_status.replace(/_/g, ' ')}
                  </StatusBadge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => exportLocationsCsv(merchantName, byLocation, range)}
              disabled={isLoading || byLocation.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Link href={`/manage/merchants?id=${merchantId}`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                View merchant
              </Button>
            </Link>
          </div>
        </div>
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
          Failed to load merchant fees.
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
            hint: 'Gross dual-pricing',
          },
          {
            label: 'Refunded',
            value: <Money value={-refunded} zeroAsDash />,
            hint: refunded > 0 ? `${refundedPct.toFixed(1)}% of gross` : 'No refund credits',
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
            label: 'Active locations',
            value: (
              <span className="font-mono tabular-nums">
                {activeLocations}{' '}
                <span className="text-muted-foreground">/ {byLocation.length}</span>
              </span>
            ),
            hint: 'With ≥1 captured payment',
          },
        ]}
      />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="locations">
            Locations
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              {byLocation.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="payments">
            Payments
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              {totals?.payment_count ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger value="config">Fee Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Fee trend</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <FeeTrendChart data={data?.byDay ?? []} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Top locations</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <TopLocationsList rows={byLocation} />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <RecentActivityTimeline entries={data?.recentActivity ?? []} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations">
          <LocationsTable rows={byLocation} loading={isLoading} />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentFeeTable
            merchantId={merchantId}
            from={range.from}
            to={range.to}
          />
        </TabsContent>

        <TabsContent value="config">
          <FeeConfigReadOnly
            merchantPercentage={data?.merchant.dual_pricing_percentage ?? 0}
            rows={byLocation}
            loading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TopLocationsList({ rows }: { rows: LocationFeeRow[] }) {
  const top = [...rows]
    .filter((r) => r.payment_count > 0)
    .sort((a, b) => b.net_platform_fee - a.net_platform_fee)
    .slice(0, 5)
  if (top.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No location activity yet.
      </p>
    )
  }
  const max = top[0].net_platform_fee || 1
  return (
    <ul className="space-y-3">
      {top.map((r) => {
        const pct = Math.max(0, (r.net_platform_fee / max) * 100)
        return (
          <li key={r.location_id} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="truncate">{r.location_name}</span>
              <Money value={r.net_platform_fee} className="text-xs font-semibold" />
            </div>
            <div className="h-1.5 rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground">
              {r.payment_count} payment{r.payment_count === 1 ? '' : 's'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function LocationsTable({
  rows,
  loading,
}: {
  rows: LocationFeeRow[]
  loading: boolean
}) {
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

  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <Table>
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
                <TableCell colSpan={7}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                No locations found.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const refundedRow = r.refunded_dual_pricing_fee + r.refunded_tip_fee
              return (
                <TableRow key={r.location_id}>
                  <TableCell className="font-medium">{r.location_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.location_address ?? '—'}
                  </TableCell>
                  <TableCell>
                    {r.dual_pricing_percentage > 0 ? (
                      <span className="font-mono text-xs rounded bg-muted px-1.5 py-0.5">
                        {r.dual_pricing_percentage}%
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Off</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <Money value={r.gross_dual_pricing_fee} zeroAsDash />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <Money value={-refundedRow} zeroAsDash />
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    <Money value={r.net_platform_fee} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {r.payment_count}
                  </TableCell>
                </TableRow>
              )
            })
          )}
          {!loading && rows.length > 0 && (
            <TableRow className="bg-muted/40 font-medium">
              <TableCell colSpan={3}>Total</TableCell>
              <TableCell className="text-right">
                <Money value={totals.gross} />
              </TableCell>
              <TableCell className="text-right">
                <Money value={-totals.refunded} zeroAsDash />
              </TableCell>
              <TableCell className="text-right">
                <Money value={totals.net} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {totals.payments}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

const PLATFORM_DEFAULT_DUAL_PRICING_PCT = 3.5

function FeeConfigReadOnly({
  merchantPercentage,
  rows,
  loading,
}: {
  merchantPercentage: number
  rows: LocationFeeRow[]
  loading: boolean
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <div className="border-b border-border p-4">
          <h3 className="text-sm font-semibold">Per-location card surcharge</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Read-only. Snapshots on captured payments are immutable.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Location</TableHead>
              <TableHead>Card surcharge %</TableHead>
              <TableHead className={cn('text-right')}>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={3}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                  No locations.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.location_id}>
                  <TableCell className="font-medium">{r.location_name}</TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">
                      {r.dual_pricing_percentage}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.dual_pricing_percentage > 0 ? (
                      <StatusBadge tone="success">Enabled</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Off</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ConfigRow
            label="Merchant default"
            value={`${merchantPercentage}%`}
          />
          <ConfigRow
            label="Platform default"
            value={`${PLATFORM_DEFAULT_DUAL_PRICING_PCT}%`}
          />
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            To change rates, edit the merchant or location through the merchant management
            flow.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
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
