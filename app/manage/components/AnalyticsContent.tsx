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

export function AnalyticsContent () {
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
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
            <BarChart3 className='h-6 w-6' />
            Analytics
          </h2>
          <p className='text-muted-foreground'>
            Comprehensive insights into platform growth, revenue, operations,
            and payments
          </p>
        </div>
      </div>

      {/* Date Range Picker */}
      <Card className='p-4'>
        <DateRangePicker
          from={dateRange.from}
          to={dateRange.to}
          onChange={setDateRange}
        />
      </Card>

      {/* Tabs Section */}
      <Tabs defaultValue='growth' className='space-y-4'>
        <TabsList className='grid w-full grid-cols-4'>
          <TabsTrigger value='growth'>Growth</TabsTrigger>
          <TabsTrigger value='revenue'>Revenue</TabsTrigger>
          <TabsTrigger value='operations'>Operations</TabsTrigger>
          <TabsTrigger value='payments'>Payments</TabsTrigger>
        </TabsList>

        <TabsContent value='growth' className='space-y-4'>
          <GrowthSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>

        <TabsContent value='revenue' className='space-y-4'>
          <RevenueSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>

        <TabsContent value='operations' className='space-y-4'>
          <OperationsSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>

        <TabsContent value='payments' className='space-y-4'>
          <PaymentsSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
