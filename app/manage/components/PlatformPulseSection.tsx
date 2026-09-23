'use client'

import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Zap,
  Radio,
  Users,
  CreditCard,
  Ticket,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { cn } from '@/lib/utils'
import { usePlatformDashboardKPIs } from '@/lib/queries/use-platform-dashboard'

interface KPIProps {
  title: string
  value: string | number
  /** `null` when no meaningful comparison exists — see `Delta`. */
  change: number | null
  description: string
  icon: React.ComponentType<{ className?: string }>
  isLoading?: boolean
  warningThreshold?: number
  // Some metrics (e.g. open support tickets) have no meaningful period delta.
  // Hide the trend pill rather than render a faked 0.0%.
  hideChange?: boolean
}

/**
 * A period-over-period delta.
 *
 * Deliberately text-led rather than a green/red filled pill: a revenue
 * comparison is information, not an operational alarm, and reserving colour for
 * real severity is what keeps the alarms legible (see `UI-DESIGN-SYSTEM.md`
 * §14.3 HQ-2). Direction is carried by the arrow glyph, which survives both
 * colour-blindness and a greyscale print.
 *
 * `null` means "no comparison available" — not zero. A percentage against a
 * zero baseline is not a measurement: "↘ 100.0% vs last week" on $0 revenue
 * only says last week had data and today has none, and "↗ 0.0%" renders a
 * non-signal as a signal. Both are suppressed.
 */
function Delta({ change }: { change: number | null }) {
  if (change === null || Math.abs(change) < 0.05) return null

  const Arrow = change >= 0 ? ArrowUpRight : ArrowDownRight

  // Hidden outright on phones rather than shrunk: a half-width tile has room
  // for the figure or the comparison, not both, and the figure is the thing
  // being read. `hidden` (not `sr-only`) so assistive tech drops it too —
  // announcing a trend that no sighted reader can see would be a different
  // page, not the same one.
  return (
    <span className="hidden items-center gap-0.5 tabular-nums sm:inline-flex">
      <Arrow className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {Math.abs(change).toFixed(1)}%
      <span className="sr-only">{change >= 0 ? 'increase' : 'decrease'}</span>
    </span>
  )
}

/** Percent change, or `null` when the baseline is zero (no comparison exists). */
function percentChange(current: number, baseline: number): number | null {
  if (!baseline) return null
  return ((current - baseline) / baseline) * 100
}

function KPI({
  title,
  value,
  change,
  description,
  icon: Icon,
  isLoading,
  warningThreshold,
  hideChange,
}: KPIProps) {
  // A metric below its threshold IS an operational alarm, so this one keeps its
  // colour where the period deltas above give theirs up.
  const isWarning =
    warningThreshold !== undefined &&
    typeof value === 'number' &&
    value < warningThreshold

  return (
    <StatTile
      label={title}
      icon={<Icon />}
      isLoading={isLoading}
      value={
        <span className={cn(isWarning && 'text-red-600 dark:text-red-400')}>
          {value}
        </span>
      }
      meta={
        // The whole line goes on phones, not just the delta: "vs last week"
        // without the percentage it qualifies is a dangling fragment, and
        // "Today"/"In progress" restate what the panel heading already says.
        <span className="hidden items-center gap-1.5 sm:inline-flex">
          {!hideChange && <Delta change={change} />}
          <span>{description}</span>
        </span>
      }
    />
  )
}

export function PlatformPulseSection() {
  const { data: kpis, isLoading } = usePlatformDashboardKPIs()

  // Calculate trend percentages
  // `Math.max(baseline, 1)` previously turned a zero baseline into 1, so $0 vs
  // $0 produced a real-looking percentage against a denominator that never
  // existed. `percentChange` returns null instead and the delta is omitted.
  const revenueChange = kpis
    ? percentChange(kpis.revenueToday, kpis.revenueLastWeekSameDay)
    : null

  const ordersChange = kpis
    ? percentChange(kpis.ordersToday, kpis.ordersLastWeekSameDay)
    : null

  return (
    <Panel>
      {/* Caption and timestamp are desktop-only. On a phone they are two lines
          of chrome above the figures that say nothing the heading and the
          live values do not already convey.

          Done in CSS rather than with `useIsMobile`: that hook breaks at
          768px while every other rule in this section uses Tailwind's `sm`
          (640px), so a JS gate would hide the caption at 700px while the
          tiles still wore their desktop treatment.

          `captionClassName` hides the whole `<p>`, which also reclaims the 4px
          `mt-1` that a hidden inner `<span>` used to leave behind. */}
      <PanelSection
        label="Platform Pulse"
        caption="Real-time platform metrics"
        captionClassName="hidden sm:block"
        action={
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Updated just now
          </span>
        }
      >
        <div className="space-y-8">
          {/* Row 1: Revenue & Volume */}
          <StatRow columns={4}>
            <KPI
              title="Revenue Today"
              value={`$${kpis?.revenueToday.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}`}
              change={revenueChange}
              description="vs last week"
              icon={DollarSign}
              isLoading={isLoading}
            />
            <KPI
              title="Orders Today"
              value={kpis?.ordersToday.toLocaleString() || '0'}
              change={ordersChange}
              description="vs last week"
              icon={ShoppingCart}
              isLoading={isLoading}
            />
            <KPI
              title="Avg. Order Value"
              value={`$${kpis?.avgOrderValue.toFixed(2) || '0.00'}`}
              change={null}
              description="Today"
              icon={TrendingUp}
              isLoading={isLoading}
            />
            <KPI
              title="Active Orders"
              value={kpis?.activeOrdersNow || '0'}
              change={null}
              description="In progress"
              icon={Zap}
              isLoading={isLoading}
            />
          </StatRow>

          {/* Row 2 is operational status, not headline trade. Labelling and
              ruling it off gives the eight tiles the two tiers the layout
              already implied but rendered at equal weight. */}
          <div className="space-y-4 border-t border-border/60 pt-6">
            {/* The rule above still separates the two tiers on a phone; the
                caption restating it is the part that costs a line. */}
            <p className="hidden text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground sm:block">
              Platform health
            </p>
            <StatRow columns={4}>
            <KPI
              title="Stations Online"
              value={
                kpis ? `${kpis.stationsOnline} of ${kpis.stationsTotalCount}` : '0 of 0'
              }
              change={null}
              description="Active"
              icon={Radio}
              isLoading={isLoading}
            />
            <KPI
              title="Staff Clocked In"
              value={kpis?.staffClockedIn || '0'}
              change={null}
              description="Current shifts"
              icon={Users}
              isLoading={isLoading}
            />
            <KPI
              title="Payment Success Rate"
              value={`${kpis?.paymentSuccessRate.toFixed(1) || '0.0'}%`}
              change={null}
              description="Today"
              icon={CreditCard}
              isLoading={isLoading}
              warningThreshold={95}
            />
            <KPI
              title="Support Tickets"
              value={kpis?.openSupportTickets ?? 0}
              change={null}
              hideChange
              description="Open"
              icon={Ticket}
              isLoading={isLoading}
            />
            </StatRow>
          </div>
        </div>
      </PanelSection>
    </Panel>
  )
}
