'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
import { usePlatformDashboardKPIs } from '@/lib/queries/use-platform-dashboard'

interface KPICardProps {
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

function KPICard({
  title,
  value,
  change,
  description,
  icon: Icon,
  isLoading,
  warningThreshold,
  hideChange,
}: KPICardProps) {
  const isWarning = warningThreshold && typeof value === 'number' && value < warningThreshold

  return (
    <Card className="overflow-hidden border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-lg transition-all duration-200 rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-slate-700">{title}</CardTitle>
        <div className="p-1.5 bg-blue-50 rounded-lg">
          <Icon className="h-4 w-4 text-blue-600" />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <>
            <div className={`text-3xl font-bold tracking-tight ${isWarning ? 'text-red-600' : 'text-slate-900'}`}>
              {value}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {!hideChange && (
                <div className={`flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full ${
                  change >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {change >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 mr-0.5" />
                  )}
                  {Math.abs(change).toFixed(1)}%
                </div>
              )}
              <span className="text-xs text-muted-foreground">{description}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight bg-gradient-to-br from-slate-900 to-blue-900 bg-clip-text text-transparent">
            Platform Pulse
          </h2>
          <p className="text-sm text-muted-foreground/80 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Real-time platform metrics
          </p>
        </div>
        <div className="self-start sm:self-auto text-xs text-muted-foreground bg-white/60 px-3 py-1.5 rounded-full border border-blue-100">
          Updated just now
        </div>
      </div>

      {/* Row 1: Revenue & Volume */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Revenue Today"
          value={`$${kpis?.revenueToday.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}`}
          change={revenueChange}
          description="vs last week"
          icon={DollarSign}
          isLoading={isLoading}
        />
        <KPICard
          title="Orders Today"
          value={kpis?.ordersToday.toLocaleString() || '0'}
          change={ordersChange}
          description="vs last week"
          icon={ShoppingCart}
          isLoading={isLoading}
        />
        <KPICard
          title="Avg. Order Value"
          value={`$${kpis?.avgOrderValue.toFixed(2) || '0.00'}`}
          change={0}
          description="Today"
          icon={TrendingUp}
          isLoading={isLoading}
        />
        <KPICard
          title="Active Orders"
          value={kpis?.activeOrdersNow || '0'}
          change={0}
          description="In progress"
          icon={Zap}
          isLoading={isLoading}
        />
      </div>

      {/* Row 2: Platform Health */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Stations Online"
          value={
            kpis ? `${kpis.stationsOnline} of ${kpis.stationsTotalCount}` : '0 of 0'
          }
          change={0}
          description="Active"
          icon={Radio}
          isLoading={isLoading}
        />
        <KPICard
          title="Staff Clocked In"
          value={kpis?.staffClockedIn || '0'}
          change={0}
          description="Current shifts"
          icon={Users}
          isLoading={isLoading}
        />
        <KPICard
          title="Payment Success Rate"
          value={`${kpis?.paymentSuccessRate.toFixed(1) || '0.0'}%`}
          change={0}
          description="Today"
          icon={CreditCard}
          isLoading={isLoading}
          warningThreshold={95}
        />
        <KPICard
          title="Support Tickets"
          value={kpis?.openSupportTickets ?? 0}
          change={0}
          hideChange
          description="Open"
          icon={Ticket}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}