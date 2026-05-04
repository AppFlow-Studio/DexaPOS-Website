'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { use } from 'react'
import { subDays } from 'date-fns'
import {
  ArrowLeft,
  ArrowDownCircle,
  Coins,
  CreditCard,
  Receipt,
  Settings,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DateRangePicker } from '@/app/manage/components/DateRangePicker'
import { useMerchantPlatformFees } from '@/app/manage/hooks/usePlatformFees'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import { formatCurrency } from '@/lib/utils'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { LocationFeeConfigDialog } from './components/LocationFeeConfigDialog'
import { MerchantBulkFeeDialog } from './components/MerchantBulkFeeDialog'

export default function MerchantPlatformFeesPage({
  params,
}: {
  params: Promise<{ merchantId: string }>
}) {
  const { merchantId } = use(params)
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(() => {
    const to = new Date()
    const from = subDays(to, 30)
    return { from: from.toISOString(), to: to.toISOString() }
  })
  const [editLocation, setEditLocation] = useState<null | {
    location_id: string
    location_name: string
    tip_surcharge_percentage: number
    dual_pricing_percentage: number
  }>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const { hasPermission, isAtLeast } = useAdminPermissions()
  const canManage = hasPermission('hq.merchant.update' as never) && isAtLeast(10)

  const { data, isLoading, isError } = useMerchantPlatformFees(
    merchantId,
    dateRange.from,
    dateRange.to
  )

  const totals = data?.totals
  const merchantName = data?.merchant.name ?? '...'

  const enabledLocationCount = useMemo(
    () => (data?.byLocation || []).filter((l) => l.tip_surcharge_percentage > 0).length,
    [data?.byLocation]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link href="/manage/platform-fees" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Platform Fees
          </Link>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-emerald-900 to-blue-900 bg-clip-text text-transparent flex items-center gap-2">
            <Receipt className="h-7 w-7 text-emerald-600" />
            {merchantName}
          </h2>
          <p className="text-sm text-muted-foreground/80">
            Per-location tip surcharge and card surcharge revenue
          </p>
        </div>
        {canManage && data && data.byLocation.length > 0 && (
          <Button
            onClick={() => setBulkOpen(true)}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            Apply to all locations
          </Button>
        )}
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
          Failed to load merchant fees.
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
            <Card className="rounded-xl shadow-sm border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net Platform Fee</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totals.net_platform_fee)}</div>
                <p className="text-xs text-muted-foreground mt-1">{totals.payment_count} payment{totals.payment_count === 1 ? '' : 's'}</p>
              </CardContent>
            </Card>
            <Card className="rounded-xl shadow-sm border-amber-200/60 bg-gradient-to-br from-amber-50 to-white">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gross Tip Surcharge</CardTitle>
                <Coins className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totals.gross_tip_fee)}</div>
              </CardContent>
            </Card>
            <Card className="rounded-xl shadow-sm border-blue-200/60 bg-gradient-to-br from-blue-50 to-white">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gross Card Surcharge</CardTitle>
                <CreditCard className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totals.gross_dual_pricing_fee)}</div>
              </CardContent>
            </Card>
            <Card className="rounded-xl shadow-sm border-rose-200/60 bg-gradient-to-br from-rose-50 to-white">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Refunded Fees</CardTitle>
                <ArrowDownCircle className="h-4 w-4 text-rose-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totals.refunded_dual_pricing_fee + totals.refunded_tip_fee)}</div>
              </CardContent>
            </Card>
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tip Surcharge Active</CardTitle>
                <Receipt className="h-4 w-4 text-slate-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {enabledLocationCount} / {data?.byLocation.length ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">locations with tip fee &gt; 0</p>
              </CardContent>
            </Card>
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
        <CardContent className="h-[260px]">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : data && data.byDay.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.byDay}>
                <defs>
                  <linearGradient id="mTipGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mDualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(Number(value))}
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area type="monotone" dataKey="gross_tip_fee" name="Tip" stroke="#f59e0b" fill="url(#mTipGrad)" strokeWidth={2} stackId="1" />
                <Area type="monotone" dataKey="gross_dual_pricing_fee" name="Card" stroke="#3b82f6" fill="url(#mDualGrad)" strokeWidth={2} stackId="1" />
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
        <CardHeader>
          <CardTitle className="text-base">Locations</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure tip & card surcharge per location. Snapshots on captured payments are immutable.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Tip %</TableHead>
                <TableHead>Card %</TableHead>
                <TableHead className="text-right">Tip Fees</TableHead>
                <TableHead className="text-right">Card Fees</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
                <TableHead className="text-right">Net Fee</TableHead>
                <TableHead className="text-right">Payments</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : !data || data.byLocation.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    No locations found.
                  </TableCell>
                </TableRow>
              ) : (
                data.byLocation.map((loc) => (
                  <TableRow key={loc.location_id}>
                    <TableCell className="font-medium">{loc.location_name}</TableCell>
                    <TableCell>
                      {loc.tip_surcharge_percentage > 0 ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-mono">
                          {loc.tip_surcharge_percentage}%
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Off</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {loc.dual_pricing_percentage > 0 ? (
                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 font-mono">
                          {loc.dual_pricing_percentage}%
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Off</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(loc.gross_tip_fee)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(loc.gross_dual_pricing_fee)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-rose-600">
                      {loc.refunded_dual_pricing_fee + loc.refunded_tip_fee > 0
                        ? `-${formatCurrency(loc.refunded_dual_pricing_fee + loc.refunded_tip_fee)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-emerald-700">
                      {formatCurrency(loc.net_platform_fee)}
                    </TableCell>
                    <TableCell className="text-right text-sm">{loc.payment_count}</TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditLocation(loc)}
                        >
                          Configure
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Read-only</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LocationFeeConfigDialog
        open={!!editLocation}
        onOpenChange={(open) => !open && setEditLocation(null)}
        location={editLocation}
      />
      {data && (
        <MerchantBulkFeeDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          merchantId={merchantId}
          merchantName={data.merchant.name}
          locations={data.byLocation}
        />
      )}
    </div>
  )
}
