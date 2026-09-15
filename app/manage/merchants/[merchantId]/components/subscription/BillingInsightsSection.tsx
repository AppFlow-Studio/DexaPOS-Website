'use client'

import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
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

const trendChartConfig = {
  paid: { label: 'Collected', color: 'hsl(var(--chart-1))' },
  failed: { label: 'Failed', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig

const statusChartConfig = {
  count: { label: 'Invoices', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

const statusVisuals: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: '#F59E0B' },
  processing: { label: 'Processing', color: '#3B82F6' },
  paid: { label: 'Paid', color: '#10B981' },
  failed: { label: 'Failed', color: '#EF4444' },
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
        const visuals = statusVisuals[statusKey] ?? { label: statusKey.replace('_', ' '), color: 'hsl(var(--chart-2))' }
        return { status: statusKey, label: visuals.label, color: visuals.color, count: bucket.count, total: bucket.total }
      })
  }, [filteredInvoices])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
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
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/40 p-4">
              <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                Net collected
                <InfoHint label="Total of all paid subscription invoices in view." />
              </div>
              <div className="mt-1 text-2xl font-semibold text-emerald-600">{formatMoney(summary.paid)}</div>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                Pending
                <InfoHint label="Open + processing invoices not yet collected. Includes card surcharge." />
              </div>
              <div className="mt-1 text-2xl font-semibold">{formatMoney(summary.pending)}</div>
              {summary.pending > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatMoney(summary.pendingSubtotal)} + {formatMoney(summary.pendingSurcharge)} surcharge
                </div>
              )}
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                Failed charges
                <InfoHint label="Invoices whose card charge failed and needs attention." />
              </div>
              <div className={`mt-1 text-2xl font-semibold ${summary.failedCount > 0 ? 'text-destructive' : ''}`}>
                {summary.failedCount}
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4">
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
            <div className="rounded-xl border p-4">
              <div className="mb-2 text-sm font-medium">Invoice status</div>
              {statusData.length > 0 ? (
                <ChartContainer config={statusChartConfig} className="h-[220px] w-full">
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {statusData.map((entry) => (
                        <Cell key={entry.status} fill={entry.color} />
                      ))}
                    </Bar>
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
        limit={20}
      />
    </div>
  )
}
