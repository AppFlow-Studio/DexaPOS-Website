'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformOrdersHeatmap } from '@/lib/queries/use-platform-dashboard'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Clock } from 'lucide-react'

export function OrdersHeatmap() {
  const { data: heatmapData, isLoading } = usePlatformOrdersHeatmap()

  // Get current hour for highlighting
  const currentHour = new Date().getHours()

  if (isLoading) {
    return (
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">Order Volume (24h)</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  if (!heatmapData || heatmapData.length === 0) {
    return (
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">Order Volume (24h)</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-center justify-center h-[300px] bg-blue-50/30 rounded-lg border border-dashed border-blue-200">
            <span className="text-sm text-muted-foreground">No order data available</span>
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

  // Original color function: low gray, medium yellow, high orange, peak red, current hour blue
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
    <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-2 border-b border-blue-100/50">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-600" />
          <CardTitle className="text-base font-semibold text-slate-900">Order Volume (24h)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
            <XAxis
              dataKey="timeLabel"
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
              interval={2}
            />
            <YAxis hide />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-white/90 backdrop-blur-sm border border-blue-100 rounded-lg p-2 shadow-lg text-xs">
                      <p className="font-semibold text-slate-900">{payload[0].payload.timeLabel}</p>
                      <p className="text-blue-600">{payload[0].value} orders</p>
                    </div>
                  )
                }
                return null
              }}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={500}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.intensity, entry.hour)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#e5e7eb' }} />
            <span className="text-muted-foreground">Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#fbbf24' }} />
            <span className="text-muted-foreground">Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#f97316' }} />
            <span className="text-muted-foreground">High</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#dc2626' }} />
            <span className="text-muted-foreground">Peak</span>
          </div>
          <div className="ml-2 flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-blue-500" />
            <span className="text-muted-foreground">Now</span>
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