'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useIsAllLocations, useSelectedLocation } from '@/stores/location-store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MapPin, Globe } from 'lucide-react'
import { DateRangePicker, DatePreset } from '@/components/dashboard/orders/DateRangePicker'
import { SalesSummaryReport } from '@/components/dashboard/orders/reports/SalesSummaryReport'
import { HourlySalesReport } from '@/components/dashboard/orders/reports/HourlySalesReport'
import { ItemSalesReport } from '@/components/dashboard/orders/reports/ItemSalesReport'
import { PaymentSummaryReport } from '@/components/dashboard/orders/reports/PaymentSummaryReport'
import { KitchenPerformanceReport } from '@/components/dashboard/orders/reports/KitchenPerformanceReport'
import { TableTurnsReport } from '@/components/dashboard/orders/reports/TableTurnsReport'
import { ServerPerformanceReport } from '@/components/dashboard/orders/reports/ServerPerformanceReport'
import { VoidsReport } from '@/components/dashboard/orders/reports/VoidsReport'

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
  const [activeTab, setActiveTab] = useState('sales-summary')

  // Get merchant and location names for PDF exports
  const merchantName = orgSlug || 'Merchant'
  const locationName = isAllLocations ? 'All Locations' : selectedLocation?.name

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) {
      setDateFrom(from)
      setDateTo(to)
    }
  }

  return (
    <main className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
            {isAllLocations ? (
              <Badge variant="outline" className="gap-1">
                <Globe className="h-3 w-3" />
                All Locations
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" />
                {selectedLocation?.name}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Download and analyze detailed reports for your business
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateRangeChange={handleDateRangeChange}
          preset={preset}
          onPresetChange={setPreset}
        />
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="sales-summary">Sales Summary</TabsTrigger>
          <TabsTrigger value="hourly-sales">Hourly Sales</TabsTrigger>
          <TabsTrigger value="item-sales">Item Sales</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="kitchen">Kitchen Performance</TabsTrigger>
          <TabsTrigger value="table-turns">Table Turns</TabsTrigger>
          <TabsTrigger value="server">Server Performance</TabsTrigger>
          <TabsTrigger value="voids">Voids & Refunds</TabsTrigger>
        </TabsList>

        {/* Sales Summary Report */}
        <TabsContent value="sales-summary">
          <Card>
            <CardContent className="pt-6">
              <SalesSummaryReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hourly Sales Report */}
        <TabsContent value="hourly-sales">
          <Card>
            <CardContent className="pt-6">
              <HourlySalesReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Item Sales Report */}
        <TabsContent value="item-sales">
          <Card>
            <CardContent className="pt-6">
              <ItemSalesReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Summary Report */}
        <TabsContent value="payments">
          <Card>
            <CardContent className="pt-6">
              <PaymentSummaryReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Kitchen Performance Report */}
        <TabsContent value="kitchen">
          <Card>
            <CardContent className="pt-6">
              <KitchenPerformanceReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Table Turns Report */}
        <TabsContent value="table-turns">
          <Card>
            <CardContent className="pt-6">
              <TableTurnsReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Server Performance Report */}
        <TabsContent value="server">
          <Card>
            <CardContent className="pt-6">
              <ServerPerformanceReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Voids & Refunds Report */}
        <TabsContent value="voids">
          <Card>
            <CardContent className="pt-6">
              <VoidsReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  )
}

