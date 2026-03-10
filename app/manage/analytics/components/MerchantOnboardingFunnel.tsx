'use client'

import { useMerchantOnboardingFunnel } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import type { OnboardingFunnelStage, StuckMerchant, MonthlyOnboardingTrend } from '@/app/manage/actions/hq-platform/analytics'

export function MerchantOnboardingFunnel() {
  const { data, isLoading } = useMerchantOnboardingFunnel()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-50 w-full" />
        <Skeleton className="h-75 w-full" />
      </div>
    )
  }

  if (!data) return null

  const STAGE_COLORS: Record<string, string> = {
    created: '#94a3b8',
    onboarding: '#f59e0b',
    active: '#22c55e',
    churned: '#ef4444',
  }

  return (
    <div className="space-y-6">
      {/* KPI banner */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-green-600">{data.conversionRate}%</p>
            <p className="text-xs text-muted-foreground">Overall Conversion Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-amber-600">{data.stuckMerchants.length}</p>
            <p className="text-xs text-muted-foreground">Stuck (&gt;14 days onboarding)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">
              {data.funnel.find(f => f.stage === 'active')?.count ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Active Merchants</p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel visualisation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Onboarding Funnel</CardTitle>
          <CardDescription className="text-xs">All merchants by lifecycle stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.funnel.map((stage: OnboardingFunnelStage) => {
              const maxCount = Math.max(...data.funnel.map(s => s.count), 1)
              const pct = Math.round((stage.count / maxCount) * 100)
              return (
                <div key={stage.stage} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-right text-muted-foreground">{stage.label}</div>
                  <div className="flex-1 h-8 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full rounded flex items-center pl-3 text-white text-xs font-medium transition-all duration-500"
                      style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: STAGE_COLORS[stage.stage] || '#94a3b8' }}
                    >
                      {stage.count}
                    </div>
                  </div>
                  {stage.conversionFromPrev !== null && (
                    <div className="w-20 text-xs text-muted-foreground text-right">
                      {stage.conversionFromPrev}% conv.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stuck Merchants Table */}
      {data.stuckMerchants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Stuck Merchants ({data.stuckMerchants.length})
            </CardTitle>
            <CardDescription className="text-xs">Merchants in onboarding for more than 14 days without progressing</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs text-right">Days in Onboarding</TableHead>
                  <TableHead className="text-xs">Last Activity</TableHead>
                  <TableHead className="text-xs">Assigned Admin</TableHead>
                  <TableHead className="text-xs">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stuckMerchants.map((m: StuckMerchant) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm py-2 font-medium">{m.name}</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono">{m.daysInOnboarding}d</TableCell>
                    <TableCell className="text-sm py-2 text-muted-foreground">
                      {m.lastActivity ? new Date(m.lastActivity).toLocaleDateString() : 'No activity'}
                    </TableCell>
                    <TableCell className="text-sm py-2">
                      {m.assignedAdmin ?? <span className="text-xs text-muted-foreground italic">Unassigned</span>}
                    </TableCell>
                    <TableCell className="py-2">
                      {m.daysInOnboarding >= 30 ? (
                        <Badge variant="destructive" className="text-xs">Critical</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">At Risk</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Monthly Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Monthly Onboarding Trend
          </CardTitle>
          <CardDescription className="text-xs">New vs Active merchants per month (last 12 months)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="newCount" name="New Merchants" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="activeCount" name="Activated" fill="#22c55e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
