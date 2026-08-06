'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useIsAllLocations, useSelectedLocation } from '@/stores/location-store'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
} from '@/components/dashboard/shell'
import { DateRangePicker, DatePreset } from '@/components/dashboard/orders/DateRangePicker'
import { SalesSummaryReport } from '@/components/dashboard/orders/reports/SalesSummaryReport'
import { HourlySalesReport } from '@/components/dashboard/orders/reports/HourlySalesReport'
import { ItemSalesReport } from '@/components/dashboard/orders/reports/ItemSalesReport'
import { PaymentSummaryReport } from '@/components/dashboard/orders/reports/PaymentSummaryReport'
import { KitchenPerformanceReport } from '@/components/dashboard/orders/reports/KitchenPerformanceReport'
import { TableTurnsReport } from '@/components/dashboard/orders/reports/TableTurnsReport'
import { ServerPerformanceReport } from '@/components/dashboard/orders/reports/ServerPerformanceReport'
import { VoidsReport } from '@/components/dashboard/orders/reports/VoidsReport'
import { ReportChannelFilter } from '@/components/dashboard/orders/reports/ReportChannelFilter'
import type { OrderSource } from '@/lib/orderout/platform'

const TABS = [
  { value: 'sales-summary', label: 'Sales Summary' },
  { value: 'hourly-sales', label: 'Hourly Sales' },
  { value: 'item-sales', label: 'Item Sales' },
  { value: 'payments', label: 'Payments' },
  { value: 'kitchen', label: 'Kitchen Performance' },
  { value: 'table-turns', label: 'Table Turns' },
  { value: 'server', label: 'Server Performance' },
  { value: 'voids', label: 'Voids & Refunds' },
] as const

export default function ReportsPage() {
  const { orgSlug } = useAuth()
  const selectedLocation = useSelectedLocation()
  const isAllLocations = useIsAllLocations()

  // Date range state
  const [preset, setPreset] = useState<DatePreset>('last_7_days')
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    const date = new Date()
    date.setDate(date.getDate() - 7)
    return date
  })
  const [dateTo, setDateTo] = useState<Date>(new Date())
  const [activeTab, setActiveTab] = useState<string>('sales-summary')
  const [orderSource, setOrderSource] = useState<OrderSource | null>(null)

  // Get merchant and location names for PDF exports
  const merchantName = orgSlug || 'Merchant'
  const locationName = isAllLocations ? 'All Locations' : selectedLocation?.name

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) {
      setDateFrom(from)
      setDateTo(to)
    }
  }

  const reportProps = { dateFrom, dateTo, merchantName, locationName }

  /** Only these two reports can be split by order source. */
  const supportsChannelFilter =
    activeTab === 'sales-summary' || activeTab === 'item-sales'

  return (
    <PageShell>
      {/*
        Reports used to stack a bordered, shadowed, blue-tinted Card per tab on
        top of a solid-blue table header. It now reads as one rounded container
        holding hairline-separated content — the same language as Orders →
        Analytics and the dashboard Overview, so moving between the three pages
        feels like one product.
      */}
      <style>{`
        .reports-date-popover {
          border-radius: 1rem;
          /* Clips the preset rail's square corners to the rounded edge. The
             panel is capped to the height available below the trigger and
             scrolls on its inner columns, so nothing is cut off here. */
          overflow: hidden;
        }
        /* Month/year selects and the Cancel/Apply footer. The preset buttons
           are excluded: they own their own radius, which differs by breakpoint
           (pill-shaped chips when stacked on a phone, a square-cornered list on
           a wide screen). */
        .reports-date-popover button:not(.rounded-full):not([class*="rounded-none"]),
        .reports-date-popover select {
          border-radius: 0.625rem;
        }
        /* Day cells stay pill-shaped so a selected range reads as one bar. */
        .reports-date-popover table button {
          border-radius: 9999px;
        }
      `}</style>

      <PageHeader
        title="Reports"
        subtitle="Download and analyze detailed reports for your business"
        backHref="/dashboard/orders"
        backLabel="Back to Orders"
        indicator={
          <LocationIndicator
            isAllLocations={isAllLocations}
            locationName={selectedLocation?.name}
          />
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Segmented pill tab bar — same affordance as the Analytics tabs and
            the Overview range picker. Scrolls horizontally rather than
            wrapping onto three ragged lines. */}
        <div className="w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            {TABS.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* One date range governing every tab below it, plus the channel
            filter for the two reports that can be split by order source. Both
            live on one control row so the filters read as a single group. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateRangeChange={handleDateRangeChange}
            preset={preset}
            onPresetChange={setPreset}
            triggerClassName="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            contentClassName="reports-date-popover"
          />

          {supportsChannelFilter && (
            <ReportChannelFilter value={orderSource} onChange={setOrderSource} />
          )}
        </div>

        <TabsContent value="sales-summary" className="mt-6">
          <ReportPanel>
            <SalesSummaryReport {...reportProps} orderSource={orderSource} />
          </ReportPanel>
        </TabsContent>

        <TabsContent value="hourly-sales" className="mt-6">
          <ReportPanel>
            <HourlySalesReport {...reportProps} />
          </ReportPanel>
        </TabsContent>

        <TabsContent value="item-sales" className="mt-6">
          <ReportPanel>
            <ItemSalesReport {...reportProps} orderSource={orderSource} />
          </ReportPanel>
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <ReportPanel>
            <PaymentSummaryReport {...reportProps} />
          </ReportPanel>
        </TabsContent>

        <TabsContent value="kitchen" className="mt-6">
          <ReportPanel>
            <KitchenPerformanceReport {...reportProps} />
          </ReportPanel>
        </TabsContent>

        <TabsContent value="table-turns" className="mt-6">
          <ReportPanel>
            <TableTurnsReport {...reportProps} />
          </ReportPanel>
        </TabsContent>

        <TabsContent value="server" className="mt-6">
          <ReportPanel>
            <ServerPerformanceReport {...reportProps} />
          </ReportPanel>
        </TabsContent>

        <TabsContent value="voids" className="mt-6">
          <ReportPanel>
            <VoidsReport {...reportProps} />
          </ReportPanel>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}

/**
 * The rounded container one report's content lives inside.
 *
 * A tier-1 `Panel` with slightly taller padding than the default `padded`
 * (`py-7` vs `py-6`) — reports open on a row of headline figures, which needs
 * a little more air above it than a toolbar does.
 */
function ReportPanel({ children }: { children: React.ReactNode }) {
  return <Panel className="px-6 py-7">{children}</Panel>
}
