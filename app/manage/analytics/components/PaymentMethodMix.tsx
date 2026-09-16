'use client'

import { useState } from 'react'
import { usePaymentMethodMix } from '@/lib/queries/use-platform-analytics'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
import { CreditCard, PieChart as PieChartIcon, Receipt, TrendingUp } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile, InsetTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip } from '@/app/manage/components/analytics-primitives'
import type { PaymentMethodSplit, MerchantFeeExposure } from '@/app/manage/actions/hq-platform/analytics'

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`
}

export function PaymentMethodMix() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = usePaymentMethodMix(days)

  const periodSelect = (
    <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
      <SelectTrigger className="h-9 w-36 rounded-full border-0 bg-muted/60 px-3 shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="7">Last 7 days</SelectItem>
        <SelectItem value="30">Last 30 days</SelectItem>
        <SelectItem value="90">Last 90 days</SelectItem>
      </SelectContent>
    </Select>
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-70 w-full rounded-3xl" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection label="Payment mix" icon={CreditCard} action={periodSelect}>
          <StatRow columns={4}>
            <StatTile label="Total GPV" value={fmt(data.totalGPV)} />
            <StatTile label="Transactions" value={data.totalTransactions.toLocaleString()} />
            <StatTile label="Cash" value={`${data.cashPercent}%`} />
            <StatTile label="Card" value={`${data.cardPercent}%`} />
          </StatRow>
        </PanelSection>
      </Panel>

      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
        <Panel>
          <PanelSection label="Payment method split" icon={PieChartIcon}>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.split} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="totalAmount">
                  {data.split.map((entry: PaymentMethodSplit, i: number) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<AnalyticsTooltip formatter={fmt} />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>

            <div className="mt-2 space-y-1">
              {data.split.map((m: PaymentMethodSplit) => (
                <div key={m.method} className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    {/* The swatch maps the row to its slice — data encoding (§4.6b). */}
                    <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                    <span className="truncate">{m.label}</span>
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {m.percentage}% · {fmt(m.totalAmount)}
                  </span>
                </div>
              ))}
            </div>
          </PanelSection>
        </Panel>

        <Panel>
          <PanelSection
            label="Fee exposure by merchant"
            icon={Receipt}
            caption="Estimated card processing fees at 2.5% of card GPV"
          >
            <Table variant="data" className="min-w-[560px]">
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">Card GPV</TableHead>
                  <TableHead className="text-right">Cash GPV</TableHead>
                  <TableHead className="text-right">Card %</TableHead>
                  <TableHead className="text-right">Est. Fees</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.feeExposureTable.slice(0, 10).map((m: MerchantFeeExposure) => (
                  <TableRow key={m.merchantId}>
                    <TableCell>{m.merchantName}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(m.cardGPV)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(m.cashGPV)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.cardPercent}%</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(m.estimatedFees)}</TableCell>
                  </TableRow>
                ))}
                {data.feeExposureTable.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No data
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </PanelSection>
        </Panel>
      </div>

      {data.dualPricingAnalysis && data.dualPricingAnalysis.merchantsWithDualPricing > 0 && (
        <Panel>
          <PanelSection
            label="Dual pricing analysis"
            caption={`${data.dualPricingAnalysis.merchantsWithDualPricing} merchant${
              data.dualPricingAnalysis.merchantsWithDualPricing !== 1 ? 's' : ''
            } with dual pricing enabled`}
          >
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <InsetTile
                label="Est. Card Surcharge Collected"
                value={fmt(data.dualPricingAnalysis.estimatedCardSurchargeCollected)}
                meta="Revenue recovered from card users"
              />
              <InsetTile
                label="Est. Cash Discount Given"
                value={fmt(data.dualPricingAnalysis.estimatedCashDiscountGiven)}
                meta="Incentive driving cash adoption"
              />
            </div>
          </PanelSection>
        </Panel>
      )}

      {data.monthlyTrend && data.monthlyTrend.length > 0 && (
        <Panel>
          <PanelSection
            label="Payment mix trend (last 6 months)"
            icon={TrendingUp}
            caption="Cash vs card adoption over time — are merchants shifting toward cash with dual pricing?"
          >
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <Tooltip content={<AnalyticsTooltip formatter={(v: number) => `${v}%`} />} />
                <Line type="monotone" dataKey="cashPercent" name="Cash %" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cardPercent" name="Card %" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="otherPercent" name="Other %" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </PanelSection>
        </Panel>
      )}
    </div>
  )
}
