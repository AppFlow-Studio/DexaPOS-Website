'use client'

import { useState } from 'react'
import { useIsAllLocations, useSelectedLocation } from '@/stores/location-store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MapPin, Globe } from 'lucide-react'
import { DateRangePicker, DatePreset } from '@/components/dashboard/orders/DateRangePicker'
import { SalesSummaryReport } from '@/components/dashboard/orders/reports/SalesSummaryReport'
import { HourlySalesReport } from '@/components/dashboard/orders/reports/HourlySalesReport'

export default function ReportsPage() {
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
          <TabsTrigger value="item-sales" disabled>Item Sales</TabsTrigger>
          <TabsTrigger value="payments" disabled>Payments</TabsTrigger>
          <TabsTrigger value="kitchen" disabled>Kitchen Performance</TabsTrigger>
          <TabsTrigger value="table-turns" disabled>Table Turns</TabsTrigger>
          <TabsTrigger value="server" disabled>Server Performance</TabsTrigger>
          <TabsTrigger value="voids" disabled>Voids & Refunds</TabsTrigger>
        </TabsList>

        {/* Sales Summary Report */}
        <TabsContent value="sales-summary">
          <Card>
            <CardContent className="pt-6">
              <SalesSummaryReport dateFrom={dateFrom} dateTo={dateTo} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hourly Sales Report */}
        <TabsContent value="hourly-sales">
          <Card>
            <CardContent className="pt-6">
              <HourlySalesReport dateFrom={dateFrom} dateTo={dateTo} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Placeholder tabs for future reports */}
        <TabsContent value="item-sales">
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Item Sales Report coming soon
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Payment Summary Report coming soon
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kitchen">
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Kitchen Performance Report coming soon
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="table-turns">
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Table Turns Report coming soon
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="server">
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Server Performance Report coming soon
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voids">
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Voids & Refunds Report coming soon
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  )
}

