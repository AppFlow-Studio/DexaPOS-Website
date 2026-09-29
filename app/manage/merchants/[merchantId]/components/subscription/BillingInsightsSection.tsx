'use client'

import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { SubscriptionInvoiceRecord } from '@/app/manage/actions/subscription-billing'
import { BillingHistorySection } from './BillingHistorySection'
import { InfoHint } from './InfoHint'
import { formatDate, formatMoney } from './helpers'

// Raw custom properties, never `hsl(var(--…))` (UI-DESIGN-SYSTEM C2). Collected
// is the headline series in the brand colour; failed sits beside it in neutral.
const trendChartConfig = {
  paid: { label: 'Collected', color: 'var(--brand)' },
  failed: { label: 'Failed', color: 'var(--muted-foreground)' },
} satisfies ChartConfig

// One series: the x-axis names each status, so a hue per bar encodes nothing (§6.1).
const statusChartConfig = {
  count: { label: 'Invoices', color: 'var(--brand)' },
} satisfies ChartConfig

const statusLabels: Record<string, string> = {
  open: 'Open',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
}

export interface BillingInsightsLocation {
  id: string
  name: string
}

interface BillingInsightsSectionProps {
  invoices: SubscriptionInvoiceRecord[]
  locations: BillingInsightsLocation[]
  invoiceActionId: string | null
  isBusy: boolean
  onPreview: (invoiceId: string) => void
  onDownload: (invoiceId: string) => void
  onCharge: (invoiceId: string) => void
}

/**
 * Overview "Billing & invoices" section with insights — a location filter,
 * money-in / pending / failed tiles, a payment-trend area chart and a status
 * distribution bar chart, plus the full invoice history table. Self-contained:
 * all analytics are computed here from the passed invoices.
 */
export function BillingInsightsSection({
  invoices,
  locations,
  invoiceActionId,
  isBusy,
  onPreview,
  onDownload,
  onCharge,
}: BillingInsightsSectionProps) {
  const [locationFilter, setLocationFilter] = useState('all')

  const filteredInvoices = useMemo(
    () =>
      locationFilter === 'all'
        ? invoices
        : invoices.filter((invoice) => invoice.location_id === locationFilter),
    [invoices, locationFilter],
  )

  const summary = useMemo(() => {
    const paid = filteredInvoices
      .filter((invoice) => invoice.status === 'paid')
      .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)
    const pendingInvoices = filteredInvoices.filter((invoice) =>
      ['open', 'processing'].includes(invoice.status),
    )
    const pending = pendingInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)
    const pendingSubtotal = pendingInvoices.reduce((sum, invoice) => sum + Number(invoice.subtotal || 0), 0)
    const pendingSurcharge = pendingInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.card_surcharge || 0),
      0,
    )
    const failedCount = filteredInvoices.filter((invoice) => invoice.status === 'failed').length
    return { paid, pending, pendingSubtotal, pendingSurcharge, failedCount }
  }, [filteredInvoices])

  const trendData = useMemo(() => {
    const byDay = new Map<string, { label: string; paid: number; failed: number }>()
    for (const invoice of filteredInvoices) {
      const dateKey = (invoice.paid_at || invoice.created_at || invoice.due_date || '').slice(0, 10)
      if (!dateKey) continue
      const current = byDay.get(dateKey) ?? { label: formatDate(dateKey), paid: 0, failed: 0 }
      if (invoice.status === 'paid') current.paid += Number(invoice.total_amount || 0)
      if (invoice.status === 'failed') current.failed += Number(invoice.total_amount || 0)
      byDay.set(dateKey, current)
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
  }, [filteredInvoices])

  const statusData = useMemo(() => {
    const bucketOrder = ['open', 'processing', 'paid', 'failed']
    const buckets = new Map<string, { count: number; total: number }>()
    for (const invoice of filteredInvoices) {
      const current = buckets.get(invoice.status) ?? { count: 0, total: 0 }
      current.count += 1
      current.total += Number(invoice.total_amount || 0)
      buckets.set(invoice.status, current)
    }
    return bucketOrder
      .filter((statusKey) => buckets.has(statusKey))
      .map((statusKey) => {
        const bucket = buckets.get(statusKey)!
        const label = statusLabels[statusKey] ?? statusKey.replace('_', ' ')
        return { status: statusKey, label, count: bucket.count, total: bucket.total }
      })
  }, [filteredInvoices])

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base text-[#0C4FD1] dark:text-[#6CA0FF]">
              Billing &amp; invoices
              <InfoHint label="Subscription payment activity across the merchant tier and every location. Filter by location to drill in." />
            </CardTitle>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="h-8 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Insight tiles */}
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/60 p-4">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                Net collected
                <InfoHint label="Total of all paid subscription invoices in view." />
              </div>
              <div className="mt-1 text-2xl font-medium leading-tight tracking-[-0.02em] tabular-nums">
                {formatMoney(summary.paid)}
              </div>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                Pending
                <InfoHint label="Open + processing invoices not yet collected. Includes card surcharge." />
              </div>
              <div className="mt-1 text-2xl font-medium leading-tight tracking-[-0.02em] tabular-nums">
                {formatMoney(summary.pending)}
              </div>
              {summary.pending > 0 && (
                <div className="mt-0.5 text-[0.8125rem] tabular-nums text-muted-foreground">
                  {formatMoney(summary.pendingSubtotal)} + {formatMoney(summary.pendingSurcharge)} surcharge
                </div>
              )}
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                Failed charges
                <InfoHint label="Invoices whose card charge failed and needs attention." />
              </div>
              <div className="mt-1 text-2xl font-medium leading-tight tracking-[-0.02em] tabular-nums">
                {summary.failedCount}
              </div>
            </div>
          </div>

          {/* Charts */}
          {/* grid-cols-1 + min-w-0: an implicit `auto` track sizes to the chart's
              rendered width and never shrinks back, pushing it off a phone. */}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-2xl border p-4">
              <div className="mb-2 text-sm font-medium">Payment trend</div>
              {trendData.length > 0 ? (
                <ChartContainer config={trendChartConfig} className="h-[220px] w-full">
                  <AreaChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="paid" stroke="var(--color-paid)" fill="var(--color-paid)" fillOpacity={0.18} />
                    <Area type="monotone" dataKey="failed" stroke="var(--color-failed)" fill="var(--color-failed)" fillOpacity={0.1} />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                  No charge activity yet
                </div>
              )}
            </div>
            <div className="min-w-0 rounded-2xl border p-4">
              <div className="mb-2 text-sm font-medium">Invoice status</div>
              {statusData.length > 0 ? (
                <ChartContainer config={statusChartConfig} className="h-[220px] w-full">
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                  No status distribution yet
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <BillingHistorySection
        invoices={filteredInvoices}
        invoiceActionId={invoiceActionId}
        isBusy={isBusy}
        onPreview={onPreview}
        onDownload={onDownload}
        onCharge={onCharge}
      />
    </div>
  )
}
