'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformGrowthMetrics } from '@/lib/queries/use-platform-analytics-layer2'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
import { Users, TrendingUp, AlertTriangle } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface GrowthSectionProps {
  from: string
  to: string
}

export function GrowthSection({ from, to }: GrowthSectionProps) {
  const { data, isLoading } = usePlatformGrowthMetrics(from, to)

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const kpiCards = [
    {
      title: 'Time to First Order',
      value: `${data?.avgTimeToFirstOrder.toFixed(1) || 0} days`,
      icon: TrendingUp,
      color: 'text-blue-600',
    },
    {
      title: 'Retention Rate',
      value: `${data?.retention.retention_rate.toFixed(1) || 0}%`,
      icon: Users,
      color: 'text-green-600',
    },
    {
      title: 'Merchants at Risk',
      value: data?.churnRisk.length || 0,
      icon: AlertTriangle,
      color: 'text-red-600',
    },
  ]

  const colors = ['#3b82f6', '#10b981', '#f59e0b']

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/90 backdrop-blur-sm border border-blue-100 rounded-lg p-2 shadow-lg text-xs">
          <p className="font-semibold text-slate-900 mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}: {entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-5 md:grid-cols-3">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon
          return (
            <Card
              key={idx}
              className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-blue-700/70">{card.title}</CardTitle>
                <div className="p-1.5 bg-blue-50 rounded-lg">
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className={`text-3xl font-bold tracking-tight ${card.color}`}>{card.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Merchant Acquisition Chart */}
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-2 border-b border-blue-100/50">
          <CardTitle className="text-base font-semibold text-slate-900">Merchant Acquisition Trend</CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80">
            New merchants and locations per week
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data?.merchantAcquisition || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
              <XAxis
                dataKey="period"
                tickFormatter={(v) => v.slice(5)}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="new_merchants"
                stroke="#3b82f6"
                strokeWidth={2}
                name="New Merchants"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="new_locations"
                stroke="#10b981"
                strokeWidth={2}
                name="New Locations"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Onboarding Funnel */}
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-2 border-b border-blue-100/50">
          <CardTitle className="text-base font-semibold text-slate-900">Onboarding Funnel</CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80">
            Merchant progression through setup stages
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data?.onboardingFunnel || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <YAxis
                dataKey="stage"
                type="category"
                width={120}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} />
              <Bar dataKey="merchant_count" radius={[0, 4, 4, 0]}>
                {(data?.onboardingFunnel || []).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Churn Risk Table */}
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-2 border-b border-blue-100/50">
          <CardTitle className="text-base font-semibold text-slate-900">Merchants at Risk (50%+ Revenue Drop)</CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80">
            Compared to prior period
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          {(data?.churnRisk || []).length === 0 ? (
            <div className="flex items-center justify-center h-32 bg-green-50/50 rounded-lg border border-green-100">
              <span className="text-sm text-green-700 font-medium">No merchants at churn risk</span>
            </div>
          ) : (
            <div className="rounded-lg border border-blue-100 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50/50 hover:bg-blue-50/50">
                    <TableHead className="text-xs font-medium text-blue-700">Merchant</TableHead>
                    <TableHead className="text-xs font-medium text-blue-700 text-right">Last Period</TableHead>
                    <TableHead className="text-xs font-medium text-blue-700 text-right">Current Period</TableHead>
                    <TableHead className="text-xs font-medium text-blue-700 text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.churnRisk.map((merchant) => (
                    <TableRow key={merchant.merchant_id} className="hover:bg-blue-50/30 transition-colors">
                      <TableCell className="text-sm font-medium text-slate-900">{merchant.merchant_name}</TableCell>
                      <TableCell className="text-sm text-slate-700 text-right">
                        ${Number(merchant.last_period_revenue).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm text-slate-700 text-right">
                        ${Number(merchant.current_revenue).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">
                          {merchant.change_pct.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}