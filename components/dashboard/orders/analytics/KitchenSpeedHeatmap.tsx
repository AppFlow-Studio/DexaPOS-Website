'use client'

import { ChartCard } from './ChartCard'
import { Flame } from 'lucide-react'
import type { KitchenHeatmapCell } from '@/types/analytics'

interface KitchenSpeedHeatmapProps {
  data?: KitchenHeatmapCell[]
  isLoading?: boolean
}

export function KitchenSpeedHeatmap({
  data,
  isLoading,
}: KitchenSpeedHeatmapProps) {
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hourLabels = [
    '12am', '1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am',
    '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm',
    '8pm', '9pm', '10pm', '11pm',
  ]

  // Find min/max for color scaling
  const validData = data?.filter((d) => d.avg_ticket_minutes > 0) || []
  const minTime = validData.length > 0 ? Math.min(...validData.map((d) => d.avg_ticket_minutes)) : 0
  const maxTime = validData.length > 0 ? Math.max(...validData.map((d) => d.avg_ticket_minutes)) : 1

  const getIntensityColor = (minutes: number) => {
    if (minutes === 0) return 'bg-slate-100 dark:bg-slate-800'

    const intensity = (minutes - minTime) / (maxTime - minTime)
    if (intensity < 0.33) return 'bg-green-100 dark:bg-green-900'
    if (intensity < 0.66) return 'bg-yellow-100 dark:bg-yellow-900'
    return 'bg-red-100 dark:bg-red-900'
  }

  const getTextColor = (minutes: number) => {
    if (minutes === 0) return 'text-slate-400'
    const intensity = (minutes - minTime) / (maxTime - minTime)
    if (intensity < 0.33) return 'text-green-700 dark:text-green-300'
    if (intensity < 0.66) return 'text-yellow-700 dark:text-yellow-300'
    return 'text-red-700 dark:text-red-300'
  }

  // Create a map for quick lookup
  const dataMap = new Map(
    data?.map((d) => [`${d.hour_of_day}-${d.day_of_week}`, d]) || []
  )

  return (
    <ChartCard
      title="Kitchen Speed Heatmap"
      subtitle="Average prep time by hour and day of week"
      icon={Flame}
      isLoading={isLoading}
      isEmpty={!data || data.length === 0}
      className="lg:col-span-2"
    >
      {data && data.length > 0 && (
        <div className="space-y-4">
          <div className="overflow-x-auto flex justify-center">
            <div className="min-w-fit">
              {/* Header with day labels */}
              <div className="flex items-start">
                <div className="w-16 flex-shrink-0" />
                <div className="flex gap-1">
                  {dayLabels.map((day) => (
                    <div
                      key={day}
                      className="w-12 h-8 flex items-center justify-center text-xs font-semibold text-muted-foreground"
                    >
                      {day}
                    </div>
                  ))}
                </div>
              </div>

              {/* Heatmap rows */}
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="flex items-center gap-1">
                  <div className="w-16 flex-shrink-0 text-xs text-muted-foreground text-right pr-2">
                    {hourLabels[hour]}
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: 7 }, (_, day) => {
                      const cellData = dataMap.get(`${hour}-${day}`)
                      const minutes = cellData?.avg_ticket_minutes || 0
                      return (
                        <div
                          key={`${hour}-${day}`}
                          className={`w-12 h-8 flex items-center justify-center rounded text-xs font-semibold cursor-help transition-all hover:ring-2 hover:ring-offset-1 ring-slate-300 ${getIntensityColor(minutes)}`}
                          title={`${hourLabels[hour]}, ${dayLabels[day]}: ${minutes.toFixed(1)} min`}
                        >
                          {minutes > 0 && (
                            <span className={getTextColor(minutes)}>
                              {minutes.toFixed(0)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs pt-4 border-t">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 dark:bg-green-900 rounded" />
              <span>Fast</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-100 dark:bg-yellow-900 rounded" />
              <span>Moderate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 dark:bg-red-900 rounded" />
              <span>Slow</span>
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  )
}
