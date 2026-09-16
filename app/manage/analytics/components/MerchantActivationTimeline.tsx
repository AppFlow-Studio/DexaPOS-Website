'use client'

import { useMerchantActivationTimeline } from '@/lib/queries/use-platform-analytics'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Minus, Timer, ListChecks } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip } from '@/app/manage/components/analytics-primitives'
import type { NeverActivatedMerchant } from '@/app/manage/actions/hq-platform/analytics'

/** Bucket fills encode the histogram's time bands — data, not decoration (§4.6b). */
const BUCKET_COLORS = ['#22c55e', '#86efac', '#f59e0b', '#fb923c', '#ef4444', '#991b1b']

export function MerchantActivationTimeline() {
  const { data, isLoading } = useMerchantActivationTimeline()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-65 w-full rounded-3xl" />
      </div>
    )
  }

  if (!data) return null

  const { momImprovement } = data
  const momImproved = momImprovement.delta !== null && momImprovement.delta < 0
  const momWorse = momImprovement.delta !== null && momImprovement.delta > 0

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection label="Activation speed" icon={Timer}>
          {/* Five figures: 3-up then 2-up. `StatRow` tops out at four columns,
              and five on one line are unreadably narrow below a wide desktop. */}
          <div className="space-y-6">
            <StatRow columns={3}>
              <StatTile label="Avg Days to Activation" value={data.avgDaysToActivate ?? '—'} />
              <StatTile label="Median Days" value={data.medianDaysToActivate ?? '—'} />
              <StatTile label="Activated This Month" value={data.activatedThisMonth} />
            </StatRow>

            <StatRow columns={2}>
              <StatTile label="Never Activated (>30d)" value={data.neverActivated.length} />
              <StatTile
                label="Avg Activation This Month"
                value={
                  <span className="flex items-center gap-1.5">
                    {momImprovement.thisMonthAvgDays !== null ? `${momImprovement.thisMonthAvgDays}d` : '—'}
                    {momImprovement.delta !== null && (
                      <span
                        className={`flex items-center text-sm font-medium ${
                          momImproved ? 'text-green-600' : momWorse ? 'text-red-600' : 'text-muted-foreground'
                        }`}
                      >
                        {momImproved ? (
                          <ArrowDownRight className="h-3.5 w-3.5" />
                        ) : momWorse ? (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        ) : (
                          <Minus className="h-3.5 w-3.5" />
                        )}
                        {Math.abs(momImprovement.delta)}d
                      </span>
                    )}
                  </span>
                }
                meta={
                  momImprovement.lastMonthAvgDays !== null
                    ? `vs ${momImprovement.lastMonthAvgDays}d last month · ${
                        momImproved ? 'Faster' : momWorse ? 'Slower' : 'Same'
                      }`
                    : 'No prior month data'
                }
              />
            </StatRow>
          </div>
        </PanelSection>
      </Panel>

      <Panel>
        <PanelSection
          label="Days to first transaction"
          caption="How long merchants take to place their first order after sign-up"
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.histogram} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<AnalyticsTooltip />} />
              <Bar dataKey="count" name="Merchants" radius={[4, 4, 0, 0]}>
                {data.histogram.map((_, i) => (
                  <Cell key={i} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </PanelSection>
      </Panel>

      {data.neverActivated.length > 0 && (
        <Panel>
          <PanelSection
            label="Never activated merchants"
            icon={ListChecks}
            caption="Signed up 30+ days ago, no completed transactions. Onboarding checklist shows readiness (6 criteria)."
          >
            {/* `variant="data"` brings its own scrolling well — no extra wrapper. */}
            <Table variant="data" className="min-w-[760px]">
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Days Since Sign-up</TableHead>
                  <TableHead className="text-center">Logo</TableHead>
                  <TableHead className="text-center">Location</TableHead>
                  <TableHead className="text-center">Menu</TableHead>
                  <TableHead className="text-center">Staff</TableHead>
                  <TableHead className="text-center">Device</TableHead>
                  <TableHead className="text-center">Order</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.neverActivated.map((m: NeverActivatedMerchant) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <span className="block truncate" title={m.name}>{m.name}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.daysSinceCreation}d</TableCell>
                    <TableCell className="text-center"><CheckIcon ok={m.hasLogo} /></TableCell>
                    <TableCell className="text-center"><CheckIcon ok={m.hasLocation} /></TableCell>
                    <TableCell className="text-center"><CheckIcon ok={m.hasMenu} /></TableCell>
                    <TableCell className="text-center"><CheckIcon ok={m.hasStaff} /></TableCell>
                    <TableCell className="text-center"><CheckIcon ok={m.hasDevice} /></TableCell>
                    <TableCell className="text-center"><CheckIcon ok={false} /></TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        {m.onboardingScore}/6
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelSection>
        </Panel>
      )}
    </div>
  )
}

/**
 * A checklist mark. Text-led per §4.6b — the glyph carries the meaning, so the
 * tint is reinforcement rather than the only signal, and it stays legible to a
 * colour-blind reader.
 */
function CheckIcon({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? 'text-base text-green-600' : 'text-base text-muted-foreground'}>
      {ok ? '✓' : '✗'}
    </span>
  )
}
