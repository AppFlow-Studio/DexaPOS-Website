'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface FeeTrendPoint {
  day: string
  gross_dual_pricing_fee: number
  refunded_dual_pricing_fee: number
  net_platform_fee: number
}

export function FeeTrendChart({ data }: { data: FeeTrendPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No fee activity in this period.
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="cardSurchargeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickFormatter={(v: string) => v.slice(5)}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickFormatter={(v: number) => `$${v}`}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value: number) => formatCurrency(Number(value))}
          contentStyle={{
            backgroundColor: 'var(--popover)',
            color: 'var(--popover-foreground)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: '12px',
          }}
          labelStyle={{ color: 'var(--foreground)' }}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} iconSize={10} />
        <Area
          type="monotone"
          dataKey="gross_dual_pricing_fee"
          name="Card surcharge"
          stroke="var(--primary)"
          fill="url(#cardSurchargeGrad)"
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="net_platform_fee"
          name="Net platform fee"
          stroke="var(--foreground)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
