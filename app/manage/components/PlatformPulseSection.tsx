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
  change: number
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
 */
function Delta({ change }: { change: number }) {
  const Arrow = change >= 0 ? ArrowUpRight : ArrowDownRight

  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums">
      <Arrow className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {Math.abs(change).toFixed(1)}%
      <span className="sr-only">{change >= 0 ? 'increase' : 'decrease'}</span>
    </span>
  )
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
        <span className="inline-flex items-center gap-1.5">
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
  const revenueChange = kpis
    ? ((kpis.revenueToday - kpis.revenueLastWeekSameDay) / Math.max(kpis.revenueLastWeekSameDay, 1)) * 100
    : 0

  const ordersChange = kpis
    ? ((kpis.ordersToday - kpis.ordersLastWeekSameDay) / Math.max(kpis.ordersLastWeekSameDay, 1)) * 100
    : 0

  return (
    <Panel>
      <PanelSection
        label="Platform Pulse"
        caption={
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Real-time platform metrics
          </span>
        }
        action={
          <span className="text-xs text-muted-foreground">Updated just now</span>
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
              change={0}
              description="Today"
              icon={TrendingUp}
              isLoading={isLoading}
            />
            <KPI
              title="Active Orders"
              value={kpis?.activeOrdersNow || '0'}
              change={0}
              description="In progress"
              icon={Zap}
              isLoading={isLoading}
            />
          </StatRow>

          {/* Row 2: Platform Health */}
          <StatRow columns={4}>
            <KPI
              title="Stations Online"
              value={
                kpis ? `${kpis.stationsOnline} of ${kpis.stationsTotalCount}` : '0 of 0'
              }
              change={0}
              description="Active"
              icon={Radio}
              isLoading={isLoading}
            />
            <KPI
              title="Staff Clocked In"
              value={kpis?.staffClockedIn || '0'}
              change={0}
              description="Current shifts"
              icon={Users}
              isLoading={isLoading}
            />
            <KPI
              title="Payment Success Rate"
              value={`${kpis?.paymentSuccessRate.toFixed(1) || '0.0'}%`}
              change={0}
              description="Today"
              icon={CreditCard}
              isLoading={isLoading}
              warningThreshold={95}
            />
            <KPI
              title="Support Tickets"
              value={kpis?.openSupportTickets ?? 0}
              change={0}
              hideChange
              description="Open"
              icon={Ticket}
              isLoading={isLoading}
            />
          </StatRow>
        </div>
      </PanelSection>
    </Panel>
  )
}
