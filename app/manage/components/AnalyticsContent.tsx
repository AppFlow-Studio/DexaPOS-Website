'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { subDays } from 'date-fns'
import { DateRangePicker } from './DateRangePicker'
import { GrowthSection } from './GrowthSection'
import { RevenueSection } from './RevenueSection'
import { OperationsSection } from './OperationsSection'
import { PaymentsSection } from './PaymentsSection'
import { BarChart3 } from 'lucide-react'

export function AnalyticsContent() {
  // Default to last 30 days
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(
    () => {
      const to = new Date()
      const from = subDays(to, 30)
      return {
        from: from.toISOString(),
        to: to.toISOString()
      }
    }
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-slate-900 to-blue-900 bg-clip-text text-transparent flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-blue-600" />
            Analytics
          </h2>
          <p className="text-sm text-muted-foreground/80">
            Comprehensive insights into platform growth, revenue, operations, and payments
          </p>
        </div>
      </div>

      {/* Date Range Picker */}
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl p-5 hover:shadow-md transition-all duration-200">
        <DateRangePicker
          from={dateRange.from}
          to={dateRange.to}
          onChange={setDateRange}
        />
      </Card>

      {/* Tabs Section */}
      <Tabs defaultValue="growth" className="space-y-4">
        <div className="overflow-x-auto">
        <TabsList className="inline-flex h-auto p-1 bg-white/80 backdrop-blur-sm border border-blue-100/50 shadow-sm rounded-xl">
          <TabsTrigger
            value="growth"
            className="px-3 sm:px-5 py-2.5 rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200 text-sm font-medium"
          >
            Growth
          </TabsTrigger>
          <TabsTrigger
            value="revenue"
            className="px-3 sm:px-5 py-2.5 rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200 text-sm font-medium"
          >
            Revenue
          </TabsTrigger>
          <TabsTrigger
            value="operations"
            className="px-3 sm:px-5 py-2.5 rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200 text-sm font-medium"
          >
            Operations
          </TabsTrigger>
          <TabsTrigger
            value="payments"
            className="px-3 sm:px-5 py-2.5 rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200 text-sm font-medium"
          >
            Payments
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="growth" className="space-y-4">
          <GrowthSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <RevenueSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          <OperationsSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <PaymentsSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>
      </Tabs>
    </div>
  )
}