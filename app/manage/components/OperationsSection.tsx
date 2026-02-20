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

export function OperationsSection({ from, to }: OperationsSectionProps) {
  const { data, isLoading } = usePlatformOperationalMetrics(from, to)

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
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
      color: 'text-blue-600',
    },
    {
      title: 'Avg Table Turn',
      value: `${data?.avgTableTurnMinutes.toFixed(1) || 0} min`,
      icon: Clock,
      color: 'text-green-600',
    },
    {
      title: 'KDS Adoption',
      value: `${adoptionRates.kds?.adoption_pct.toFixed(1) || 0}%`,
      icon: Zap,
      color: 'text-yellow-600',
    },
    {
      title: 'Table Mgmt',
      value: `${adoptionRates.tableManagement?.adoption_pct.toFixed(1) || 0}%`,
      icon: TrendingUp,
      color: 'text-purple-600',
    },
    {
      title: 'Online Ordering',
      value: `${adoptionRates.onlineOrdering?.adoption_pct.toFixed(1) || 0}%`,
      icon: Zap,
      color: 'text-orange-600',
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon
          return (
            <Card key={idx}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Peak Hours Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Peak Hours Heatmap</CardTitle>
          <CardDescription>Order volume by day and hour</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="inline-block">
              {/* Column headers (hours) */}
              <div className="flex mb-2">
                <div className="w-16 text-xs font-medium text-center px-1">Day</div>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="w-8 text-xs font-medium text-center px-0.5">
                    {h}
                  </div>
                ))}
              </div>

              {/* Heatmap rows */}
              {Array.from({ length: 7 }, (_, dow) => {
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                return (
                  <div key={dow} className="flex items-center mb-1">
                    <div className="w-16 text-xs font-medium text-right pr-2">{dayNames[dow]}</div>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const cellData = (data?.peakHoursHeatmap || []).find((h) => h.day_of_week === dow && h.hour === hour)
                      const maxCount = Math.max(...(data?.peakHoursHeatmap || []).map((h) => h.order_count), 1)
                      const intensity = cellData ? cellData.order_count / maxCount : 0
                      const bgColor = `rgba(59, 130, 246, ${intensity * 0.9})`

                      return (
                        <div
                          key={`${dow}-${hour}`}
                          className="w-8 h-6 border border-gray-200 flex items-center justify-center text-xs cursor-pointer hover:brightness-110"
                          style={{ backgroundColor: bgColor }}
                          title={`Day ${dow} Hour ${hour}: ${cellData?.order_count || 0} orders`}
                        >
                          {cellData && cellData.order_count > 0 ? (
                            <span className="text-white text-xs font-bold">{cellData.order_count}</span>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trend Lines */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kitchen Time Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data?.kitchenTrend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} />
                <YAxis />
                <Tooltip formatter={(value) => `${Number(value).toFixed(1)} min`} />
                <Line type="monotone" dataKey="avg_minutes" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Table Turn Time Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data?.tableTurnTrend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} />
                <YAxis />
                <Tooltip formatter={(value) => `${Number(value).toFixed(1)} min`} />
                <Line type="monotone" dataKey="avg_minutes" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Busiest Locations */}
      <Card>
        <CardHeader>
          <CardTitle>Busiest Locations</CardTitle>
          <CardDescription>Top 10 by order count</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead className="text-right">Orders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.busiestLocations || []).map((location, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{location.location_name}</TableCell>
                  <TableCell>{location.merchant_name}</TableCell>
                  <TableCell className="text-right font-bold">{location.order_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
