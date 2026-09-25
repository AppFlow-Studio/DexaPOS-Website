'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNow } from 'date-fns'
import { useMerchantOnboardingFunnel } from '@/lib/queries/use-platform-analytics'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { AlertTriangle, TrendingUp, Filter } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, valueAxisWidthMobile } from '@/app/manage/components/analytics-primitives'
import type { OnboardingFunnelStage, StalledMerchant } from '@/app/manage/actions/hq-platform/analytics'

/**
 * Stage colours are data encoding, not status decoration — each bar maps to its
 * lifecycle stage the way a chart series maps to its legend entry (§4.6b's
 * second exception).
 */
const STAGE_COLORS: Record<string, string> = {
  created: '#94a3b8',
  onboarding: '#f59e0b',
  live: '#22c55e',
  churned: '#ef4444',
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `2025-10` → `Oct '25`. */
function fmtMonth(key: string) {
  const [y, m] = key.split('-').map(Number)
  return m ? `${MONTH_ABBR[m - 1]} '${String(y).slice(2)}` : key
}

const CHECKLIST: { key: keyof StalledMerchant; label: string }[] = [
  { key: 'hasLogo', label: 'Logo' },
  { key: 'hasLocation', label: 'Location' },
  { key: 'hasMenu', label: 'Menu' },
  { key: 'hasStaff', label: 'Staff' },
  { key: 'hasDevice', label: 'Device' },
]

/**
 * Mobile column meta for the stalled-merchants table. Readiness is the roll-up
 * of the five checklist columns, so it stays visible while the individual
 * checkmarks start hidden.
 */
const STALLED_COLUMNS: ReportColumn[] = [
  { id: 'merchant', label: 'Merchant', locked: true },
  { id: 'signedUp', label: 'Signed Up', defaultHidden: true },
  { id: 'lastActivity', label: 'Last Activity', defaultHidden: true },
  { id: 'admin', label: 'Assigned Admin', defaultHidden: true },
  ...CHECKLIST.map(c => ({ id: c.key, label: c.label, defaultHidden: true })),
  { id: 'readiness', label: 'Readiness' },
]

export function MerchantOnboardingFunnel() {
  const { data, isLoading } = useMerchantOnboardingFunnel()
  const router = useRouter()
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(STALLED_COLUMNS)
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-50 w-full rounded-3xl" />
        <Skeleton className="h-75 w-full rounded-3xl" />
      </div>
    )
  }

  if (!data) return null

  const stalled = data.stalledMerchants
  // A column that reads "Unassigned" on every row carries no information.
  const anyAssigned = stalled.some(m => m.assignedAdmin)
  const showCol = (id: string) =>
    (id !== 'admin' || anyAssigned) && (!isMobile || !hiddenCols.has(id))

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection
          label="Merchants by stage"
          icon={Filter}
          caption={`All ${data.totalMerchants} merchants by onboarding status`}
        >
          <div className="space-y-6">
            <StatRow columns={3}>
              <StatTile
                label="Total Merchants"
                value={data.totalMerchants}
                meta="Across all stages"
              />
              <StatTile
                label="Live"
                value={data.liveCount}
                meta={`${data.liveRate}% of merchants`}
              />
              <StatTile
                label="Stalled"
                value={stalled.length}
                meta="Signed up 14+ days ago, not live"
              />
            </StatRow>

            <div className="space-y-3">
              {data.funnel.map((stage: OnboardingFunnelStage) => (
                /* Mobile stacks the label over a full-width track; the two
                   fixed gutters of the desktop row left the bar only the
                   ~130px that remained on a 390px phone. */
                <div
                  key={stage.stage}
                  className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground sm:w-24 sm:shrink-0 sm:justify-end sm:text-right">
                    <span>{stage.label}</span>
                    <span className="tabular-nums sm:hidden">{stage.percentOfTotal}%</span>
                  </div>
                  {/* Width is the stage's share of ALL merchants, so bars
                      compare directly and every track is the same length. */}
                  <div className="h-8 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    {/* `min-w-8`: a 5% bar on a phone is ~12px, narrower than
                        the pl-3 inset alone, so the count was clipped away. */}
                    <div
                      className="flex h-full min-w-8 items-center rounded-full pl-3 text-xs font-medium text-white transition-all duration-500"
                      style={{ width: `${Math.max(stage.percentOfTotal, 5)}%`, backgroundColor: STAGE_COLORS[stage.stage] }}
                    >
                      {stage.count}
                    </div>
                  </div>
                  <div className="hidden w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                    {stage.percentOfTotal}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </PanelSection>
      </Panel>

      {stalled.length > 0 && (
        <Panel>
          <PanelSection
            label={`Stalled merchants (${stalled.length})`}
            icon={AlertTriangle}
            caption="Signed up 14+ days ago and not live yet. Closest to ready first."
            action={
              <MobileColumnsButton
                columns={anyAssigned ? STALLED_COLUMNS : STALLED_COLUMNS.filter(c => c.id !== 'admin')}
                hidden={hiddenCols}
                onChange={setHiddenCols}
              />
            }
          >
            {/* The `variant="data"` well is the surface — §5.2. Min-width is
                dropped on mobile so hiding columns actually narrows the table. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[820px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  {showCol('signedUp') && <TableHead className="whitespace-nowrap text-right">Signed Up</TableHead>}
                  {showCol('lastActivity') && <TableHead className="whitespace-nowrap">Last Activity</TableHead>}
                  {showCol('admin') && <TableHead>Assigned Admin</TableHead>}
                  {CHECKLIST.map(c => showCol(c.key) && (
                    <TableHead key={c.key} className="text-center">{c.label}</TableHead>
                  ))}
                  {showCol('readiness') && <TableHead className="text-right">Readiness</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {stalled.map((m: StalledMerchant) => (
                  <TableRow
                    key={m.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/manage/merchants/${m.id}`)}
                  >
                    <TableCell className="max-w-60">
                      <span className="block truncate font-medium" title={m.name}>{m.name}</span>
                      {m.ownerEmail && (
                        <span className="block truncate text-xs text-muted-foreground" title={m.ownerEmail}>
                          {m.ownerEmail}
                        </span>
                      )}
                    </TableCell>
                    {showCol('signedUp') && (
                      <TableCell
                        className="whitespace-nowrap text-right tabular-nums"
                        title={format(new Date(m.createdAt), 'MMM d, yyyy')}
                      >
                        {m.daysSinceSignup}d ago
                      </TableCell>
                    )}
                    {showCol('lastActivity') && (
                      <TableCell
                        className="whitespace-nowrap text-muted-foreground"
                        title={m.lastActivity ? format(new Date(m.lastActivity), 'MMM d, yyyy h:mm a') : undefined}
                      >
                        {m.lastActivity ? formatDistanceToNow(new Date(m.lastActivity), { addSuffix: true }) : 'None'}
                      </TableCell>
                    )}
                    {showCol('admin') && (
                      <TableCell className="text-muted-foreground">{m.assignedAdmin ?? '—'}</TableCell>
                    )}
                    {CHECKLIST.map(c => showCol(c.key) && (
                      <TableCell key={c.key} className="text-center">
                        <CheckMark ok={m[c.key] as boolean} />
                      </TableCell>
                    ))}
                    {showCol('readiness') && (
                      <TableCell className="text-right text-sm tabular-nums">
                        {m.readinessScore}/{CHECKLIST.length}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelSection>
        </Panel>
      )}

      <Panel>
        <PanelSection
          label="Monthly sign-ups"
          icon={TrendingUp}
          caption="Merchants signed up each month, and how many of them are live now (last 12 months)"
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={fmtMonth} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={isMobile ? valueAxisWidthMobile(3) : undefined} />
              <Tooltip content={props => <AnalyticsTooltip {...props} label={fmtMonth(String(props.label ?? ''))} />} />
              {/* Recharts tints legend text with the series colour; only the dot should carry it. */}
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12 }}
                formatter={value => <span className="text-muted-foreground">{value}</span>}
              />
              <Bar dataKey="newCount" name="Signed up" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="liveCount" name="Now live" fill="#22c55e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PanelSection>
      </Panel>
    </div>
  )
}

/** Checklist mark — the glyph carries the meaning; no colour. */
function CheckMark({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? 'text-base text-foreground' : 'text-base text-muted-foreground/60'}>
      {ok ? '✓' : '✗'}
    </span>
  )
}
