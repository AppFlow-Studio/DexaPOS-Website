'use client'

import { useMerchantActivationTimeline } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { NeverActivatedMerchant } from '@/app/manage/actions/hq-platform/analytics'

const BUCKET_COLORS = ['#22c55e', '#86efac', '#f59e0b', '#fb923c', '#ef4444', '#991b1b']

export function MerchantActivationTimeline() {
  const { data, isLoading } = useMerchantActivationTimeline()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-65 w-full" />
      </div>
    )
  }

  if (!data) return null

  const { momImprovement } = data
  const momImproved = momImprovement.delta !== null && momImprovement.delta < 0
  const momWorse = momImprovement.delta !== null && momImprovement.delta > 0

  return (
    <div className="space-y-6">
      {/* KPI row — 5 cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{data.avgDaysToActivate ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Avg Days to Activation</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{data.medianDaysToActivate ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Median Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-green-600">{data.activatedThisMonth}</p>
            <p className="text-xs text-muted-foreground">Activated This Month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-red-600">{data.neverActivated.length}</p>
            <p className="text-xs text-muted-foreground">Never Activated (&gt;30d)</p>
          </CardContent>
        </Card>

        {/* MoM Improvement Metric */}
        <Card className={momImproved ? 'border-green-200' : momWorse ? 'border-red-200' : undefined}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-1">
              <p className={`text-2xl font-bold ${momImproved ? 'text-green-600' : momWorse ? 'text-red-600' : 'text-muted-foreground'}`}>
                {momImprovement.thisMonthAvgDays !== null ? `${momImprovement.thisMonthAvgDays}d` : '—'}
              </p>
              {momImprovement.delta !== null && (
                <span className={`flex items-center text-xs font-medium ${momImproved ? 'text-green-600' : 'text-red-600'}`}>
                  {momImproved
                    ? <ArrowDownRight className="h-3.5 w-3.5" />
                    : momWorse
                      ? <ArrowUpRight className="h-3.5 w-3.5" />
                      : <Minus className="h-3.5 w-3.5" />}
                  {Math.abs(momImprovement.delta)}d
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Avg Activation This Month</p>
            {momImprovement.lastMonthAvgDays !== null && (
              <p className="text-[10px] text-muted-foreground mt-1">
                vs {momImprovement.lastMonthAvgDays}d last month
                {momImprovement.delta !== null && (
                  <Badge
                    variant="secondary"
                    className={`ml-1 text-[10px] px-1.5 py-0 ${momImproved ? 'text-green-700 bg-green-50' : momWorse ? 'text-red-700 bg-red-50' : ''}`}
                  >
                    {momImproved ? 'Faster' : momWorse ? 'Slower' : 'Same'}
                  </Badge>
                )}
              </p>
            )}
            {momImprovement.lastMonthAvgDays === null && (
              <p className="text-[10px] text-muted-foreground mt-1">No prior month data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Histogram */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Days to First Transaction</CardTitle>
          <CardDescription className="text-xs">How long merchants take to place their first order after sign-up</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.histogram} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v: number) => [v, 'Merchants']} />
              <Bar dataKey="count" name="Merchants" radius={[4, 4, 0, 0]}>
                {data.histogram.map((_, i) => (
                  <Cell key={i} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Never Activated */}
      {data.neverActivated.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Never Activated Merchants</CardTitle>
            <CardDescription className="text-xs">
              Signed up 30+ days ago, no completed transactions. Onboarding checklist shows readiness (6 criteria).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs ">Merchant</TableHead>
                  <TableHead className="text-xs text-right whitespace-nowrap">Days Since Sign-up</TableHead>
                  <TableHead className="text-xs text-center">Logo</TableHead>
                  <TableHead className="text-xs text-center">Location</TableHead>
                  <TableHead className="text-xs text-center">Menu</TableHead>
                  <TableHead className="text-xs text-center">Staff</TableHead>
                  <TableHead className="text-xs text-center">Device</TableHead>
                  <TableHead className="text-xs text-center">Order</TableHead>
                  <TableHead className="text-xs text-center">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.neverActivated.map((m: NeverActivatedMerchant) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm py-2 font-medium ">
                      <span className="block truncate" title={m.name}>{m.name}</span>
                    </TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono">{m.daysSinceCreation}d</TableCell>
                    <TableCell className="py-2 text-center"><CheckIcon ok={m.hasLogo} /></TableCell>
                    <TableCell className="py-2 text-center"><CheckIcon ok={m.hasLocation} /></TableCell>
                    <TableCell className="py-2 text-center"><CheckIcon ok={m.hasMenu} /></TableCell>
                    <TableCell className="py-2 text-center"><CheckIcon ok={m.hasStaff} /></TableCell>
                    <TableCell className="py-2 text-center"><CheckIcon ok={m.hasDevice} /></TableCell>
                    <TableCell className="py-2 text-center"><CheckIcon ok={false} /></TableCell>
                    <TableCell className="py-2 text-center">
                      <ScoreBadge score={m.onboardingScore} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CheckIcon({ ok }: { ok: boolean }) {
  return (
    <span className={`text-base ${ok ? 'text-green-500' : 'text-red-400'}`}>
      {ok ? '✓' : '✗'}
    </span>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const colorMap: Record<number, string> = {
    5: 'text-green-600 bg-green-50',
    4: 'text-blue-600 bg-blue-50',
    3: 'text-amber-600 bg-amber-50',
    2: 'text-orange-600 bg-orange-50',
    1: 'text-red-600 bg-red-50',
    0: 'text-red-700 bg-red-50',
  }
  const color = colorMap[score] ?? colorMap[0]
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {score}/6
    </span>
  )
}
