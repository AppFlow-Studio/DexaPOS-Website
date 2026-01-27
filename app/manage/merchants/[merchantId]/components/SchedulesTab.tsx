'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar, Clock, Lock } from 'lucide-react'
import { AvailabilitySchedulesView } from './AvailabilitySchedulesView'
import { TimesheetsView } from './TimesheetsView'

interface SchedulesTabProps {
  merchantId: string
  locations: any[]
}

export function SchedulesTab({ merchantId, locations }: SchedulesTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">Schedules & Availability</h2>
        <p className="text-muted-foreground">
          Manage staff shifts, timesheets, and menu availability schedules.
        </p>
      </div>

      <Tabs defaultValue="availability" className="w-full">
        <TabsList>
          <TabsTrigger value="availability" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Menu Availability
          </TabsTrigger>
          <TabsTrigger value="timesheets" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Staff Timesheets
          </TabsTrigger>
          {/* Future: Staff Scheduling (when backend is ready) */}
        </TabsList>

        <TabsContent value="availability" className="mt-6">
          <AvailabilitySchedulesView merchantId={merchantId} locations={locations} />
        </TabsContent>

        <TabsContent value="timesheets" className="mt-6">
          <TimesheetsView merchantId={merchantId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
