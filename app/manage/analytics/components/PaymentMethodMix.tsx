'use client'

import { useState } from 'react'
import { usePaymentMethodMix } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { PaymentMethodSplit, MerchantFeeExposure, DualPricingAnalysis, MonthlyPaymentTrend } from '@/app/manage/actions/hq-platform/analytics'

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`
}

export function PaymentMethodMix() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = usePaymentMethodMix(days)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-70" />
          <Skeleton className="h-70" />
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Period:</span>
        <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{fmt(data.totalGPV)}</p>
            <p className="text-xs text-muted-foreground">Total GPV</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{data.totalTransactions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-green-600">{data.cashPercent}%</p>
            <p className="text-xs text-muted-foreground">Cash</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-blue-600">{data.cardPercent}%</p>
            <p className="text-xs text-muted-foreground">Card</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Payment Method Split</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.split} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="totalAmount">
                  {data.split.map((entry: PaymentMethodSplit, i: number) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, name: string) => [fmt(v), name]} />
                <Legend formatter={(v: string) => {
                  const item = data.split.find(s => s.totalAmount === data.split.find(x => x.label === v)?.totalAmount)
                  return `${v}`
                }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1">
              {data.split.map((m: PaymentMethodSplit) => (
                <div key={m.method} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
                    <span>{m.label}</span>
                  </div>
                  <span className="text-muted-foreground">{m.percentage}% · {fmt(m.totalAmount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Fee Exposure */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Fee Exposure by Merchant</CardTitle>
            <CardDescription className="text-xs">Estimated card processing fees at 2.5% of card GPV</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs text-right">Card GPV</TableHead>
                  <TableHead className="text-xs text-right">Cash GPV</TableHead>
                  <TableHead className="text-xs text-right">Card %</TableHead>
                  <TableHead className="text-xs text-right">Est. Fees</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.feeExposureTable.slice(0, 10).map((m: MerchantFeeExposure) => (
                  <TableRow key={m.merchantId}>
                    <TableCell className="text-sm py-2">{m.merchantName}</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono text-blue-600">{fmt(m.cardGPV)}</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono text-green-600">{fmt(m.cashGPV)}</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono">{m.cardPercent}%</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono text-amber-600">{fmt(m.estimatedFees)}</TableCell>
                  </TableRow>
                ))}
                {data.feeExposureTable.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-4">No data</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dual Pricing Analysis */}
      {data.dualPricingAnalysis && data.dualPricingAnalysis.merchantsWithDualPricing > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Dual Pricing Analysis</CardTitle>
            <CardDescription className="text-xs">
              {data.dualPricingAnalysis.merchantsWithDualPricing} merchant{data.dualPricingAnalysis.merchantsWithDualPricing !== 1 ? 's' : ''} with dual pricing enabled
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Est. Card Surcharge Collected</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{fmt(data.dualPricingAnalysis.estimatedCardSurchargeCollected)}</p>
                <p className="text-xs text-blue-500 mt-1">Revenue recovered from card users</p>
              </div>
              <div className="p-4 rounded-lg bg-green-50 border border-green-100">
                <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Est. Cash Discount Given</p>
                <p className="text-2xl font-bold text-green-700 mt-1">{fmt(data.dualPricingAnalysis.estimatedCashDiscountGiven)}</p>
                <p className="text-xs text-green-500 mt-1">Incentive driving cash adoption</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6-Month Payment Method Trend */}
      {data.monthlyTrend && data.monthlyTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Payment Mix Trend (Last 6 Months)</CardTitle>
            <CardDescription className="text-xs">Cash vs card adoption over time — are merchants shifting toward cash with dual pricing?</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <Tooltip formatter={(v: number, name: string) => [`${v}%`, name]} />
                <Line type="monotone" dataKey="cashPercent" name="Cash %" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cardPercent" name="Card %" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="otherPercent" name="Other %" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

    </div>
  )
}