'use client'

import { useMerchantActivationTimeline } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { NeverActivatedMerchant } from '@/app/manage/actions/hq-platform/analytics'

const BUCKET_COLORS = ['#22c55e', '#86efac', '#f59e0b', '#fb923c', '#ef4444', '#991b1b']

export function MerchantActivationTimeline() {
  const { data, isLoading } = useMerchantActivationTimeline()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-65 w-full" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              Signed up 30+ days ago, no completed transactions. Onboarding checklist shows readiness.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs text-right">Days Since Sign-up</TableHead>
                  <TableHead className="text-xs">Menu</TableHead>
                  <TableHead className="text-xs">Staff</TableHead>
                  <TableHead className="text-xs">Device</TableHead>
                  <TableHead className="text-xs">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.neverActivated.map((m: NeverActivatedMerchant) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm py-2 font-medium">{m.name}</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono">{m.daysSinceCreation}d</TableCell>
                    <TableCell className="py-2">
                      <CheckIcon ok={m.hasMenu} />
                    </TableCell>
                    <TableCell className="py-2">
                      <CheckIcon ok={m.hasStaff} />
                    </TableCell>
                    <TableCell className="py-2">
                      <CheckIcon ok={m.hasDevice} />
                    </TableCell>
                    <TableCell className="py-2">
                      <ScoreBadge score={m.onboardingScore} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
  const colors: Record<number, string> = { 4: 'text-green-600 bg-green-50', 3: 'text-blue-600 bg-blue-50', 2: 'text-amber-600 bg-amber-50', 1: 'text-red-600 bg-red-50' }
  const color = colors[score] || colors[1]
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {score}/4
    </span>
  )
}
