'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useIsAllLocations, useSelectedLocation } from '@/stores/location-store'
import { Card, CardContent } from '@/components/ui/card'

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
      {/* Header with Blue Theme */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Reports</h1>
             
            </div>
            <p className="text-base text-slate-600">
              Download and analyze detailed reports for your business
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-1 bg-gradient-to-r rounded-full w-24"></div>
      </div>

      {/* Controls with Blue Styling */}
      
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateRangeChange={handleDateRangeChange}
            preset={preset}
            onPresetChange={setPreset}
          />
      

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList className="flex-wrap h-auto gap-2 bg-transparent border-b-2 border-slate-200 rounded-none p-0 pb-2">
  <TabsTrigger
    value="sales-summary"
    className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 hover:text-slate-900 rounded-none"
  >
    Sales Summary
  </TabsTrigger>
  <TabsTrigger
    value="hourly-sales"
    className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 hover:text-slate-900 rounded-none"
  >
    Hourly Sales
  </TabsTrigger>
  <TabsTrigger
    value="item-sales"
    className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 hover:text-slate-900 rounded-none"
  >
    Item Sales
  </TabsTrigger>
  <TabsTrigger
    value="payments"
    className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 hover:text-slate-900 rounded-none"
  >
    Payments
  </TabsTrigger>
  <TabsTrigger
    value="kitchen"
    className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 hover:text-slate-900 rounded-none"
  >
    Kitchen Performance
  </TabsTrigger>
  <TabsTrigger
    value="table-turns"
    className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 hover:text-slate-900 rounded-none"
  >
    Table Turns
  </TabsTrigger>
  <TabsTrigger
    value="server"
    className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 hover:text-slate-900 rounded-none"
  >
    Server Performance
  </TabsTrigger>
  <TabsTrigger
    value="voids"
    className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 hover:text-slate-900 rounded-none"
  >
    Voids & Refunds
  </TabsTrigger>
</TabsList>

        {/* Sales Summary Report */}
        <TabsContent value="sales-summary">
          <Card className="border-blue-200 shadow-lg">
            <CardContent className="pt-6">
              <SalesSummaryReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hourly Sales Report */}
        <TabsContent value="hourly-sales">
          <Card className="border-blue-200 shadow-lg">
            <CardContent className="pt-6">
              <HourlySalesReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Item Sales Report */}
        <TabsContent value="item-sales">
          <Card className="border-blue-200 shadow-lg">
            <CardContent className="pt-6">
              <ItemSalesReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Summary Report */}
        <TabsContent value="payments">
          <Card className="border-blue-200 shadow-lg">
            <CardContent className="pt-6">
              <PaymentSummaryReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Kitchen Performance Report */}
        <TabsContent value="kitchen">
          <Card className="border-blue-200 shadow-lg">
            <CardContent className="pt-6">
              <KitchenPerformanceReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Table Turns Report */}
        <TabsContent value="table-turns">
          <Card className="border-blue-200 shadow-lg">
            <CardContent className="pt-6">
              <TableTurnsReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Server Performance Report */}
        <TabsContent value="server">
          <Card className="border-blue-200 shadow-lg">
            <CardContent className="pt-6">
              <ServerPerformanceReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Voids & Refunds Report */}
        <TabsContent value="voids">
          <Card className="border-blue-200 shadow-lg">
            <CardContent className="pt-6">
              <VoidsReport dateFrom={dateFrom} dateTo={dateTo} merchantName={merchantName} locationName={locationName} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  )
}

