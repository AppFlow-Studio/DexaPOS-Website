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
}

function KPICard({
  title,
  value,
  change,
  description,
  icon: Icon,
  isLoading,
  warningThreshold,
}: KPICardProps) {
  const isWarning = warningThreshold && typeof value === 'number' && value < warningThreshold

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <>
            <div className={`text-2xl font-bold ${isWarning ? 'text-red-600' : ''}`}>{value}</div>
            <div className="flex items-center space-x-2 text-xs">
              {change >= 0 ? (
                <ArrowUpRight className="h-3 w-3 text-green-600" />
              ) : (
                <ArrowDownRight className="h-3 w-3 text-red-600" />
              )}
              <span className={change >= 0 ? 'text-green-600' : 'text-red-600'}>
                {Math.abs(change).toFixed(1)}%
              </span>
              <span className="text-muted-foreground">{description}</span>
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
      <div>
        <h2 className="text-xl font-semibold">Platform Pulse</h2>
        <p className="text-sm text-muted-foreground">Real-time platform metrics</p>
      </div>

      {/* Row 1: Revenue & Volume */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          value={kpis?.openSupportTickets || '0'}
          change={0}
          description="Open"
          icon={Ticket}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
