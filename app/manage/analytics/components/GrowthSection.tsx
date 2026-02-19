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
          <Skeleton key={i} className="h-64 w-full" />
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

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon
          return (
            <Card key={idx}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Merchant Acquisition Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Merchant Acquisition Trend</CardTitle>
          <CardDescription>New merchants and locations per week</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data?.merchantAcquisition || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tickFormatter={(v) => v.slice(5)} />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="new_merchants"
                stroke="#3b82f6"
                strokeWidth={2}
                name="New Merchants"
              />
              <Line
                type="monotone"
                dataKey="new_locations"
                stroke="#10b981"
                strokeWidth={2}
                name="New Locations"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Onboarding Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Onboarding Funnel</CardTitle>
          <CardDescription>Merchant progression through setup stages</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data?.onboardingFunnel || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="stage" type="category" width={120} tick={{ fontSize: 12 }} />
              <Tooltip />
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
      <Card>
        <CardHeader>
          <CardTitle>Merchants at Risk (50%+ Revenue Drop)</CardTitle>
          <CardDescription>Compared to prior period</CardDescription>
        </CardHeader>
        <CardContent>
          {(data?.churnRisk || []).length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No merchants at churn risk</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">Last Period</TableHead>
                  <TableHead className="text-right">Current Period</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.churnRisk.map((merchant) => (
                  <TableRow key={merchant.merchant_id}>
                    <TableCell className="font-medium">{merchant.merchant_name}</TableCell>
                    <TableCell className="text-right">
                      ${Number(merchant.last_period_revenue).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      ${Number(merchant.current_revenue).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive">
                        {merchant.change_pct.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
