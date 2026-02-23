'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformOperationalMetrics } from '@/lib/queries/use-platform-analytics-layer2'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Clock, Zap, TrendingUp } from 'lucide-react'

interface OperationsSectionProps {
  from: string
  to: string
}

// Color palette for KPI icons (keeping original colors)
const KPI_COLORS = ['text-blue-600', 'text-green-600', 'text-yellow-600', 'text-purple-600', 'text-orange-600']

export function OperationsSection({ from, to }: OperationsSectionProps) {
  const { data, isLoading } = usePlatformOperationalMetrics(from, to)

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const adoptionRates = {
    kds: data?.featureAdoption.find((f) => f.feature === 'kds'),
    tableManagement: data?.featureAdoption.find((f) => f.feature === 'table_management'),
    onlineOrdering: data?.featureAdoption.find((f) => f.feature === 'online_ordering'),
  }

  const kpiCards = [
    {
      title: 'Avg Kitchen Time',
      value: `${data?.avgKitchenMinutes.toFixed(1) || 0} min`,
      icon: Clock,
      color: KPI_COLORS[0],
    },
    {
      title: 'Avg Table Turn',
      value: `${data?.avgTableTurnMinutes.toFixed(1) || 0} min`,
      icon: Clock,
      color: KPI_COLORS[1],
    },
    {
      title: 'KDS Adoption',
      value: `${adoptionRates.kds?.adoption_pct.toFixed(1) || 0}%`,
      icon: Zap,
      color: KPI_COLORS[2],
    },
    {
      title: 'Table Mgmt',
      value: `${adoptionRates.tableManagement?.adoption_pct.toFixed(1) || 0}%`,
      icon: TrendingUp,
      color: KPI_COLORS[3],
    },
    {
      title: 'Online Ordering',
      value: `${adoptionRates.onlineOrdering?.adoption_pct.toFixed(1) || 0}%`,
      icon: Zap,
      color: KPI_COLORS[4],
    },
  ]

  // Heatmap color function – green (low) → yellow → orange → red (high)
  const getHeatmapColor = (intensity: number) => {
    // Color stops: green (#22c55e), yellow (#eab308), orange (#f97316), red (#ef4444)
    const stops = [
      { pos: 0, r: 34, g: 197, b: 94 },   // green
      { pos: 0.33, r: 234, g: 179, b: 8 }, // yellow
      { pos: 0.66, r: 249, g: 115, b: 22 }, // orange
      { pos: 1, r: 239, g: 68, b: 68 },    // red
    ]

    // Find the two stops between which intensity lies
    let lower = stops[0]
    let upper = stops[stops.length - 1]
    for (let i = 0; i < stops.length - 1; i++) {
      if (intensity >= stops[i].pos && intensity <= stops[i + 1].pos) {
        lower = stops[i]
        upper = stops[i + 1]
        break
      }
    }

    // Interpolate between lower and upper
    const range = upper.pos - lower.pos
    const t = range === 0 ? 0 : (intensity - lower.pos) / range
    const r = Math.round(lower.r + (upper.r - lower.r) * t)
    const g = Math.round(lower.g + (upper.g - lower.g) * t)
    const b = Math.round(lower.b + (upper.b - lower.b) * t)
    return `rgb(${r}, ${g}, ${b})`
  }

  const maxOrderCount = Math.max(...(data?.peakHoursHeatmap || []).map((h) => h.order_count), 1)

  // Prepare day names
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  return (
    <div className="space-y-6">
      {/* KPI Cards - modernized */}
      <div className="grid gap-5 md:grid-cols-5">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon
          return (
            <Card
              key={idx}
              className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-blue-700/70">{card.title}</CardTitle>
                <div className="p-1.5 bg-blue-50 rounded-lg">
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className={`text-2xl font-bold tracking-tight ${card.color}`}>{card.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Peak Hours Heatmap */}
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-2 border-b border-blue-100/50">
          <CardTitle className="text-base font-semibold text-slate-900">Peak Hours Heatmap</CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80">
            Order volume by day and hour (green = low, red = high)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-blue-200">
            <div className="inline-block min-w-full">
              {/* Column headers (hours) */}
              <div className="flex mb-2 ml-16">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="w-8 text-xs font-medium text-center text-muted-foreground">
                    {h.toString().padStart(2, '0')}
                  </div>
                ))}
              </div>

              {/* Heatmap rows */}
              {Array.from({ length: 7 }, (_, dow) => (
                <div key={dow} className="flex items-center mb-1">
                  <div className="w-16 text-xs font-medium text-slate-700 pr-2">{dayNames[dow].slice(0, 3)}</div>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const cellData = (data?.peakHoursHeatmap || []).find(
                      (h) => h.day_of_week === dow && h.hour === hour
                    )
                    const intensity = cellData ? cellData.order_count / maxOrderCount : 0

                    return (
                      <div
                        key={`${dow}-${hour}`}
                        className="w-8 h-8 rounded-sm flex items-center justify-center text-xs font-medium transition-all duration-100 hover:scale-110 hover:shadow-md cursor-default"
                        style={{
                          backgroundColor: intensity > 0 ? getHeatmapColor(intensity) : '#f8fafc',
                          color: intensity > 0.5 ? 'white' : '#1e293b',
                          border: '1px solid rgba(203, 213, 225, 0.3)',
                        }}
                        title={`${dayNames[dow]} ${hour}:00 – ${cellData?.order_count || 0} orders`}
                      >
                        {cellData && cellData.order_count > 0 ? cellData.order_count : ''}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs">
            <span className="text-muted-foreground">Low</span>
            <div className="flex h-3 w-20 rounded-sm overflow-hidden">
              <div className="h-full w-1/5" style={{ backgroundColor: getHeatmapColor(0) }} />
              <div className="h-full w-1/5" style={{ backgroundColor: getHeatmapColor(0.25) }} />
              <div className="h-full w-1/5" style={{ backgroundColor: getHeatmapColor(0.5) }} />
              <div className="h-full w-1/5" style={{ backgroundColor: getHeatmapColor(0.75) }} />
              <div className="h-full w-1/5" style={{ backgroundColor: getHeatmapColor(1) }} />
            </div>
            <span className="text-muted-foreground">High</span>
          </div>
        </CardContent>
      </Card>

      {/* Trend Lines */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2 border-b border-blue-100/50">
            <CardTitle className="text-base font-semibold text-slate-900">Kitchen Time Trend</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data?.kitchenTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white/90 backdrop-blur-sm border border-blue-100 rounded-lg p-2 shadow-lg text-xs">
                          <p className="font-semibold text-slate-900 mb-1">{label}</p>
                          <p className="text-blue-600">{payload[0].value} min</p>
                        </div>
                      )
                    }
                    return null
                  }}
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                />
                <Line
                  type="monotone"
                  dataKey="avg_minutes"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Kitchen Time"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2 border-b border-blue-100/50">
            <CardTitle className="text-base font-semibold text-slate-900">Table Turn Time Trend</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data?.tableTurnTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white/90 backdrop-blur-sm border border-blue-100 rounded-lg p-2 shadow-lg text-xs">
                          <p className="font-semibold text-slate-900 mb-1">{label}</p>
                          <p className="text-green-600">{payload[0].value} min</p>
                        </div>
                      )
                    }
                    return null
                  }}
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                />
                <Line
                  type="monotone"
                  dataKey="avg_minutes"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="Table Turn Time"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Busiest Locations */}
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-2 border-b border-blue-100/50">
          <CardTitle className="text-base font-semibold text-slate-900">Busiest Locations</CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80">
            Top 10 by order count
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          <div className="rounded-lg border border-blue-100 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-blue-50/50 hover:bg-blue-50/50">
                  <TableHead className="text-xs font-medium text-blue-700">Location</TableHead>
                  <TableHead className="text-xs font-medium text-blue-700">Merchant</TableHead>
                  <TableHead className="text-xs font-medium text-blue-700 text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.busiestLocations || []).map((location, idx) => (
                  <TableRow key={idx} className="hover:bg-blue-50/30 transition-colors">
                    <TableCell className="text-sm font-medium text-slate-900">{location.location_name}</TableCell>
                    <TableCell className="text-sm text-slate-700">{location.merchant_name}</TableCell>
                    <TableCell className="text-sm text-slate-900 font-bold text-right">
                      {location.order_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}