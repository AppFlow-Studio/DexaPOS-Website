'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformRevenueMetrics } from '@/lib/queries/use-platform-analytics-layer2'
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
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface RevenueSectionProps {
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

export function RevenueSection({ from, to }: RevenueSectionProps) {
  const { data, isLoading } = usePlatformRevenueMetrics(from, to)

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const totalRevenue = (data?.gmvByDay || []).reduce((sum, day) => sum + day.revenue, 0)

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-700/70">Total GMV</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">
              ${totalRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Selected period</p>
          </CardContent>
        </Card>
        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-700/70">Avg Daily GMV</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">
              ${(totalRevenue / (data?.gmvByDay?.length || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per day</p>
          </CardContent>
        </Card>
        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-700/70">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">
              {(data?.gmvByDay || []).reduce((sum, day) => sum + (day.order_count || 0), 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Platform GMV Chart */}
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-2 border-b border-blue-100/50">
          <CardTitle className="text-base font-semibold text-slate-900">Platform GMV Trend</CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80">
            Daily gross merchandise value
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data?.gmvByDay || []}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v.toLocaleString()}`}
              />
              <Tooltip
                content={<CustomTooltip formatter={(v: number) => `$${v.toLocaleString()}`} />}
                cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#revenueGradient)"
                name="Revenue"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Revenue by Merchant + Order Type */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2 border-b border-blue-100/50">
            <CardTitle className="text-base font-semibold text-slate-900">Revenue by Merchant</CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">
              Top 10 merchants
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={(data?.revenueByMerchant || []).slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis
                  dataKey="merchant_name"
                  type="category"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip
                  content={<CustomTooltip formatter={(v: number) => `$${v.toLocaleString()}`} />}
                  cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {(data?.revenueByMerchant || []).slice(0, 10).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2 border-b border-blue-100/50">
            <CardTitle className="text-base font-semibold text-slate-900">Revenue by Order Type</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={data?.revenueByOrderType || []}
                  cx="50%"
                  cy="45%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="revenue"
                  nameKey="order_type"
                >
                  {(data?.revenueByOrderType || []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={<CustomTooltip formatter={(v: number) => `$${v.toLocaleString()}`} />}
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

      {/* Payment Method Mix + Cash vs Card */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2 border-b border-blue-100/50">
            <CardTitle className="text-base font-semibold text-slate-900">Payment Method Mix</CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">
              By transaction count
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={data?.paymentMethodMix || []}
                  cx="50%"
                  cy="45%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="txn_count"
                  nameKey="payment_method"
                >
                  {(data?.paymentMethodMix || []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
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

        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
  <CardHeader className="pb-2 border-b border-blue-100/50">
    <CardTitle className="text-base font-semibold text-slate-900">Cash vs Card Split</CardTitle>
    <CardDescription className="text-xs text-muted-foreground/80">
      By pricing mode
    </CardDescription>
  </CardHeader>
  <CardContent className="p-4 pt-3">
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data?.cashVsCardSplit || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
        <XAxis
          dataKey="pricing_mode"
          tick={{ fontSize: 12, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v.toLocaleString()}`}
        />
        <Tooltip
          content={<CustomTooltip formatter={(v: number) => `$${v.toLocaleString()}`} />}
          cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
        />
        <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
          {(data?.cashVsCardSplit || []).map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </CardContent>
</Card>
      </div>

      {/* Trend Lines: Avg Ticket, Tip Rate, Refund Rate */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-900">Avg Ticket Size</CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">Daily trend</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data?.avgTicketByDay || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  content={<CustomTooltip formatter={(v: number) => `$${v.toFixed(2)}`} />}
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                />
                <Line
                  type="monotone"
                  dataKey="avg_ticket"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Avg Ticket"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-900">Tip Rate %</CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">Daily average</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data?.tipRateByDay || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip formatter={(v: number) => `${v.toFixed(1)}%`} />} />
                <Line
                  type="monotone"
                  dataKey="tip_rate_pct"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="Tip Rate"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-900">Refund Rate %</CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">Daily (target 5%)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data?.refundRateByDay || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip formatter={(v: number) => `${v.toFixed(1)}%`} />} />
                <Line
                  type="monotone"
                  dataKey="refund_rate_pct"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name="Refund Rate"
                />
                <Line
                  type="monotone"
                  dataKey={() => 5}
                  stroke="#94a3b8"
                  strokeDasharray="5 5"
                  strokeWidth={1}
                  dot={false}
                  name="Target 5%"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}