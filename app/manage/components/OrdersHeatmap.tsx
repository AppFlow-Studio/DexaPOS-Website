'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformOrdersHeatmap } from '@/lib/queries/use-platform-dashboard'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export function OrdersHeatmap() {
  const { data: heatmapData, isLoading } = usePlatformOrdersHeatmap()

  // Get current hour for highlighting
  const currentHour = new Date().getHours()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!heatmapData || heatmapData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No order data available
          </div>
        </CardContent>
      </Card>
    )
  }

  // Format data for chart
  const maxCount = Math.max(...heatmapData.map((d) => d.count), 1)
  const chartData = heatmapData.map((d) => ({
    ...d,
    timeLabel: formatHour(d.hour),
    intensity: d.count / maxCount, // 0-1 for color intensity
  }))

  // Color function based on intensity
  const getBarColor = (intensity: number, hour: number) => {
    if (hour === currentHour) {
      return '#3b82f6' // Blue for current hour
    }
    if (intensity < 0.25) return '#e5e7eb' // Light gray
    if (intensity < 0.5) return '#fbbf24' // Light yellow
    if (intensity < 0.75) return '#f97316' // Orange
    return '#dc2626' // Red for highest
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Order Volume (Last 24 Hours)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="timeLabel"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              interval={2} // Show every 3rd label to avoid crowding
            />
            <YAxis hide />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-background border rounded-lg p-2 shadow-lg text-xs">
                      <p className="font-semibold">{payload[0].payload.timeLabel}</p>
                      <p className="text-muted-foreground">{payload[0].value} orders</p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.intensity, entry.hour)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#e5e7eb' }} />
            <span>Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#fbbf24' }} />
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#f97316' }} />
            <span>High</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#dc2626' }} />
            <span>Peak</span>
          </div>
          <div className="ml-2 flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#3b82f6' }} />
            <span>Now</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatHour(hour: number): string {
  if (hour === 0) return '12AM'
  if (hour < 12) return `${hour}AM`
  if (hour === 12) return '12PM'
  return `${hour - 12}PM`
}
