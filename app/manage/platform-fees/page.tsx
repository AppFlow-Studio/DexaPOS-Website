'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { subDays } from 'date-fns'
import {
  Receipt,
  TrendingUp,
  ArrowDownCircle,
  CreditCard,
  Coins,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DateRangePicker } from '@/app/manage/components/DateRangePicker'
import { usePlatformFeesOverview } from '@/app/manage/hooks/usePlatformFees'
import { formatCurrency } from '@/lib/utils'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  tone?: 'default' | 'success' | 'tip' | 'card' | 'refund'
}) {
  const toneStyles: Record<string, string> = {
    default: 'border-blue-100/60 bg-white',
    success: 'border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white',
    tip: 'border-amber-200/60 bg-gradient-to-br from-amber-50 to-white',
    card: 'border-blue-200/60 bg-gradient-to-br from-blue-50 to-white',
    refund: 'border-rose-200/60 bg-gradient-to-br from-rose-50 to-white',
  }
  const iconStyles: Record<string, string> = {
    default: 'text-slate-500',
    success: 'text-emerald-600',
    tip: 'text-amber-600',
    card: 'text-blue-600',
    refund: 'text-rose-600',
  }
  return (
    <Card className={`shadow-sm rounded-xl ${toneStyles[tone]}`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </CardTitle>
        <Icon className={`h-4 w-4 ${iconStyles[tone]}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export default function PlatformFeesPage() {
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(() => {
    const to = new Date()
    const from = subDays(to, 30)
    return { from: from.toISOString(), to: to.toISOString() }
  })
  const [merchantSearch, setMerchantSearch] = useState('')

  const { data, isLoading, isError } = usePlatformFeesOverview(
    dateRange.from,
    dateRange.to
  )

  const totals = data?.totals
  const filteredMerchants = useMemo(() => {
    const rows = data?.byMerchant ?? []
    if (!merchantSearch.trim()) return rows
    const q = merchantSearch.trim().toLowerCase()
    return rows.filter((r) => r.merchant_name.toLowerCase().includes(q))
  }, [data?.byMerchant, merchantSearch])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-emerald-900 to-blue-900 bg-clip-text text-transparent flex items-center gap-2">
            <Receipt className="h-7 w-7 text-emerald-600" />
            Platform Fees
          </h2>
          <p className="text-sm text-muted-foreground/80">
            Tip surcharges and dual-pricing card fees collected across all merchants
          </p>
        </div>
      </div>

      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl p-5">
        <DateRangePicker
          from={dateRange.from}
          to={dateRange.to}
          onChange={setDateRange}
        />
      </Card>

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load platform fees. Please try again.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="rounded-xl">
              <CardHeader className="pb-2">
                <Skeleton className="h-3 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))
        ) : totals ? (
          <>
            <KpiCard
              label="Net Platform Fee"
              value={formatCurrency(totals.net_platform_fee)}
              icon={TrendingUp}
              hint={`${totals.payment_count} payment${totals.payment_count === 1 ? '' : 's'}`}
              tone="success"
            />
            <KpiCard
              label="Gross Tip Surcharge"
              value={formatCurrency(totals.gross_tip_fee)}
              icon={Coins}
              tone="tip"
            />
            <KpiCard
              label="Gross Card Surcharge"
              value={formatCurrency(totals.gross_dual_pricing_fee)}
              icon={CreditCard}
              tone="card"
            />
            <KpiCard
              label="Refunded Fees"
              value={formatCurrency(
                totals.refunded_dual_pricing_fee + totals.refunded_tip_fee
              )}
              icon={ArrowDownCircle}
              tone="refund"
            />
            <KpiCard
              label="Avg Fee / Payment"
              value={formatCurrency(
                totals.payment_count > 0
                  ? totals.net_platform_fee / totals.payment_count
                  : 0
              )}
              icon={Receipt}
            />
          </>
        ) : null}
      </div>

      <Card className="rounded-xl shadow-sm border border-blue-100/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            Fee Trend
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : data && data.byDay.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.byDay}>
                <defs>
                  <linearGradient id="tipFeeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dualFeeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(Number(value))}
                  contentStyle={{
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="gross_tip_fee"
                  name="Tip Surcharge"
                  stroke="#f59e0b"
                  fill="url(#tipFeeGrad)"
                  strokeWidth={2}
                  stackId="1"
                />
                <Area
                  type="monotone"
                  dataKey="gross_dual_pricing_fee"
                  name="Card Surcharge"
                  stroke="#3b82f6"
                  fill="url(#dualFeeGrad)"
                  strokeWidth={2}
                  stackId="1"
                />
                <Line
                  type="monotone"
                  dataKey="net_platform_fee"
                  name="Net Platform Fee"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No fee activity in this period.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm border border-blue-100/60">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Fees by Merchant</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click a row to drill into per-location breakdown and configure rates.
            </p>
          </div>
          <div className="w-72">
            <Input
              placeholder="Search merchants..."
              value={merchantSearch}
              onChange={(e) => setMerchantSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead className="text-right">Locations</TableHead>
                <TableHead className="text-right">Tip Surcharge</TableHead>
                <TableHead className="text-right">Card Surcharge</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
                <TableHead className="text-right">Net Fee</TableHead>
                <TableHead className="text-right">Payments</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredMerchants.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    {merchantSearch
                      ? 'No merchants match your search.'
                      : 'No fees collected in this period yet.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredMerchants.map((row) => (
                  <TableRow
                    key={row.merchant_id}
                    className="cursor-pointer hover:bg-emerald-50/30"
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={`/manage/platform-fees/${row.merchant_id}`}
                        className="block w-full"
                      >
                        {row.merchant_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="font-normal">
                        {row.location_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(row.gross_tip_fee)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(row.gross_dual_pricing_fee)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-rose-600">
                      {row.refunded_dual_pricing_fee + row.refunded_tip_fee > 0
                        ? `-${formatCurrency(
                            row.refunded_dual_pricing_fee + row.refunded_tip_fee
                          )}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-emerald-700">
                      {formatCurrency(row.net_platform_fee)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {row.payment_count}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/manage/platform-fees/${row.merchant_id}`}>
                        <Button variant="ghost" size="sm">
                          View →
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
