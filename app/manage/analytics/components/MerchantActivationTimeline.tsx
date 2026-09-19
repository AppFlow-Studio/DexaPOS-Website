'use client'

import { useState } from 'react'
import { useMerchantActivationTimeline } from '@/lib/queries/use-platform-analytics'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Minus, Timer, ListChecks } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, VALUE_AXIS_WIDTH_MOBILE } from '@/app/manage/components/analytics-primitives'
import type { NeverActivatedMerchant } from '@/app/manage/actions/hq-platform/analytics'

/** Bucket fills encode the histogram's time bands — data, not decoration (§4.6b). */
const BUCKET_COLORS = ['#22c55e', '#86efac', '#f59e0b', '#fb923c', '#ef4444', '#991b1b']

/**
 * Mobile column meta for the never-activated table.
 *
 * Score is the roll-up of the six checklist columns, so it stays visible while
 * the individual checkmarks start hidden — one number instead of six ticks is
 * the right trade on a phone.
 */
const NEVER_ACTIVATED_COLUMNS: ReportColumn[] = [
  { id: 'merchant', label: 'Merchant', locked: true },
  { id: 'days', label: 'Days Since Sign-up', defaultHidden: true },
  { id: 'logo', label: 'Logo', defaultHidden: true },
  { id: 'location', label: 'Location', defaultHidden: true },
  { id: 'menu', label: 'Menu', defaultHidden: true },
  { id: 'staff', label: 'Staff', defaultHidden: true },
  { id: 'device', label: 'Device', defaultHidden: true },
  { id: 'order', label: 'Order', defaultHidden: true },
  { id: 'score', label: 'Score' },
]

export function MerchantActivationTimeline() {
  const { data, isLoading } = useMerchantActivationTimeline()
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(NEVER_ACTIVATED_COLUMNS)
  )
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)

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
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={isMobile ? VALUE_AXIS_WIDTH_MOBILE : undefined} />
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
            action={
              <MobileColumnsButton
                columns={NEVER_ACTIVATED_COLUMNS}
                hidden={hiddenCols}
                onChange={setHiddenCols}
              />
            }
          >
            {/* `variant="data"` brings its own scrolling well — no extra wrapper.
                The min-width is dropped on mobile so hiding columns actually
                narrows the table instead of just spreading it out. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[760px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  {showCol('days') && <TableHead className="whitespace-nowrap text-right">Days Since Sign-up</TableHead>}
                  {showCol('logo') && <TableHead className="text-center">Logo</TableHead>}
                  {showCol('location') && <TableHead className="text-center">Location</TableHead>}
                  {showCol('menu') && <TableHead className="text-center">Menu</TableHead>}
                  {showCol('staff') && <TableHead className="text-center">Staff</TableHead>}
                  {showCol('device') && <TableHead className="text-center">Device</TableHead>}
                  {showCol('order') && <TableHead className="text-center">Order</TableHead>}
                  {showCol('score') && <TableHead className="text-center">Score</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.neverActivated.map((m: NeverActivatedMerchant) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <span className="block truncate" title={m.name}>{m.name}</span>
                    </TableCell>
                    {showCol('days') && (
                      <TableCell className="text-right tabular-nums">{m.daysSinceCreation}d</TableCell>
                    )}
                    {showCol('logo') && <TableCell className="text-center"><CheckIcon ok={m.hasLogo} /></TableCell>}
                    {showCol('location') && <TableCell className="text-center"><CheckIcon ok={m.hasLocation} /></TableCell>}
                    {showCol('menu') && <TableCell className="text-center"><CheckIcon ok={m.hasMenu} /></TableCell>}
                    {showCol('staff') && <TableCell className="text-center"><CheckIcon ok={m.hasStaff} /></TableCell>}
                    {showCol('device') && <TableCell className="text-center"><CheckIcon ok={m.hasDevice} /></TableCell>}
                    {showCol('order') && <TableCell className="text-center"><CheckIcon ok={false} /></TableCell>}
                    {showCol('score') && (
                      <TableCell className="text-center">
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                          {m.onboardingScore}/6
                        </span>
                      </TableCell>
                    )}
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
