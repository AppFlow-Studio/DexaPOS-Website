'use client'

import { useState } from 'react'
import { usePaymentMethodMix } from '@/lib/queries/use-platform-analytics'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { CreditCard, PieChart as PieChartIcon, Receipt, TrendingUp } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile, InsetTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, valueAxisWidthMobile } from '@/app/manage/components/analytics-primitives'
import type { PaymentMethodSplit, MerchantFeeExposure, MonthlyPaymentTrend } from '@/app/manage/actions/hq-platform/analytics'

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`
}

/** "2026-07" → "Jul" (short) or "Jul 2026" (long). */
function monthLabel(key: string | undefined, style: 'short' | 'long') {
  // Recharts renders tooltip content before anything is hovered, with no label.
  if (!key) return ''
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    ...(style === 'long' && { year: 'numeric' }),
    timeZone: 'UTC',
  })
}

/**
 * Mobile column meta for the fee exposure table. Est. Fees is what the table is
 * named for, so it is the number kept beside the merchant on a phone.
 */
const FEE_EXPOSURE_COLUMNS: ReportColumn[] = [
  { id: 'merchant', label: 'Merchant', locked: true },
  { id: 'cardGpv', label: 'Card GPV', defaultHidden: true },
  { id: 'cashGpv', label: 'Cash GPV', defaultHidden: true },
  { id: 'cardPct', label: 'Card %', defaultHidden: true },
  { id: 'estFees', label: 'Est. Fees' },
]

/** Trend series, bottom of the stack first. */
const TREND_SERIES = [
  { key: 'cashPercent', name: 'Cash', color: '#22c55e' },
  { key: 'cardPercent', name: 'Card', color: '#3b82f6' },
  { key: 'otherPercent', name: 'Other', color: '#94a3b8' },
] as const

/** `days` comes from the Revenue & Risk tab's shared period picker. */
export function PaymentMethodMix({ days }: { days: number }) {
  const { data, isLoading } = usePaymentMethodMix(days)
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(FEE_EXPOSURE_COLUMNS)
  )
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)
  // Keeps the empty-state cell full-width as columns are toggled.
  const visibleColCount = FEE_EXPOSURE_COLUMNS.filter(c => showCol(c.id)).length

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
        <PanelSection label="Payment mix" icon={CreditCard} caption={`Last ${days} days`}>
          <StatRow columns={4}>
            {/* Payments, not order GPV: cash is net of the dual-pricing discount
                and card includes tips, so this won't match Whale Watch's GPV. */}
            <StatTile label="Collected" value={fmt(data.totalGPV)} meta="Payments incl. tips" />
            <StatTile label="Transactions" value={data.totalTransactions.toLocaleString()} />
            <StatTile label="Cash" value={`${data.cashPercent}%`} />
            <StatTile label="Card" value={`${data.cardPercent}%`} />
          </StatRow>
        </PanelSection>
      </Panel>

      {/* 2:3 split so the five-column fee table gets the room it needs; at
          half width it scrolled sideways with columns cut off. */}
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-2">
          <PanelSection label="Payment method split" icon={PieChartIcon}>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.split} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="totalAmount" nameKey="label">
                  {data.split.map((entry: PaymentMethodSplit, i: number) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<AnalyticsTooltip formatter={fmt} />} />
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

        <Panel className="lg:col-span-3">
          <PanelSection
            label="Fee exposure by merchant"
            icon={Receipt}
            caption="Gross card fees at an assumed 2.5% of card volume. Dual-pricing merchants pass most of this on to customers."
            action={
              <MobileColumnsButton
                columns={FEE_EXPOSURE_COLUMNS}
                hidden={hiddenCols}
                onChange={setHiddenCols}
              />
            }
          >
            {/* Min-width lifted on mobile so hidden columns actually narrow the
                table instead of leaving it scrolling sideways. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[480px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  {showCol('cardGpv') && <TableHead className="text-right">Card GPV</TableHead>}
                  {showCol('cashGpv') && <TableHead className="text-right">Cash GPV</TableHead>}
                  {showCol('cardPct') && <TableHead className="text-right">Card %</TableHead>}
                  {showCol('estFees') && <TableHead className="text-right">Est. Fees</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.feeExposureTable.slice(0, 10).map((m: MerchantFeeExposure) => (
                  <TableRow key={m.merchantId}>
                    <TableCell>
                      {m.merchantName}
                      {m.dualPricing && (
                        <p className="text-xs text-muted-foreground">Dual pricing</p>
                      )}
                    </TableCell>
                    {showCol('cardGpv') && <TableCell className="text-right tabular-nums">{fmt(m.cardGPV)}</TableCell>}
                    {showCol('cashGpv') && <TableCell className="text-right tabular-nums">{fmt(m.cashGPV)}</TableCell>}
                    {showCol('cardPct') && <TableCell className="text-right tabular-nums">{m.cardPercent}%</TableCell>}
                    {showCol('estFees') && <TableCell className="text-right tabular-nums">{fmt(m.estimatedFees)}</TableCell>}
                  </TableRow>
                ))}
                {data.feeExposureTable.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleColCount} className="h-24 text-center text-muted-foreground">
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
            {/* 100% stacked bars, one per month: monthly shares are discrete, and
                smoothed lines implied values between months that don't exist.
                A month with no payments renders as an empty slot. */}
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {TREND_SERIES.map(s => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => monthLabel(v, 'short')} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 100]} width={isMobile ? valueAxisWidthMobile(4) : undefined} />
                <Tooltip
                  content={(props: any) => {
                    const row = props.payload?.[0]?.payload as MonthlyPaymentTrend | undefined
                    const n = row?.transactionCount ?? 0
                    return (
                      <AnalyticsTooltip
                        {...props}
                        label={`${monthLabel(props.label, 'long')} · ${n} payment${n === 1 ? '' : 's'}`}
                        formatter={(v: number) => `${v}%`}
                      />
                    )
                  }}
                />
                {TREND_SERIES.map(s => (
                  <Bar key={s.key} dataKey={s.key} name={s.name} stackId="mix" fill={s.color} maxBarSize={48} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </PanelSection>
        </Panel>
      )}
    </div>
  )
}
