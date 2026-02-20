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
  ResponsiveContainer,
  ComposedChart,
} from 'recharts'
import { CreditCard, AlertTriangle, TrendingDown } from 'lucide-react'

interface PaymentsSectionProps {
  from: string
  to: string
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']

export function PaymentsSection({ from, to }: PaymentsSectionProps) {
  const { data, isLoading } = usePlatformPaymentMetrics(from, to)

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
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
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
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

      {/* Transaction Volume + Failure Rate */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Volume & Failure Rate</CardTitle>
          <CardDescription>Daily transactions and failure rate trend</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={combinedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
              <Tooltip />
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
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey={() => 5}
                stroke="#999"
                strokeDasharray="5 5"
                isAnimationActive={false}
                name="5% Threshold"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Chargebacks + Terminals */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Chargeback Volume</CardTitle>
            <CardDescription>By month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data?.chargebacksByMonth || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => Number(value).toLocaleString()} />
                <Bar dataKey="chargeback_count" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Terminal Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data?.terminalDistribution || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ terminal_type, terminal_count }) => `${terminal_type}: ${terminal_count}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="terminal_count"
                >
                  {(data?.terminalDistribution || []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Dual Pricing Adoption */}
      <Card>
        <CardHeader>
          <CardTitle>Dual Pricing (Cash Discount) Adoption</CardTitle>
          <CardDescription>Merchants using cash discounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {data?.dualPricingAdoption.adopted_merchants || 0} of{' '}
                  {data?.dualPricingAdoption.total_merchants || 0} merchants
                </span>
                <span className="text-sm font-bold">
                  {data?.dualPricingAdoption.adoption_pct.toFixed(1) || 0}%
                </span>
              </div>
              <Progress value={data?.dualPricingAdoption.adoption_pct || 0} className="h-3" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
