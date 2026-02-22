'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { usePlatformPaymentMetrics } from '@/lib/queries/use-platform-analytics-layer2'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts'
import { CreditCard, AlertTriangle, TrendingDown } from 'lucide-react'

interface PaymentsSectionProps {
  from: string
  to: string
}

// Color palette for charts
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

// Custom tooltip component for consistent styling
const CustomTooltip = ({ active, payload, label, formatter }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/90 backdrop-blur-sm border border-blue-100 rounded-lg p-2 shadow-lg text-xs">
        <p className="font-semibold text-slate-900 mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}: {formatter ? formatter(entry.value) : entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export function PaymentsSection({ from, to }: PaymentsSectionProps) {
  const { data, isLoading } = usePlatformPaymentMetrics(from, to)

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const kpiCards = [
    {
      title: 'Total Transactions',
      value: data?.summaryStats.total_transactions.toLocaleString() || '0',
      icon: CreditCard,
      color: 'text-blue-600',
    },
    {
      title: 'Failure Rate',
      value: `${data?.summaryStats.overall_failure_rate.toFixed(1) || 0}%`,
      icon: TrendingDown,
      color: data?.summaryStats.overall_failure_rate! > 5 ? 'text-red-600' : 'text-green-600',
    },
    {
      title: 'Chargebacks',
      value: data?.summaryStats.total_chargebacks.toLocaleString() || '0',
      icon: AlertTriangle,
      color: 'text-red-600',
    },
    {
      title: 'Chargeback Amount',
      value: `$${Number(data?.summaryStats.total_chargeback_amount || 0).toLocaleString()}`,
      icon: CreditCard,
      color: 'text-orange-600',
    },
  ]

  // Merge transaction volume and failure rate data
  const combinedData = (data?.transactionVolumeByDay || []).map((day) => {
    const failureDay = (data?.failureRateByDay || []).find((f) => f.date === day.date)
    return {
      date: day.date,
      txn_count: day.txn_count,
      total_amount: day.total_amount,
      failure_rate_pct: failureDay?.failure_rate_pct || 0,
    }
  })

  return (
    <div className="space-y-6">
      {/* KPI Cards - modernized */}
      <div className="grid gap-5 md:grid-cols-4">
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

      {/* Transaction Volume + Failure Rate */}
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-2 border-b border-blue-100/50">
          <CardTitle className="text-base font-semibold text-slate-900">Transaction Volume & Failure Rate</CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80">
            Daily transactions and failure rate trend
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={combinedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v.toLocaleString()}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={<CustomTooltip formatter={(v: number) => v.toLocaleString()} />}
                cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                formatter={(value) => <span className="text-xs text-slate-700">{value}</span>}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="txn_count"
                fill="#3b82f6"
                stroke="#3b82f6"
                fillOpacity={0.2}
                name="Transactions"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="failure_rate_pct"
                stroke="#ef4444"
                strokeWidth={2}
                name="Failure Rate %"
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey={() => 5}
                stroke="#94a3b8"
                strokeDasharray="5 5"
                strokeWidth={1}
                dot={false}
                name="5% Threshold"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Chargebacks + Terminals */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2 border-b border-blue-100/50">
            <CardTitle className="text-base font-semibold text-slate-900">Chargeback Volume</CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">
              By month
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data?.chargebacksByMonth || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v.toLocaleString()}
                />
                <Tooltip
                  content={<CustomTooltip formatter={(v: number) => v.toLocaleString()} />}
                  cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                />
                <Bar dataKey="chargeback_count" fill="#ef4444" radius={[4, 4, 0, 0]} name="Chargebacks" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2 border-b border-blue-100/50">
            <CardTitle className="text-base font-semibold text-slate-900">Terminal Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={data?.terminalDistribution || []}
                  cx="50%"
                  cy="45%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="terminal_count"
                  nameKey="terminal_type"
                >
                  {(data?.terminalDistribution || []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={<CustomTooltip formatter={(v: number) => v.toLocaleString()} />}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  formatter={(value) => <span className="text-xs text-slate-700">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Dual Pricing Adoption */}
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-2 border-b border-blue-100/50">
          <CardTitle className="text-base font-semibold text-slate-900">Dual Pricing (Cash Discount) Adoption</CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80">
            Merchants using cash discounts
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">
                  {data?.dualPricingAdoption.adopted_merchants || 0} of{' '}
                  {data?.dualPricingAdoption.total_merchants || 0} merchants
                </span>
                <span className="font-bold text-blue-600">
                  {data?.dualPricingAdoption.adoption_pct.toFixed(1) || 0}%
                </span>
              </div>
              <Progress
                value={data?.dualPricingAdoption.adoption_pct || 0}
                className="h-3 bg-blue-100 [&>div]:bg-blue-600"
              />
            </div>
            {/* Optional mini bar chart for distribution */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100">
                <p className="text-xs text-muted-foreground">Adopted</p>
                <p className="text-xl font-bold text-blue-600">{data?.dualPricingAdoption.adopted_merchants || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50/50 border border-gray-200">
                <p className="text-xs text-muted-foreground">Not Adopted</p>
                <p className="text-xl font-bold text-gray-600">
                  {(data?.dualPricingAdoption.total_merchants || 0) - (data?.dualPricingAdoption.adopted_merchants || 0)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}